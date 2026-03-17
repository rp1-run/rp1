/**
 * Task queue agent tool entry point.
 * Provides task lifecycle management for agents and workflows.
 */

import { isAbsolute } from "node:path";
import { pipe } from "fp-ts/lib/function.js";
import * as TE from "fp-ts/lib/TaskEither.js";
import type { CLIError } from "../../../shared/errors.js";
import { registerTool, type ToolOptions } from "../index.js";
import type { ToolResult } from "../models.js";
import { errorResult, successResult } from "../output.js";
import {
	cancelTask,
	completeTask,
	createTask,
	failTask,
	getTask,
	listTasks,
	pickupTask,
} from "./database.js";
import type {
	TaskCreateInput,
	TaskQueryOptions,
	TaskRecord,
	TaskResolveInput,
} from "./models.js";
import { type TaskStatus, VALID_TASK_STATUSES } from "./models.js";

/** Tool name used for registration and output */
const TOOL_NAME = "task";

/**
 * Validate that a string is non-empty after trimming.
 */
const isNonEmpty = (value: string): boolean => value.trim().length > 0;

/**
 * Validate that a string is valid JSON.
 */
const isValidJson = (value: string): boolean => {
	try {
		JSON.parse(value);
		return true;
	} catch {
		return false;
	}
};

/**
 * Validate that a number is a positive integer.
 */
const isPositiveInteger = (value: number): boolean =>
	Number.isInteger(value) && value > 0;

/**
 * Validate that a status string is a valid TaskStatus.
 */
const isValidStatus = (value: string): value is TaskStatus =>
	(VALID_TASK_STATUSES as readonly string[]).includes(value);

/**
 * Execute task create operation.
 * Validates input and creates a new pending task.
 *
 * @param input - Task creation data
 * @param dbPath - Optional database path override
 * @returns TaskEither with ToolResult containing the created TaskRecord
 */
export const executeCreate = (
	input: TaskCreateInput,
	dbPath?: string,
): TE.TaskEither<CLIError, ToolResult<TaskRecord>> => {
	if (!isNonEmpty(input.type)) {
		return TE.right(
			errorResult(TOOL_NAME, null as unknown as TaskRecord, [
				{ message: "Task type must be a non-empty string" },
			]),
		);
	}

	if (!isNonEmpty(input.description)) {
		return TE.right(
			errorResult(TOOL_NAME, null as unknown as TaskRecord, [
				{ message: "Task description must be a non-empty string" },
			]),
		);
	}

	if (input.payload !== undefined && !isValidJson(input.payload)) {
		return TE.right(
			errorResult(TOOL_NAME, null as unknown as TaskRecord, [
				{ message: "Task payload must be valid JSON" },
			]),
		);
	}

	if (input.projectPath !== undefined && !isAbsolute(input.projectPath)) {
		return TE.right(
			errorResult(TOOL_NAME, null as unknown as TaskRecord, [
				{ message: "Project path must be an absolute path" },
			]),
		);
	}

	return pipe(
		createTask(input, dbPath),
		TE.map((data) => successResult(TOOL_NAME, data)),
	);
};

/**
 * Execute task list operation.
 * Validates query options and returns filtered task list.
 *
 * @param options - Query filters (status, projectPath, limit)
 * @param dbPath - Optional database path override
 * @returns TaskEither with ToolResult containing array of TaskRecord
 */
export const executeList = (
	options: TaskQueryOptions = {},
	dbPath?: string,
): TE.TaskEither<CLIError, ToolResult<readonly TaskRecord[]>> => {
	if (options.status !== undefined && !isValidStatus(options.status)) {
		return TE.right(
			errorResult(TOOL_NAME, null as unknown as readonly TaskRecord[], [
				{
					message: `Invalid status filter '${options.status}'. Valid values: ${VALID_TASK_STATUSES.join(", ")}`,
				},
			]),
		);
	}

	if (options.projectPath !== undefined && !isAbsolute(options.projectPath)) {
		return TE.right(
			errorResult(TOOL_NAME, null as unknown as readonly TaskRecord[], [
				{ message: "Project path must be an absolute path" },
			]),
		);
	}

	if (options.limit !== undefined && !isPositiveInteger(options.limit)) {
		return TE.right(
			errorResult(TOOL_NAME, null as unknown as readonly TaskRecord[], [
				{ message: "Limit must be a positive integer" },
			]),
		);
	}

	return pipe(
		listTasks(options, dbPath),
		TE.map((data) => successResult(TOOL_NAME, data)),
	);
};

