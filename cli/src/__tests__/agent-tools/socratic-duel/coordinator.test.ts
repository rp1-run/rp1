import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as E from "fp-ts/lib/Either.js";
import {
	closeDatabase,
	getEmitDatabase,
	resetInstance,
} from "../../../agent-tools/emit/database.js";
import {
	executeAdjourn,
	executeClaimTurn,
	executeJoin,
	executeStatus,
	executeSubmitTurn,
} from "../../../agent-tools/socratic-duel/index.js";
import type { TurnInput } from "../../../agent-tools/socratic-duel/models.js";
import { expectTaskRight } from "../../helpers/index.js";

const realDateNow = Date.now;

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

describe("socratic-duel coordinator", () => {
	let tempDir: string;
	let dbPath: string;
	let targetPath: string;

	beforeEach(async () => {
		tempDir = await mkdtemp(join(tmpdir(), "socratic-duel-coordinator-"));
		dbPath = join(tempDir, "rp1.db");
		targetPath = join(tempDir, "target.md");
		await writeFile(targetPath, "# Target\n\nOriginal body.\n", "utf-8");
	});

	afterEach(async () => {
		Date.now = realDateNow;
		closeDatabase();
		resetInstance();
		await rm(tempDir, { recursive: true, force: true });
	});

	const joinParticipantForPath = async (
		path: string,
		participantName: string,
	) => {
		const result = await expectTaskRight(
			executeJoin(
				{
					targetPath: path,
					participantName,
					harness: "test-harness",
					modelId: "test-model",
				},
				dbPath,
			),
		);

		expect(result.success).toBe(true);
		return result.data;
	};

	const joinParticipant = async (participantName: string) =>
		joinParticipantForPath(targetPath, participantName);

	const claimAndSubmit = async (
		duelId: string,
		participantId: string,
		turn: TurnInput,
	) => {
		const claim = await expectTaskRight(
			executeClaimTurn({ duelId, participantId }, dbPath),
		);
		expect(claim.success).toBe(true);
		expect(claim.data.acquired).toBe(true);
		expect(claim.data.prior_region_hash).not.toBeNull();

		const submit = await expectTaskRight(
			executeSubmitTurn(
				{
					duelId,
					participantId,
					priorRegionHash: claim.data.prior_region_hash ?? "",
					turn,
				},
				dbPath,
			),
		);
		expect(submit.success).toBe(true);
		return submit.data;
	};

	const claimTurn = async (duelId: string, participantId: string) =>
		expectTaskRight(executeClaimTurn({ duelId, participantId }, dbPath));

	test("rejects accepted consensus while the current turn has blocking unresolved items", async () => {
		const first = await joinParticipant("participant-a");
		const second = await joinParticipant("participant-b");

		await claimAndSubmit(first.duel_id, first.participant_id, makeTurn("a1"));
		await claimAndSubmit(
			first.duel_id,
			second.participant_id,
			makeTurn("b1", {
				stance: "ACCEPTING_CONSENSUS",
				terminal_summary: "Participant B sees consensus.",
			}),
		);

		const claim = await expectTaskRight(
			executeClaimTurn(
				{ duelId: first.duel_id, participantId: first.participant_id },
				dbPath,
			),
		);
		const beforeSubmit = await readFile(targetPath, "utf-8");
		const rejected = await expectTaskRight(
			executeSubmitTurn(
				{
					duelId: first.duel_id,
					participantId: first.participant_id,
					priorRegionHash: claim.data.prior_region_hash ?? "",
					turn: makeTurn("a2", {
						stance: "ACCEPTING_CONSENSUS",
						unresolved_items: [
							{ item: "Blocking support gap remains", blocking: true },
						],
						stance_revision_support: ["Principle: test evidence"],
						terminal_outcome: "ACCEPTED_CONSENSUS",
						terminal_summary: "Consensus despite a blocker.",
					}),
				},
				dbPath,
			),
		);

		expect(rejected.success).toBe(false);
		expect(rejected.errors?.map((error) => error.message).join("\n")).toContain(
			"requires no blocking unresolved items",
		);
		expect(await readFile(targetPath, "utf-8")).toBe(beforeSubmit);

		const status = await expectTaskRight(
			executeStatus({ duelId: first.duel_id }, dbPath),
		);
		expect(status.data.duel.status).toBe("ACTIVE");
		expect(status.data.turns).toHaveLength(2);
	});

	test("does not append Markdown when database turn persistence fails", async () => {
		const first = await joinParticipant("participant-a");
		await joinParticipant("participant-b");
		const claim = await expectTaskRight(
			executeClaimTurn(
				{ duelId: first.duel_id, participantId: first.participant_id },
				dbPath,
			),
		);
		expect(claim.success).toBe(true);
		expect(claim.data.acquired).toBe(true);

		const db = await expectTaskRight(getEmitDatabase(dbPath));
		db.prepare(
			"UPDATE socratic_duels SET lease_expires_at = $leaseExpiresAt WHERE id = $id",
		).run({
			$id: first.duel_id,
			$leaseExpiresAt: new Date(1000).toISOString(),
		});

		const beforeSubmit = await readFile(targetPath, "utf-8");
		let nowCalls = 0;
		Date.now = () => {
			nowCalls += 1;
			return nowCalls === 1 ? 500 : 1500;
		};

		const result = await executeSubmitTurn(
			{
				duelId: first.duel_id,
				participantId: first.participant_id,
				priorRegionHash: claim.data.prior_region_hash ?? "",
				turn: makeTurn("db-failure"),
			},
			dbPath,
		)();
		Date.now = realDateNow;

		expect(E.isLeft(result)).toBe(true);
		expect(await readFile(targetPath, "utf-8")).toBe(beforeSubmit);

		const status = await expectTaskRight(
			executeStatus({ duelId: first.duel_id }, dbPath),
		);
		expect(status.data.turns).toHaveLength(0);
		expect(status.data.duel.status).toBe("ACTIVE");
	});

	test("enforces lease ownership and turn alternation", async () => {
		const first = await joinParticipant("participant-a");
		const second = await joinParticipant("participant-b");

		const firstClaim = await claimTurn(first.duel_id, first.participant_id);
		expect(firstClaim.success).toBe(true);
		expect(firstClaim.data.acquired).toBe(true);

		const peerClaim = await claimTurn(first.duel_id, second.participant_id);
		expect(peerClaim.success).toBe(true);
		expect(peerClaim.data.acquired).toBe(false);
		expect(peerClaim.data.owner_participant_id).toBe(first.participant_id);
		expect(peerClaim.data.reason).toBe("Peer owns an unexpired turn lease");

		const submit = await expectTaskRight(
			executeSubmitTurn(
				{
					duelId: first.duel_id,
					participantId: first.participant_id,
					priorRegionHash: firstClaim.data.prior_region_hash ?? "",
					turn: makeTurn("a1"),
				},
				dbPath,
			),
		);
		expect(submit.success).toBe(true);

		const repeatedClaim = await claimTurn(first.duel_id, first.participant_id);
		expect(repeatedClaim.success).toBe(true);
		expect(repeatedClaim.data.acquired).toBe(false);
		expect(repeatedClaim.data.reason).toBe(
			"Turn alternation requires the peer participant to continue",
		);
	});

	test("allows continuation after the peer turn lease expires", async () => {
		const first = await joinParticipant("participant-a");
		const second = await joinParticipant("participant-b");

		await claimAndSubmit(first.duel_id, first.participant_id, makeTurn("a1"));
		const peerClaim = await claimTurn(first.duel_id, second.participant_id);
		expect(peerClaim.success).toBe(true);
		expect(peerClaim.data.acquired).toBe(true);

		const db = await expectTaskRight(getEmitDatabase(dbPath));
		db.prepare(
			"UPDATE socratic_duels SET lease_expires_at = $leaseExpiresAt WHERE id = $id",
		).run({
			$id: first.duel_id,
			$leaseExpiresAt: new Date(0).toISOString(),
		});

		const continuation = await claimTurn(first.duel_id, first.participant_id);
		expect(continuation.success).toBe(true);
		expect(continuation.data.acquired).toBe(true);
		expect(continuation.data.reason).toBe("Peer lease expired");
		expect(continuation.data.owner_participant_id).toBe(first.participant_id);
	});

	test("marks candidate convergence without adjourning", async () => {
		const first = await joinParticipant("participant-a");
		const second = await joinParticipant("participant-b");

		await claimAndSubmit(
			first.duel_id,
			first.participant_id,
			makeTurn("a1", { stance: "CONVERGING" }),
		);
		const result = await claimAndSubmit(
			first.duel_id,
			second.participant_id,
			makeTurn("b1", { stance: "CONVERGING" }),
		);

		expect(result.status).toBe("ACTIVE");
		expect(result.terminal_outcome).toBeNull();
		expect(result.candidate_convergence).toBe(true);

		const document = await readFile(targetPath, "utf-8");
		expect(document).toContain("**Candidate Convergence**: YES");
		expect(document).toContain("Pending.");
	});

	test("records max turns on the sixth accepted turn", async () => {
		const first = await joinParticipant("participant-a");
		const second = await joinParticipant("participant-b");
		let result = await claimAndSubmit(
			first.duel_id,
			first.participant_id,
			makeTurn("a1"),
		);

		for (const [participantId, label] of [
			[second.participant_id, "b1"],
			[first.participant_id, "a2"],
			[second.participant_id, "b2"],
			[first.participant_id, "a3"],
			[second.participant_id, "b3"],
		] as const) {
			result = await claimAndSubmit(
				first.duel_id,
				participantId,
				makeTurn(label),
			);
		}

		expect(result.status).toBe("MAX_TURNS");
		expect(result.terminal_outcome).toBe("MAX_TURNS");
		expect(result.next_step).toBe("adjourn");

		const status = await expectTaskRight(
			executeStatus({ duelId: first.duel_id }, dbPath),
		);
		expect(status.data.duel.status).toBe("MAX_TURNS");
		expect(status.data.turns).toHaveLength(6);
		expect(await readFile(targetPath, "utf-8")).toContain(
			"**Outcome**: MAX_TURNS",
		);
	});

	test("records accepted consensus only after both participants accept", async () => {
		const first = await joinParticipant("participant-a");
		const second = await joinParticipant("participant-b");

		await claimAndSubmit(first.duel_id, first.participant_id, makeTurn("a1"));
		const firstAcceptance = await claimAndSubmit(
			first.duel_id,
			second.participant_id,
			makeTurn("b1", {
				stance: "ACCEPTING_CONSENSUS",
				terminal_summary: "Participant B accepts supported consensus.",
			}),
		);
		expect(firstAcceptance.status).toBe("ACTIVE");

		const consensus = await claimAndSubmit(
			first.duel_id,
			first.participant_id,
			makeTurn("a2", {
				stance: "ACCEPTING_CONSENSUS",
				stance_revision_support: ["Principle: peer evidence resolved scope"],
				terminal_outcome: "ACCEPTED_CONSENSUS",
				terminal_summary: "Both participants accept the supported consensus.",
			}),
		);

		expect(consensus.status).toBe("ACCEPTED_CONSENSUS");
		expect(consensus.terminal_outcome).toBe("ACCEPTED_CONSENSUS");
		expect(await readFile(targetPath, "utf-8")).toContain(
			"Both participants accept the supported consensus.",
		);
	});

	test("records dissent and timeout adjournments distinctly", async () => {
		const first = await joinParticipant("participant-a");
		const second = await joinParticipant("participant-b");

		await claimAndSubmit(first.duel_id, first.participant_id, makeTurn("a1"));
		await claimAndSubmit(first.duel_id, second.participant_id, makeTurn("b1"));

		const dissent = await expectTaskRight(
			executeAdjourn(
				{
					duelId: first.duel_id,
					participantId: first.participant_id,
					outcome: "DISSENT",
					summary: "Material disagreement remains.",
				},
				dbPath,
			),
		);
		expect(dissent.success).toBe(true);
		expect(dissent.data.status).toBe("DISSENT");
		expect(await readFile(targetPath, "utf-8")).toContain(
			"**Outcome**: DISSENT",
		);

		const secondTargetPath = join(tempDir, "timeout-target.md");
		await writeFile(secondTargetPath, "# Timeout Target\n", "utf-8");
		const timeoutParticipant = await joinParticipantForPath(
			secondTargetPath,
			"timeout-a",
		);
		await joinParticipantForPath(secondTargetPath, "timeout-b");

		const timeout = await expectTaskRight(
			executeAdjourn(
				{
					duelId: timeoutParticipant.duel_id,
					participantId: timeoutParticipant.participant_id,
					outcome: "TIMEOUT",
					summary: "Peer did not return within the bounded wait policy.",
				},
				dbPath,
			),
		);
		expect(timeout.success).toBe(true);
		expect(timeout.data.status).toBe("TIMEOUT");
		expect(await readFile(secondTargetPath, "utf-8")).toContain(
			"**Outcome**: TIMEOUT",
		);
	});

	test("invalidates the duel when an accepted turn body is tampered", async () => {
		const first = await joinParticipant("participant-a");
		const second = await joinParticipant("participant-b");

		await claimAndSubmit(first.duel_id, first.participant_id, makeTurn("a1"));
		const beforeTamper = await readFile(targetPath, "utf-8");
		await writeFile(
			targetPath,
			beforeTamper.replace("Position a1", "Position tampered"),
			"utf-8",
		);

		const result = await claimTurn(first.duel_id, second.participant_id);
		expect(result.success).toBe(false);
		expect(result.errors?.map((error) => error.message).join("\n")).toContain(
			"hash mismatch",
		);

		const status = await expectTaskRight(
			executeStatus({ duelId: first.duel_id }, dbPath),
		);
		expect(status.data.duel.status).toBe("INVALIDATED");
		expect(status.data.next_step).toBe("adjourn");
	});
});
