import { constants } from "node:fs";
import { access, realpath, stat } from "node:fs/promises";
import { extname, isAbsolute } from "node:path";
import type {
	ParticipantRecord,
	Stance,
	TerminalOutcome,
	TurnInput,
	TurnRecord,
	ValidationIssue,
} from "./models.js";
import { VALID_STANCES, VALID_TERMINAL_OUTCOMES } from "./models.js";

const URL_RE = /^https?:\/\/\S+$/i;
const PRINCIPLE_RE = /^Principle:\s*\S.+$/;
const FILE_REF_RE = /^(?:\.{0,2}\/|\/)?[^\n]+(?:\.[A-Za-z0-9]+)(?::\d+)?$/;

const isObject = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

const nonEmpty = (value: unknown): value is string =>
	typeof value === "string" && value.trim().length > 0;

const isStance = (value: unknown): value is Stance =>
	typeof value === "string" &&
	(VALID_STANCES as readonly string[]).includes(value);

export const isTerminalOutcome = (value: unknown): value is TerminalOutcome =>
	typeof value === "string" &&
	(VALID_TERMINAL_OUTCOMES as readonly string[]).includes(value);

export const validateTargetPath = async (
	targetPath: string,
): Promise<{ readonly targetPath: string; readonly targetKey: string }> => {
	if (!isAbsolute(targetPath)) {
		throw new Error(`Target path must be absolute: ${targetPath}`);
	}

	const extension = extname(targetPath).toLowerCase();
	if (extension !== ".md" && extension !== ".markdown") {
		throw new Error(`Target path must be a Markdown file: ${targetPath}`);
	}

	await access(targetPath, constants.R_OK | constants.W_OK);

	const fileStat = await stat(targetPath);
	if (!fileStat.isFile()) {
		throw new Error(`Target path must be a file: ${targetPath}`);
	}

	const canonicalPath = await realpath(targetPath);

	return {
		targetPath: canonicalPath,
		targetKey: canonicalPath,
	};
};

export const validateParticipantFields = (
	participantName: string,
	harness: string,
	modelId: string,
): readonly ValidationIssue[] => {
	const issues: ValidationIssue[] = [];

	if (!nonEmpty(participantName)) {
		issues.push({ message: "Participant name must be non-empty" });
	}
	if (!nonEmpty(harness)) {
		issues.push({ message: "Harness must be non-empty" });
	}
	if (!nonEmpty(modelId)) {
		issues.push({ message: "Model ID must be non-empty" });
	}

	return issues;
};

export const parseTurnInput = (
	content: string,
): {
	readonly turn?: TurnInput;
	readonly issues: readonly ValidationIssue[];
} => {
	let parsed: unknown;
	try {
		parsed = JSON.parse(content);
	} catch (error) {
		return {
			issues: [
				{
					message: `Turn JSON is invalid: ${error instanceof Error ? error.message : String(error)}`,
				},
			],
		};
	}

	if (!isObject(parsed)) {
		return { issues: [{ message: "Turn JSON must be an object" }] };
	}

	return {
		turn: parsed as unknown as TurnInput,
		issues: [],
	};
};

const validateSupport = (
	support: unknown,
	context: string,
): readonly ValidationIssue[] => {
	if (!Array.isArray(support) || support.length === 0) {
		return [{ message: "Support must be a non-empty array", context }];
	}

	return support.flatMap((entry, index) => {
		if (!nonEmpty(entry)) {
			return [
				{
					message: "Support entries must be non-empty strings",
					context: `${context}[${index}]`,
				},
			];
		}

		const value = entry.trim();
		if (
			URL_RE.test(value) ||
			PRINCIPLE_RE.test(value) ||
			FILE_REF_RE.test(value)
		) {
			return [];
		}

		return [
			{
				message:
					"Support entries must be URLs, file references, or Principle: ... entries",
				context: `${context}[${index}]`,
			},
		];
	});
};