/**
 * Execute task pickup operation.
 * Atomically picks up the oldest pending task.
 *
 * @param projectPath - Optional project path filter
 * @param dbPath - Optional database path override
 * @returns TaskEither with ToolResult containing the picked-up TaskRecord or null
 */
export const executePickup = (
	projectPath?: string,
	dbPath?: string,
): TE.TaskEither<CLIError, ToolResult<TaskRecord | null>> => {
	if (projectPath !== undefined && !isAbsolute(projectPath)) {
		return TE.right(
			errorResult(TOOL_NAME, null as unknown as TaskRecord | null, [
				{ message: "Project path must be an absolute path" },
			]),
		);
	}

	return pipe(
		pickupTask(projectPath, dbPath),
		TE.map((data) => successResult(TOOL_NAME, data)),
	);
};

/**
 * Execute task complete operation.
 * Marks an in_progress task as completed with an optional result summary.
 *
 * @param input - Task ID and optional result
 * @param dbPath - Optional database path override
 * @returns TaskEither with ToolResult containing the completed TaskRecord
 */
export const executeComplete = (
	input: TaskResolveInput,
	dbPath?: string,
): TE.TaskEither<CLIError, ToolResult<TaskRecord>> => {
	if (!isPositiveInteger(input.id)) {
		return TE.right(
			errorResult(TOOL_NAME, null as unknown as TaskRecord, [
				{ message: "Task ID must be a positive integer" },
			]),
		);
	}

	return pipe(
		completeTask(input, dbPath),
		TE.map((data) => successResult(TOOL_NAME, data)),
	);
};

/**
 * Execute task fail operation.
 * Marks an in_progress task as failed with an optional error description.
 *
 * @param input - Task ID and optional error description
 * @param dbPath - Optional database path override
 * @returns TaskEither with ToolResult containing the failed TaskRecord
 */
export const executeFail = (
	input: TaskResolveInput,
	dbPath?: string,
): TE.TaskEither<CLIError, ToolResult<TaskRecord>> => {
	if (!isPositiveInteger(input.id)) {
		return TE.right(
			errorResult(TOOL_NAME, null as unknown as TaskRecord, [
				{ message: "Task ID must be a positive integer" },
			]),
		);
	}

	return pipe(
		failTask(input, dbPath),
		TE.map((data) => successResult(TOOL_NAME, data)),
	);
};

/**
 * Execute task cancel operation.
 * Cancels a pending or in_progress task.
 *
 * @param id - Task ID to cancel
 * @param dbPath - Optional database path override
 * @returns TaskEither with ToolResult containing the cancelled TaskRecord
 */
export const executeCancel = (
	id: number,
	dbPath?: string,
): TE.TaskEither<CLIError, ToolResult<TaskRecord>> => {
	if (!isPositiveInteger(id)) {
		return TE.right(
			errorResult(TOOL_NAME, null as unknown as TaskRecord, [
				{ message: "Task ID must be a positive integer" },
			]),
		);
	}

	return pipe(
		cancelTask(id, dbPath),
		TE.map((data) => successResult(TOOL_NAME, data)),
	);
};

/**
 * Execute task get operation.
 * Retrieves a single task by ID.
 *
 * @param id - Task ID
 * @param dbPath - Optional database path override
 * @returns TaskEither with ToolResult containing the TaskRecord
 */
export const executeGet = (
	id: number,
	dbPath?: string,
): TE.TaskEither<CLIError, ToolResult<TaskRecord>> => {
	if (!isPositiveInteger(id)) {
		return TE.right(
			errorResult(TOOL_NAME, null as unknown as TaskRecord, [
				{ message: "Task ID must be a positive integer" },
			]),
		);
	}

	return pipe(
		getTask(id, dbPath),
		TE.map((data) => successResult(TOOL_NAME, data)),
	);
};

/**
 * Main execute function for tool registration.
 * This tool uses subcommands, so this is a placeholder for the registry.
 * Actual execution is done via the individual execute functions invoked by CLI command handlers.
 */
const execute = (
	_input: string,
	_options: ToolOptions,
): TE.TaskEither<CLIError, ToolResult<{ message: string }>> =>
	TE.right(
		successResult(TOOL_NAME, {
			message:
				"Use subcommands: create, list, pickup, complete, fail, cancel, get. See --help for details.",
		}),
	);

/** Register this tool with the framework */
registerTool({
	name: TOOL_NAME,
	description:
		"Manage task queue (create, list, pickup, complete, fail, cancel, get)",
	execute,
});

export { TOOL_NAME };
