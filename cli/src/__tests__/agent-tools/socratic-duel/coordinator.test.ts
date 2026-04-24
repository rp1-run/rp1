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
	executeClaimLock,
	executeJoin,
	executeRefreshLock,
	executeReleaseLock,
	executeStatus,
} from "../../../agent-tools/socratic-duel/index.js";
import { expectTaskRight } from "../../helpers/index.js";

describe("socratic-duel lock coordinator", () => {
	let tempDir: string;
	let dbPath: string;
	let targetPath: string;

	beforeEach(async () => {
		tempDir = await mkdtemp(join(tmpdir(), "socratic-duel-lock-"));
		dbPath = join(tempDir, "rp1.db");
		targetPath = join(tempDir, "target.md");
		await writeFile(targetPath, "# Target\n\nOriginal body.\n", "utf-8");
	});

	afterEach(async () => {
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

	const claimLock = async (duelId: string, participantId: string) =>
		expectTaskRight(executeClaimLock({ duelId, participantId }, dbPath));

	test("joins a lock context without editing the target Markdown", async () => {
		const beforeJoin = await readFile(targetPath, "utf-8");
		const first = await joinParticipant("participant-a");
		const resumed = await joinParticipant("participant-a");

		expect(first.duel_id).toBe(resumed.duel_id);
		expect(first.participant_id).toBe(resumed.participant_id);
		expect(first.participant_count).toBe(1);
		expect(resumed.participant_count).toBe(1);
		expect(first.next_step).toBe("wait_peer");
		expect(await readFile(targetPath, "utf-8")).toBe(beforeJoin);

		const status = await expectTaskRight(
			executeStatus({ duelId: first.duel_id }, dbPath),
		);
		expect(status.data.participant_count).toBe(1);
		expect(status.data.lock.owner_participant_id).toBeNull();
		expect(status.data.lock.expired).toBe(false);
	});

	test("rejects invalid targets and a third participant", async () => {
		const relativeTarget = await executeJoin(
			{
				targetPath: "relative.md",
				participantName: "participant-a",
				harness: "test-harness",
				modelId: "test-model",
			},
			dbPath,
		)();
		expect(E.isLeft(relativeTarget)).toBe(true);

		await joinParticipant("participant-a");
		await joinParticipant("participant-b");
		const third = await executeJoin(
			{
				targetPath,
				participantName: "participant-c",
				harness: "test-harness",
				modelId: "test-model",
			},
			dbPath,
		)();

		expect(E.isLeft(third)).toBe(true);
	});

	test("keeps participant status ordered by registration when timestamps tie", async () => {
		const first = await joinParticipant("participant-a");
		const second = await joinParticipant("participant-b");
		const db = await expectTaskRight(getEmitDatabase(dbPath));

		db.prepare(
			`UPDATE socratic_duel_participants
			 SET id = CASE id
				 WHEN $firstId THEN 'z-first-participant'
				 WHEN $secondId THEN 'a-second-participant'
				 ELSE id
			 END,
			 joined_at = $joinedAt
			 WHERE duel_id = $duelId`,
		).run({
			$duelId: first.duel_id,
			$firstId: first.participant_id,
			$secondId: second.participant_id,
			$joinedAt: "2026-04-24T00:00:00.000Z",
		});

		const status = await expectTaskRight(
			executeStatus({ duelId: first.duel_id }, dbPath),
		);
		expect(
			status.data.participants.map((participant) => participant.id),
		).toEqual(["z-first-participant", "a-second-participant"]);
	});

	test("grants one unexpired lock and tells the peer to wait", async () => {
		const first = await joinParticipant("participant-a");
		const second = await joinParticipant("participant-b");

		const firstClaim = await claimLock(first.duel_id, first.participant_id);
		expect(firstClaim.success).toBe(true);
		expect(firstClaim.data.acquired).toBe(true);
		expect(typeof firstClaim.data.lease_token).toBe("string");
		expect(firstClaim.data.owner_participant_id).toBe(first.participant_id);
		expect(firstClaim.data.next_step).toBe("compose_turn");

		const peerClaim = await claimLock(first.duel_id, second.participant_id);
		expect(peerClaim.success).toBe(true);
		expect(peerClaim.data.acquired).toBe(false);
		expect(peerClaim.data.owner_participant_id).toBe(first.participant_id);
		expect(peerClaim.data.reason).toBe("Peer owns an unexpired lock");
		expect(peerClaim.data.next_step).toBe("wait_turn");
	});

	test("refreshes only the current owner's matching lock token", async () => {
		const first = await joinParticipant("participant-a");
		const second = await joinParticipant("participant-b");
		const claim = await claimLock(first.duel_id, first.participant_id);
		const token = claim.data.lease_token ?? "";

		const rejectedPeer = await expectTaskRight(
			executeRefreshLock(
				{
					duelId: first.duel_id,
					participantId: second.participant_id,
					leaseToken: token,
				},
				dbPath,
			),
		);
		expect(rejectedPeer.success).toBe(true);
		expect(rejectedPeer.data.refreshed).toBe(false);
		expect(rejectedPeer.data.reason).toBe(
			"Participant does not own this lock token",
		);

		const refreshed = await expectTaskRight(
			executeRefreshLock(
				{
					duelId: first.duel_id,
					participantId: first.participant_id,
					leaseToken: token,
				},
				dbPath,
			),
		);
		expect(refreshed.success).toBe(true);
		expect(refreshed.data.refreshed).toBe(true);
		expect(refreshed.data.lease_token).toBe(token);
		expect(refreshed.data.next_step).toBe("compose_turn");
	});

	test("releases only the current owner's matching lock token", async () => {
		const first = await joinParticipant("participant-a");
		const second = await joinParticipant("participant-b");
		const claim = await claimLock(first.duel_id, first.participant_id);
		const token = claim.data.lease_token ?? "";

		const rejectedPeer = await expectTaskRight(
			executeReleaseLock(
				{
					duelId: first.duel_id,
					participantId: second.participant_id,
					leaseToken: token,
				},
				dbPath,
			),
		);
		expect(rejectedPeer.success).toBe(true);
		expect(rejectedPeer.data.released).toBe(false);
		expect(rejectedPeer.data.owner_participant_id).toBe(first.participant_id);

		const released = await expectTaskRight(
			executeReleaseLock(
				{
					duelId: first.duel_id,
					participantId: first.participant_id,
					leaseToken: token,
				},
				dbPath,
			),
		);
		expect(released.success).toBe(true);
		expect(released.data.released).toBe(true);
		expect(released.data.owner_participant_id).toBeNull();
		expect(released.data.next_step).toBe("claim_lock");

		const peerClaim = await claimLock(first.duel_id, second.participant_id);
		expect(peerClaim.data.acquired).toBe(true);
		expect(peerClaim.data.owner_participant_id).toBe(second.participant_id);
	});

	test("lets a peer claim after lock expiry and rejects stale refresh", async () => {
		const first = await joinParticipant("participant-a");
		const second = await joinParticipant("participant-b");
		const claim = await claimLock(first.duel_id, first.participant_id);
		const staleToken = claim.data.lease_token ?? "";

		const db = await expectTaskRight(getEmitDatabase(dbPath));
		db.prepare(
			"UPDATE socratic_duels SET lease_expires_at = $leaseExpiresAt WHERE id = $id",
		).run({
			$id: first.duel_id,
			$leaseExpiresAt: new Date(0).toISOString(),
		});

		const staleRefresh = await expectTaskRight(
			executeRefreshLock(
				{
					duelId: first.duel_id,
					participantId: first.participant_id,
					leaseToken: staleToken,
				},
				dbPath,
			),
		);
		expect(staleRefresh.data.refreshed).toBe(false);
		expect(staleRefresh.data.reason).toBe("Current lock has expired");

		const peerClaim = await claimLock(first.duel_id, second.participant_id);
		expect(peerClaim.data.acquired).toBe(true);
		expect(peerClaim.data.owner_participant_id).toBe(second.participant_id);
		expect(peerClaim.data.lease_token).not.toBe(staleToken);
	});

	test("closes a lock context without storing terminal debate content", async () => {
		const first = await joinParticipant("participant-a");
		const second = await joinParticipant("participant-b");
		const claim = await claimLock(first.duel_id, first.participant_id);

		const closed = await expectTaskRight(
			executeReleaseLock(
				{
					duelId: first.duel_id,
					participantId: first.participant_id,
					leaseToken: claim.data.lease_token ?? "",
					close: true,
				},
				dbPath,
			),
		);
		expect(closed.success).toBe(true);
		expect(closed.data.closed).toBe(true);
		expect(closed.data.status).toBe("CLOSED");
		expect(closed.data.next_step).toBe("closed");

		const status = await expectTaskRight(
			executeStatus({ duelId: first.duel_id }, dbPath),
		);
		expect(status.data.duel.status).toBe("CLOSED");
		expect(status.data.duel.currentOwnerId).toBeNull();
		expect(status.data.duel).not.toHaveProperty("conclusionSummary");
		expect(status.data.duel).not.toHaveProperty("candidateConvergence");
		expect(
			status.data.participants.map((participant) => participant.id),
		).toEqual([first.participant_id, second.participant_id]);

		const newRun = await joinParticipant("participant-a");
		expect(newRun.duel_id).not.toBe(first.duel_id);
	});
});
