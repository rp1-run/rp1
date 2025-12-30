/**
 * Shared git utilities for agent tools.
 *
 * IMPORTANT: When performing git operations that mutate state (create branches,
 * remove worktrees, etc.), always use `GitContext.repoRoot` as the cwd.
 * This prevents bugs when running from inside a nested worktree.
 *
 * For read-only operations that query the current context (status, detection),
 * use `GitContext.cwd` to get information about where the user is running from.
 */

import path from "node:path";
import { pipe } from "fp-ts/lib/function.js";
import * as TE from "fp-ts/lib/TaskEither.js";
import type { CLIError } from "../../shared/errors.js";
import { runtimeError } from "../../shared/errors.js";

/**
 * Environment variables to clear when spawning git processes.
 * Prevents git context inheritance that can cause cross-repo operations.
 */
export const GIT_ENV_VARS_TO_CLEAR = [
	"GIT_DIR",
	"GIT_WORK_TREE",
	"GIT_INDEX_FILE",
	"GIT_OBJECT_DIRECTORY",
	"GIT_ALTERNATE_OBJECT_DIRECTORIES",
	"GIT_COMMON_DIR",
] as const;

/**
 * Create an isolated environment for git command execution.
 * Clears git-related environment variables to prevent context leakage.
 */
export const getIsolatedGitEnv = (): NodeJS.ProcessEnv => {
	const env = { ...process.env };
	for (const key of GIT_ENV_VARS_TO_CLEAR) {
		delete env[key];
	}
	return env;
};

/**
 * Context for git operations.
 *
 * - `repoRoot`: Main repository root. Use this for ALL mutation operations.
 * - `cwd`: Current working directory. Use only for read-only context queries.
 * - `isWorktree`: Whether cwd is inside a linked worktree.
 */
export interface GitContext {
	/** Main repository root - use for mutations */
	readonly repoRoot: string;
	/** Current working directory - use for read-only queries */
	readonly cwd: string;
	/** Whether currently running inside a linked worktree */
	readonly isWorktree: boolean;
}

/**
 * Execute a git command and return stdout as trimmed string.
 * Returns Left on non-zero exit code or execution failure.
 *
 * @param args - Git command arguments (without 'git' prefix)
 * @param cwd - Working directory for the command
 */
