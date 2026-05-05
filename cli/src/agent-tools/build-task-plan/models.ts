export const TASK_PLAN_SCHEMA_VERSION = 1;

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
	readonly target?: string;
	readonly notes?: string;
}

export interface BuildTaskUnit {
	readonly unit_id: number;
	readonly task_ids: readonly string[];
	readonly complexity: BuildTaskComplexity;
	readonly depends_on: readonly string[];
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
