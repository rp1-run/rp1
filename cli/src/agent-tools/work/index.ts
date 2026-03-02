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
	type CleanupResult,
	closeDatabase,
	countExpiredRuns,
	DEFAULT_DB_PATH,
	deleteExpiredRuns,
	getCurrentWorkflowState,
	getLatestStatusByFeature,
	insertStatusUpdate,
	isValidStatus,
	queryStatusUpdates,
	resetDatabaseInstance,
} from "./database.js";
import type {
	QueryOptions,
	StatusUpdateInput,
	StatusUpdateRecord,
	StatusValue,
} from "./models.js";
import { VALID_STATUSES } from "./models.js";

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
 * Workflow context for enriched daemon notifications.
 * Allows broadcasting run:step and run:status WebSocket events
 * for state-machine-enabled workflows.
 */
interface WorkflowNotifyContext {
	readonly workflow: string;
	readonly runId?: string;
	readonly previousState?: string | null;
	readonly newState: string;
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
 * Execute work update subcommand.
 * Inserts a new status update and returns the result.
 * Also notifies the daemon for immediate WebSocket broadcast (best-effort).
 *
 * @param input - Status update data
 * @param dbPath - Optional database path override
 * @returns TaskEither with ToolResult containing WorkUpdateResult
 */
export const executeUpdate = (
	input: StatusUpdateInput,
	dbPath?: string,
): TE.TaskEither<CLIError, ToolResult<WorkUpdateResult>> =>
	pipe(
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
		TE.chainFirst((data) =>
			TE.fromTask(async () => {
				const workflowCtx =
					input.workflow && input.step
						? {
								workflow: input.workflow,
								runId: input.runId,
								previousState: input.previousState,
								newState: input.step,
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
	VALID_STATUSES,
};
export type {
	QueryOptions,
	StatusUpdateInput,
	StatusUpdateRecord,
	StatusValue,
};
