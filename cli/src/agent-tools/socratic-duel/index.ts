import { randomUUID } from "node:crypto";
import * as E from "fp-ts/lib/Either.js";
import * as TE from "fp-ts/lib/TaskEither.js";
import type { CLIError } from "../../../shared/errors.js";
import { runtimeError } from "../../../shared/errors.js";
import { registerTool, type ToolOptions } from "../index.js";
import type { ToolResult } from "../models.js";
import { errorResult, successResult } from "../output.js";
import {
	adjournDuel,
	type ClaimDecision,
	claimTurn,
	type DuelSnapshot,
	getActiveDuelSnapshotByTargetKey,
	getDuelSnapshot,
	invalidateDuel,
	joinDuel,
	persistAcceptedTurnWithSideEffect,
} from "./database.js";
import {
	appendTurnToManagedRegion,
	ensureManagedRegion,
	hashText,
	type ManagedRegion,
	type ParsedTurnMarkdown,
	parseManagedRegion,
	readMarkdownDocument,
	renderTurnSection,
	terminalSummaryForOutcome,
	updateManagedRegionMetadata,
	writeMarkdownDocument,
} from "./markdown.js";
import type {
	AdjournInput,
	AdjournResult,
	ClaimTurnInput,
	ClaimTurnResult,
	DuelRecord,
	DuelStatus,
	JoinInput,
	JoinResult,
	ParticipantRecord,
	StatusResult,
	SubmitTurnInput,
	SubmitTurnResult,
	TerminalOutcome,
	TurnInput,
	TurnRecord,
	ValidationIssue,
} from "./models.js";
import { RETRY_AFTER_SECONDS } from "./models.js";
import {
	hasBlockingUnresolvedItems,
	isTerminalOutcome,
	parseTurnInput,
	validateParticipantFields,
	validateTargetPath,
	validateTurnInput,
} from "./validation.js";

const TOOL_NAME = "socratic-duel";

interface StatusInput {
	readonly duelId?: string;
	readonly targetPath?: string;
}

const isCLIError = (error: unknown): error is CLIError =>
	typeof error === "object" && error !== null && "_tag" in error;

const toCLIError =
	(message: string) =>
	(error: unknown): CLIError =>
		isCLIError(error)
			? error
			: runtimeError(
					`${message}: ${error instanceof Error ? error.message : String(error)}`,
				);

const issueResult = <T>(
	issues: readonly ValidationIssue[],
	data: T,
): ToolResult<T> =>
	errorResult(
		TOOL_NAME,
		data,
		issues.map((issue) => ({
			message: issue.message,
			context: issue.context,
		})),
	);

const validateParsedTurnsAgainstRecords = (
	parsedTurns: readonly ParsedTurnMarkdown[],
	records: readonly TurnRecord[],
): readonly ValidationIssue[] => {
	const issues: ValidationIssue[] = [];

	if (parsedTurns.length !== records.length) {
		issues.push({
			message: `Managed region turn count (${parsedTurns.length}) does not match database turn count (${records.length})`,
		});
	}

	for (const record of records) {
		const parsed = parsedTurns.find(
			(turn) => turn.number === record.turnNumber,
		);
		if (!parsed) {
			issues.push({
				message: `Managed region is missing turn ${record.turnNumber}`,
			});
			continue;
		}
		if (parsed.hash !== record.turnHash) {
			issues.push({
				message: `Turn ${record.turnNumber} hash no longer matches the accepted record`,
			});
		}
		if (parsed.id !== record.id) {
			issues.push({
				message: `Turn ${record.turnNumber} identifier no longer matches the accepted record`,
			});
		}
	}

	return issues;
};

const nextStepForStatus = (
	snapshot: DuelSnapshot,
): StatusResult["next_step"] => {
	if (snapshot.duel.status !== "ACTIVE") {
		return "adjourn";
	}
	if (snapshot.participants.length < 2) {
		return "wait_peer";
	}
	if (snapshot.duel.currentOwnerId) {
		return "wait_turn";
	}
	return "claim_turn";
};

const joinNextStep = (
	status: DuelStatus,
	participantCount: number,
): JoinResult["next_step"] => {
	if (status !== "ACTIVE") {
		return "adjourn";
	}
	return participantCount < 2 ? "wait_peer" : "claim_turn";
};

