/**
 * Git operations for comment extraction.
 * Gets changed files and line ranges for scoped extraction.
 */

import { pipe } from "fp-ts/lib/function.js";
import * as TE from "fp-ts/lib/TaskEither.js";
import type { CLIError } from "../../../shared/errors.js";
import { execGitCommand, execGitCommandMayFail } from "../git.js";

/**
 * Result of getting changed files.
 */
export interface ChangedFilesResult {
	readonly files: readonly string[];
	readonly diffArg: string | null;
	readonly scopeType: "unstaged" | "branch" | "range";
}

/**
 * Get changed files based on scope.
 *
 * @param scope - "unstaged", "branch", or a commit range
 * @param base - Base branch for "branch" scope
 * @param cwd - Working directory
 */
export const getChangedFiles = (
	scope: string,
	base: string,
	cwd: string,
): TE.TaskEither<CLIError, ChangedFilesResult> => {
	if (scope === "unstaged") {
		return pipe(
			execGitCommand(["diff", "--name-only"], cwd),
			TE.map((out) => ({
				files: out ? out.split("\n").filter(Boolean) : [],
				diffArg: null,
				scopeType: "unstaged" as const,
			})),
		);
	}

	if (scope === "branch") {
		return pipe(
			execGitCommand(["merge-base", "HEAD", base], cwd),
			TE.chain((mergeBase) =>
				pipe(
					execGitCommand(["diff", "--name-only", mergeBase, "HEAD"], cwd),
					TE.chain((branchFiles) =>
						pipe(
							execGitCommand(["diff", "--name-only"], cwd),
							TE.map((unstagedFiles) => {
								const files = new Set(
									branchFiles ? branchFiles.split("\n").filter(Boolean) : [],
								);
								if (unstagedFiles) {
									for (const f of unstagedFiles.split("\n").filter(Boolean)) {
										files.add(f);
									}
								}
								return {
									files: Array.from(files),
									diffArg: mergeBase,
									scopeType: "branch" as const,
								};
							}),
						),
					),
				),
			),
		);
	}

	// Commit range (e.g., "abc123..def456")
	return pipe(
		execGitCommand(["diff", "--name-only", scope], cwd),
		TE.map((out) => ({
			files: out ? out.split("\n").filter(Boolean) : [],
			diffArg: scope,
			scopeType: "range" as const,
		})),
	);
};

/**
 * Get total lines added from git diff --stat.
 */
export const getLinesAdded = (
	scopeType: "unstaged" | "branch" | "range",
	diffArg: string | null,
	cwd: string,
): TE.TaskEither<CLIError, number> => {
	const args: string[] = ["diff", "--stat"];

	if (scopeType === "branch" && diffArg) {
		args.push(diffArg, "HEAD");
	} else if (scopeType === "range" && diffArg) {
		args.push(diffArg);
	}

	return pipe(
		execGitCommandMayFail(args, cwd),
		TE.map(({ stdout }) => {
			if (!stdout) return 0;
			const lines = stdout.trim().split("\n");
			if (lines.length === 0) return 0;
			const summary = lines[lines.length - 1];
			const match = summary.match(/(\d+)\s+insertion/);
			return match ? Number.parseInt(match[1], 10) : 0;
		}),
	);
};

/**
 * Get changed line numbers per file using git diff -U0.
 * Used for --line-scoped filtering.
 *
 * @param scope - Git diff scope (commit range)
 * @param cwd - Working directory
 */
export const getChangedLineRanges = (
	scope: string,
	cwd: string,
): TE.TaskEither<CLIError, ReadonlyMap<string, ReadonlySet<number>>> =>
	pipe(
		execGitCommandMayFail(["diff", "-U0", "--no-color", scope], cwd),
		TE.map(({ stdout }) => {
			if (!stdout) return new Map();

			const result = new Map<string, Set<number>>();
			let currentFile: string | null = null;

			for (const line of stdout.split("\n")) {
				// Match file header: +++ b/path/to/file
				if (line.startsWith("+++ b/")) {
					currentFile = line.slice(6);
					if (!result.has(currentFile)) {
						result.set(currentFile, new Set());
					}
				}
				// Skip deleted files: +++ /dev/null
				else if (line.startsWith("+++ /dev/null")) {
					currentFile = null;
				}
				// Match hunk header: @@ -old_start,old_count +new_start,new_count @@
				else if (line.startsWith("@@") && currentFile) {
					const match = line.match(/@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/);
					if (match) {
						const start = Number.parseInt(match[1], 10);
						const count = match[2] ? Number.parseInt(match[2], 10) : 1;
						if (count > 0) {
							const fileLines = result.get(currentFile);
							if (fileLines) {
								for (let lineNum = start; lineNum < start + count; lineNum++) {
									fileLines.add(lineNum);
								}
							}
						}
					}
				}
			}

			return result;
		}),
	);

/**
 * Check if in a git repository.
 */
export const isGitRepo = (cwd: string): TE.TaskEither<CLIError, boolean> =>
	pipe(
		execGitCommandMayFail(["rev-parse", "--git-dir"], cwd),
		TE.map(({ success }) => success),
	);
