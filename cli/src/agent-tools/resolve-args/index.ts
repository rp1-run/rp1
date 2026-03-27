/**
 * resolve-args tool entry point.
 * Resolves structured arguments for skills and agents by merging
 * user input with settings files and schema defaults.
 */

import * as E from "fp-ts/lib/Either.js";
import { pipe } from "fp-ts/lib/function.js";
import * as TE from "fp-ts/lib/TaskEither.js";
import type { CLIError } from "../../../shared/errors.js";
import { parseError, usageError } from "../../../shared/errors.js";
import { registerTool, type ToolOptions } from "../index.js";
import type { ToolResult } from "../models.js";
import { successResult } from "../output.js";
import type { ResolveArgsInput, ResolvedArgs } from "./models.js";
import { resolveArgs } from "./resolver.js";

/** Tool name used for registration and output. */
const TOOL_NAME = "resolve-args";

/**
 * Validate and parse JSON input into ResolveArgsInput.
 */
const parseInput = (input: string): E.Either<CLIError, ResolveArgsInput> => {
	if (!input.trim()) {
		return E.left(
			usageError(
				"Empty input",
				'Provide JSON with "schema_path", "raw_args", and "project_root" fields.',
			),
		);
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(input);
	} catch {
		return E.left(parseError("stdin", "Invalid JSON input"));
	}

	if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
		return E.left(
			usageError(
				"Input must be a JSON object",
				'Provide JSON with "schema_path", "raw_args", and "project_root" fields.',
			),
		);
	}

	const obj = parsed as Record<string, unknown>;

	if (typeof obj.schema_path !== "string" || !obj.schema_path) {
		return E.left(
			usageError(
				'Missing or invalid "schema_path" field',
				"Provide the path to the skill/agent markdown file with frontmatter.",
			),
		);
	}

	const rawArgs = typeof obj.raw_args === "string" ? obj.raw_args : "";
	const projectRoot =
		typeof obj.project_root === "string" ? obj.project_root : process.cwd();

	return E.right({
		schema_path: obj.schema_path,
		raw_args: rawArgs,
		project_root: projectRoot,
	});
};

/**
 * Execute the resolve-args tool.
 * Parses JSON input, reads the schema file, and resolves arguments.
 */
export const execute = (
	input: string,
	_options: ToolOptions,
): TE.TaskEither<CLIError, ToolResult<ResolvedArgs>> =>
	pipe(
		TE.fromEither(parseInput(input)),
		TE.chain(resolveArgs),
		TE.map((data) => successResult(TOOL_NAME, data)),
	);

registerTool({
	name: TOOL_NAME,
	description:
		"Resolve structured arguments for skills and agents from schema, settings, and user input",
	execute,
});

export { TOOL_NAME };