const claimNextStep = (
	decision: ClaimDecision,
): ClaimTurnResult["next_step"] => {
	if (decision.duel.status !== "ACTIVE") {
		return "adjourn";
	}
	if (decision.acquired) {
		return "compose_turn";
	}
	return decision.participants.length < 2 ? "wait_peer" : "wait_turn";
};

const nullClaimResult = (
	duelId: string,
	participantId: string,
): ClaimTurnResult => ({
	duel_id: duelId,
	participant_id: participantId,
	acquired: false,
	turn_number: null,
	prior_region_hash: null,
	lease_expires_at: null,
	owner_participant_id: null,
	retry_after_seconds: RETRY_AFTER_SECONDS,
	wait_until: null,
	reason: null,
	next_step: "adjourn",
	prior_turns: [],
});

const findParticipant = (
	snapshot: DuelSnapshot,
	participantId: string,
): ParticipantRecord => {
	const participant = snapshot.participants.find(
		({ id }) => id === participantId,
	);
	if (!participant) {
		throw new Error(`Participant not found in duel: ${participantId}`);
	}
	return participant;
};

const parseExistingRegion = (content: string): ManagedRegion | null => {
	const parsed = parseManagedRegion(content);
	if (parsed.kind === "invalid") {
		throw new Error(parsed.reason);
	}
	return parsed.kind === "ok" ? parsed.managed : null;
};

const invalidateAndReturnIssues = async (
	duelId: string,
	issues: readonly ValidationIssue[],
	dbPath?: string,
): Promise<void> => {
	const result = await invalidateDuel(
		duelId,
		issues.map((issue) => issue.message).join("; "),
		dbPath,
	)();
	if (E.isLeft(result)) {
		throw result.left;
	}
};

const loadStatusSnapshot = async (
	input: StatusInput,
	dbPath?: string,
): Promise<DuelSnapshot> => {
	if (input.duelId) {
		const result = await getDuelSnapshot(input.duelId, dbPath)();
		if (E.isLeft(result)) {
			throw result.left;
		}
		return result.right;
	}

	if (!input.targetPath) {
		throw new Error("Either duelId or targetPath is required");
	}

	const target = await validateTargetPath(input.targetPath);
	const result = await getActiveDuelSnapshotByTargetKey(
		target.targetKey,
		dbPath,
	)();
	if (E.isLeft(result)) {
		throw result.left;
	}
	return result.right;
};

export const executeJoin = (
	input: JoinInput,
	dbPath?: string,
): TE.TaskEither<CLIError, ToolResult<JoinResult>> =>
	TE.tryCatch(async () => {
		const participantIssues = validateParticipantFields(
			input.participantName,
			input.harness,
			input.modelId,
		);
		if (participantIssues.length > 0) {
			return issueResult(participantIssues, null as unknown as JoinResult);
		}

		const target = await validateTargetPath(input.targetPath);
		const content = await readMarkdownDocument(target.targetPath);
		const existingRegion = parseExistingRegion(content);
		const dbResult = await joinDuel(
			input,
			target.targetKey,
			target.targetPath,
			existingRegion?.duelId,
			dbPath,
		)();
		if (E.isLeft(dbResult)) {
			throw dbResult.left;
		}

		const snapshotResult = await getDuelSnapshot(
			dbResult.right.duel.id,
			dbPath,
		)();
		if (E.isLeft(snapshotResult)) {
			throw snapshotResult.left;
		}
		const snapshot = snapshotResult.right;
		const existingTurnIssues =
			existingRegion === null
				? snapshot.turns.length > 0
					? [{ message: "Managed region is missing accepted turns" }]
					: []
				: validateParsedTurnsAgainstRecords(
						existingRegion.turns,
						snapshot.turns,
					);

		if (existingTurnIssues.length > 0) {
			await invalidateAndReturnIssues(
				snapshot.duel.id,
				existingTurnIssues,
				dbPath,
			);
			return issueResult(existingTurnIssues, null as unknown as JoinResult);
		}

		const nextContent = ensureManagedRegion(
			content,
			snapshot.duel,
			snapshot.participants,
		);
		if (nextContent !== content) {
			await writeMarkdownDocument(target.targetPath, nextContent);
		}

		const data: JoinResult = {
			duel_id: snapshot.duel.id,
			participant_id: dbResult.right.participant.id,
			participant_count: dbResult.right.participantCount,
			status: snapshot.duel.status,
			target_path: snapshot.duel.targetPath,
			target_key: snapshot.duel.targetKey,
			max_turns: snapshot.duel.maxTurns,
			next_turn_number: snapshot.duel.nextTurnNumber,
			candidate_convergence: snapshot.duel.candidateConvergence,
			next_step: joinNextStep(
				snapshot.duel.status,
				dbResult.right.participantCount,
			),
		};

		return successResult(TOOL_NAME, data);
	}, toCLIError("Failed to join Socratic Duel"));

