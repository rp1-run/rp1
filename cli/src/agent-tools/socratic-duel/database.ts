import type { Database } from "bun:sqlite";
import { randomUUID } from "node:crypto";
import { pipe } from "fp-ts/lib/function.js";
import * as TE from "fp-ts/lib/TaskEither.js";
import type { CLIError } from "../../../shared/errors.js";
import { runtimeError } from "../../../shared/errors.js";
import { ensureSocraticDuelSchema, getEmitDatabase } from "../emit/database.js";
import type {
	ClaimLockInput,
	DuelRecord,
	DuelStatus,
	JoinInput,
	ParticipantRecord,
	RefreshLockInput,
	ReleaseLockInput,
} from "./models.js";
import { LEASE_DURATION_MS, RETRY_AFTER_SECONDS } from "./models.js";

interface DuelRow {
	id: string;
	target_path: string;
	target_key: string;
	status: string;
	current_owner_id: string | null;
	lease_token: string | null;
	lease_expires_at: string | null;
	created_at: string;
	updated_at: string;
}

interface ParticipantRow {
	id: string;
	duel_id: string;
	display_name: string;
	harness: string;
	model_id: string;
	joined_at: string;
	last_seen_at: string;
}

export interface JoinDuelResult {
	readonly duel: DuelRecord;
	readonly participant: ParticipantRecord;
	readonly participantCount: number;
}

export interface DuelSnapshot {
	readonly duel: DuelRecord;
	readonly participants: readonly ParticipantRecord[];
}

export interface ClaimLockDecision extends DuelSnapshot {
	readonly acquired: boolean;
	readonly reason: string | null;
	readonly retryAfterSeconds: number;
	readonly waitUntil: string | null;
}

export interface RefreshLockDecision extends DuelSnapshot {
	readonly refreshed: boolean;
	readonly reason: string | null;
}

export interface ReleaseLockDecision extends DuelSnapshot {
	readonly released: boolean;
	readonly closed: boolean;
	readonly reason: string | null;
}

const nowIso = (): string => new Date().toISOString();

const leaseExpirationIso = (): string =>
	new Date(Date.now() + LEASE_DURATION_MS).toISOString();

export const isLeaseExpired = (expiresAt: string | null): boolean =>
	expiresAt === null || Date.parse(expiresAt) <= Date.now();

export const isLeaseActive = (expiresAt: string | null): boolean =>
	!isLeaseExpired(expiresAt);

const rowToDuel = (row: DuelRow): DuelRecord => ({
	id: row.id,
	targetPath: row.target_path,
	targetKey: row.target_key,
	status: row.status as DuelStatus,
	currentOwnerId: row.current_owner_id,
	leaseToken: row.lease_token,
	leaseExpiresAt: row.lease_expires_at,
	createdAt: row.created_at,
	updatedAt: row.updated_at,
});

const rowToParticipant = (row: ParticipantRow): ParticipantRecord => ({
	id: row.id,
	duelId: row.duel_id,
	displayName: row.display_name,
	harness: row.harness,
	modelId: row.model_id,
	joinedAt: row.joined_at,
	lastSeenAt: row.last_seen_at,
});

const withDb = <T>(
	dbPath: string | undefined,
	operation: (db: Database) => T,
): TE.TaskEither<CLIError, T> =>
	pipe(
		getEmitDatabase(dbPath),
		TE.chain((db) =>
			TE.tryCatch(
				async () => {
					ensureSocraticDuelSchema(db);
					return operation(db);
				},
				(error) =>
					runtimeError(
						`Socratic Duel lock operation failed: ${error instanceof Error ? error.message : String(error)}`,
					),
			),
		),
	);

const transaction = <T>(db: Database, operation: () => T): T => {
	db.exec("BEGIN IMMEDIATE TRANSACTION");
	try {
		const result = operation();
		db.exec("COMMIT");
		return result;
	} catch (error) {
		db.exec("ROLLBACK");
		throw error;
	}
};

