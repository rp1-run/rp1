/**
 * Worktree status detection.
 * Determines if currently running in a git worktree and provides
 * information about the worktree path, branch, and main repository.
 */

import path from "node:path";
import { pipe } from "fp-ts/lib/function.js";
import * as TE from "fp-ts/lib/TaskEither.js";
import type { CLIError } from "../../../shared/errors.js";
import { runtimeError } from "../../../shared/errors.js";
import type { WorktreeStatusResult } from "./models.js";

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
 * Get git directory for the current worktree.
 * Returns the .git directory path (or path inside .git for linked worktrees).
 */
const getGitDir = (cwd: string): TE.TaskEither<CLIError, string> =>
	execGitCommand(["rev-parse", "--git-dir"], cwd);

/**
 * Get the common git directory shared across all worktrees.
 * For a standard clone, this equals git-dir.
 * For a linked worktree, this points to the main repository's .git directory.
 */
const getGitCommonDir = (cwd: string): TE.TaskEither<CLIError, string> =>
	execGitCommand(["rev-parse", "--git-common-dir"], cwd);

/**
 * Get the current branch name (if on a branch).
 * Returns the branch name or undefined if in detached HEAD state.
 */
const getCurrentBranch = (
	cwd: string,
): TE.TaskEither<CLIError, string | undefined> =>
	pipe(
		execGitCommand(["rev-parse", "--abbrev-ref", "HEAD"], cwd),
		TE.map((branch): string | undefined =>
			branch === "HEAD" ? undefined : branch,
		),
		TE.orElse(
			(): TE.TaskEither<CLIError, string | undefined> => TE.right(undefined),
		),
	);

/**
 * Derive the main repository root from the git common directory.
 * The common-dir is typically the .git directory in the main repo.
 */
const deriveMainRepoRoot = (commonDir: string): string => {
	const normalized = path.normalize(commonDir);

	if (normalized.endsWith(".git")) {
		return path.dirname(normalized);
	}

	// Handle cases where commonDir might be inside .git (e.g., .git/worktrees/...)
	const gitIndex = normalized.lastIndexOf(".git");
	if (gitIndex !== -1) {
		return normalized.slice(0, gitIndex - 1);
	}

	// Fallback: assume commonDir's parent is the repo root
	return path.dirname(normalized);
};

/**
 * Check if currently running in a git worktree.
 *
 * Algorithm:
 * 1. Run `git rev-parse --git-dir` and `git rev-parse --git-common-dir`
 * 2. If they differ, we're in a linked worktree
 * 3. Extract worktree path and branch name
 * 4. Derive main repo path from git-common-dir
 * 5. Return WorktreeStatusResult
 *
 * @param cwd - Current working directory (defaults to process.cwd())
 * @returns TaskEither with WorktreeStatusResult or CLIError
 */
export const getWorktreeStatus = (
	cwd: string = process.cwd(),
): TE.TaskEither<CLIError, WorktreeStatusResult> =>
	pipe(
		TE.Do,
		TE.bind("gitDir", () => getGitDir(cwd)),
		TE.bind("commonDir", () => getGitCommonDir(cwd)),
		TE.bind("branch", () => getCurrentBranch(cwd)),
		TE.map(({ gitDir, commonDir, branch }) => {
			const normalizedGitDir = path.resolve(cwd, gitDir);
			const normalizedCommonDir = path.resolve(cwd, commonDir);
			const isWorktree = normalizedGitDir !== normalizedCommonDir;

			if (isWorktree) {
				const mainRepoPath = deriveMainRepoRoot(normalizedCommonDir);

				return {
					isWorktree: true,
					path: cwd,
					branch,
					mainRepoPath,
				} satisfies WorktreeStatusResult;
			}

			return {
				isWorktree: false,
			} satisfies WorktreeStatusResult;
		}),
	);