export const executeStatus = (
	input: StatusInput,
	dbPath?: string,
): TE.TaskEither<CLIError, ToolResult<StatusResult>> =>
	TE.tryCatch(async () => {
		const snapshot = await loadStatusSnapshot(input, dbPath);
		let priorRegionHash: string | null = null;

		try {
			const content = await readMarkdownDocument(snapshot.duel.targetPath);
			const parsed = parseManagedRegion(content);
			if (parsed.kind === "ok") {
				const issues = validateParsedTurnsAgainstRecords(
					parsed.managed.turns,
					snapshot.turns,
				);
				if (issues.length === 0) {
					priorRegionHash = hashText(parsed.managed.region);
				}
			}
		} catch {
			priorRegionHash = null;
		}

		return successResult(TOOL_NAME, {
			duel: snapshot.duel,
			participants: snapshot.participants,
			turns: snapshot.turns,
			prior_region_hash: priorRegionHash,
			next_step: nextStepForStatus(snapshot),
		});
	}, toCLIError("Failed to read Socratic Duel status"));

export const executeClaimTurn = (
	input: ClaimTurnInput,
	dbPath?: string,
): TE.TaskEither<CLIError, ToolResult<ClaimTurnResult>> =>
	TE.tryCatch(async () => {
		const dbResult = await claimTurn(input, dbPath)();
		if (E.isLeft(dbResult)) {
			throw dbResult.left;
		}
		const decision = dbResult.right;
		const nextStep = claimNextStep(decision);

		if (!decision.acquired) {
			return successResult(TOOL_NAME, {
				duel_id: decision.duel.id,
				participant_id: input.participantId,
				acquired: false,
				turn_number: null,
				prior_region_hash: null,
				lease_expires_at: decision.duel.leaseExpiresAt,
				owner_participant_id: decision.duel.currentOwnerId,
				retry_after_seconds: decision.retryAfterSeconds,
				wait_until: decision.waitUntil,
				reason: decision.reason,
				next_step: nextStep,
				prior_turns: decision.turns,
			});
		}

		const content = await readMarkdownDocument(decision.duel.targetPath);
		const parsed = parseManagedRegion(content);
		if (parsed.kind !== "ok") {
			const issues = [
				{
					message:
						parsed.kind === "missing"
							? "Managed region is missing"
							: parsed.reason,
				},
			];
			await invalidateAndReturnIssues(decision.duel.id, issues, dbPath);
			return issueResult(
				issues,
				nullClaimResult(decision.duel.id, input.participantId),
			);
		}

		const issues = validateParsedTurnsAgainstRecords(
			parsed.managed.turns,
			decision.turns,
		);
		if (issues.length > 0) {
			await invalidateAndReturnIssues(decision.duel.id, issues, dbPath);
			return issueResult(
				issues,
				nullClaimResult(decision.duel.id, input.participantId),
			);
		}

		return successResult(TOOL_NAME, {
			duel_id: decision.duel.id,
			participant_id: input.participantId,
			acquired: true,
			turn_number: decision.duel.nextTurnNumber,
			prior_region_hash: hashText(parsed.managed.region),
			lease_expires_at: decision.duel.leaseExpiresAt,
			owner_participant_id: decision.duel.currentOwnerId,
			retry_after_seconds: decision.retryAfterSeconds,
			wait_until: decision.waitUntil,
			reason: decision.reason,
			next_step: "compose_turn",
			prior_turns: decision.turns,
		});
	}, toCLIError("Failed to claim Socratic Duel turn"));

