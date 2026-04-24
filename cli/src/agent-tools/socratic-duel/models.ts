export type DuelStatus =
	| "ACTIVE"
	| "ACCEPTED_CONSENSUS"
	| "DISSENT"
	| "MAX_TURNS"
	| "TIMEOUT"
	| "INVALIDATED";

export type TerminalOutcome = Exclude<DuelStatus, "ACTIVE">;

export type Stance =
	| "OPEN_TO_DEBATE"
	| "CONVERGING"
	| "ACCEPTING_CONSENSUS"
	| "DISSENTING"
	| "REVISING";

export const VALID_STANCES: readonly Stance[] = [
	"OPEN_TO_DEBATE",
	"CONVERGING",
	"ACCEPTING_CONSENSUS",
	"DISSENTING",
	"REVISING",
] as const;

export const VALID_TERMINAL_OUTCOMES: readonly TerminalOutcome[] = [
	"ACCEPTED_CONSENSUS",
	"DISSENT",
	"MAX_TURNS",
	"TIMEOUT",
	"INVALIDATED",
] as const;

export const MAX_TURNS = 6;
export const LEASE_DURATION_MS = 15 * 60 * 1000;
export const RETRY_AFTER_SECONDS = 30;

export interface DuelRecord {
	readonly id: string;
	readonly targetPath: string;
	readonly targetKey: string;
	readonly status: DuelStatus;
	readonly maxTurns: number;
	readonly nextTurnNumber: number;
	readonly currentOwnerId: string | null;
	readonly leaseExpiresAt: string | null;
	readonly candidateConvergence: boolean;
	readonly conclusionSummary: string | null;
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

export interface TurnRecord {
	readonly id: string;
	readonly duelId: string;
	readonly turnNumber: number;
	readonly participantId: string;
	readonly stance: Stance;
	readonly turnHash: string;
	readonly priorRegionHash: string;
	readonly contentJson: string;
	readonly acceptedAt: string;
}

export interface CounterpointInput {
	readonly addresses: string;
	readonly claim: string;
	readonly support: readonly string[];
}

export interface NovelArgumentInput {
	readonly claim: string;
	readonly support: readonly string[];
}

export interface UnresolvedItemInput {
	readonly item: string;
	readonly blocking: boolean;
}

export interface TurnInput {
	readonly stance: Stance;
	readonly position: string;
	readonly counterpoints: readonly CounterpointInput[];
	readonly agreements: readonly string[];
	readonly novel_argument: NovelArgumentInput;
	readonly unresolved_items: readonly UnresolvedItemInput[];
	readonly stance_revision_support?: readonly string[];
	readonly candidate_convergence?: boolean;
	readonly terminal_outcome?: TerminalOutcome | null;
	readonly terminal_summary?: string | null;
	readonly prior_region_hash?: string;
}

export interface JoinInput {
	readonly targetPath: string;
	readonly participantName: string;
	readonly harness: string;
	readonly modelId: string;
	readonly runId?: string;
}

export interface ClaimTurnInput {
	readonly duelId: string;
	readonly participantId: string;
}

export interface SubmitTurnInput {
	readonly duelId: string;
	readonly participantId: string;
	readonly priorRegionHash: string;
	readonly turn: TurnInput;
}

export interface AdjournInput {
	readonly duelId: string;
	readonly participantId?: string;
	readonly outcome: TerminalOutcome;
	readonly summary: string;
}

export interface JoinResult {
	readonly duel_id: string;
	readonly participant_id: string;
	readonly participant_count: number;
	readonly status: DuelStatus;
	readonly target_path: string;
	readonly target_key: string;
	readonly max_turns: number;
	readonly next_turn_number: number;
	readonly candidate_convergence: boolean;
	readonly next_step: "wait_peer" | "claim_turn" | "adjourn";
}

export interface StatusResult {
	readonly duel: DuelRecord;
	readonly participants: readonly ParticipantRecord[];
	readonly turns: readonly TurnRecord[];
	readonly prior_region_hash: string | null;
	readonly next_step: "wait_peer" | "claim_turn" | "wait_turn" | "adjourn";
}

export interface ClaimTurnResult {
	readonly duel_id: string;
	readonly participant_id: string;
	readonly acquired: boolean;
	readonly turn_number: number | null;
	readonly prior_region_hash: string | null;
	readonly lease_expires_at: string | null;
	readonly owner_participant_id: string | null;
	readonly retry_after_seconds: number;
	readonly wait_until: string | null;
	readonly reason: string | null;
	readonly next_step: "compose_turn" | "wait_peer" | "wait_turn" | "adjourn";
	readonly prior_turns: readonly TurnRecord[];
}

export interface SubmitTurnResult {
	readonly duel_id: string;
	readonly participant_id: string;
	readonly accepted: boolean;
	readonly turn_number: number;
	readonly turn_hash: string;
	readonly status: DuelStatus;
	readonly terminal_outcome: TerminalOutcome | null;
	readonly candidate_convergence: boolean;
	readonly next_step: "claim_turn" | "adjourn";
}

export interface AdjournResult {
	readonly duel_id: string;
	readonly status: TerminalOutcome;
	readonly summary: string;
	readonly next_step: "adjourn";
}

export interface ValidationIssue {
	readonly message: string;
	readonly context?: string;
}
