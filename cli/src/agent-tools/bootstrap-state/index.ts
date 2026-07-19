import * as TE from "fp-ts/lib/TaskEither.js";
import type { CLIError } from "../../../shared/errors.js";
import { registerTool, type ToolOptions } from "../index.js";
import type { ToolResult } from "../models.js";
import { successResult } from "../output.js";

const TOOL_NAME = "bootstrap-state";

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
		"Manage bootstrap recovery state markers with safe JSON serialization",
	execute,
});

export { TOOL_NAME };
export {
	deleteBootstrapState,
	readBootstrapState,
	writeBootstrapState,
} from "./operations.js";
