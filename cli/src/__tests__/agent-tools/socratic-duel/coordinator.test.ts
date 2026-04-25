import {
	afterEach,
	beforeEach,
	describe,
	expect,
	setSystemTime,
	test,
} from "bun:test";
import {
	chmod,
	mkdir,
	mkdtemp,
	readFile,
	realpath,
	rm,
	writeFile,
} from "node:fs/promises";
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
	let debateDir: string;

	beforeEach(async () => {
		tempDir = await realpath(
			await mkdtemp(join(tmpdir(), "socratic-duel-lock-")),
		);
		dbPath = join(tempDir, "rp1.db");
		targetPath = join(tempDir, "target.md");
		debateDir = join(tempDir, "debates");
		await writeFile(targetPath, "# Target\n\nOriginal body.\n", "utf-8");
	});

	afterEach(async () => {
		setSystemTime();
		closeDatabase();
		resetInstance();
		await rm(tempDir, { recursive: true, force: true });
	});

	const joinParticipantForPath = async (
		path: string,
		participantName: string,
		topic = "Target",
	) => {
		const result = await expectTaskRight(
			executeJoin(
				{
					targetPath: path,
					topic,
					debateDir,
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

	const joinParticipant = async (participantName: string, topic = "Target") =>
		joinParticipantForPath(targetPath, participantName, topic);

	const localDateSlug = (): string => {
		const date = new Date();
		const year = date.getFullYear();
		const month = String(date.getMonth() + 1).padStart(2, "0");
		const day = String(date.getDate()).padStart(2, "0");
		return `${year}-${month}-${day}`;
	};

	const freezeDebateDate = (): string => {
		setSystemTime(new Date(2026, 3, 25, 12, 0, 0));
		return localDateSlug();
	};

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
		expect(first.source_path).toBe(targetPath);
		expect(first.topic).toBe("Target");
		expect(first.topic_slug).toBe("target");
		expect(first.debate_path).toMatch(
			new RegExp(`${debateDir}/\\d{4}-\\d{2}-\\d{2}-target\\.md$`),
		);
		expect(first.target_key).toBe(
			JSON.stringify([first.source_path, "target"]),
		);
		expect(await readFile(targetPath, "utf-8")).toBe(beforeJoin);

		const status = await expectTaskRight(
			executeStatus({ duelId: first.duel_id }, dbPath),
		);
		expect(status.data.participant_count).toBe(1);
		expect(status.data.source_path).toBe(targetPath);
		expect(status.data.topic).toBe("Target");
		expect(status.data.topic_slug).toBe("target");
		expect(status.data.debate_path).toBe(first.debate_path);
		expect(status.data.lock.owner_participant_id).toBeNull();
		expect(status.data.lock.lease_token).toBeNull();
		expect(status.data.duel.leaseToken).toBeNull();
		expect(status.data.lock.expired).toBe(false);
	});

	test("resumes by source plus topic and separates different topics", async () => {
		const first = await joinParticipant("participant-a", "Focused Topic");
		const resumed = await joinParticipant("participant-b", "Focused Topic");
		const differentTopic = await joinParticipant(
			"participant-a",
			"Other Topic",
		);

		expect(resumed.duel_id).toBe(first.duel_id);
		expect(resumed.debate_path).toBe(first.debate_path);
		expect(differentTopic.duel_id).not.toBe(first.duel_id);
		expect(differentTopic.debate_path).not.toBe(first.debate_path);

		const status = await expectTaskRight(
			executeStatus({ targetPath, topic: "Focused Topic" }, dbPath),
		);
		expect(status.data.duel.id).toBe(first.duel_id);
		expect(status.data.topic_slug).toBe("focused-topic");
	});

	test("allocates a suffixed debate path when the date-topic file exists", async () => {
		const debateDate = freezeDebateDate();
		await mkdir(debateDir, { recursive: true });
		await writeFile(
			join(debateDir, `${debateDate}-collision-topic.md`),
			"# Existing debate\n",
			"utf-8",
		);

		const first = await joinParticipant("participant-a", "Collision Topic");

		expect(first.debate_path).toBe(
			join(debateDir, `${debateDate}-collision-topic-2.md`),
		);
	});

	test("allocates a suffixed debate path when a prior closed duel owns the base path", async () => {
		const debateDate = freezeDebateDate();
		const first = await joinParticipant("participant-a", "Reusable Topic");
		const second = await joinParticipant("participant-b", "Reusable Topic");
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
		expect(closed.data.closed).toBe(true);
		expect(second.debate_path).toBe(first.debate_path);

		const newRun = await joinParticipant("participant-a", "Reusable Topic");

		expect(newRun.duel_id).not.toBe(first.duel_id);
		expect(newRun.debate_path).toBe(
			join(debateDir, `${debateDate}-reusable-topic-2.md`),
		);
	});

	test("joins with a readable source that is not writable", async () => {
		await chmod(targetPath, 0o444);
		try {
			const first = await joinParticipant("participant-a", "Read Only Source");

			expect(first.topic_slug).toBe("read-only-source");
			expect(first.debate_path).toMatch(
				new RegExp(`${debateDir}/\\d{4}-\\d{2}-\\d{2}-read-only-source\\.md$`),
			);
		} finally {
			await chmod(targetPath, 0o644);
		}
	});

	test("reads legacy v15 active rows with nullable debate metadata after migration", async () => {
		const { Database } = await import("bun:sqlite");
		const rawDb = new Database(dbPath, { create: true });
		rawDb.exec("PRAGMA journal_mode = WAL;");
		rawDb.exec("PRAGMA foreign_keys = ON;");
		rawDb.exec(`
			CREATE TABLE schema_version (version INTEGER NOT NULL);
			INSERT INTO schema_version (version) VALUES (15);
			CREATE TABLE runs (
				id TEXT PRIMARY KEY NOT NULL,
				flow TEXT NOT NULL,
				feature_id TEXT NOT NULL,
				project_path TEXT NOT NULL,
				rp1_project_root TEXT NOT NULL,
				rp1_kb_root TEXT NOT NULL,
				rp1_work_root TEXT NOT NULL,
				project_id TEXT DEFAULT NULL,
				run_policy TEXT DEFAULT NULL CHECK(run_policy IN ('fresh', 'resumable')),
				work_identity TEXT DEFAULT NULL,
				bootstrap_context TEXT DEFAULT NULL,
				name TEXT DEFAULT NULL,
				harness TEXT DEFAULT NULL,
				status TEXT NOT NULL DEFAULT 'not_started',
				created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
				updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
			);
			CREATE TABLE socratic_duels (
				id TEXT PRIMARY KEY NOT NULL,
				target_path TEXT NOT NULL,
				target_key TEXT NOT NULL,
				status TEXT NOT NULL DEFAULT 'ACTIVE',
				current_owner_id TEXT DEFAULT NULL,
				lease_token TEXT DEFAULT NULL,
				lease_expires_at TEXT DEFAULT NULL,
				created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
				updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
			);
			CREATE TABLE socratic_duel_participants (
				id TEXT PRIMARY KEY NOT NULL,
				duel_id TEXT NOT NULL,
				display_name TEXT NOT NULL,
				harness TEXT NOT NULL,
				model_id TEXT NOT NULL,
				joined_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
				last_seen_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
			);
		`);
		rawDb
			.prepare(
				`INSERT INTO socratic_duels (
					id, target_path, target_key, status, current_owner_id, lease_token, lease_expires_at
				) VALUES (
					'duel-v15', $targetPath, $targetPath, 'ACTIVE',
					'participant-v15', 'lease-v15', '2099-01-01T00:00:00.000Z'
				)`,
			)
			.run({ $targetPath: targetPath });
		rawDb
			.prepare(
				`INSERT INTO socratic_duel_participants (
					id, duel_id, display_name, harness, model_id
				) VALUES (
					'participant-v15', 'duel-v15', 'Legacy Codex', 'codex', 'gpt-5'
				)`,
			)
			.run();
		rawDb.close();

		const statusById = await expectTaskRight(
			executeStatus({ duelId: "duel-v15" }, dbPath),
		);
		const statusByTarget = await expectTaskRight(
			executeStatus({ targetPath }, dbPath),
		);

		expect(statusById.data.duel.id).toBe("duel-v15");
		expect(statusByTarget.data.duel.id).toBe("duel-v15");
		expect(statusById.data.source_path).toBe(targetPath);
		expect(statusById.data.target_key).toBe(targetPath);
		expect(statusById.data.topic).toBeNull();
		expect(statusById.data.topic_slug).toBeNull();
		expect(statusById.data.debate_path).toBeNull();
		expect(statusById.data.lock.owner_participant_id).toBe("participant-v15");
		expect(statusById.data.lock.lease_token).toBeNull();
		expect(statusById.data.duel.leaseToken).toBeNull();
		expect(statusById.data.participants).toEqual([
			expect.objectContaining({
				id: "participant-v15",
				displayName: "Legacy Codex",
			}),
		]);
	});

	test("claims a timeout lease before closing a no-peer duel", async () => {
		const first = await joinParticipant("participant-a");

		const normalClaim = await claimLock(first.duel_id, first.participant_id);
		expect(normalClaim.success).toBe(true);
		expect(normalClaim.data.acquired).toBe(false);
		expect(normalClaim.data.reason).toBe("Waiting for a second participant");
		expect(normalClaim.data.lease_token).toBeNull();
		expect(normalClaim.data.next_step).toBe("wait_peer");

		const timeoutClaim = await expectTaskRight(
			executeClaimLock(
				{
					duelId: first.duel_id,
					participantId: first.participant_id,
					forTimeout: true,
				},
				dbPath,
			),
		);
		expect(timeoutClaim.success).toBe(true);
		expect(timeoutClaim.data.acquired).toBe(true);
		expect(typeof timeoutClaim.data.lease_token).toBe("string");
		expect(timeoutClaim.data.owner_participant_id).toBe(first.participant_id);
		expect(timeoutClaim.data.next_step).toBe("update_markdown");

		const closed = await expectTaskRight(
			executeReleaseLock(
				{
					duelId: first.duel_id,
					participantId: first.participant_id,
					leaseToken: timeoutClaim.data.lease_token ?? "",
					close: true,
				},
				dbPath,
			),
		);
		expect(closed.success).toBe(true);
		expect(closed.data.closed).toBe(true);
		expect(closed.data.status).toBe("CLOSED");
	});

	test("rejects invalid targets and a third participant", async () => {
		const relativeTarget = await executeJoin(
			{
				targetPath: "relative.md",
				topic: "Target",
				debateDir,
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
				topic: "Target",
				debateDir,
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

		const status = await expectTaskRight(
			executeStatus({ duelId: first.duel_id }, dbPath),
		);
		expect(status.data.lock.owner_participant_id).toBe(first.participant_id);
		expect(status.data.lock.lease_token).toBeNull();
		expect(status.data.duel.leaseToken).toBeNull();

		const peerClaim = await claimLock(first.duel_id, second.participant_id);
		expect(peerClaim.success).toBe(true);
		expect(peerClaim.data.acquired).toBe(false);
		expect(peerClaim.data.lease_token).toBeNull();
		expect(peerClaim.data.owner_participant_id).toBe(first.participant_id);
		expect(peerClaim.data.reason).toBe("Peer owns an unexpired lock");
		expect(peerClaim.data.next_step).toBe("wait_turn");

		const peerTimeoutClaim = await expectTaskRight(
			executeClaimLock(
				{
					duelId: first.duel_id,
					participantId: second.participant_id,
					forTimeout: true,
				},
				dbPath,
			),
		);
		expect(peerTimeoutClaim.success).toBe(true);
		expect(peerTimeoutClaim.data.acquired).toBe(false);
		expect(peerTimeoutClaim.data.lease_token).toBeNull();
		expect(peerTimeoutClaim.data.reason).toBe("Peer owns an unexpired lock");
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
		expect(rejectedPeer.data.lease_token).toBeNull();
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
		expect(released.data.next_step).toBe("wait_turn");

		const peerClaim = await claimLock(first.duel_id, second.participant_id);
		expect(peerClaim.data.acquired).toBe(true);
		expect(peerClaim.data.owner_participant_id).toBe(second.participant_id);
	});

	test("requires an active owned lease to close a lock context", async () => {
		const first = await joinParticipant("participant-a");
		const second = await joinParticipant("participant-b");

		const noOwnerClose = await expectTaskRight(
			executeReleaseLock(
				{
					duelId: first.duel_id,
					participantId: first.participant_id,
					close: true,
				},
				dbPath,
			),
		);
		expect(noOwnerClose.success).toBe(true);
		expect(noOwnerClose.data.closed).toBe(false);
		expect(noOwnerClose.data.reason).toBe(
			"Closing a duel requires an active lock owned by this participant",
		);

		const claim = await claimLock(first.duel_id, first.participant_id);
		const peerClose = await expectTaskRight(
			executeReleaseLock(
				{
					duelId: first.duel_id,
					participantId: second.participant_id,
					leaseToken: claim.data.lease_token ?? "",
					close: true,
				},
				dbPath,
			),
		);

		expect(peerClose.success).toBe(true);
		expect(peerClose.data.released).toBe(false);
		expect(peerClose.data.closed).toBe(false);
		expect(peerClose.data.status).toBe("ACTIVE");
		expect(peerClose.data.owner_participant_id).toBe(first.participant_id);
		expect(peerClose.data.reason).toBe(
			"Closing a duel requires an active lock owned by this participant",
		);
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