const latestStancesAfterTurn = (
	priorTurns: readonly TurnRecord[],
	participants: readonly ParticipantRecord[],
	participantId: string,
	turn: TurnInput,
): Map<string, TurnInput["stance"]> => {
	const latest = new Map<string, TurnInput["stance"]>();
	for (const priorTurn of priorTurns) {
		latest.set(priorTurn.participantId, priorTurn.stance);
	}
	latest.set(participantId, turn.stance);

	for (const participant of participants) {
		if (!latest.has(participant.id)) {
			latest.delete(participant.id);
		}
	}

	return latest;
};

const deriveStatusAfterTurn = (
	snapshot: DuelSnapshot,
	participantId: string,
	turn: TurnInput,
): { readonly status: DuelStatus; readonly summary: string | null } => {
	const contributedParticipants = new Set([
		...snapshot.turns.map((record) => record.participantId),
		participantId,
	]);
	const bothContributed = contributedParticipants.size >= 2;
	const latestStances = latestStancesAfterTurn(
		snapshot.turns,
		snapshot.participants,
		participantId,
		turn,
	);
	const allAcceptingConsensus =
		snapshot.participants.length === 2 &&
		snapshot.participants.every(
			(participant) =>
				latestStances.get(participant.id) === "ACCEPTING_CONSENSUS",
		);
	const currentTurnHasBlockingItems = hasBlockingUnresolvedItems(turn);

	if (turn.terminal_outcome === "ACCEPTED_CONSENSUS") {
		if (currentTurnHasBlockingItems) {
			throw new Error(
				"ACCEPTED_CONSENSUS requires no blocking unresolved items in the current turn",
			);
		}
		if (!allAcceptingConsensus) {
			throw new Error(
				"ACCEPTED_CONSENSUS requires the latest turn from both participants to use ACCEPTING_CONSENSUS",
			);
		}
		return {
			status: "ACCEPTED_CONSENSUS",
			summary: terminalSummaryForOutcome(
				"ACCEPTED_CONSENSUS",
				turn.terminal_summary,
			),
		};
	}

	if (turn.terminal_outcome === "DISSENT") {
		if (!bothContributed) {
			throw new Error("DISSENT requires both participants to contribute");
		}
		return {
			status: "DISSENT",
			summary: terminalSummaryForOutcome("DISSENT", turn.terminal_summary),
		};
	}

	if (allAcceptingConsensus && !currentTurnHasBlockingItems) {
		return {
			status: "ACCEPTED_CONSENSUS",
			summary: terminalSummaryForOutcome(
				"ACCEPTED_CONSENSUS",
				turn.terminal_summary,
			),
		};
	}

	if (snapshot.duel.nextTurnNumber >= snapshot.duel.maxTurns) {
		return {
			status: "MAX_TURNS",
			summary: terminalSummaryForOutcome("MAX_TURNS", turn.terminal_summary),
		};
	}

	return { status: "ACTIVE", summary: null };
};

const deriveCandidateConvergence = (
	snapshot: DuelSnapshot,
	participantId: string,
	turn: TurnInput,
): boolean => {
	if (turn.candidate_convergence === true) {
		return true;
	}

	const latestStances = latestStancesAfterTurn(
		snapshot.turns,
		snapshot.participants,
		participantId,
		turn,
	);
	const noBlockingItems = turn.unresolved_items.every((item) => !item.blocking);

	return (
		snapshot.participants.length === 2 &&
		noBlockingItems &&
		snapshot.participants.every((participant) => {
			const stance = latestStances.get(participant.id);
			return stance === "CONVERGING" || stance === "ACCEPTING_CONSENSUS";
		})
	);
};