const getDuelByIdSync = (db: Database, duelId: string): DuelRecord => {
	const row = db
		.prepare("SELECT * FROM socratic_duels WHERE id = $id")
		.get({ $id: duelId }) as DuelRow | null;

	if (!row) {
		throw new Error(`Duel not found: ${duelId}`);
	}

	return rowToDuel(row);
};

const getActiveDuelByTargetKeySync = (
	db: Database,
	targetKey: string,
): DuelRecord | null => {
	const row = db
		.prepare(
			"SELECT * FROM socratic_duels WHERE target_key = $targetKey AND status = 'ACTIVE'",
		)
		.get({ $targetKey: targetKey }) as DuelRow | null;

	return row ? rowToDuel(row) : null;
};

const getParticipantByIdSync = (
	db: Database,
	participantId: string,
): ParticipantRecord => {
	const row = db
		.prepare("SELECT * FROM socratic_duel_participants WHERE id = $id")
		.get({ $id: participantId }) as ParticipantRow | null;

	if (!row) {
		throw new Error(`Participant not found: ${participantId}`);
	}

	return rowToParticipant(row);
};

const listParticipantsSync = (
	db: Database,
	duelId: string,
): readonly ParticipantRecord[] => {
	const rows = db
		.prepare(
			"SELECT * FROM socratic_duel_participants WHERE duel_id = $duelId ORDER BY joined_at ASC, rowid ASC",
		)
		.all({ $duelId: duelId }) as ParticipantRow[];

	return rows.map(rowToParticipant);
};

const snapshotSync = (db: Database, duelId: string): DuelSnapshot => ({
	duel: getDuelByIdSync(db, duelId),
	participants: listParticipantsSync(db, duelId),
});

const assertParticipantInDuel = (
	db: Database,
	duelId: string,
	participantId: string,
): ParticipantRecord => {
	const participant = getParticipantByIdSync(db, participantId);
	if (participant.duelId !== duelId) {
		throw new Error("Participant does not belong to this duel");
	}
	return participant;
};

const clearExpiredLockSync = (db: Database, duel: DuelRecord): void => {
	if (!duel.currentOwnerId || isLeaseActive(duel.leaseExpiresAt)) {
		return;
	}

	db.prepare(
		`UPDATE socratic_duels
		 SET current_owner_id = NULL,
		     lease_token = NULL,
		     lease_expires_at = NULL,
		     updated_at = $now
		 WHERE id = $id`,
	).run({
		$id: duel.id,
		$now: nowIso(),
	});
};

export const joinDuel = (
	input: JoinInput,
	targetKey: string,
	canonicalTargetPath: string,
	dbPath?: string,
): TE.TaskEither<CLIError, JoinDuelResult> =>
	withDb(dbPath, (db) =>
		transaction(db, () => {
			let duel = getActiveDuelByTargetKeySync(db, targetKey);

			if (!duel) {
				const duelId = randomUUID();
				db.prepare(
					`INSERT INTO socratic_duels (
						id,
						target_path,
						target_key,
						status
					)
					VALUES ($id, $targetPath, $targetKey, 'ACTIVE')`,
				).run({
					$id: duelId,
					$targetPath: canonicalTargetPath,
					$targetKey: targetKey,
				});
				duel = getDuelByIdSync(db, duelId);
			}

			const existingParticipant = db
				.prepare(
					`SELECT * FROM socratic_duel_participants
					 WHERE duel_id = $duelId
					   AND display_name = $displayName
					   AND harness = $harness
					   AND model_id = $modelId`,
				)
				.get({
					$duelId: duel.id,
					$displayName: input.participantName.trim(),
					$harness: input.harness.trim(),
					$modelId: input.modelId.trim(),
				}) as ParticipantRow | null;

			let participant: ParticipantRecord;
			if (existingParticipant) {
				db.prepare(
					`UPDATE socratic_duel_participants
					 SET last_seen_at = $now
					 WHERE id = $id`,
				).run({
					$id: existingParticipant.id,
					$now: nowIso(),
				});
				participant = getParticipantByIdSync(db, existingParticipant.id);
			} else {
				const participantCount = listParticipantsSync(db, duel.id).length;
				if (participantCount >= 2) {
					throw new Error(
						"Active Socratic Duel already has two participants; resume with an existing participant identity",
					);
				}

				const participantId = randomUUID();
				db.prepare(
					`INSERT INTO socratic_duel_participants (
						id,
						duel_id,
						display_name,
						harness,
						model_id
					)
					VALUES ($id, $duelId, $displayName, $harness, $modelId)`,
				).run({
					$id: participantId,
					$duelId: duel.id,
					$displayName: input.participantName.trim(),
					$harness: input.harness.trim(),
					$modelId: input.modelId.trim(),
				});
				participant = getParticipantByIdSync(db, participantId);
			}

			db.prepare(
				`UPDATE socratic_duels
				 SET target_path = $targetPath,
				     updated_at = $now
				 WHERE id = $id`,
			).run({
				$id: duel.id,
				$targetPath: canonicalTargetPath,
				$now: nowIso(),
			});

			duel = getDuelByIdSync(db, duel.id);
			const participantCount = listParticipantsSync(db, duel.id).length;

			return { duel, participant, participantCount };
		}),
	);

