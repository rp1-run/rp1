import { createHash, randomUUID } from "node:crypto";
import { readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type {
	DuelRecord,
	ParticipantRecord,
	TerminalOutcome,
	TurnInput,
} from "./models.js";

const START_RE = /<!-- rp1:socratic-duel:start id="([^"]+)" -->/g;
const END_MARKER = "<!-- rp1:socratic-duel:end -->";
const TURN_RE =
	/<!-- rp1:socratic-duel:turn id="([^"]+)" number="(\d+)" hash="([^"]+)" -->\n([\s\S]*?)\n<!-- rp1:socratic-duel:turn:end -->/g;

export interface ParsedTurnMarkdown {
	readonly id: string;
	readonly number: number;
	readonly hash: string;
	readonly body: string;
	readonly section: string;
}

export interface ManagedRegion {
	readonly duelId: string;
	readonly prefix: string;
	readonly region: string;
	readonly suffix: string;
	readonly turnsMarkdown: string;
	readonly turns: readonly ParsedTurnMarkdown[];
}

export type ManagedRegionParseResult =
	| { readonly kind: "missing" }
	| { readonly kind: "ok"; readonly managed: ManagedRegion }
	| { readonly kind: "invalid"; readonly reason: string };

export const hashText = (content: string): string =>
	`sha256:${createHash("sha256").update(content).digest("hex")}`;

export const hashTurnBody = (body: string): string => hashText(body.trimEnd());

export const parseManagedRegion = (
	content: string,
): ManagedRegionParseResult => {
	const starts = [...content.matchAll(START_RE)];
	if (starts.length === 0) {
		return { kind: "missing" };
	}
	if (starts.length > 1) {
		return { kind: "invalid", reason: "Duplicate Socratic Duel start markers" };
	}

	const start = starts[0];
	if (start.index === undefined) {
		return { kind: "invalid", reason: "Unable to locate start marker" };
	}

	const endIndex = content.indexOf(END_MARKER, start.index + start[0].length);
	if (endIndex === -1) {
		return { kind: "invalid", reason: "Missing Socratic Duel end marker" };
	}

	if (content.indexOf(END_MARKER, endIndex + END_MARKER.length) !== -1) {
		return { kind: "invalid", reason: "Duplicate Socratic Duel end markers" };
	}

	const prefix = content.slice(0, start.index);
	const region = content.slice(start.index, endIndex + END_MARKER.length);
	const suffix = content.slice(endIndex + END_MARKER.length);
	const turnsSection = extractTurnsMarkdown(region);
	if (turnsSection.kind === "invalid") {
		return turnsSection;
	}

	const turns = parseTurns(turnsSection.turnsMarkdown);
	if (turns.kind === "invalid") {
		return turns;
	}

	return {
		kind: "ok",
		managed: {
			duelId: start[1],
			prefix,
			region,
			suffix,
			turnsMarkdown: turnsSection.turnsMarkdown,
			turns: turns.turns,
		},
	};
};

const extractTurnsMarkdown = (
	region: string,
):
	| { readonly kind: "ok"; readonly turnsMarkdown: string }
	| { readonly kind: "invalid"; readonly reason: string } => {
	const turnsHeading = "\n### Turns\n";
	const conclusionHeading = "\n### Conclusion\n";
	const turnsStart = region.indexOf(turnsHeading);
	const conclusionStart = region.indexOf(conclusionHeading);

	if (turnsStart === -1 || conclusionStart === -1) {
		return {
			kind: "invalid",
			reason: "Managed region is missing Turns or Conclusion sections",
		};
	}
	if (conclusionStart < turnsStart) {
		return {
			kind: "invalid",
			reason: "Managed region sections are out of order",
		};
	}

	return {
		kind: "ok",
		turnsMarkdown: region.slice(
			turnsStart + turnsHeading.length,
			conclusionStart,
		),
	};
};

const parseTurns = (
	turnsMarkdown: string,
):
	| { readonly kind: "ok"; readonly turns: readonly ParsedTurnMarkdown[] }
	| { readonly kind: "invalid"; readonly reason: string } => {
	const matches = [...turnsMarkdown.matchAll(TURN_RE)];
	const turns = matches.map((match) => {
		const section = match[0];
		const body = match[4].trimEnd();
		return {
			id: match[1],
			number: Number.parseInt(match[2], 10),
			hash: match[3],
			body,
			section,
		};
	});

	if (turns.length === 0 && turnsMarkdown.trim().length > 0) {
		return {
			kind: "invalid",
			reason: "Turns section contains unrecognized content",
		};
	}

	const consumed = turns
		.map((turn) => turn.section)
		.reduce(
			(remaining, section) => remaining.replace(section, ""),
			turnsMarkdown,
		)
		.trim();
	if (consumed.length > 0) {
		return {
			kind: "invalid",
			reason: "Turns section contains content outside managed turn markers",
		};
	}

	const seen = new Set<number>();
	for (const [index, turn] of turns.entries()) {
		const expected = index + 1;
		if (turn.number !== expected) {
			return {
				kind: "invalid",
				reason: `Skipped or out-of-order turn number: expected ${expected}, found ${turn.number}`,
			};
		}
		if (seen.has(turn.number)) {
			return {
				kind: "invalid",
				reason: `Duplicate turn number: ${turn.number}`,
			};
		}
		seen.add(turn.number);

		const calculatedHash = hashTurnBody(turn.body);
		if (calculatedHash !== turn.hash) {
			return {
				kind: "invalid",
				reason: `Turn ${turn.number} hash mismatch`,
			};
		}
	}

	return { kind: "ok", turns };
};

export const readMarkdownDocument = (targetPath: string): Promise<string> =>
	readFile(targetPath, "utf-8");

export const writeMarkdownDocument = async (
	targetPath: string,
	content: string,
): Promise<void> => {
	const temporaryPath = join(
		dirname(targetPath),
		`.rp1-duel-${randomUUID()}.tmp`,
	);
	await writeFile(temporaryPath, content, "utf-8");
	await rename(temporaryPath, targetPath);
};

const escapeTableCell = (value: string): string =>
	value.replaceAll("|", "\\|").replace(/\s+/g, " ").trim();

const renderParticipantRows = (
	participants: readonly ParticipantRecord[],
): string => {
	if (participants.length === 0) {
		return "| Pending | Pending | Pending |";
	}

	return participants
		.map(
			(participant) =>
				`| ${escapeTableCell(participant.displayName)} | ${escapeTableCell(participant.harness)} | ${escapeTableCell(participant.modelId)} |`,
		)
		.join("\n");
};

const renderConclusion = (duel: DuelRecord): string => {
	if (duel.status === "ACTIVE") {
		return "Pending.";
	}

	return `**Outcome**: ${duel.status}\n\n${duel.conclusionSummary ?? "No summary provided."}`;
};

const renderRegion = (
	duel: DuelRecord,
	participants: readonly ParticipantRecord[],
	turnsMarkdown: string,
): string => `<!-- rp1:socratic-duel:start id="${duel.id}" -->
## Socratic Duel

**Status**: ${duel.status}
**Target**: \`${duel.targetPath}\`
**Max Turns**: ${duel.maxTurns}
**Candidate Convergence**: ${duel.candidateConvergence ? "YES" : "NO"}

### Participants
| Participant | Harness | Model |
|-------------|---------|-------|
${renderParticipantRows(participants)}

### Turns
${turnsMarkdown.trimEnd().length > 0 ? `\n${turnsMarkdown.trimEnd()}\n` : "\n"}
### Conclusion
${renderConclusion(duel)}
${END_MARKER}`;

export const ensureManagedRegion = (
	content: string,
	duel: DuelRecord,
	participants: readonly ParticipantRecord[],
): string => {
	const parsed = parseManagedRegion(content);
	if (parsed.kind === "missing") {
		const separator =
			content.length === 0 ? "" : content.endsWith("\n") ? "\n" : "\n\n";
		return `${content}${separator}${renderRegion(duel, participants, "")}\n`;
	}
	if (parsed.kind === "invalid") {
		throw new Error(parsed.reason);
	}

	return replaceManagedRegion(
		parsed.managed,
		renderRegion(duel, participants, parsed.managed.turnsMarkdown),
	);
};

export const updateManagedRegionMetadata = (
	content: string,
	duel: DuelRecord,
	participants: readonly ParticipantRecord[],
): string => {
	const parsed = parseManagedRegion(content);
	if (parsed.kind !== "ok") {
		throw new Error(
			parsed.kind === "missing" ? "Managed region is missing" : parsed.reason,
		);
	}

	return replaceManagedRegion(
		parsed.managed,
		renderRegion(duel, participants, parsed.managed.turnsMarkdown),
	);
};

const replaceManagedRegion = (
	managed: ManagedRegion,
	nextRegion: string,
): string => `${managed.prefix}${nextRegion}${managed.suffix}`;

const renderList = (items: readonly string[]): string =>
	items.map((item) => `- ${item.trim()}`).join("\n");

const renderSupportList = (items: readonly string[]): string =>
	items.map((item) => `    - ${item.trim()}`).join("\n");

const renderTurnBody = (
	turnNumber: number,
	participant: ParticipantRecord,
	turn: TurnInput,
): string => {
	const counterpoints = turn.counterpoints
		.map(
			(counterpoint) => `- Addresses: ${counterpoint.addresses.trim()}
  Claim: ${counterpoint.claim.trim()}
  Support:
${renderSupportList(counterpoint.support)}`,
		)
		.join("\n");

	const unresolvedItems = turn.unresolved_items
		.map(
			(item) =>
				`- ${item.item.trim()} (${item.blocking ? "blocking" : "non-blocking"})`,
		)
		.join("\n");

	const stanceRevisionSupport =
		turn.stance_revision_support && turn.stance_revision_support.length > 0
			? `\n\n**Stance Revision Support**\n${renderList(turn.stance_revision_support)}`
			: "";

	return `#### Turn ${turnNumber} - ${participant.displayName} (${participant.harness} / ${participant.modelId}) - ${turn.stance}

**Position**
${turn.position.trim()}

**Counterpoints**
${counterpoints}

**Agreements**
${renderList(turn.agreements)}

**Novel Argument**
${turn.novel_argument.claim.trim()}

Support:
${renderSupportList(turn.novel_argument.support)}

**Unresolved Items**
${unresolvedItems}${stanceRevisionSupport}`;
};

export const renderTurnSection = (
	turnId: string,
	turnNumber: number,
	participant: ParticipantRecord,
	turn: TurnInput,
): { readonly markdown: string; readonly turnHash: string } => {
	const body = renderTurnBody(turnNumber, participant, turn);
	const turnHash = hashTurnBody(body);

	return {
		markdown: `<!-- rp1:socratic-duel:turn id="${turnId}" number="${turnNumber}" hash="${turnHash}" -->
${body}
<!-- rp1:socratic-duel:turn:end -->`,
		turnHash,
	};
};

export const appendTurnToManagedRegion = (
	content: string,
	duel: DuelRecord,
	participants: readonly ParticipantRecord[],
	turnMarkdown: string,
): string => {
	const parsed = parseManagedRegion(content);
	if (parsed.kind !== "ok") {
		throw new Error(
			parsed.kind === "missing" ? "Managed region is missing" : parsed.reason,
		);
	}

	const turnsMarkdown = `${parsed.managed.turnsMarkdown.trimEnd()}${
		parsed.managed.turnsMarkdown.trimEnd().length > 0 ? "\n\n" : ""
	}${turnMarkdown}\n`;

	return replaceManagedRegion(
		parsed.managed,
		renderRegion(duel, participants, turnsMarkdown),
	);
};

export const terminalSummaryForOutcome = (
	outcome: TerminalOutcome,
	summary: string | null | undefined,
): string => summary?.trim() || `Duel adjourned with ${outcome}.`;