export const executeSubmitTurn = (
	input: SubmitTurnInput,
	dbPath?: string,
): TE.TaskEither<CLIError, ToolResult<SubmitTurnResult>> =>
	TE.tryCatch(async () => {
		const snapshotResult = await getDuelSnapshot(input.duelId, dbPath)();
		if (E.isLeft(snapshotResult)) {
			throw snapshotResult.left;
		}
		const snapshot = snapshotResult.right;
		const participant = findParticipant(snapshot, input.participantId);

		if (snapshot.duel.status !== "ACTIVE") {
			return issueResult(
				[{ message: `Duel is terminal: ${snapshot.duel.status}` }],
				null as unknown as SubmitTurnResult,
			);
		}

		if (snapshot.duel.currentOwnerId !== input.participantId) {
			return issueResult(
				[{ message: "Participant does not own the current turn lease" }],
				null as unknown as SubmitTurnResult,
			);
		}
		if (
			snapshot.duel.leaseExpiresAt === null ||
			Date.parse(snapshot.duel.leaseExpiresAt) <= Date.now()
		) {
			return issueResult(
				[{ message: "Current turn lease has expired" }],
				null as unknown as SubmitTurnResult,
			);
		}

		const content = await readMarkdownDocument(snapshot.duel.targetPath);
		const parsed = parseManagedRegion(content);
		if (parsed.kind !== "ok") {
			const issues = [
				{
					message:
						parsed.kind === "missing"
							? "Managed region is missing"
							: parsed.reason,
				},
			];
			await invalidateAndReturnIssues(snapshot.duel.id, issues, dbPath);
			return issueResult(issues, null as unknown as SubmitTurnResult);
		}

		const regionHash = hashText(parsed.managed.region);
		if (regionHash !== input.priorRegionHash) {
			const issues = [
				{
					message:
						"Prior region hash does not match the current managed region",
				},
			];
			await invalidateAndReturnIssues(snapshot.duel.id, issues, dbPath);
			return issueResult(issues, null as unknown as SubmitTurnResult);
		}

		const regionIssues = validateParsedTurnsAgainstRecords(
			parsed.managed.turns,
			snapshot.turns,
		);
		if (regionIssues.length > 0) {
			await invalidateAndReturnIssues(snapshot.duel.id, regionIssues, dbPath);
			return issueResult(regionIssues, null as unknown as SubmitTurnResult);
		}

		const turnIssues = validateTurnInput(
			input.turn,
			snapshot.turns,
			participant,
		);
		if (turnIssues.length > 0) {
			return issueResult(turnIssues, null as unknown as SubmitTurnResult);
		}

		const terminal = deriveStatusAfterTurn(
			snapshot,
			input.participantId,
			input.turn,
		);
		const candidateConvergence = deriveCandidateConvergence(
			snapshot,
			input.participantId,
			input.turn,
		);
		const turnId = randomUUID();
		const renderedTurn = renderTurnSection(
			turnId,
			snapshot.duel.nextTurnNumber,
			participant,
			input.turn,
		);
		const duelForRender: DuelRecord = {
			...snapshot.duel,
			status: terminal.status,
			candidateConvergence,
			conclusionSummary: terminal.summary,
		};
		const nextContent = appendTurnToManagedRegion(
			content,
			duelForRender,
			snapshot.participants,
			renderedTurn.markdown,
		);

		const persistResult = await persistAcceptedTurnWithSideEffect(
			{
				duelId: snapshot.duel.id,
				participantId: input.participantId,
				turnId,
				turnNumber: snapshot.duel.nextTurnNumber,
				stance: input.turn.stance,
				turnHash: renderedTurn.turnHash,
				priorRegionHash: input.priorRegionHash,
				contentJson: JSON.stringify(input.turn),
				status: terminal.status,
				candidateConvergence,
				conclusionSummary: terminal.summary,
			},
			{
				run: () => writeMarkdownDocument(snapshot.duel.targetPath, nextContent),
				rollback: () =>
					writeMarkdownDocument(snapshot.duel.targetPath, content),
			},
			dbPath,
		)();
		if (E.isLeft(persistResult)) {
			throw persistResult.left;
		}

		const terminalOutcome =
			terminal.status === "ACTIVE"
				? null
				: (terminal.status as TerminalOutcome);

		return successResult(TOOL_NAME, {
			duel_id: snapshot.duel.id,
			participant_id: input.participantId,
			accepted: true,
			turn_number: snapshot.duel.nextTurnNumber,
			turn_hash: renderedTurn.turnHash,
			status: terminal.status,
			terminal_outcome: terminalOutcome,
			candidate_convergence: candidateConvergence,
			next_step: terminal.status === "ACTIVE" ? "claim_turn" : "adjourn",
		});
	}, toCLIError("Failed to submit Socratic Duel turn"));

