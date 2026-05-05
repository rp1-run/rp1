import type { EventRecord, RunRecord, Status } from "../../../shared/events.js";
import type { ArtifactRecord, StepStatusEntry } from "../emit/database.js";

export interface WorkflowStateInput {
	readonly runId: string;
	readonly workflow: string;
	readonly feature: string;
	readonly parentPhases: readonly string[];
	readonly recentEventLimit: number;
}

export interface WorkflowStateContractGap {
	readonly phase: string;
	readonly missing_artifacts: readonly string[];
	readonly message: string;
}

export interface WorkflowStatePhase {
	readonly phase: string;
	readonly status: Status;
}

export interface WorkflowStateSummary {
	readonly next_phase: string | null;
	readonly contract_gaps: readonly WorkflowStateContractGap[];
}

export interface WorkflowStateResult {
	readonly run: RunRecord;
	readonly steps: readonly StepStatusEntry[];
	readonly artifacts: readonly ArtifactRecord[];
	readonly recent_events: readonly EventRecord[];
	readonly phases: readonly WorkflowStatePhase[];
	readonly summary: WorkflowStateSummary;
}
