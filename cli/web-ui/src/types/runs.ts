/**
 * Type definitions for runs, steps, artifacts, and events.
 * Used by the V2 dashboard for monitoring AI agent runs.
 */

/** Status of an agent run */
export type RunStatus =
	| "queued"
	| "running"
	| "waiting-input"
	| "completed"
	| "failed"
	| "needs-review";

/** Status of a workflow step within a run */
export type StepStatus =
	| "pending"
	| "running"
	| "completed"
	| "failed"
	| "skipped"
	| "waiting-input"
	| "needs-review";

/** Type of artifact produced by a run */
export type ArtifactType =
	| "markdown"
	| "diff"
	| "diagram"
	| "report"
	| "code"
	| "other";

/** Type of event in the run event stream */
export type EventType =
	| "step-start"
	| "step-complete"
	| "warning"
	| "error"
	| "artifact-updated"
	| "task-batch"
	| "agent-update";

/** A workflow step within a run */
export interface Step {
	readonly id: string;
	readonly name: string;
	readonly status: StepStatus;
	readonly startedAt: string | null;
	readonly completedAt: string | null;
	readonly taskCount: number | null;
	readonly completedTaskCount: number | null;
}

/** An artifact produced or updated by a run */
export interface Artifact {
	readonly path: string;
	readonly absolutePath: string;
	readonly type: ArtifactType;
	readonly updatedDuringRun: boolean;
	readonly isNew: boolean;
	readonly step: string | null;
}

/** A task within an agent sub-flow */
export interface AgentTask {
	readonly id: string;
	readonly name: string;
	readonly status: string;
	readonly agent: string;
}

/** An event in the run event stream */
export interface RunEvent {
	readonly id: string;
	readonly type: EventType;
	readonly message: string;
	readonly timestamp: string;
	readonly stepId: string | null;
	readonly metadata: Readonly<Record<string, unknown>> | null;
}

/** An agent run with all associated data */
export interface Run {
	readonly id: string;
	readonly projectId: string;
	readonly projectName: string;
	readonly featureId: string;
	readonly featureName: string;
	readonly command: string;
	readonly status: RunStatus;
	readonly currentStep: string | null;
	readonly steps: readonly Step[];
	readonly artifacts: readonly Artifact[];
	readonly events: readonly RunEvent[];
	readonly startedAt: string;
	readonly completedAt: string | null;
	readonly error: string | null;
	readonly agentSteps: Readonly<Record<string, readonly AgentTask[]>> | null;
}

/** Attention groupings for the home dashboard */
export interface AttentionData {
	readonly waiting: readonly Run[];
	readonly needsReview: readonly Run[];
	readonly failed: readonly Run[];
	readonly running: readonly Run[];
}

/** Filter state for the runs list */
export interface RunsFilter {
	readonly status: RunStatus | "all";
	readonly projectId: string | null;
	readonly dateRange: "today" | "week" | "month" | "all";
}
