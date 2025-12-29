/**
 * rp1-root-dir tool entry point.
 * Returns the resolved RP1_ROOT path with worktree awareness,
 * enabling agents to access KB and work artifacts from the main
 * repository when running in a linked git worktree.
 */

import { pipe } from "fp-ts/lib/function.js";
import * as TE from "fp-ts/lib/TaskEither.js";
import type { CLIError } from "../../../shared/errors.js";
import { registerTool, type ToolOptions } from "../index.js";
import type { ToolResult } from "../models.js";
import { successResult } from "../output.js";
import type { Rp1RootResult } from "./models.js";
import { resolveRp1Root } from "./resolver.js";

/** Tool name used for registration and output */
const TOOL_NAME = "rp1-root-dir";

/**
 * Execute rp1-root-dir tool.
 * Resolves the RP1_ROOT path with worktree detection.
 *
 * @param _input - Unused (tool takes no input)
 * @param _options - Unused tool options
 * @returns TaskEither with ToolResult containing Rp1RootResult
 */
export const execute = (
	_input: string,
	_options: ToolOptions,
): TE.TaskEither<CLIError, ToolResult<Rp1RootResult>> =>
	pipe(
		resolveRp1Root(),
		TE.map((data) => successResult(TOOL_NAME, data)),
	);

/** Register this tool with the framework */
registerTool({
	name: TOOL_NAME,
	description:
		"Resolve RP1_ROOT path with worktree awareness for KB and artifact access",
	execute,
});

export { TOOL_NAME };
