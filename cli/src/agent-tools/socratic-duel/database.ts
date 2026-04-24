import type { Database } from "bun:sqlite";
import { randomUUID } from "node:crypto";
import { pipe } from "fp-ts/lib/function.js";
import * as TE from "fp-ts/lib/TaskEither.js";
import type { CLIError } from "../../../shared/errors.js";
import { runtimeError } from "../../../shared/errors.js";
import { ensureSocraticDuelSchema, getEmitDatabase } from "../emit/database.js";
import type {
	ClaimTurnInput,
	DuelRecord,
	DuelStatus,
	JoinInput,
	ParticipantRecord,
	Stance,
	TerminalOutcome,
	TurnRecord,
} from "./models.js";
import { LEASE_DURATION_MS, MAX_TURNS, RETRY_AFTER_SECONDS } from "./models.js";

interface DuelRow {
	id: string;
	target_path: string;
	target_key: string;
	status: string;
	max_turns: number;
	next_turn_number: number;
	current_owner_id: string | null;
	lease_expires_at: string | null;
	candidate_convergence: number;
	conclusion_summary: string | null;
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

interface TurnRow {
	id: string;
	duel_id: string;
	turn_number: number;
	participant_id: string;
	stance: string;
	turn_hash: string;
	prior_region_hash: string;
	content_json: string;
	accepted_at: string;
}

export interface JoinDuelResult {
	readonly duel: DuelRecord;
	readonly participant: ParticipantRecord;
	readonly participantCount: number;
}

export interface DuelSnapshot {
	readonly duel: DuelRecord;
	readonly participants: readonly ParticipantRecord[];
	readonly turns: readonly TurnRecord[];
}

export interface ClaimDecision extends DuelSnapshot {
	readonly acquired: boolean;
	readonly reason: string | null;
	readonly retryAfterSeconds: number;
	readonly waitUntil: string | null;
}

export interface PersistTurnInput {
	readonly duelId: string;
	readonly participantId: string;
	readonly turnId: string;
	readonly turnNumber: number;
	readonly stance: Stance;
	readonly turnHash: string;
	readonly priorRegionHash: string;
	readonly contentJson: string;
	readonly status: DuelStatus;
	readonly candidateConvergence: boolean;
	readonly conclusionSummary: string | null;
}

export interface TransactionalSideEffect {
	readonly run: () => Promise<void>;
	readonly rollback: () => Promise<void>;
}

const nowIso = (): string => new Date().toISOString();

const leaseExpirationIso = (): string =>
	new Date(Date.now() + LEASE_DURATION_MS).toISOString();

const isUnexpired = (expiresAt: string | null): boolean =>
	expiresAt !== null && Date.parse(expiresAt) > Date.now();

const rowToDuel = (row: DuelRow): DuelRecord => ({
	id: row.id,
	targetPath: row.target_path,
	targetKey: row.target_key,
	status: row.status as DuelStatus,
	maxTurns: row.max_turns,
	nextTurnNumber: row.next_turn_number,
	currentOwnerId: row.current_owner_id,
	leaseExpiresAt: row.lease_expires_at,
	candidateConvergence: row.candidate_convergence === 1,
	conclusionSummary: row.conclusion_summary,
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

const rowToTurn = (row: TurnRow): TurnRecord => ({
	id: row.id,
	duelId: row.duel_id,
	turnNumber: row.turn_number,
	participantId: row.participant_id,
	stance: row.stance as Stance,
	turnHash: row.turn_hash,
	priorRegionHash: row.prior_region_hash,
	contentJson: row.content_json,
	acceptedAt: row.accepted_at,
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
						`Socratic Duel database operation failed: ${error instanceof Error ? error.message : String(error)}`,
					),
			),
		),
	);

const transaction = <T>(db: Database, operation: () => T): T => {
	db.exec("BEGIN TRANSACTION");
	try {
		const result = operation();
		db.exec("COMMIT");
		return result;
	} catch (error) {
		db.exec("ROLLBACK");
		throw error;
	}
};

const errorMessage = (error: unknown): string =>
	error instanceof Error ? error.message : String(error);

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
			"SELECT * FROM socratic_duel_participants WHERE duel_id = $duelId ORDER BY joined_at ASC, id ASC",
		)
		.all({ $duelId: duelId }) as ParticipantRow[];

	return rows.map(rowToParticipant);
};

const listTurnsSync = (db: Database, duelId: string): readonly TurnRecord[] => {
	const rows = db
		.prepare(
			"SELECT * FROM socratic_duel_turns WHERE duel_id = $duelId ORDER BY turn_number ASC",
		)
		.all({ $duelId: duelId }) as TurnRow[];

	return rows.map(rowToTurn);
};

