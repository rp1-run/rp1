/**
 * Type-safe data models for work status agent tool.
 * Defines interfaces for status updates and query results.
 */

/**
 * Valid status values for workflow progress tracking.
 * Enforced at database level via CHECK constraint.
 */
export type StatusValue = "started" | "in_progress" | "completed" | "failed";

/**
 * Array of valid status values for validation.
 */
export const VALID_STATUSES: readonly StatusValue[] = [
	"started",
	"in_progress",
	"completed",
	"failed",
] as const;

/**
 * Input for creating a new status update.
 * Used by the agent tool to insert status records.
 */
export interface StatusUpdateInput {
	/** Absolute path to project root */
	readonly projectPath: string;
	/** Feature identifier (kebab-case) */
	readonly feature: string;
	/** Task identifier within feature (optional) */
	readonly task?: string;
	/** Current status state */
	readonly status: StatusValue;
	/** Human-readable status message (optional) */
	readonly message?: string;
	/** JSON string for additional context (optional) */
	readonly metadata?: string;
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
	/** Task identifier (null if not specified) */
	readonly task: string | null;
	/** Status state */
	readonly status: StatusValue;
	/** Human-readable message (null if not specified) */
	readonly message: string | null;
	/** JSON metadata blob (null if not specified) */
	readonly metadata: string | null;
	/** ISO 8601 UTC timestamp */
	readonly createdAt: string;
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
