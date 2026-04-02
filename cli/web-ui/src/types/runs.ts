/**
 * Type definitions for runs, steps, artifacts, and events.
 * Used by the V2 dashboard for monitoring AI agent runs.
 *
 * All status and event types are the canonical shared types from
 * shared/events.ts with zero legacy values.
 */

import type {
	ArtifactType,
	EventType as SharedEventType,
	Status,
} from "../../../shared/events";

export type { ArtifactType };

/** Status of an agent run -- canonical shared Status */
export type RunStatus = Status;

/** Status of a workflow step within a run -- canonical shared Status */
export type StepStatus = Status;

/** Event type for the run event stream -- canonical shared EventType */
export type EventType = SharedEventType;

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
	readonly docId: string;
	readonly path: string;
	readonly absolutePath: string;
	readonly type: ArtifactType;
	readonly updatedDuringRun: boolean;
	readonly isNew: boolean;
	readonly step: string | null;
	readonly subflow?: boolean;
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
	readonly name: string | null;
	readonly command: string;
	readonly status: RunStatus;
	readonly harness: string | null;
	readonly currentStep: string | null;
	readonly steps: readonly Step[];
	readonly artifacts: readonly Artifact[];
	readonly events: readonly RunEvent[];
	readonly startedAt: string;
	readonly lastEventAt?: string | null;
	readonly completedAt: string | null;
	readonly error: string | null;
	readonly agentSteps: Readonly<Record<string, readonly AgentTask[]>> | null;
	readonly subflows?: Readonly<Record<string, string>>;
}

/** Attention groupings for the home dashboard */
export interface AttentionData {
	readonly waiting: readonly Run[];
	readonly failed: readonly Run[];
	readonly running: readonly Run[];
}

/** Filter state for the runs list */
export interface RunsFilter {
	readonly status: RunStatus | "all";
	readonly projectId: string | null;
	readonly dateRange: "today" | "week" | "month" | "all";
}
