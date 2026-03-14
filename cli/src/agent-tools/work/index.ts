/**
 * Work status agent tool entry point.
 * Provides status update functionality for tracking agent workflow progress.
 */

import { pipe } from "fp-ts/lib/function.js";
import * as TE from "fp-ts/lib/TaskEither.js";
import type { CLIError } from "../../../shared/errors.js";
import { registerTool, type ToolOptions } from "../index.js";
import type { ToolResult } from "../models.js";
import { successResult } from "../output.js";
import {
	deriveOrderedSteps,
	loadStateMachine,
} from "../state-machine/index.js";
import {
	type CleanupResult,
	closeDatabase,
	countExpiredRuns,
	DEFAULT_DB_PATH,
	deleteExpiredRuns,
	getCurrentWorkflowState,
	getLatestStatusByFeature,
	getStepStatusValue,
	insertArtifact,
	insertStatusUpdate,
	isValidStatus,
	queryStatusUpdates,
	resetDatabaseInstance,
} from "./database.js";
import type {
	ArtifactInput,
	ArtifactRecord,
	ArtifactTypeValue,
	QueryOptions,
	ReconciliationResult,
	StatusUpdateInput,
	StatusUpdateRecord,
	StatusValue,
} from "./models.js";
import { VALID_ARTIFACT_TYPES, VALID_STATUSES } from "./models.js";

/** Tool name used for registration and output */
const TOOL_NAME = "work";

/**
 * Result type for the update subcommand.
 * Contains inserted record details.
 */
export interface WorkUpdateResult {
	readonly id: number;
	readonly projectPath: string;
	readonly feature: string;
	readonly step: string | null;
	readonly status: StatusValue;
	readonly message: string | null;
	readonly createdAt: string;
}

/**
 * Result type for the artifact subcommand.
 * Contains inserted artifact details.
 */
export interface WorkArtifactResult {
	readonly id: number;
	readonly projectPath: string;
	readonly feature: string;
	readonly runId: string | null;
	readonly path: string;
	readonly type: ArtifactTypeValue;
	readonly createdAt: string;
	readonly worktreePath: string | null;
	readonly step: string | null;
}

/**
 * Execute work artifact subcommand.
 * Registers a new artifact in the database.
 *
 * @param input - Artifact registration data
 * @param dbPath - Optional database path override
 * @returns TaskEither with ToolResult containing WorkArtifactResult
 */
export const executeArtifact = (
	input: ArtifactInput,
	dbPath?: string,
): TE.TaskEither<CLIError, ToolResult<WorkArtifactResult>> =>
	pipe(
		insertArtifact(input, dbPath),
		TE.map(
			(result): WorkArtifactResult => ({
				id: result.id,
				projectPath: input.projectPath,
				feature: input.feature,
				runId: input.runId ?? null,
				path: input.path,
				type: input.type,
				createdAt: result.createdAt,
				worktreePath: input.worktreePath ?? null,
				step: input.step ?? null,
			}),
		),
		TE.chainFirst((data) =>
			TE.fromTask(async () => {
				await notifyDaemonArtifact(data.projectPath, data.feature, {
					path: data.path,
					type: data.type,
					step: data.step,
					runId: data.runId,
				});
			}),
		),
		TE.map((data) => successResult(TOOL_NAME, data)),
	);

/**
 * Notify the daemon of an artifact registration for immediate WebSocket broadcast.
 * This is a best-effort operation - if the daemon is not running, we don't care.
 */
const notifyDaemonArtifact = async (
	projectPath: string,
	feature: string,
	artifact: {
		path: string;
		type: string;
		step: string | null;
		runId: string | null;
	},
): Promise<void> => {
	try {
		const { connectToDaemon, notifyArtifactChange } = await import(
			"../../../web-ui/src/daemon/index.js"
		);

		const conn = await connectToDaemon();
		if (conn) {
			await notifyArtifactChange(conn, projectPath, feature, artifact);
		}
	} catch {
		// Daemon not available - polling will pick up the change
	}
};

/**
 * Workflow context for enriched daemon notifications.
 * Allows broadcasting run:step and run:status WebSocket events
 * for state-machine-enabled workflows.
 */
interface WorkflowNotifyContext {
	readonly workflow: string;
	readonly runId?: string;
	readonly previousState?: string | null;
	readonly newState: string;
	readonly stepStatus?: string;
}

