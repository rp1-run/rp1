/**
 * Comment extraction agent tool entry point.
 * Extracts comments from git-changed files for analysis.
 */

import { existsSync } from "node:fs";
import path from "node:path";
import { pipe } from "fp-ts/lib/function.js";
import * as TE from "fp-ts/lib/TaskEither.js";
import type { CLIError } from "../../../shared/errors.js";
import { runtimeError } from "../../../shared/errors.js";
import { registerTool, type ToolOptions } from "../index.js";
import type { ToolResult } from "../models.js";
import { errorResult, successResult } from "../output.js";
import { extractCommentsFromFiles } from "./extractor.js";
import {
	getChangedFiles,
	getChangedLineRanges,
	getLinesAdded,
	isGitRepo,
} from "./git-ops.js";
import type { CommentExtractOptions, CommentExtractResult } from "./models.js";

/** Tool name used for registration and output */
const TOOL_NAME = "comment-extract";

/**
 * Execute comment extraction.
 *
 * @param options - Extraction options
 * @param cwd - Working directory (defaults to process.cwd())
 */
export const executeExtract = (
	options: CommentExtractOptions,
	cwd: string = process.cwd(),
): TE.TaskEither<CLIError, ToolResult<CommentExtractResult>> =>
	pipe(
		isGitRepo(cwd),
		TE.chain((isRepo) => {
			if (!isRepo) {
				return TE.right(
					errorResult(
						TOOL_NAME,
						{
							scope: options.scope,
							base: options.base,
							filesScanned: 0,
							linesAdded: 0,
							comments: [],
						},
						[{ message: "Not a git repository" }],
					),
				);
			}
			return TE.right(null);
		}),
		TE.chain((errorOrNull) => {
			if (errorOrNull !== null) {
				return TE.right(errorOrNull);
			}
			return performExtraction(options, cwd);
		}),
	);

/**
 * Perform the actual extraction after validation.
 */
const performExtraction = (
	options: CommentExtractOptions,
	cwd: string,
): TE.TaskEither<CLIError, ToolResult<CommentExtractResult>> =>
	pipe(
		TE.Do,
		TE.bind("changedFiles", () =>
			getChangedFiles(options.scope, options.base, cwd),
		),
		TE.bind("linesAdded", ({ changedFiles }) =>
			getLinesAdded(changedFiles.scopeType, changedFiles.diffArg, cwd),
		),
		TE.bind("changedLines", ({ changedFiles }) => {
			if (
				options.lineScoped &&
				changedFiles.scopeType === "range" &&
				changedFiles.diffArg
			) {
				return getChangedLineRanges(changedFiles.diffArg, cwd);
			}
			return TE.right(undefined);
		}),
		TE.chain(({ changedFiles, linesAdded, changedLines }) => {
			// Filter to only files that exist
			const existingFiles = changedFiles.files.filter((f) => {
				const fullPath = path.isAbsolute(f) ? f : path.join(cwd, f);
				return existsSync(fullPath);
			});

			// Resolve to absolute paths
			const absoluteFiles = existingFiles.map((f) =>
				path.isAbsolute(f) ? f : path.join(cwd, f),
			);

			// Convert changedLines keys to absolute paths if present
			let absoluteChangedLines:
				| ReadonlyMap<string, ReadonlySet<number>>
				| undefined;
			if (changedLines) {
				const absMap = new Map<string, ReadonlySet<number>>();
				for (const [file, lines] of changedLines) {
					const absPath = path.isAbsolute(file) ? file : path.join(cwd, file);
					absMap.set(absPath, lines);
				}
				absoluteChangedLines = absMap;
			}

			return pipe(
				extractCommentsFromFiles(absoluteFiles, absoluteChangedLines),
				TE.map(({ comments, filesScanned }) => {
					// Convert file paths back to relative for output
					const relativeComments = comments.map((c) => ({
						...c,
						file: path.relative(cwd, c.file),
					}));

					const result: CommentExtractResult = {
						scope: options.scope,
						base: options.base,
						filesScanned,
						linesAdded,
						comments: relativeComments,
						...(options.lineScoped && { lineScoped: true }),
					};

					return successResult(TOOL_NAME, result);
				}),
			);
		}),
	);

/**
 * Main execute function for tool registration.
 * Parses input as JSON options.
 */
const execute = (
	input: string,
	_options: ToolOptions,
): TE.TaskEither<CLIError, ToolResult<CommentExtractResult>> => {
	let options: CommentExtractOptions;

	try {
		options = JSON.parse(input) as CommentExtractOptions;
	} catch {
		return TE.left(
			runtimeError(
				'Invalid input: expected JSON with "scope" and "base" fields',
			),
		);
	}

	if (!options.scope || !options.base) {
		return TE.left(runtimeError('Missing required fields: "scope" and "base"'));
	}

	return executeExtract(options);
};

/** Register this tool with the framework */
registerTool({
	name: TOOL_NAME,
	description:
		"Extract comments from git-changed files for analysis and cleanup",
	execute,
});

export { TOOL_NAME };
export type { CommentExtractOptions };
