/**
 * Type-safe data models for work status agent tool.
 * Defines interfaces for status updates and query results.
 */

/**
 * Valid status values for workflow progress tracking.
 * Enforced at database level via CHECK constraint.
 */
export type StatusValue =
	| "started"
	| "in_progress"
	| "waiting-input"
	| "needs-review"
	| "completed"
	| "failed";

/**
 * Array of valid status values for validation.
 */
export const VALID_STATUSES: readonly StatusValue[] = [
	"started",
	"in_progress",
	"waiting-input",
	"needs-review",
	"completed",
	"failed",
] as const;

/**
 * Result of insert-time reconciliation for forward-only lifecycle enforcement.
 * Transient field on StatusUpdateInput, not persisted to the database.
 */
export interface ReconciliationResult {
	/** When true, the update was rejected as a backward transition and should be skipped */
	readonly rejected?: boolean;
	/** Reason for rejection */
	readonly reason?: string;
	/** Steps that were auto-corrected during this update */
	readonly autoCorrections?: readonly string[];
}

/**
 * Input for creating a new status update.
 * Used by the agent tool to insert status records.
 */
export interface StatusUpdateInput {
	/** Absolute path to project root */
	readonly projectPath: string;
	/** Feature identifier (kebab-case) */
	readonly feature: string;
	/** Workflow step identifier within feature (optional) */
	readonly step?: string;
	/** Current status state */
	readonly status: StatusValue;
	/** Human-readable status message (optional) */
	readonly message?: string;
	/** JSON string for additional context (optional) */
	readonly metadata?: string;
	/** Workflow run isolation ID (optional, UUID) */
	readonly runId?: string;
	/** State machine identifier / skill name (optional) */
	readonly workflow?: string;
	/** ISO 8601 expiry timestamp for stale row cleanup (optional) */
	readonly expiresAt?: string;
	/** Previous workflow state before this transition (transient, not persisted) */
	readonly previousState?: string | null;
	/** Reconciliation result from insert-time validation (transient, not persisted) */
	readonly reconciliation?: ReconciliationResult;
	/** Agent name for agent-scoped state tracking (optional) */
	readonly agent?: string;
	/** Task identifier for per-task state tracking (optional) */
	readonly task?: string;
	/** Original worktree path when project path was normalized to main repo root (optional) */
	readonly worktreePath?: string;
}

/**
 * Stored status update record with auto-generated fields.
 * Returned from database queries.
 */
export interface StatusUpdateRecord {
	/** Auto-incremented row ID */
	readonly id: number;
	/** Absolute path to project root */
	readonly projectPath: string;
	/** Feature identifier */
	readonly feature: string;
	/** Workflow step identifier (null if not specified) */
	readonly step: string | null;
	/** Status state */
	readonly status: StatusValue;
	/** Human-readable message (null if not specified) */
	readonly message: string | null;
	/** JSON metadata blob (null if not specified) */
	readonly metadata: string | null;
	/** ISO 8601 UTC timestamp */
	readonly createdAt: string;
	/** Workflow run isolation ID (null if not specified) */
	readonly runId: string | null;
	/** ISO 8601 expiry timestamp (null means row never expires) */
	readonly expiresAt: string | null;
	/** State machine identifier / skill name (null if not specified) */
	readonly workflow: string | null;
	/** Agent name for agent-scoped state tracking (null for skill-level updates) */
	readonly agent: string | null;
	/** Task identifier for per-task state tracking (null for non-per-task updates) */
	readonly task: string | null;
	/** Original worktree path when project path was normalized (null if not from worktree) */
	readonly worktreePath: string | null;
}

/**
 * Result of inserting a status update.
 * Contains the generated ID and timestamp.
 */
export interface InsertResult {
	/** Auto-generated row ID */
	readonly id: number;
	/** ISO 8601 UTC timestamp when record was created */
	readonly createdAt: string;
}

/**
 * Query options for retrieving status updates.
 */
export interface QueryOptions {
	/** Filter by project path (required) */
	readonly projectPath: string;
	/** Filter by feature (optional) */
	readonly feature?: string;
	/** Maximum number of records to return (optional) */
	readonly limit?: number;
}

/**
 * Valid artifact type values.
 */
export type ArtifactTypeValue =
	| "markdown"
	| "code"
	| "diagram"
	| "diff"
	| "report"
	| "other";

export const VALID_ARTIFACT_TYPES: readonly ArtifactTypeValue[] = [
	"markdown",
	"code",
	"diagram",
	"diff",
	"report",
	"other",
] as const;

/**
 * Input for registering a new artifact.
 */
export interface ArtifactInput {
	/** Absolute path to project root */
	readonly projectPath: string;
	/** Feature identifier (kebab-case) */
	readonly feature: string;
	/** Workflow run ID (optional) */
	readonly runId?: string;
	/** Relative path to the artifact file */
	readonly path: string;
	/** Artifact type classification */
	readonly type: ArtifactTypeValue;
	/** Original worktree path when project path was normalized to main repo root (optional) */
	readonly worktreePath?: string;
	/** Workflow step that produced this artifact (optional) */
	readonly step?: string;
}

/**
 * Stored artifact record with auto-generated fields.
 */
export interface ArtifactRecord {
	/** Auto-incremented row ID */
	readonly id: number;
	/** Absolute path to project root */
	readonly projectPath: string;
	/** Feature identifier */
	readonly feature: string;
	/** Workflow run ID (null if not specified) */
	readonly runId: string | null;
	/** Relative path to the artifact file */
	readonly path: string;
	/** Artifact type classification */
	readonly type: ArtifactTypeValue;
	/** ISO 8601 UTC timestamp */
	readonly createdAt: string;
	/** Original worktree path when project path was normalized (null if not from worktree) */
	readonly worktreePath: string | null;
	/** Workflow step that produced this artifact (null if not specified) */
	readonly step: string | null;
}
