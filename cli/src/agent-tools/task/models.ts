/**
 * Type-safe data models for the task queue agent tool.
 * Defines interfaces for task creation, lifecycle, and query operations.
 */

/**
 * Valid task lifecycle states.
 * Enforced at database level via CHECK constraint.
 */
export type TaskStatus =
	| "pending"
	| "in_progress"
	| "completed"
	| "failed"
	| "cancelled";

/**
 * Array of valid task status values for runtime validation.
 */
export const VALID_TASK_STATUSES: readonly TaskStatus[] = [
	"pending",
	"in_progress",
	"completed",
	"failed",
	"cancelled",
] as const;

/**
 * Input for creating a new task.
 * Used by CLI and agent-tools to insert task records.
 */
export interface TaskCreateInput {
	/** Free-form task type string (e.g., "check-annotations", "archive-feature") */
	readonly type: string;
	/** Human-readable description of the task */
	readonly description: string;
	/** Optional JSON blob for type-specific data */
	readonly payload?: string;
	/** Optional absolute project directory path for scoping */
	readonly projectPath?: string;
}

/**
 * Input for completing or failing a task.
 * Used to transition a task to a terminal state with an optional result.
 */
export interface TaskResolveInput {
	/** Task ID to resolve */
	readonly id: number;
	/** Optional result summary (completed) or error description (failed) */
	readonly result?: string;
}

/**
 * Stored task record with auto-generated fields.
 * Returned from database queries.
 */
export interface TaskRecord {
	/** Auto-incremented row ID */
	readonly id: number;
	/** Free-form task type string */
	readonly type: string;
	/** Human-readable description */
	readonly description: string;
	/** Current lifecycle state */
	readonly status: TaskStatus;
	/** JSON blob for type-specific data (null if not specified) */
	readonly payload: string | null;
	/** Project directory path for scoping (null = global task) */
	readonly projectPath: string | null;
	/** Result summary or error description (null if not yet resolved) */
	readonly result: string | null;
	/** ISO 8601 UTC creation timestamp */
	readonly createdAt: string;
	/** ISO 8601 UTC last-modified timestamp */
	readonly updatedAt: string;
}

/**
 * Query options for listing tasks.
 * All fields are optional filters applied to the task list.
 */
export interface TaskQueryOptions {
	/** Filter by lifecycle status */
	readonly status?: TaskStatus;
	/** Filter by project directory path */
	readonly projectPath?: string;
	/** Maximum number of records to return */
	readonly limit?: number;
}