export const execGitCommand = (
	args: readonly string[],
	cwd: string,
): TE.TaskEither<CLIError, string> =>
	TE.tryCatch(
		async () => {
			const proc = Bun.spawn(["git", ...args], {
				cwd,
				stdout: "pipe",
				stderr: "pipe",
				env: getIsolatedGitEnv(),
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
 * Useful for commands like `git show-ref` that use exit codes for boolean results.
 *
 * @param args - Git command arguments (without 'git' prefix)
 * @param cwd - Working directory for the command
 */
export const execGitCommandMayFail = (
	args: readonly string[],
	cwd: string,
): TE.TaskEither<CLIError, { success: boolean; stdout: string }> =>
	TE.tryCatch(
		async () => {
			const proc = Bun.spawn(["git", ...args], {
				cwd,
				stdout: "pipe",
				stderr: "pipe",
				env: getIsolatedGitEnv(),
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
 * Get the main repository root from git-common-dir.
 * Works correctly from both main repo and linked worktrees.
 *
 * CRITICAL: This function is essential for worktree safety. When running
 * from inside a worktree, `git rev-parse HEAD` returns that worktree's HEAD,
 * not the main repo's HEAD. Always use the returned path for mutation operations.
 *
 * @param cwd - Current working directory (can be inside a worktree)
 * @returns Absolute path to the main repository root
 */
export const getMainRepoRoot = (cwd: string): TE.TaskEither<CLIError, string> =>
	pipe(
		execGitCommand(["rev-parse", "--git-common-dir"], cwd),
		TE.map((commonDir) => {
			const absoluteCommonDir = path.isAbsolute(commonDir)
				? commonDir
				: path.resolve(cwd, commonDir);

			if (path.basename(absoluteCommonDir) === ".git") {
				return path.dirname(absoluteCommonDir);
			}

			return absoluteCommonDir;
		}),
	);

/**
 * Get the git directory for the current context.
 * For main repo: returns .git
 * For worktree: returns .git/worktrees/<name>
 *
 * @param cwd - Current working directory
 */
export const getGitDir = (cwd: string): TE.TaskEither<CLIError, string> =>
	execGitCommand(["rev-parse", "--git-dir"], cwd);

/**
 * Get the common git directory shared across all worktrees.
 * Always points to the main repository's .git directory.
 *
 * @param cwd - Current working directory
 */
export const getGitCommonDir = (cwd: string): TE.TaskEither<CLIError, string> =>
	execGitCommand(["rev-parse", "--git-common-dir"], cwd);

/**
 * Check if the current directory is inside a linked worktree.
 *
 * @param cwd - Current working directory
 */
export const isInsideWorktree = (
	cwd: string,
): TE.TaskEither<CLIError, boolean> =>
	pipe(
		TE.Do,
		TE.bind("gitDir", () => getGitDir(cwd)),
		TE.bind("commonDir", () => getGitCommonDir(cwd)),
		TE.map(({ gitDir, commonDir }) => {
			const normalizedGitDir = path.resolve(cwd, gitDir);
			const normalizedCommonDir = path.resolve(cwd, commonDir);
			return normalizedGitDir !== normalizedCommonDir;
		}),
	);

/**
 * Create a GitContext for safe git operations.
 *
 * This is the recommended way to set up git operations. It resolves the
 * main repository root upfront, so all subsequent operations can use
 * `context.repoRoot` for mutations without risk of worktree-related bugs.
 *
 * @example
 * ```typescript
 * pipe(
 *   withGitContext(),
 *   TE.chain(ctx =>
 *     // Use ctx.repoRoot for mutations
 *     execGitCommand(["rev-parse", "HEAD"], ctx.repoRoot)
 *   )
 * )
 * ```
 *
 * @param cwd - Starting directory (defaults to process.cwd())
 */
export const withGitContext = (
	cwd: string = process.cwd(),
): TE.TaskEither<CLIError, GitContext> =>
	pipe(
		TE.Do,
		TE.bind("repoRoot", () => getMainRepoRoot(cwd)),
		TE.bind("isWorktree", () => isInsideWorktree(cwd)),
		TE.map(({ repoRoot, isWorktree }) => ({
			repoRoot,
			cwd,
			isWorktree,
		})),
	);

/**
 * Get the current branch name.
 * Returns undefined if in detached HEAD state.
 *
 * @param cwd - Working directory for the command
 */
export const getCurrentBranch = (
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
 * Get the current HEAD commit SHA.
 *
 * WARNING: When running from inside a worktree, this returns that worktree's
 * HEAD, not the main repo's HEAD. For consistent behavior, pass
 * `GitContext.repoRoot` as the cwd parameter.
 *
 * @param cwd - Working directory (use GitContext.repoRoot for consistency)
 */
export const getHeadCommitSha = (
	cwd: string,
): TE.TaskEither<CLIError, string> =>
	execGitCommand(["rev-parse", "HEAD"], cwd);

/**
 * Check if a git branch exists locally.
 *
 * @param branchName - Name of the branch to check
 * @param cwd - Working directory (use GitContext.repoRoot)
 */
export const branchExists = (
	branchName: string,
	cwd: string,
): TE.TaskEither<CLIError, boolean> =>
	pipe(
		execGitCommandMayFail(
			["show-ref", "--verify", "--quiet", `refs/heads/${branchName}`],
			cwd,
		),
		TE.map(({ success }) => success),
	);

/**
 * Derive the repository root from a git directory path.
 * Handles both standard .git directories and paths inside .git.
 *
 * @param gitDirPath - Path to .git directory or subdirectory
 */
export const deriveRepoRootFromGitDir = (gitDirPath: string): string => {
	const normalized = path.normalize(gitDirPath);

	if (normalized.endsWith(".git")) {
		return path.dirname(normalized);
	}

	const gitIndex = normalized.lastIndexOf(".git");
	if (gitIndex !== -1) {
		return normalized.slice(0, gitIndex - 1);
	}

	return path.dirname(normalized);
};
