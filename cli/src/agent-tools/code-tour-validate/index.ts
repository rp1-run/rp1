/**
 * code-tour-validate tool entry point.
 * Wraps the shared Code Tour validator, mapping validation issues to the
 * standard tool error envelope so agents can self-correct PR walkthrough JSON.
 */

import * as TE from "fp-ts/lib/TaskEither.js";
import {
	type CodeTourDocument,
	type CodeTourValidationIssue,
	parseCodeTourDocument,
} from "../../../shared/code-tour.js";
import type { CLIError } from "../../../shared/errors.js";
import { registerTool, type ToolOptions } from "../index.js";
import type { ToolError, ToolResult } from "../models.js";
import { errorResult, successResult } from "../output.js";

/** Tool name used for registration and output */
const TOOL_NAME = "code-tour-validate";

/**
 * Map a Code Tour validation issue to the standard tool error envelope.
 * Preserves the JSON path as `context` and the human-readable message.
 */
const toToolError = (issue: CodeTourValidationIssue): ToolError => ({
	message: issue.message,
	context: issue.path,
});

/**
 * Execute code-tour-validate tool.
 * Parses and validates Code Tour JSON content via the shared validator.
 *
 * @param content - Raw Code Tour JSON content
 * @param _options - Tool options (unused; validation is synchronous)
 * @returns TaskEither with a ToolResult; success carries the validated
 *   document, failure carries a null document plus mapped validation errors.
 */
export const execute = (
	content: string,
	_options: ToolOptions,
): TE.TaskEither<CLIError, ToolResult<CodeTourDocument | null>> => {
	const result = parseCodeTourDocument(content);

	if (result.ok) {
		return TE.right(successResult(TOOL_NAME, result.document));
	}

	return TE.right(errorResult(TOOL_NAME, null, result.issues.map(toToolError)));
};

/** Register this tool with the framework */
registerTool({
	name: TOOL_NAME,
	description: "Validate Code Tour JSON walkthrough documents",
	execute,
});

export { TOOL_NAME };
