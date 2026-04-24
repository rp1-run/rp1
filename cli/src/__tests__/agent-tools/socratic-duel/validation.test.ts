import { describe, expect, test } from "bun:test";
import type {
	ParticipantRecord,
	TurnInput,
	TurnRecord,
} from "../../../agent-tools/socratic-duel/models.js";
import { validateTurnInput } from "../../../agent-tools/socratic-duel/validation.js";

const participant: ParticipantRecord = {
	id: "participant-a",
	duelId: "duel-1",
	displayName: "Participant A",
	harness: "codex",
	modelId: "gpt-test",
	joinedAt: "2026-04-24T00:00:00.000Z",
	lastSeenAt: "2026-04-24T00:00:00.000Z",
};

const makeTurn = (
	label: string,
	overrides: Partial<TurnInput> = {},
): TurnInput => ({
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
	...overrides,
});

const makePriorTurn = (
	label: string,
	overrides: Partial<TurnRecord> = {},
): TurnRecord => ({
	id: `turn-${label}`,
	duelId: "duel-1",
	turnNumber: 1,
	participantId: participant.id,
	stance: "OPEN_TO_DEBATE",
	turnHash: `sha256:${label}`,
	priorRegionHash: `sha256:prior-${label}`,
	contentJson: JSON.stringify(makeTurn(label)),
	acceptedAt: "2026-04-24T00:00:00.000Z",
	...overrides,
});

const messagesFor = (
	turn: TurnInput,
	priorTurns: readonly TurnRecord[] = [],
): string =>
	validateTurnInput(turn, priorTurns, participant)
		.map((issue) => issue.message)
		.join("\n");

describe("socratic-duel turn validation", () => {
	test("rejects missing required sections and invalid stance values", () => {
		const cases: readonly [string, TurnInput, string][] = [
			[
				"stance",
				{ ...makeTurn("stance"), stance: "INVALID" } as unknown as TurnInput,
				"Invalid stance",
			],
			[
				"position",
				{ ...makeTurn("position"), position: " " },
				"Position must be non-empty",
			],
			[
				"counterpoints",
				{ ...makeTurn("counterpoints"), counterpoints: [] },
				"Counterpoints must be a non-empty array",
			],
			[
				"agreements",
				{ ...makeTurn("agreements"), agreements: [] },
				"Agreements must be a non-empty array",
			],
			[
				"novel_argument",
				{
					...makeTurn("novel"),
					novel_argument: undefined,
				} as unknown as TurnInput,
				"Novel argument must be an object",
			],
			[
				"unresolved_items",
				{ ...makeTurn("unresolved"), unresolved_items: [] },
				"Unresolved items must be a non-empty array",
			],
		];

		for (const [name, turn, expected] of cases) {
			expect(messagesFor(turn), name).toContain(expected);
		}
	});

	test("enforces support references and stance revision evidence", () => {
		const priorTurns = [makePriorTurn("prior")];
		const messages = messagesFor(
			makeTurn("revision", {
				stance: "REVISING",
				counterpoints: [
					{
						addresses: "Turn 1",
						claim: "Counterpoint without accepted support",
						support: ["because I think so"],
					},
				],
				novel_argument: {
					claim: "A revised novel claim",
					support: ["unsupported source"],
				},
			}),
			priorTurns,
		);

		expect(messages).toContain(
			"Support entries must be URLs, file references, or Principle: ... entries",
		);
		expect(messages).toContain("Support must be a non-empty array");
	});

	test("rejects duplicate novelty, blocked consensus, and submit-only terminal outcomes", () => {
		const priorTurns = [makePriorTurn("prior")];

		const duplicateMessages = messagesFor(
			makeTurn("duplicate", {
				novel_argument: {
					claim: "Novel claim prior",
					support: ["Principle: test evidence"],
				},
			}),
			priorTurns,
		);
		expect(duplicateMessages).toContain(
			"Novel argument duplicates a prior claim",
		);

		const consensusMessages = messagesFor(
			makeTurn("consensus", {
				stance: "ACCEPTING_CONSENSUS",
				unresolved_items: [{ item: "Still blocked", blocking: true }],
				terminal_outcome: "ACCEPTED_CONSENSUS",
			}),
			priorTurns,
		);
		expect(consensusMessages).toContain(
			"ACCEPTING_CONSENSUS requires no blocking unresolved items",
		);
		expect(consensusMessages).toContain(
			"ACCEPTED_CONSENSUS requires no blocking unresolved items",
		);

		const terminalMessages = messagesFor(
			makeTurn("terminal", {
				terminal_outcome: "TIMEOUT",
			}),
		);
		expect(terminalMessages).toContain(
			"TIMEOUT, INVALIDATED, and MAX_TURNS outcomes are not accepted from submit-turn JSON",
		);
	});
});
