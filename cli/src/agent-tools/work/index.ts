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
	closeDatabase,
	DEFAULT_DB_PATH,
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
	readonly task: string | null;
	readonly status: StatusValue;
	readonly message: string | null;
	readonly createdAt: string;
}

/**
 * Notify the daemon of a status change for immediate WebSocket broadcast.
 * This is a best-effort operation - if the daemon is not running, we don't care.
 */
const notifyDaemon = async (
	projectPath: string,
	feature: string,
	status: string,
): Promise<void> => {
	try {
		// Dynamic import to avoid bundling issues with the daemon module
		const { connectToDaemon, notifyStatusChange } = await import(
			"../../../web-ui/src/daemon/index.js"
		);

		const conn = await connectToDaemon();
		if (conn) {
			await notifyStatusChange(conn, projectPath, feature, status);
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
				task: input.task ?? null,
				status: input.status,
				message: input.message ?? null,
				createdAt: result.createdAt,
			}),
		),
		TE.chainFirst((data) =>
			TE.fromTask(async () => {
				// Fire and forget - notify daemon but don't wait or fail on errors
				await notifyDaemon(data.projectPath, data.feature, data.status);
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
