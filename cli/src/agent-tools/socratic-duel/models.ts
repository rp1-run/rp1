export type DuelStatus = "ACTIVE" | "CLOSED";

export const LEASE_DURATION_MS = 15 * 60 * 1000;
export const RETRY_AFTER_SECONDS = 30;

export interface DuelRecord {
	readonly id: string;
	readonly targetPath: string;
	readonly targetKey: string;
	readonly status: DuelStatus;
	readonly currentOwnerId: string | null;
	readonly leaseToken: string | null;
	readonly leaseExpiresAt: string | null;
	readonly createdAt: string;
	readonly updatedAt: string;
}

export interface ParticipantRecord {
	readonly id: string;
	readonly duelId: string;
	readonly displayName: string;
	readonly harness: string;
	readonly modelId: string;
	readonly joinedAt: string;
	readonly lastSeenAt: string;
}

export interface JoinInput {
	readonly targetPath: string;
	readonly participantName: string;
	readonly harness: string;
	readonly modelId: string;
	readonly runId?: string;
}

export interface ClaimLockInput {
	readonly duelId: string;
	readonly participantId: string;
	readonly forTimeout?: boolean;
}

export interface RefreshLockInput {
	readonly duelId: string;
	readonly participantId: string;
	readonly leaseToken: string;
}

export interface ReleaseLockInput {
	readonly duelId: string;
	readonly participantId: string;
	readonly leaseToken?: string;
	readonly close?: boolean;
}

export interface JoinResult {
	readonly duel_id: string;
	readonly participant_id: string;
	readonly participant_count: number;
	readonly status: DuelStatus;
	readonly target_path: string;
	readonly target_key: string;
	readonly next_step: "wait_peer" | "claim_lock" | "closed";
}

export interface StatusResult {
	readonly duel: DuelRecord;
	readonly participants: readonly ParticipantRecord[];
	readonly participant_count: number;
	readonly lock: LockStatus;
	readonly next_step: "wait_peer" | "claim_lock" | "wait_turn" | "closed";
}

export interface LockStatus {
	readonly owner_participant_id: string | null;
	readonly lease_token: string | null;
	readonly lease_expires_at: string | null;
	readonly expired: boolean;
}

export interface ClaimLockResult {
	readonly duel_id: string;
	readonly participant_id: string;
	readonly acquired: boolean;
	readonly lease_token: string | null;
	readonly lease_expires_at: string | null;
	readonly owner_participant_id: string | null;
	readonly retry_after_seconds: number;
	readonly wait_until: string | null;
	readonly reason: string | null;
	readonly next_step:
		| "compose_turn"
		| "update_markdown"
		| "wait_peer"
		| "wait_turn"
		| "closed";
}

export interface RefreshLockResult {
	readonly duel_id: string;
	readonly participant_id: string;
	readonly refreshed: boolean;
	readonly lease_token: string | null;
	readonly lease_expires_at: string | null;
	readonly reason: string | null;
	readonly next_step: "compose_turn" | "wait_turn" | "closed";
}

export interface ReleaseLockResult {
	readonly duel_id: string;
	readonly participant_id: string;
	readonly released: boolean;
	readonly closed: boolean;
	readonly status: DuelStatus;
	readonly owner_participant_id: string | null;
	readonly reason: string | null;
	readonly next_step: "claim_lock" | "wait_turn" | "closed";
}

export interface ValidationIssue {
	readonly message: string;
	readonly context?: string;
}