/**
 * Notify the daemon of a status change for immediate WebSocket broadcast.
 * This is a best-effort operation - if the daemon is not running, we don't care.
 *
 * When workflow context is provided (state-machine-enabled workflows),
 * the daemon also broadcasts run:step and run:status events.
 */
const notifyDaemon = async (
	projectPath: string,
	feature: string,
	status: string,
	workflowCtx?: WorkflowNotifyContext,
): Promise<void> => {
	try {
		// Dynamic import to avoid bundling issues with the daemon module
		const { connectToDaemon, notifyStatusChange } = await import(
			"../../../web-ui/src/daemon/index.js"
		);

		const conn = await connectToDaemon();
		if (conn) {
			await notifyStatusChange(conn, projectPath, feature, status, workflowCtx);
		}
	} catch {
		// Daemon not available - this is fine, polling will pick up the change
	}
};

/**
 * Map raw status value to step-level status for WebSocket broadcast.
 * This is the canonical mapping from database status values to
 * the step statuses used by the frontend canvas.
 */
const mapStatusToStepStatus = (status: StatusValue): string => {
	switch (status) {
		case "started":
		case "in_progress":
			return "running";
		case "waiting-input":
			return "waiting-input";
		case "needs-review":
			return "needs-review";
		case "completed":
			return "completed";
		case "failed":
			return "failed";
	}
};

/**
 * Auto-correct skipped steps by inserting "completed" records for prior
 * steps in the state machine that have no status records.
 *
 * This ensures the database always has a complete step history even when
 * intermediate steps were never explicitly reported (e.g., rapid execution
 * or missed events).
 */
const autoCorrectSkippedSteps = async (
	input: StatusUpdateInput,
	dbPath?: string,
): Promise<readonly string[]> => {
	if (!input.workflow || !input.step || input.status === "failed") {
		return [];
	}

	try {
		const agentOrWorkflow = input.agent ?? input.workflow;
		const machineResult = await loadStateMachine(agentOrWorkflow)();
		if (machineResult._tag === "Left") return [];

		const orderedSteps = deriveOrderedSteps(machineResult.right);
		const currentStepIndex = orderedSteps.findIndex((s) => s.id === input.step);
		if (currentStepIndex <= 0) return [];

		const corrections: string[] = [];
		for (let i = 0; i < currentStepIndex; i++) {
			const priorStep = orderedSteps[i];
			const priorStatusResult = await getStepStatusValue(
				input.projectPath,
				input.feature,
				priorStep.id,
				input.runId,
				dbPath,
			)();

			const priorStatus =
				priorStatusResult._tag === "Right" ? priorStatusResult.right : null;
			const isNonTerminal =
				priorStatus === null ||
				(priorStatus !== "completed" && priorStatus !== "failed");

			if (priorStatusResult._tag === "Right" && isNonTerminal) {
				const reason =
					priorStatus === null ? "skipped" : `stuck in ${priorStatus}`;
				console.log(
					`[reconcile] Auto-correcting ${reason} step ${priorStep.id}: inserting completed status`,
				);
				await insertStatusUpdate(
					{
						projectPath: input.projectPath,
						feature: input.feature,
						step: priorStep.id,
						status: "completed",
						message: "Auto-corrected: step was skipped",
						runId: input.runId,
						workflow: input.workflow,
						expiresAt: input.expiresAt,
						agent: input.agent,
						task: input.task,
						worktreePath: input.worktreePath,
					},
					dbPath,
				)();
				corrections.push(priorStep.id);
			}
		}

		return corrections;
	} catch {
		return [];
	}
};

/**
 * Execute work update subcommand.
 * Inserts a new status update and returns the result.
 * Also notifies the daemon for immediate WebSocket broadcast (best-effort).
 *
 * When reconciliation indicates a backward transition (rejected), the insert
 * and notify are skipped entirely -- the update is a no-op (self-healing).
 *
 * @param input - Status update data
 * @param dbPath - Optional database path override
 * @returns TaskEither with ToolResult containing WorkUpdateResult
 */