const normalizeClaim = (claim: string): string =>
	claim
		.toLowerCase()
		.replace(/[`*_~()[\]{}.,:;!?'"-]/g, " ")
		.replace(/\s+/g, " ")
		.trim();

const collectPriorClaims = (priorTurns: readonly TurnRecord[]): Set<string> => {
	const claims = new Set<string>();

	for (const turn of priorTurns) {
		try {
			const parsed = JSON.parse(turn.contentJson) as Partial<TurnInput>;
			if (typeof parsed.position === "string") {
				claims.add(normalizeClaim(parsed.position));
			}
			if (typeof parsed.novel_argument?.claim === "string") {
				claims.add(normalizeClaim(parsed.novel_argument.claim));
			}
			if (Array.isArray(parsed.counterpoints)) {
				for (const counterpoint of parsed.counterpoints) {
					if (typeof counterpoint?.claim === "string") {
						claims.add(normalizeClaim(counterpoint.claim));
					}
				}
			}
		} catch {
			claims.add(normalizeClaim(turn.contentJson));
		}
	}

	return claims;
};

const findPriorStance = (
	participantId: string,
	priorTurns: readonly TurnRecord[],
): Stance | null => {
	const prior = [...priorTurns]
		.reverse()
		.find((turn) => turn.participantId === participantId);

	return prior?.stance ?? null;
};

export const hasBlockingUnresolvedItems = (turn: TurnInput): boolean =>
	Array.isArray(turn.unresolved_items) &&
	turn.unresolved_items.some(
		(item) => isObject(item) && item.blocking === true,
	);

export const validateTurnInput = (
	turn: TurnInput,
	priorTurns: readonly TurnRecord[],
	participant: ParticipantRecord,
): readonly ValidationIssue[] => {
	const issues: ValidationIssue[] = [];

	if (!isObject(turn)) {
		return [{ message: "Turn input must be an object" }];
	}

	if (!isStance(turn.stance)) {
		issues.push({
			message: `Invalid stance. Valid stances: ${VALID_STANCES.join(", ")}`,
			context: "stance",
		});
	}

	if (!nonEmpty(turn.position)) {
		issues.push({ message: "Position must be non-empty", context: "position" });
	}

	if (!Array.isArray(turn.counterpoints) || turn.counterpoints.length === 0) {
		issues.push({
			message: "Counterpoints must be a non-empty array",
			context: "counterpoints",
		});
	} else {
		for (const [index, counterpoint] of turn.counterpoints.entries()) {
			if (!isObject(counterpoint)) {
				issues.push({
					message: "Counterpoint must be an object",
					context: `counterpoints[${index}]`,
				});
				continue;
			}
			if (!nonEmpty(counterpoint.addresses)) {
				issues.push({
					message: "Counterpoint addresses must be non-empty",
					context: `counterpoints[${index}].addresses`,
				});
			}
			if (!nonEmpty(counterpoint.claim)) {
				issues.push({
					message: "Counterpoint claim must be non-empty",
					context: `counterpoints[${index}].claim`,
				});
			}
			issues.push(
				...validateSupport(
					counterpoint.support,
					`counterpoints[${index}].support`,
				),
			);
		}
	}

	if (!Array.isArray(turn.agreements) || turn.agreements.length === 0) {
		issues.push({
			message: "Agreements must be a non-empty array",
			context: "agreements",
		});
	} else {
		for (const [index, agreement] of turn.agreements.entries()) {
			if (!nonEmpty(agreement)) {
				issues.push({
					message: "Agreement entries must be non-empty strings",
					context: `agreements[${index}]`,
				});
			}
		}
	}

	if (!isObject(turn.novel_argument)) {
		issues.push({
			message: "Novel argument must be an object",
			context: "novel_argument",
		});
	} else {
		if (!nonEmpty(turn.novel_argument.claim)) {
			issues.push({
				message: "Novel argument claim must be non-empty",
				context: "novel_argument.claim",
			});
		} else {
			const priorClaims = collectPriorClaims(priorTurns);
			if (priorClaims.has(normalizeClaim(turn.novel_argument.claim))) {
				issues.push({
					message: "Novel argument duplicates a prior claim",
					context: "novel_argument.claim",
				});
			}
		}
		issues.push(
			...validateSupport(turn.novel_argument.support, "novel_argument.support"),
		);
	}

	if (
		!Array.isArray(turn.unresolved_items) ||
		turn.unresolved_items.length === 0
	) {
		issues.push({
			message: "Unresolved items must be a non-empty array",
			context: "unresolved_items",
		});
	} else {
		for (const [index, item] of turn.unresolved_items.entries()) {
			if (!isObject(item)) {
				issues.push({
					message: "Unresolved item must be an object",
					context: `unresolved_items[${index}]`,
				});
				continue;
			}
			if (!nonEmpty(item.item)) {
				issues.push({
					message: "Unresolved item text must be non-empty",
					context: `unresolved_items[${index}].item`,
				});
			}
			if (typeof item.blocking !== "boolean") {
				issues.push({
					message: "Unresolved item blocking flag must be boolean",
					context: `unresolved_items[${index}].blocking`,
				});
			}
		}
	}

	if (
		turn.stance === "ACCEPTING_CONSENSUS" &&
		hasBlockingUnresolvedItems(turn)
	) {
		issues.push({
			message:
				"ACCEPTING_CONSENSUS requires no blocking unresolved items in the current turn",
			context: "unresolved_items",
		});
	}

	const priorStance = findPriorStance(participant.id, priorTurns);
	if (priorStance !== null && priorStance !== turn.stance) {
		issues.push(
			...validateSupport(
				turn.stance_revision_support,
				"stance_revision_support",
			),
		);
	}

	if (
		turn.terminal_outcome !== null &&
		turn.terminal_outcome !== undefined &&
		!isTerminalOutcome(turn.terminal_outcome)
	) {
		issues.push({
			message: `Invalid terminal outcome. Valid outcomes: ${VALID_TERMINAL_OUTCOMES.join(", ")}`,
			context: "terminal_outcome",
		});
	}

	if (
		turn.terminal_outcome === "ACCEPTED_CONSENSUS" &&
		hasBlockingUnresolvedItems(turn)
	) {
		issues.push({
			message:
				"ACCEPTED_CONSENSUS requires no blocking unresolved items in the current turn",
			context: "unresolved_items",
		});
	}

	if (
		turn.terminal_outcome === "TIMEOUT" ||
		turn.terminal_outcome === "INVALIDATED" ||
		turn.terminal_outcome === "MAX_TURNS"
	) {
		issues.push({
			message:
				"TIMEOUT, INVALIDATED, and MAX_TURNS outcomes are not accepted from submit-turn JSON",
			context: "terminal_outcome",
		});
	}

	return issues;
};
