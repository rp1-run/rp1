/**
 * Worktree cleanup logic.
 * Removes a git worktree and optionally deletes the associated branch.
 */

import path from "node:path";
import { pipe } from "fp-ts/lib/function.js";
import * as TE from "fp-ts/lib/TaskEither.js";
import type { CLIError } from "../../../shared/errors.js";
import { runtimeError, usageError } from "../../../shared/errors.js";
import type { WorktreeCleanupResult } from "./models.js";

/**
 * Execute a git command and return stdout as trimmed string.
 * Returns Left on non-zero exit code or execution failure.
 */
const execGitCommand = (
	args: readonly string[],
	cwd: string,
): TE.TaskEither<CLIError, string> =>
	TE.tryCatch(
		async () => {
			const proc = Bun.spawn(["git", ...args], {
				cwd,
				stdout: "pipe",
				stderr: "pipe",
			});
			const exitCode = await proc.exited;

			if (exitCode !== 0) {
				const stderr = await new Response(proc.stderr).text();
				throw new Error(
					`git ${args.join(" ")} failed: ${stderr.trim() || `exit code ${exitCode}`}`,
				);
			}

			return (await new Response(proc.stdout).text()).trim();
		},
		(error) =>
			runtimeError(
				`Git command failed: ${error instanceof Error ? error.message : String(error)}`,
			),
	);

/**
 * Execute a git command that may fail gracefully (exit code != 0).
 * Returns Right with success status instead of Left on non-zero exit.
 */
const execGitCommandMayFail = (
	args: readonly string[],
	cwd: string,
): TE.TaskEither<CLIError, { success: boolean; stdout: string }> =>
	TE.tryCatch(
		async () => {
			const proc = Bun.spawn(["git", ...args], {
				cwd,
				stdout: "pipe",
				stderr: "pipe",
			});
			const exitCode = await proc.exited;
			const stdout = (await new Response(proc.stdout).text()).trim();

			return { success: exitCode === 0, stdout };
		},
		(error) =>
			runtimeError(
				`Git command failed: ${error instanceof Error ? error.message : String(error)}`,
			),
	);

/**
 * Parse worktree list output to check if a path is a valid worktree.
 * Returns the branch name if found, undefined otherwise.
 */
const parseWorktreeList = (
	output: string,
	targetPath: string,
): string | undefined => {
	const normalizedTarget = path.normalize(targetPath);
	const lines = output.split("\n");

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		// First line of each worktree entry is the path
		if (line.startsWith("worktree ")) {
			const worktreePath = path.normalize(line.slice("worktree ".length));
			if (worktreePath === normalizedTarget) {
				// Look for the branch line in subsequent lines
				for (let j = i + 1; j < lines.length && lines[j] !== ""; j++) {
					const nextLine = lines[j];
					if (nextLine.startsWith("branch refs/heads/")) {
						return nextLine.slice("branch refs/heads/".length);
					}
				}
				// Worktree found but no branch (detached HEAD)
				return "";
			}
		}
	}

	return undefined;
};

/**
 * Verify that the given path is a valid git worktree.
 * Returns the branch name if valid, or Left with error if not.
 */
const verifyWorktree = (
	worktreePath: string,
	cwd: string,
): TE.TaskEither<CLIError, string | undefined> =>
	pipe(
		execGitCommand(["worktree", "list", "--porcelain"], cwd),
		TE.chain((output) => {
			const branch = parseWorktreeList(output, worktreePath);
			if (branch === undefined) {
				return TE.left(
					usageError(
						`Path is not a valid worktree: ${worktreePath}`,
						"Use 'git worktree list' to see available worktrees",
					),
				);
			}
			// Return undefined for empty string (detached HEAD), otherwise the branch name
			return TE.right(branch || undefined);
		}),
	);

/**
 * Remove a git worktree.
 */