export const getDuelSnapshot = (
	duelId: string,
	dbPath?: string,
): TE.TaskEither<CLIError, DuelSnapshot> =>
	withDb(dbPath, (db) =>
		transaction(db, () => {
			const duel = getDuelByIdSync(db, duelId);
			clearExpiredLockSync(db, duel);
			return snapshotSync(db, duelId);
		}),
	);

export const getActiveDuelSnapshotByTargetKey = (
	targetKey: string,
	dbPath?: string,
): TE.TaskEither<CLIError, DuelSnapshot> =>
	withDb(dbPath, (db) =>
		transaction(db, () => {
			const duel = getActiveDuelByTargetKeySync(db, targetKey);
			if (!duel) {
				throw new Error(`No active duel found for target: ${targetKey}`);
			}
			clearExpiredLockSync(db, duel);
			return snapshotSync(db, duel.id);
		}),
	);

export const claimLock = (
	input: ClaimLockInput,
	dbPath?: string,
): TE.TaskEither<CLIError, ClaimLockDecision> =>
	withDb(dbPath, (db) =>
		transaction(db, () => {
			assertParticipantInDuel(db, input.duelId, input.participantId);
			let snapshot = snapshotSync(db, input.duelId);
			clearExpiredLockSync(db, snapshot.duel);
			snapshot = snapshotSync(db, input.duelId);

			if (snapshot.duel.status !== "ACTIVE") {
				return {
					...snapshot,
					acquired: false,
					reason: `Duel lock context is closed`,
					retryAfterSeconds: 0,
					waitUntil: null,
				};
			}

			if (snapshot.participants.length < 2) {
				return {
					...snapshot,
					acquired: false,
					reason: "Waiting for a second participant",
					retryAfterSeconds: RETRY_AFTER_SECONDS,
					waitUntil: null,
				};
			}

			if (snapshot.duel.currentOwnerId && snapshot.duel.leaseExpiresAt) {
				return {
					...snapshot,
					acquired: false,
					reason:
						snapshot.duel.currentOwnerId === input.participantId
							? "Participant already owns an active lock; use refresh-lock"
							: "Peer owns an unexpired lock",
					retryAfterSeconds: RETRY_AFTER_SECONDS,
					waitUntil: snapshot.duel.leaseExpiresAt,
				};
			}

			const leaseToken = randomUUID();
			const leaseExpiresAt = leaseExpirationIso();
			db.prepare(
				`UPDATE socratic_duels
				 SET current_owner_id = $ownerId,
				     lease_token = $leaseToken,
				     lease_expires_at = $leaseExpiresAt,
				     updated_at = $now
				 WHERE id = $id`,
			).run({
				$id: input.duelId,
				$ownerId: input.participantId,
				$leaseToken: leaseToken,
				$leaseExpiresAt: leaseExpiresAt,
				$now: nowIso(),
			});

			snapshot = snapshotSync(db, input.duelId);
			return {
				...snapshot,
				acquired: true,
				reason: null,
				retryAfterSeconds: RETRY_AFTER_SECONDS,
				waitUntil: leaseExpiresAt,
			};
		}),
	);

