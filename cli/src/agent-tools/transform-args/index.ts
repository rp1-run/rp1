/**
 * transform-args tool entry point.
 * Schema-driven argument parsing with hierarchical settings management.
 */

import { pipe } from "fp-ts/lib/function.js";
import * as TE from "fp-ts/lib/TaskEither.js";
import type { CLIError } from "../../../shared/errors.js";
import { runtimeError } from "../../../shared/errors.js";
import { registerTool, type ToolOptions } from "../index.js";
import type { ToolResult } from "../models.js";
import { errorResult, successResult } from "../output.js";
import { formatOutput } from "./formatter.js";
import {
	loadSettingsFileForValidation,
	resolveGlobalSettingsPath,
	resolveLocalSettingsPath,
} from "./settings-loader.js";
import { type TransformError, transformArgs } from "./transformer.js";

// Re-export formatter functions
export { formatOutput, formatOutputWithWarnings } from "./formatter.js";
// Re-export public types from models
export type {
	ArgumentSchema,
	FileValidation,
	FlagArg,
	MergedSettings,
	PositionalArg,
	SettingsFile,
	SettingsSource,
	SettingsValidationResult,
	TransformResult,
} from "./models.js";
// Re-export schema parser
export { parseArgumentHint } from "./schema.js";
// Re-export settings utilities
export {
	loadSettings,
	loadSettingsFile,
	resolveGlobalSettingsPath,
	resolveLocalSettingsPath,
} from "./settings-loader.js";
export { emptyMergedSettings, mergeSettings } from "./settings-merger.js";
export type { TransformError } from "./transformer.js";
// Re-export transformation functions
export { transformArgs, transformArgsSync } from "./transformer.js";

/** Tool name used for registration and output */
const TOOL_NAME = "transform-args";

/**
 * Transform result data structure for tool output.
 */
interface TransformArgsData {
	readonly output: string;
	readonly schemaUsed: boolean;
	readonly namespace: string;
	readonly variableCount: number;
	readonly warnings: readonly string[];
}

/**
 * Execute transform-args tool.
 *
 * Parses plugin-command argument schema and transforms raw arguments
 * into VARIABLE=value output format.
 *
 * @param input - JSON input string containing pluginCommand, namespace, and args
 * @param options - Tool options (unused for this tool)
 * @returns TaskEither with ToolResult containing transformation data
 */
export const execute = (
	input: string,
	_options: ToolOptions,
): TE.TaskEither<CLIError, ToolResult<TransformArgsData>> => {
	// Parse input JSON
	let parsed: { pluginCommand: string; namespace?: string; args?: string[] };
	try {
		parsed = JSON.parse(input);
	} catch {
		return TE.left(runtimeError("Invalid JSON input for transform-args"));
	}

	const { pluginCommand, namespace = "global", args = [] } = parsed;

	if (!pluginCommand) {
		return TE.left(runtimeError("Missing pluginCommand in input"));
	}

	return pipe(
		transformArgs(pluginCommand, namespace, args),
		TE.mapLeft((error: TransformError): CLIError => {
			return runtimeError(error.message);
		}),
		TE.map((result) => {
			const output = formatOutput(result);
			const data: TransformArgsData = {
				output,
				schemaUsed: result.schemaUsed,
				namespace: result.namespace,
				variableCount: Object.keys(result.variables).length,
				warnings: result.warnings,
			};

			if (result.warnings.length > 0) {
				return errorResult(
					TOOL_NAME,
					data,
					result.warnings.map((w) => ({ message: w })),
				);
			}

			return successResult(TOOL_NAME, data);
		}),
	);
};

/**
 * Validate settings files and return validation result.
 *
 * Checks both global and local settings files for TOML validity.
 *
 * @param cwd - Current working directory for local settings resolution
 * @returns Promise with validation results
 */
export const validateSettings = async (
	cwd: string = process.cwd(),
): Promise<{
	valid: boolean;
	globalFile: {
		path: string;
		exists: boolean;
		valid: boolean;
		error?: string;
		line?: number;
	};
	localFile: {
		path: string;
		exists: boolean;
		valid: boolean;
		error?: string;
		line?: number;
	};
}> => {
	const globalPath = resolveGlobalSettingsPath();
	const localPath = resolveLocalSettingsPath(cwd);

	const [globalResult, localResult] = await Promise.all([
		loadSettingsFileForValidation(globalPath),
		loadSettingsFileForValidation(localPath),
	]);

	const globalFile = {
		path: globalPath,
		exists: globalResult.exists,
		valid: globalResult.valid,
		error: globalResult.error,
		line: globalResult.line,
	};

	const localFile = {
		path: localPath,
		exists: localResult.exists,
		valid: localResult.valid,
		error: localResult.error,
		line: localResult.line,
	};

	// Overall valid if both files are valid (or don't exist)
	const valid = globalFile.valid && localFile.valid;

	return { valid, globalFile, localFile };
};

/** Register this tool with the framework */
registerTool({
	name: TOOL_NAME,
	description:
		"Transform command arguments using schema and settings into VARIABLE=value format",
	execute,
});

export { TOOL_NAME };
