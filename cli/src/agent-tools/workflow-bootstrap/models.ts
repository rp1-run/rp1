import type { WorkflowRunPolicy } from "../../../shared/events.js";
import type { WorkflowRunDecision } from "../emit/database.js";
import type {
	ResolvedArgumentValues,
	ResolvedDirectories,
} from "../resolve-args/models.js";

export interface WorkflowBootstrapInput {
	readonly name: string;
	readonly schema_path: string;
	readonly raw_args: string;
	readonly project_root: string;
	readonly harness?: string;
}

export interface WorkflowBootstrapWorkflow {
	readonly name: string;
	readonly schemaPath: string;
	readonly runPolicy: WorkflowRunPolicy;
	readonly identityArgs: readonly string[];
}

export interface WorkflowBootstrapRun {
	readonly runId: string;
	readonly resumed: boolean;
	readonly decision: WorkflowRunDecision;
}

export interface WorkflowBootstrapTrace {
	readonly projectIdentity: string;
	readonly workIdentity?: string;
	readonly identityValues: Readonly<Record<string, string | boolean>>;
	readonly requestedProjectRoot: string;
	readonly canonicalProjectRoot: string;
	readonly isWorktree: boolean;
	readonly worktreeName?: string;
	readonly host: string;
	readonly harness: string;
}

export interface WorkflowBootstrapResult {
	readonly arguments: ResolvedArgumentValues;
	readonly directories: ResolvedDirectories;
	readonly workflow: WorkflowBootstrapWorkflow;
	readonly run: WorkflowBootstrapRun;
	readonly trace: WorkflowBootstrapTrace;
}