export const refreshLock = (
	input: RefreshLockInput,
	dbPath?: string,
): TE.TaskEither<CLIError, RefreshLockDecision> =>
	withDb(dbPath, (db) =>
		transaction(db, () => {
			assertParticipantInDuel(db, input.duelId, input.participantId);
			let snapshot = snapshotSync(db, input.duelId);

			if (snapshot.duel.status !== "ACTIVE") {
				return {
					...snapshot,
					refreshed: false,
					reason: "Duel lock context is closed",
				};
			}
			if (
				snapshot.duel.currentOwnerId !== input.participantId ||
				snapshot.duel.leaseToken !== input.leaseToken
			) {
				return {
					...snapshot,
					refreshed: false,
					reason: "Participant does not own this lock token",
				};
			}
			if (isLeaseExpired(snapshot.duel.leaseExpiresAt)) {
				clearExpiredLockSync(db, snapshot.duel);
				snapshot = snapshotSync(db, input.duelId);
				return {
					...snapshot,
					refreshed: false,
					reason: "Current lock has expired",
				};
			}

			const leaseExpiresAt = leaseExpirationIso();
			db.prepare(
				`UPDATE socratic_duels
				 SET lease_expires_at = $leaseExpiresAt,
				     updated_at = $now
				 WHERE id = $id`,
			).run({
				$id: input.duelId,
				$leaseExpiresAt: leaseExpiresAt,
				$now: nowIso(),
			});

			snapshot = snapshotSync(db, input.duelId);
			return { ...snapshot, refreshed: true, reason: null };
		}),
	);

export const releaseLock = (
	input: ReleaseLockInput,
	dbPath?: string,
): TE.TaskEither<CLIError, ReleaseLockDecision> =>
	withDb(dbPath, (db) =>
		transaction(db, () => {
			assertParticipantInDuel(db, input.duelId, input.participantId);
			let snapshot = snapshotSync(db, input.duelId);
			if (snapshot.duel.status !== "ACTIVE") {
				return {
					...snapshot,
					released: false,
					closed: snapshot.duel.status === "CLOSED",
					reason: "Duel lock context is closed",
				};
			}

			const hasActiveOwner =
				snapshot.duel.currentOwnerId !== null &&
				isLeaseActive(snapshot.duel.leaseExpiresAt);
			const ownsActiveLock =
				hasActiveOwner &&
				snapshot.duel.currentOwnerId === input.participantId &&
				input.leaseToken !== undefined &&
				snapshot.duel.leaseToken === input.leaseToken;

			if (input.close && !ownsActiveLock) {
				if (!hasActiveOwner) {
					clearExpiredLockSync(db, snapshot.duel);
					snapshot = snapshotSync(db, input.duelId);
				}
				return {
					...snapshot,
					released: false,
					closed: false,
					reason:
						"Closing a duel requires an active lock owned by this participant",
				};
			}

			if (hasActiveOwner && !ownsActiveLock) {
				return {
					...snapshot,
					released: false,
					closed: false,
					reason: "Participant does not own this active lock",
				};
			}

			if (!hasActiveOwner) {
				clearExpiredLockSync(db, snapshot.duel);
				snapshot = snapshotSync(db, input.duelId);
				return {
					...snapshot,
					released: false,
					closed: false,
					reason: "No active lock to release",
				};
			}

			db.prepare(
				`UPDATE socratic_duels
				 SET status = $status,
				     current_owner_id = NULL,
				     lease_token = NULL,
				     lease_expires_at = NULL,
				     updated_at = $now
				 WHERE id = $id`,
			).run({
				$id: input.duelId,
				$status: input.close ? "CLOSED" : snapshot.duel.status,
				$now: nowIso(),
			});

			snapshot = snapshotSync(db, input.duelId);
			return {
				...snapshot,
				released: hasActiveOwner,
				closed: snapshot.duel.status === "CLOSED",
				reason: null,
			};
		}),
	);