const snapshotSync = (db: Database, duelId: string): DuelSnapshot => ({
	duel: getDuelByIdSync(db, duelId),
	participants: listParticipantsSync(db, duelId),
	turns: listTurnsSync(db, duelId),
});

const persistAcceptedTurnSync = (
	db: Database,
	input: PersistTurnInput,
): DuelSnapshot => {
	const duel = getDuelByIdSync(db, input.duelId);
	if (
		duel.currentOwnerId !== input.participantId ||
		!isUnexpired(duel.leaseExpiresAt)
	) {
		throw new Error("Participant does not own an unexpired turn lease");
	}
	if (duel.nextTurnNumber !== input.turnNumber) {
		throw new Error(
			`Turn number mismatch: expected ${duel.nextTurnNumber}, received ${input.turnNumber}`,
		);
	}

	db.prepare(
		`INSERT INTO socratic_duel_turns (
			id,
			duel_id,
			turn_number,
			participant_id,
			stance,
			turn_hash,
			prior_region_hash,
			content_json
		)
		VALUES (
			$id,
			$duelId,
			$turnNumber,
			$participantId,
			$stance,
			$turnHash,
			$priorRegionHash,
			$contentJson
		)`,
	).run({
		$id: input.turnId,
		$duelId: input.duelId,
		$turnNumber: input.turnNumber,
		$participantId: input.participantId,
		$stance: input.stance,
		$turnHash: input.turnHash,
		$priorRegionHash: input.priorRegionHash,
		$contentJson: input.contentJson,
	});

	db.prepare(
		`UPDATE socratic_duels
		 SET status = $status,
		     next_turn_number = next_turn_number + 1,
		     current_owner_id = NULL,
		     lease_expires_at = NULL,
		     candidate_convergence = $candidateConvergence,
		     conclusion_summary = $conclusionSummary,
		     updated_at = $now
		 WHERE id = $id`,
	).run({
		$id: input.duelId,
		$status: input.status,
		$candidateConvergence: input.candidateConvergence ? 1 : 0,
		$conclusionSummary: input.conclusionSummary,
		$now: nowIso(),
	});

	return snapshotSync(db, input.duelId);
};

