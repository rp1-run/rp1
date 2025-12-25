/**
 * mmd-validate tool entry point.
 * Orchestrates Mermaid diagram extraction, validation, and output formatting.
 */

import { pipe } from "fp-ts/lib/function.js";
import * as TE from "fp-ts/lib/TaskEither.js";
import type { CLIError } from "../../../shared/errors.js";
import { runtimeError } from "../../../shared/errors.js";
import { registerTool, type ToolOptions } from "../index.js";
import type { ToolError, ToolResult } from "../models.js";
import { errorResult, successResult } from "../output.js";
import { extractMermaidBlocks } from "./extractor.js";
import type { DiagramError, MmdValidateData } from "./models.js";
import { validateDiagrams } from "./validator.js";

/** Tool name used for registration and output */
const TOOL_NAME = "mmd-validate";

/** Default timeout for validation in milliseconds */
const DEFAULT_TIMEOUT = 30000;

/**
 * Convert diagram errors to tool errors for output envelope.
 * Extracts errors from invalid diagrams and maps to ToolError format.
 */
const toToolErrors = (data: MmdValidateData): readonly ToolError[] =>
	data.diagrams
		.filter((d) => !d.valid)
		.flatMap((d) =>
			(d.errors ?? []).map(
				(e: DiagramError): ToolError => ({
					message: e.message,
					line: e.line,
					column: e.column,
					context: e.context,
				}),
			),
		);

/**
 * Execute mmd-validate tool.
 * Orchestrates extraction, validation, and output formatting.
 *
 * @param content - Raw content to validate (markdown or raw mermaid)
 * @param options - Tool options including timeout
 * @returns TaskEither with ToolResult containing validation data
 */
export const execute = (
	content: string,
	options: ToolOptions,
): TE.TaskEither<CLIError, ToolResult<MmdValidateData>> =>
	pipe(
		// Extract mermaid blocks from content
		TE.fromEither(extractMermaidBlocks(content)),
		TE.mapLeft((error) =>
			runtimeError(`Failed to extract mermaid blocks: ${error.message}`),
		),
		TE.chain((blocks) => {
			// Handle empty input (no diagrams) as success with empty results
			if (blocks.length === 0) {
				return TE.right(
					successResult(TOOL_NAME, {
						diagrams: [],
						summary: { total: 0, valid: 0, invalid: 0 },
					}),
				);
			}

			// Validate all extracted blocks
			return pipe(
				validateDiagrams(blocks, options.timeout ?? DEFAULT_TIMEOUT),
				TE.map((data) => {
					const errors = toToolErrors(data);
					return errors.length > 0
						? errorResult(TOOL_NAME, data, errors)
						: successResult(TOOL_NAME, data);
				}),
			);
		}),
	);

/** Register this tool with the framework */
registerTool({
	name: TOOL_NAME,
	description: "Validate Mermaid diagram syntax in markdown documents",
	execute,
});

export { TOOL_NAME };
