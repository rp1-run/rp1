export const TASK_PLAN_SCHEMA_VERSION = 1;

/** Concurrent builders the scheduler proposes when the caller says nothing. */
export const DEFAULT_MAX_BUILDERS = 4;

/**
 * Hard ceiling on concurrent builders. Every builder past the primary runs in
 * its own git worktree, so the ceiling matches the worktree lifecycle the build
 * skill documents rather than being unbounded.
 */
export const MAX_BUILDERS_LIMIT = 4;

export const VALID_BUILD_TASK_TYPES = ["code", "docs"] as const;
export const VALID_BUILD_TASK_STATUSES = [
	"pending",
	"completed",
	"blocked",
] as const;
export const VALID_BUILD_TASK_COMPLEXITIES = [
	"simple",
	"medium",
	"complex",
] as const;

export type BuildTaskType = (typeof VALID_BUILD_TASK_TYPES)[number];
export type BuildTaskStatus = (typeof VALID_BUILD_TASK_STATUSES)[number];
export type BuildTaskComplexity =
	(typeof VALID_BUILD_TASK_COMPLEXITIES)[number];

export interface BuildTaskPlanInput {
	readonly tasksPath: string;
	readonly maxSimpleBatch: number;
	readonly complexIsolated: boolean;
}

export interface BuildTaskPlanDocument {
	readonly schema_version: typeof TASK_PLAN_SCHEMA_VERSION;
	readonly feature_id: string;
	readonly tasks: readonly BuildTaskPlanTask[];
}

export interface BuildTaskPlanTask {
	readonly id: string;
	readonly title: string;
	readonly type: BuildTaskType;
	readonly status: BuildTaskStatus;
	readonly complexity: BuildTaskComplexity;
	readonly acceptance_refs: readonly string[];
	readonly dependencies: readonly string[];
	readonly reference?: string;
	readonly target: string;
	readonly notes?: string;
}

export interface BuildTaskUnit {
	readonly unit_id: number;
	readonly task_ids: readonly string[];
	readonly complexity: BuildTaskComplexity;
	readonly depends_on: readonly string[];
}

/**
 * Scheduler input. Cross-call state is carried by task ID, never by
 * `unit_id`: units are renumbered from 1 on every call as tasks complete, so a
 * `unit_id` is only meaningful within the response that produced it.
 */
export interface ScheduleWaveInput {
	readonly task_units: readonly BuildTaskUnit[];
	readonly tasks: readonly BuildTaskPlanTask[];
	/** Task IDs whose reviewer returned SUCCESS. Satisfies dependencies. */
	readonly completed_task_ids: readonly string[];
	/** Task IDs a builder finished but no reviewer has accepted yet. */
	readonly built_task_ids: readonly string[];
	readonly max_builders: number;
	readonly git_commit: boolean;
	readonly clean_tree: boolean;
}

export interface WaveDispatch {
	readonly unit_id: number;
	readonly task_ids: readonly string[];
	readonly role: "primary" | "secondary";
}

/** A unit whose build is already done and which needs review, not rebuilding. */
export interface WaveReview {
	readonly unit_id: number;
	readonly task_ids: readonly string[];
}

/**
 * Scheduler output.
 *
 * `review` and `dispatch` are independent: when both are non-empty the
 * orchestrator runs them concurrently, which is the reviewer-pipelining case.
 * The scheduler only pairs them when the build is dependency-free and
 * file-disjoint from the unit under review.
 */
export interface ScheduleWaveResult {
	readonly review: readonly WaveReview[];
	readonly dispatch: readonly WaveDispatch[];
	readonly held: readonly number[];
	readonly mode: "serial" | "parallel-wave" | "review-only";
	readonly reason?: string;
}

export interface BuildTaskPlanSummary {
	readonly total_tasks: number;
	readonly pending: number;
	readonly completed: number;
	readonly blocked: number;
	readonly implementation_pending: number;
	readonly documentation_pending: number;
	readonly total_units: number;
	readonly skipped_completed: number;
	readonly skipped_blocked: number;
}

export interface BuildTaskPlanResult {
	readonly plan_path: string;
	readonly source_tasks_path: string;
	readonly schema_version: typeof TASK_PLAN_SCHEMA_VERSION;
	readonly feature_id: string;
	readonly tasks: readonly BuildTaskPlanTask[];
	readonly implementation_tasks: readonly BuildTaskPlanTask[];
	readonly documentation_tasks: readonly BuildTaskPlanTask[];
	readonly task_units: readonly BuildTaskUnit[];
	readonly warnings: readonly string[];
	readonly summary: BuildTaskPlanSummary;
}
