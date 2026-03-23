/**
 * Feedback tool entry point.
 * Provides feedback lifecycle management for agents processing Arcade feedback.
 */

import * as TE from "fp-ts/lib/TaskEither.js";
import type { CLIError } from "../../../shared/errors.js";
import { registerTool, type ToolOptions } from "../index.js";
import type { ToolResult } from "../models.js";
import { successResult } from "../output.js";

const TOOL_NAME = "feedback";

/**
 * Main execute function for tool registration.
 * This tool uses subcommands, so this is a placeholder for the registry.
 * Actual execution is done via individual execute functions invoked by CLI command handlers.
 */
const execute = (
	_input: string,
	_options: ToolOptions,
): TE.TaskEither<CLIError, ToolResult<{ message: string }>> =>
	TE.right(
		successResult(TOOL_NAME, {
			message:
				"Use subcommands: read, resolve, reply, accept-edit. See --help for details.",
		}),
	);

registerTool({
	name: TOOL_NAME,
	description: "Read, resolve, reply to, and accept feedback from the Arcade",
	execute,
});

export { TOOL_NAME };
export { executeFeedbackAcceptEdit } from "./accept.js";
export { executeFeedbackRead } from "./read.js";
export { executeFeedbackReply } from "./reply.js";
export { executeFeedbackResolve } from "./resolve.js";
export {
	validateAcceptEditOptions,
	validateReadOptions,
	validateReplyOptions,
	validateResolveOptions,
} from "./validate.js";