export const executeUpdate = (
	input: StatusUpdateInput,
	dbPath?: string,
): TE.TaskEither<CLIError, ToolResult<WorkUpdateResult>> => {
	if (input.reconciliation?.rejected) {
		const noopResult: WorkUpdateResult = {
			id: 0,
			projectPath: input.projectPath,
			feature: input.feature,
			step: input.step ?? null,
			status: input.status,
			message: input.reconciliation.reason ?? "backward_transition",
			createdAt: new Date().toISOString(),
		};
		return TE.right(successResult(TOOL_NAME, noopResult));
	}

	return pipe(
		insertStatusUpdate(input, dbPath),
		TE.map(
			(result): WorkUpdateResult => ({
				id: result.id,
				projectPath: input.projectPath,
				feature: input.feature,
				step: input.step ?? null,
				status: input.status,
				message: input.message ?? null,
				createdAt: result.createdAt,
			}),
		),
		TE.chainFirst(() =>
			TE.fromTask(async () => {
				await autoCorrectSkippedSteps(input, dbPath);
			}),
		),
		TE.chainFirst((data) =>
			TE.fromTask(async () => {
				const stepStatus = mapStatusToStepStatus(input.status);
				const workflowCtx =
					input.workflow && input.step
						? {
								workflow: input.workflow,
								runId: input.runId,
								previousState: input.previousState,
								newState: input.step,
								stepStatus,
							}
						: undefined;
				await notifyDaemon(
					data.projectPath,
					data.feature,
					data.status,
					workflowCtx,
				);
			}),
		),
		TE.map((data) => successResult(TOOL_NAME, data)),
	);
};

/**
 * Execute work query subcommand.
 * Retrieves status updates for a project.
 *
 * @param options - Query options with filters
 * @param dbPath - Optional database path override
 * @returns TaskEither with ToolResult containing array of StatusUpdateRecord
 */
export const executeQuery = (
	options: QueryOptions,
	dbPath?: string,
): TE.TaskEither<CLIError, ToolResult<readonly StatusUpdateRecord[]>> =>
	pipe(
		queryStatusUpdates(options, dbPath),
		TE.map((data) => successResult(TOOL_NAME, data)),
	);

/**
 * Execute work status subcommand.
 * Gets the latest status for each feature in a project.
 *
 * @param projectPath - Project path to query
 * @param dbPath - Optional database path override
 * @returns TaskEither with ToolResult containing array of StatusUpdateRecord
 */
export const executeStatus = (
	projectPath: string,
	dbPath?: string,
): TE.TaskEither<CLIError, ToolResult<readonly StatusUpdateRecord[]>> =>
	pipe(
		getLatestStatusByFeature(projectPath, dbPath),
		TE.map((data) => successResult(TOOL_NAME, data)),
	);

/**
 * Options for the cleanup subcommand.
 */
export interface CleanupOptions {
	readonly dryRun: boolean;
	readonly olderThan: number;
}

/**
 * Execute work cleanup subcommand.
 * Deletes expired runs (all rows for runs whose latest row has expired).
 * In dry-run mode, reports counts without deleting.
 *
 * @param options - Cleanup options (dryRun, olderThan)
 * @param dbPath - Optional database path override
 * @returns TaskEither with ToolResult containing CleanupResult
 */
export const executeCleanup = (
	options: CleanupOptions,
	dbPath?: string,
): TE.TaskEither<CLIError, ToolResult<CleanupResult>> =>
	pipe(
		options.dryRun
			? countExpiredRuns(options.olderThan, dbPath)
			: deleteExpiredRuns(options.olderThan, dbPath),
		TE.map((data) => successResult(TOOL_NAME, data)),
	);

/**
 * Main execute function for tool registration.
 * Note: This tool uses subcommands, so this execute function is a placeholder
 * for the registry. The actual execution is done via executeUpdate, executeQuery,
 * and executeStatus functions which are invoked by the CLI command handler.
 */
const execute = (
	_input: string,
	_options: ToolOptions,
): TE.TaskEither<CLIError, ToolResult<{ message: string }>> =>
	TE.right(
		successResult(TOOL_NAME, {
			message:
				"Use subcommands: update, query, status. See --help for details.",
		}),
	);

/** Register this tool with the framework */
registerTool({
	name: TOOL_NAME,
	description:
		"Track agent workflow progress with status updates (update, query, status)",
	execute,
});

export {
	closeDatabase,
	DEFAULT_DB_PATH,
	getCurrentWorkflowState,
	isValidStatus,
	resetDatabaseInstance,
	TOOL_NAME,
	VALID_ARTIFACT_TYPES,
	VALID_STATUSES,
};
export type {
	ArtifactInput,
	ArtifactRecord,
	ArtifactTypeValue,
	QueryOptions,
	ReconciliationResult,
	StatusUpdateInput,
	StatusUpdateRecord,
	StatusValue,
};
