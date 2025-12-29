/**
 * Worktree agent tool entry point.
 * Provides subcommand handlers for creating, cleaning up, and checking
 * worktree status. Used by AI agents to isolate work in git worktrees.
 */

import { pipe } from "fp-ts/lib/function.js";
import * as TE from "fp-ts/lib/TaskEither.js";
import type { CLIError } from "../../../shared/errors.js";
import { registerTool, type ToolOptions } from "../index.js";
import type { ToolResult } from "../models.js";
import { successResult } from "../output.js";
import { type CleanupWorktreeOptions, cleanupWorktree } from "./cleanup.js";
import { type CreateWorktreeOptions, createWorktree } from "./create.js";
import type {
	WorktreeCleanupResult,
	WorktreeCreateResult,
	WorktreeStatusResult,
} from "./models.js";
import { getWorktreeStatus } from "./status.js";

/** Tool name used for registration and output */
const TOOL_NAME = "worktree";

/**
 * Execute worktree create subcommand.
 * Creates an isolated git worktree for agent execution.
 *
 * @param options - Creation options with slug and optional prefix
 * @returns TaskEither with ToolResult containing WorktreeCreateResult
 */
export const executeCreate = (
	options: CreateWorktreeOptions,
): TE.TaskEither<CLIError, ToolResult<WorktreeCreateResult>> =>
	pipe(
		createWorktree(options),
		TE.map((data) => successResult(TOOL_NAME, data)),
	);

/**
 * Execute worktree cleanup subcommand.
 * Removes a worktree and optionally deletes the associated branch.
 *
 * @param options - Cleanup options with path and optional flags
 * @returns TaskEither with ToolResult containing WorktreeCleanupResult
 */
export const executeCleanup = (
	options: CleanupWorktreeOptions,
): TE.TaskEither<CLIError, ToolResult<WorktreeCleanupResult>> =>
	pipe(
		cleanupWorktree(options),
		TE.map((data) => successResult(TOOL_NAME, data)),
	);

/**
 * Execute worktree status subcommand.
 * Checks if currently running in a git worktree.
 *
 * @returns TaskEither with ToolResult containing WorktreeStatusResult
 */
export const executeStatus = (): TE.TaskEither<
	CLIError,
	ToolResult<WorktreeStatusResult>
> =>
	pipe(
		getWorktreeStatus(),
		TE.map((data) => successResult(TOOL_NAME, data)),
	);

/**
 * Main execute function for tool registration.
 * Note: This tool uses subcommands, so this execute function is a placeholder
 * for the registry. The actual execution is done via executeCreate, executeCleanup,
 * and executeStatus functions which are invoked by the CLI command handler.
 */
const execute = (
	_input: string,
	_options: ToolOptions,
): TE.TaskEither<CLIError, ToolResult<WorktreeStatusResult>> =>
	pipe(
		getWorktreeStatus(),
		TE.map((data) => successResult(TOOL_NAME, data)),
	);

/** Register this tool with the framework */
registerTool({
	name: TOOL_NAME,
	description:
		"Manage git worktrees for isolated agent execution (create, cleanup, status)",
	execute,
});

export { TOOL_NAME };
export type { CreateWorktreeOptions, CleanupWorktreeOptions };
