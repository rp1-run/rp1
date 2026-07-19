import * as TE from "fp-ts/lib/TaskEither.js";
import type { CLIError } from "../../../shared/errors.js";
import { registerTool, type ToolOptions } from "../index.js";
import type { ToolResult } from "../models.js";
import { successResult } from "../output.js";

const TOOL_NAME = "blueprint-context";

const execute = (
	_input: string,
	_options: ToolOptions,
): TE.TaskEither<CLIError, ToolResult<{ message: string }>> =>
	TE.right(
		successResult(TOOL_NAME, {
			message: "Use subcommands: write, read, delete. See --help for details.",
		}),
	);

registerTool({
	name: TOOL_NAME,
	description:
		"Persist blueprint interview context (EXTRA_CONTEXT) with safe, atomic writes",
	execute,
});

export { TOOL_NAME };
export {
	deleteBlueprintContext,
	readBlueprintContext,
	writeBlueprintContext,
} from "./operations.js";
