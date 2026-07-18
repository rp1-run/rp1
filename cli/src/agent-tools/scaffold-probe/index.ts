import * as TE from "fp-ts/lib/TaskEither.js";
import type { CLIError } from "../../../shared/errors.js";
import { registerTool, type ToolOptions } from "../index.js";
import type { ToolResult } from "../models.js";
import { successResult } from "../output.js";

const TOOL_NAME = "scaffold-probe";

const execute = (
	_input: string,
	_options: ToolOptions,
): TE.TaskEither<CLIError, ToolResult<{ message: string }>> =>
	TE.right(
		successResult(TOOL_NAME, {
			message:
				"Use subcommand: probe --target-dir <path>. See --help for details.",
		}),
	);

registerTool({
	name: TOOL_NAME,
	description:
		"Four-point scaffold completeness probe for bootstrap verification",
	execute,
});

export { TOOL_NAME };
export { probeScaffold } from "./probe.js";
