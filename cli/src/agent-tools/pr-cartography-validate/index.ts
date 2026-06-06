/**
 * pr-cartography-validate tool entry point.
 * Wraps the shared PR cartography validator and maps validation issues to the
 * standard agent-tool error envelope.
 */

import * as TE from "fp-ts/lib/TaskEither.js";
import type { CLIError } from "../../../shared/errors.js";
import {
	type PRCartographyDocument,
	type PRCartographyValidationIssue,
	parsePRCartographyDocument,
} from "../../../shared/pr-cartography.js";
import { registerTool, type ToolOptions } from "../index.js";
import type { ToolError, ToolResult } from "../models.js";
import { errorResult, successResult } from "../output.js";

const TOOL_NAME = "pr-cartography-validate";

const toToolError = (issue: PRCartographyValidationIssue): ToolError => ({
	message: issue.message,
	context: issue.path,
});

export const execute = (
	content: string,
	_options: ToolOptions,
): TE.TaskEither<CLIError, ToolResult<PRCartographyDocument | null>> => {
	const result = parsePRCartographyDocument(content);

	if (result.ok) {
		return TE.right(successResult(TOOL_NAME, result.document));
	}

	return TE.right(errorResult(TOOL_NAME, null, result.issues.map(toToolError)));
};

registerTool({
	name: TOOL_NAME,
	description: "Validate PR cartography JSON documents",
	execute,
});

export { TOOL_NAME };
