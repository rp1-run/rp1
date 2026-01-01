/**
 * Comment extraction logic.
 * Parses source files and extracts comments with context.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import * as A from "fp-ts/lib/Array.js";
import { pipe } from "fp-ts/lib/function.js";
import * as TE from "fp-ts/lib/TaskEither.js";
import type { CLIError } from "../../../shared/errors.js";
import { runtimeError } from "../../../shared/errors.js";
import type { ExtractedComment } from "./models.js";
import { getPatterns } from "./patterns.js";

/** Maximum file size to process (10000 lines) */
const MAX_LINES = 10000;

/**
 * Read a file and return its lines.
 * Skips files that are too large.
 */
const readFileLines = (
	filePath: string,
): TE.TaskEither<CLIError, readonly string[]> =>
	pipe(
		TE.tryCatch(
			async () => {
				const content = await readFile(filePath, "utf-8");
				const lines = content.split("\n");
				if (lines.length > MAX_LINES) {
					return [];
				}
				return lines;
			},
			(error) =>
				runtimeError(
					`Failed to read file: ${error instanceof Error ? error.message : String(error)}`,
				),
		),
	);

/**
 * Extract comments from a single file.
 *
 * @param filePath - Path to the source file
 * @param lineFilter - Optional set of line numbers to include (for --line-scoped mode)
 */
export const extractComments = (
	filePath: string,
	lineFilter?: ReadonlySet<number>,
): TE.TaskEither<CLIError, readonly ExtractedComment[]> => {
	const ext = path.extname(filePath).toLowerCase();
	const patterns = getPatterns(ext);

	if (!patterns) {
		return TE.right([]);
	}

	return pipe(
		readFileLines(filePath),
		TE.map((lines) => {
			if (lines.length === 0) {
				return [];
			}
			return extractCommentsFromLines(filePath, lines, patterns, lineFilter);
		}),
	);
};

interface CommentPatterns {
	readonly single: readonly RegExp[];
	readonly multi: readonly [RegExp, RegExp][];
}

/**
 * Core extraction logic that processes file lines.
 */
const extractCommentsFromLines = (
	filePath: string,
	lines: readonly string[],
	patterns: CommentPatterns,
	lineFilter?: ReadonlySet<number>,
): ExtractedComment[] => {
	const comments: ExtractedComment[] = [];

	let inMulti = false;
	let multiEnd: RegExp | null = null;
	let multiStart = 0;
	let multiContent: string[] = [];

	const getContextBefore = (lineNum: number): string =>
		lineNum > 1 ? (lines[lineNum - 2]?.trimEnd() ?? "") : "";

	const getContextAfter = (lineNum: number): string =>
		lineNum < lines.length ? (lines[lineNum]?.trimEnd() ?? "") : "";

	const shouldInclude = (lineNum: number): boolean =>
		lineFilter === undefined || lineFilter.has(lineNum);

	for (let i = 0; i < lines.length; i++) {
		const lineNum = i + 1;
		const line = lines[i];

		// Continue multi-line comment
		if (inMulti && multiEnd) {
			multiContent.push(line.trimEnd());
			if (multiEnd.test(line)) {
				if (shouldInclude(multiStart)) {
					comments.push({
						file: filePath,
						line: multiStart,
						type: "multi",
						content: multiContent.join("\n"),
						contextBefore: getContextBefore(multiStart),
						contextAfter: getContextAfter(lineNum),
					});
				}
				inMulti = false;
				multiContent = [];
			}
			continue;
		}

		// Check for multi-line comment start
		let foundMulti = false;
		for (const [startPat, endPat] of patterns.multi) {
			if (startPat.test(line)) {
				if (endPat.test(line)) {
					// Single-line multi-comment (e.g., /* comment */)
					const combined = new RegExp(`${startPat.source}.*?${endPat.source}`);
					const match = line.match(combined);
					if (match && shouldInclude(lineNum)) {
						comments.push({
							file: filePath,
							line: lineNum,
							type: "multi",
							content: match[0],
							contextBefore: getContextBefore(lineNum),
							contextAfter: getContextAfter(lineNum),
						});
					}
				} else {
					inMulti = true;
					multiEnd = endPat;
					multiStart = lineNum;
					multiContent = [line.trimEnd()];
				}
				foundMulti = true;
				break;
			}
		}

		if (foundMulti || inMulti) {
			continue;
		}

		// Check for single-line comments
		for (const pat of patterns.single) {
			const regex = new RegExp(`(${pat.source}.*?)$`);
			const match = line.match(regex);
			if (match && shouldInclude(lineNum)) {
				comments.push({
					file: filePath,
					line: lineNum,
					type: "single",
					content: match[1].trim(),
					contextBefore: getContextBefore(lineNum),
					contextAfter: getContextAfter(lineNum),
				});
				break;
			}
		}
	}

	return comments;
};

/**
 * Extract comments from multiple files.
 */
export const extractCommentsFromFiles = (
	files: readonly string[],
	changedLines?: ReadonlyMap<string, ReadonlySet<number>>,
): TE.TaskEither<
	CLIError,
	{ comments: readonly ExtractedComment[]; filesScanned: number }
> =>
	pipe(
		files,
		A.filter((f) => {
			const ext = path.extname(f).toLowerCase();
			return getPatterns(ext) !== undefined;
		}),
		A.map((f) => {
			const lineFilter = changedLines?.get(f);
			return pipe(
				extractComments(f, lineFilter),
				TE.map((comments) => ({ file: f, comments })),
			);
		}),
		A.sequence(TE.ApplicativePar),
		TE.map((results) => ({
			comments: results.flatMap((r) => r.comments),
			filesScanned: results.length,
		})),
	);