export const joinDuel = (
	input: JoinInput,
	targetKey: string,
	canonicalTargetPath: string,
	existingDuelId?: string,
	dbPath?: string,
): TE.TaskEither<CLIError, JoinDuelResult> =>
	withDb(dbPath, (db) =>
		transaction(db, () => {
			const activeDuel = getActiveDuelByTargetKeySync(db, targetKey);
			let duel = activeDuel;

			if (!duel) {
				const duelId = existingDuelId ?? randomUUID();
				db.prepare(
					`INSERT INTO socratic_duels (
						id,
						target_path,
						target_key,
						status,
						max_turns,
						next_turn_number
					)
					VALUES ($id, $targetPath, $targetKey, 'ACTIVE', $maxTurns, 1)`,
				).run({
					$id: duelId,
					$targetPath: canonicalTargetPath,
					$targetKey: targetKey,
					$maxTurns: MAX_TURNS,
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
	withDb(dbPath, (db) => snapshotSync(db, duelId));

export const getActiveDuelSnapshotByTargetKey = (
	targetKey: string,
	dbPath?: string,
): TE.TaskEither<CLIError, DuelSnapshot> =>
	withDb(dbPath, (db) => {
		const duel = getActiveDuelByTargetKeySync(db, targetKey);
		if (!duel) {
			throw new Error(`No active duel found for target: ${targetKey}`);
		}

		return snapshotSync(db, duel.id);
	});

export const claimTurn = (
	input: ClaimTurnInput,
	dbPath?: string,
): TE.TaskEither<CLIError, ClaimDecision> =>
	withDb(dbPath, (db) =>
		transaction(db, () => {
			const participant = getParticipantByIdSync(db, input.participantId);
			let snapshot = snapshotSync(db, input.duelId);

			if (participant.duelId !== input.duelId) {
				throw new Error("Participant does not belong to this duel");
			}

			if (snapshot.duel.status !== "ACTIVE") {
				return {
					...snapshot,
					acquired: false,
					reason: `Duel is terminal: ${snapshot.duel.status}`,
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

			const ownerId = snapshot.duel.currentOwnerId;
			const leaseExpiresAt = snapshot.duel.leaseExpiresAt;
			if (ownerId && isUnexpired(leaseExpiresAt)) {
				if (ownerId === input.participantId) {
					const nextLeaseExpiresAt = leaseExpirationIso();
					db.prepare(
						`UPDATE socratic_duels
						 SET lease_expires_at = $leaseExpiresAt,
						     updated_at = $now
						 WHERE id = $id`,
					).run({
						$id: input.duelId,
						$leaseExpiresAt: nextLeaseExpiresAt,
						$now: nowIso(),
					});
					snapshot = snapshotSync(db, input.duelId);
					return {
						...snapshot,
						acquired: true,
						reason: null,
						retryAfterSeconds: RETRY_AFTER_SECONDS,
						waitUntil: nextLeaseExpiresAt,
					};
				}

				return {
					...snapshot,
					acquired: false,
					reason: "Peer owns an unexpired turn lease",
					retryAfterSeconds: RETRY_AFTER_SECONDS,
					waitUntil: leaseExpiresAt,
				};
			}

			const lastTurn = snapshot.turns.at(-1);
			const expiredPeerLease =
				ownerId !== null &&
				ownerId !== input.participantId &&
				leaseExpiresAt !== null &&
				!isUnexpired(leaseExpiresAt);

			if (
				lastTurn?.participantId === input.participantId &&
				!expiredPeerLease
			) {
				return {
					...snapshot,
					acquired: false,
					reason: "Turn alternation requires the peer participant to continue",
					retryAfterSeconds: RETRY_AFTER_SECONDS,
					waitUntil: null,
				};
			}

			const nextLeaseExpiresAt = leaseExpirationIso();
			db.prepare(
				`UPDATE socratic_duels
				 SET current_owner_id = $ownerId,
				     lease_expires_at = $leaseExpiresAt,
				     updated_at = $now
				 WHERE id = $id`,
			).run({
				$id: input.duelId,
				$ownerId: input.participantId,
				$leaseExpiresAt: nextLeaseExpiresAt,
				$now: nowIso(),
			});

			snapshot = snapshotSync(db, input.duelId);
			return {
				...snapshot,
				acquired: true,
				reason: expiredPeerLease ? "Peer lease expired" : null,
				retryAfterSeconds: RETRY_AFTER_SECONDS,
				waitUntil: nextLeaseExpiresAt,
			};
		}),
	);

export const persistAcceptedTurn = (
	input: PersistTurnInput,
	dbPath?: string,
): TE.TaskEither<CLIError, DuelSnapshot> =>
	withDb(dbPath, (db) =>
		transaction(db, () => persistAcceptedTurnSync(db, input)),
	);

export const persistAcceptedTurnWithSideEffect = (
	input: PersistTurnInput,
	sideEffect: TransactionalSideEffect,
	dbPath?: string,
): TE.TaskEither<CLIError, DuelSnapshot> =>
	pipe(
		getEmitDatabase(dbPath),
		TE.chain((db) =>
			TE.tryCatch(
				async () => {
					ensureSocraticDuelSchema(db);
					let sideEffectApplied = false;
					db.exec("BEGIN TRANSACTION");
					try {
						const snapshot = persistAcceptedTurnSync(db, input);
						await sideEffect.run();
						sideEffectApplied = true;
						db.exec("COMMIT");
						return snapshot;
					} catch (error) {
						try {
							db.exec("ROLLBACK");
						} catch {}
						if (sideEffectApplied) {
							try {
								await sideEffect.rollback();
							} catch (rollbackError) {
								throw new Error(
									`${errorMessage(error)}; side-effect rollback failed: ${errorMessage(rollbackError)}`,
								);
							}
						}
						throw error;
					}
				},
				(error) =>
					runtimeError(
						`Socratic Duel database operation failed: ${errorMessage(error)}`,
					),
			),
		),
	);

export const adjournDuel = (
	duelId: string,
	participantId: string | undefined,
	outcome: TerminalOutcome,
	summary: string,
	dbPath?: string,
): TE.TaskEither<CLIError, DuelSnapshot> =>
	withDb(dbPath, (db) =>
		transaction(db, () => {
			const duel = getDuelByIdSync(db, duelId);

			if (duel.status !== "ACTIVE") {
				return snapshotSync(db, duelId);
			}

			if (
				participantId &&
				duel.currentOwnerId &&
				duel.currentOwnerId !== participantId &&
				isUnexpired(duel.leaseExpiresAt)
			) {
				throw new Error(
					"Cannot adjourn while another participant owns the floor",
				);
			}

			if (participantId) {
				const participant = getParticipantByIdSync(db, participantId);
				if (participant.duelId !== duelId) {
					throw new Error("Participant does not belong to this duel");
				}
			}

			db.prepare(
				`UPDATE socratic_duels
				 SET status = $status,
				     current_owner_id = NULL,
				     lease_expires_at = NULL,
				     conclusion_summary = $summary,
				     updated_at = $now
				 WHERE id = $id`,
			).run({
				$id: duelId,
				$status: outcome,
				$summary: summary,
				$now: nowIso(),
			});

			return snapshotSync(db, duelId);
		}),
	);

export const invalidateDuel = (
	duelId: string,
	summary: string,
	dbPath?: string,
): TE.TaskEither<CLIError, DuelSnapshot> =>
	adjournDuel(duelId, undefined, "INVALIDATED", summary, dbPath);