export const executeAdjourn = (
	input: AdjournInput,
	dbPath?: string,
): TE.TaskEither<CLIError, ToolResult<AdjournResult>> =>
	TE.tryCatch(async () => {
		if (!isTerminalOutcome(input.outcome)) {
			return issueResult(
				[
					{
						message: "Adjourn outcome must be a terminal Socratic Duel outcome",
					},
				],
				null as unknown as AdjournResult,
			);
		}
		if (
			input.outcome === "MAX_TURNS" ||
			input.outcome === "ACCEPTED_CONSENSUS"
		) {
			return issueResult(
				[
					{
						message:
							"MAX_TURNS and ACCEPTED_CONSENSUS are derived by submit-turn",
					},
				],
				null as unknown as AdjournResult,
			);
		}
		if (input.outcome !== "INVALIDATED" && !input.participantId) {
			return issueResult(
				[
					{
						message: "participant-id is required when adjourning a live duel",
					},
				],
				null as unknown as AdjournResult,
			);
		}

		const beforeResult = await getDuelSnapshot(input.duelId, dbPath)();
		if (E.isLeft(beforeResult)) {
			throw beforeResult.left;
		}
		if (input.outcome === "DISSENT") {
			const contributed = new Set(
				beforeResult.right.turns.map((turn) => turn.participantId),
			);
			if (contributed.size < 2) {
				return issueResult(
					[{ message: "DISSENT requires both participants to contribute" }],
					null as unknown as AdjournResult,
				);
			}
		}

		const summary = terminalSummaryForOutcome(input.outcome, input.summary);
		const result = await adjournDuel(
			input.duelId,
			input.participantId,
			input.outcome,
			summary,
			dbPath,
		)();
		if (E.isLeft(result)) {
			throw result.left;
		}

		const snapshot = result.right;
		try {
			const content = await readMarkdownDocument(snapshot.duel.targetPath);
			const nextContent = updateManagedRegionMetadata(
				content,
				snapshot.duel,
				snapshot.participants,
			);
			if (nextContent !== content) {
				await writeMarkdownDocument(snapshot.duel.targetPath, nextContent);
			}
		} catch {
			if (input.outcome !== "INVALIDATED") {
				throw new Error(
					"Duel adjourned in database but Markdown update failed",
				);
			}
		}

		return successResult(TOOL_NAME, {
			duel_id: snapshot.duel.id,
			status: snapshot.duel.status as TerminalOutcome,
			summary,
			next_step: "adjourn",
		});
	}, toCLIError("Failed to adjourn Socratic Duel"));

export const parseSubmitTurnInput = (
	content: string,
	duelId: string,
	participantId: string,
	priorRegionHash: string | undefined,
): ToolResult<SubmitTurnInput> => {
	const parsed = parseTurnInput(content);
	if (parsed.issues.length > 0 || !parsed.turn) {
		return issueResult(parsed.issues, null as unknown as SubmitTurnInput);
	}

	const resolvedPriorRegionHash =
		priorRegionHash ?? parsed.turn.prior_region_hash;
	if (!resolvedPriorRegionHash) {
		return issueResult(
			[{ message: "prior-region-hash is required" }],
			null as unknown as SubmitTurnInput,
		);
	}

	return successResult(TOOL_NAME, {
		duelId,
		participantId,
		priorRegionHash: resolvedPriorRegionHash,
		turn: parsed.turn,
	});
};

const execute = (
	_input: string,
	_options: ToolOptions,
): TE.TaskEither<CLIError, ToolResult<{ message: string }>> =>
	TE.right(
		successResult(TOOL_NAME, {
			message:
				"Use subcommands: join, status, claim-turn, submit-turn, adjourn. See --help for details.",
		}),
	);

registerTool({
	name: TOOL_NAME,
	description:
		"Coordinate Socratic Duel participants, turn leases, Markdown records, and terminal outcomes",
	execute,
});

export { TOOL_NAME };