const removeWorktree = (
	worktreePath: string,
	force: boolean,
	cwd: string,
): TE.TaskEither<CLIError, void> => {
	const args = force
		? ["worktree", "remove", "--force", worktreePath]
		: ["worktree", "remove", worktreePath];

	return pipe(
		execGitCommand(args, cwd),
		TE.map(() => undefined),
	);
};

/**
 * Delete a local git branch.
 * Uses -D to force delete even if not merged.
 */
const deleteBranch = (
	branchName: string,
	cwd: string,
): TE.TaskEither<CLIError, boolean> =>
	pipe(
		execGitCommandMayFail(["branch", "-D", branchName], cwd),
		TE.map(({ success }) => success),
	);

/**
 * Prune stale worktree references.
 */
const pruneWorktrees = (cwd: string): TE.TaskEither<CLIError, void> =>
	pipe(
		execGitCommand(["worktree", "prune"], cwd),
		TE.map(() => undefined),
	);

export interface CleanupWorktreeOptions {
	/** Path to the worktree to remove (required) */
	readonly path: string;
	/** Preserve the branch after removing worktree (default: true) */
	readonly keepBranch?: boolean;
	/** Force removal even if worktree has changes */
	readonly force?: boolean;
}

/**
 * Get the main repository root from git-common-dir.
 * Works from both main repo and worktrees.
 */
const getMainRepoRoot = (cwd: string): TE.TaskEither<CLIError, string> =>
	pipe(
		execGitCommand(["rev-parse", "--git-common-dir"], cwd),
		TE.map((commonDir) => {
			// commonDir is typically .git or /path/to/repo/.git
			const absoluteCommonDir = path.isAbsolute(commonDir)
				? commonDir
				: path.resolve(cwd, commonDir);
			// If it ends with .git, parent is the repo root
			if (path.basename(absoluteCommonDir) === ".git") {
				return path.dirname(absoluteCommonDir);
			}
			// Otherwise return as-is (bare repo case)
			return absoluteCommonDir;
		}),
	);

/**
 * Remove a git worktree and optionally delete the associated branch.
 *
 * Algorithm:
 * 1. Resolve main repo root (safe cwd that won't be deleted)
 * 2. Verify path is a valid worktree
 * 3. Run `git worktree remove <path>` (add `--force` if option set)
 * 4. If `!keepBranch`: run `git branch -D <branch>`
 * 5. Run `git worktree prune` to clean up stale refs
 * 6. Return WorktreeCleanupResult
 *
 * @param options - Cleanup options
 * @param cwd - Current working directory (defaults to process.cwd())
 * @returns TaskEither with WorktreeCleanupResult or CLIError
 */
export const cleanupWorktree = (
	options: CleanupWorktreeOptions,
	cwd: string = process.cwd(),
): TE.TaskEither<CLIError, WorktreeCleanupResult> => {
	const { path: worktreePath, keepBranch = true, force = false } = options;
	const absolutePath = path.isAbsolute(worktreePath)
		? worktreePath
		: path.resolve(cwd, worktreePath);

	return pipe(
		// First get the main repo root - this is a safe cwd that won't be deleted
		getMainRepoRoot(cwd),
		TE.bindTo("repoRoot"),
		TE.bind("branchName", ({ repoRoot }) =>
			verifyWorktree(absolutePath, repoRoot),
		),
		TE.chain(({ repoRoot, branchName }) =>
			pipe(
				removeWorktree(absolutePath, force, repoRoot),
				TE.map(() => ({ repoRoot, branchName })),
			),
		),
		TE.bind("branchDeleted", ({ repoRoot, branchName }) => {
			if (keepBranch || !branchName) {
				return TE.right(false);
			}
			return deleteBranch(branchName, repoRoot);
		}),
		TE.chain(({ repoRoot, branchDeleted }) =>
			pipe(
				pruneWorktrees(repoRoot),
				TE.map(() => branchDeleted),
			),
		),
		TE.map(
			(branchDeleted): WorktreeCleanupResult => ({
				removed: true,
				branchDeleted,
				path: absolutePath,
			}),
		),
	);
};
