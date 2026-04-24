import { describe, expect, test } from "bun:test";
import {
	appendTurnToManagedRegion,
	ensureManagedRegion,
	parseManagedRegion,
	renderTurnSection,
} from "../../../agent-tools/socratic-duel/markdown.js";
import type {
	DuelRecord,
	ParticipantRecord,
	TurnInput,
} from "../../../agent-tools/socratic-duel/models.js";

const duel: DuelRecord = {
	id: "duel-1",
	targetPath: "/tmp/target.md",
	targetKey: "/tmp/target.md",
	status: "ACTIVE",
	maxTurns: 6,
	nextTurnNumber: 1,
	currentOwnerId: null,
	leaseExpiresAt: null,
	candidateConvergence: false,
	conclusionSummary: null,
	createdAt: "2026-04-24T00:00:00.000Z",
	updatedAt: "2026-04-24T00:00:00.000Z",
};

const participants: readonly ParticipantRecord[] = [
	{
		id: "participant-a",
		duelId: duel.id,
		displayName: "Participant A",
		harness: "codex",
		modelId: "gpt-test",
		joinedAt: "2026-04-24T00:00:00.000Z",
		lastSeenAt: "2026-04-24T00:00:00.000Z",
	},
	{
		id: "participant-b",
		duelId: duel.id,
		displayName: "Participant B",
		harness: "claude-code",
		modelId: "claude-test",
		joinedAt: "2026-04-24T00:00:01.000Z",
		lastSeenAt: "2026-04-24T00:00:01.000Z",
	},
];

const makeTurn = (label: string): TurnInput => ({
	stance: "OPEN_TO_DEBATE",
	position: `Position ${label}`,
	counterpoints: [
		{
			addresses: "Target document",
			claim: `Counterpoint ${label}`,
			support: ["Principle: test evidence"],
		},
	],
	agreements: [`Agreement ${label}`],
	novel_argument: {
		claim: `Novel claim ${label}`,
		support: ["Principle: test evidence"],
	},
	unresolved_items: [{ item: `Unresolved ${label}`, blocking: false }],
});

const expectInvalid = (content: string, expectedReason: string): void => {
	const parsed = parseManagedRegion(content);
	expect(parsed.kind).toBe("invalid");
	if (parsed.kind === "invalid") {
		expect(parsed.reason).toContain(expectedReason);
	}
};

describe("socratic-duel managed Markdown region", () => {
	test("rejects duplicate and malformed managed regions", () => {
		const region = ensureManagedRegion("", duel, participants);

		expectInvalid(
			`${region}\n${region}`,
			"Duplicate Socratic Duel start markers",
		);
		expectInvalid(
			region.replace("### Conclusion", "### Closing"),
			"missing Turns or Conclusion sections",
		);
		expectInvalid(
			`${region.trimEnd()}\n<!-- rp1:socratic-duel:end -->\n`,
			"Duplicate Socratic Duel end markers",
		);
	});

	test("preserves prefix, suffix, and prior turn bodies when appending", () => {
		const emptyRegion = ensureManagedRegion(
			"# Target\n\nOriginal body.\n",
			duel,
			participants,
		);
		const content = `${emptyRegion}\n## Later Notes\n\nHuman notes stay here.\n`;
		const firstTurn = renderTurnSection(
			"turn-1",
			1,
			participants[0],
			makeTurn("alpha"),
		);
		const withFirstTurn = appendTurnToManagedRegion(
			content,
			duel,
			participants,
			firstTurn.markdown,
		);
		const parsedFirst = parseManagedRegion(withFirstTurn);
		expect(parsedFirst.kind).toBe("ok");
		if (parsedFirst.kind !== "ok") {
			throw new Error("expected first append to parse");
		}

		const firstSection = parsedFirst.managed.turns[0].section;
		const secondTurn = renderTurnSection(
			"turn-2",
			2,
			participants[1],
			makeTurn("beta"),
		);
		const withSecondTurn = appendTurnToManagedRegion(
			withFirstTurn,
			{ ...duel, nextTurnNumber: 2 },
			participants,
			secondTurn.markdown,
		);
		const parsedSecond = parseManagedRegion(withSecondTurn);

		expect(parsedSecond.kind).toBe("ok");
		if (parsedSecond.kind === "ok") {
			expect(parsedSecond.managed.prefix).toBe(parsedFirst.managed.prefix);
			expect(parsedSecond.managed.suffix).toBe(parsedFirst.managed.suffix);
			expect(parsedSecond.managed.turns).toHaveLength(2);
			expect(parsedSecond.managed.turns[0].section).toBe(firstSection);
		}
		expect(withSecondTurn).toContain("# Target\n\nOriginal body.");
		expect(withSecondTurn).toContain(
			"## Later Notes\n\nHuman notes stay here.",
		);
	});

	test("rejects tampered turn bodies, duplicate turns, and skipped turn numbers", () => {
		const region = ensureManagedRegion("", duel, participants);
		const firstTurn = renderTurnSection(
			"turn-1",
			1,
			participants[0],
			makeTurn("alpha"),
		);
		const content = appendTurnToManagedRegion(
			region,
			duel,
			participants,
			firstTurn.markdown,
		);

		expectInvalid(
			content.replace("Position alpha", "Position edited"),
			"hash mismatch",
		);
		expectInvalid(
			content.replace(
				"\n### Conclusion",
				`\n\n${firstTurn.markdown}\n### Conclusion`,
			),
			"turn number",
		);
		expectInvalid(
			content.replace('number="1"', 'number="2"'),
			"Skipped or out-of-order turn number",
		);
	});
});
