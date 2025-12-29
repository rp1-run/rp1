/**
 * Path resolution logic for rp1-root-dir agent tool.
 * Resolves RP1_ROOT path with worktree awareness, enabling agents
 * to access KB and work artifacts from the main repository when
 * running in a linked git worktree.
 */

import path from "node:path";
import * as E from "fp-ts/lib/Either.js";
import { pipe } from "fp-ts/lib/function.js";
import * as TE from "fp-ts/lib/TaskEither.js";
import type { CLIError } from "../../../shared/errors.js";
import { runtimeError } from "../../../shared/errors.js";
import type { Rp1RootResult } from "./models.js";

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
 * Resolve RP1_ROOT path with worktree detection.
 *
 * Resolution algorithm:
 * 1. Check RP1_ROOT environment variable (override)
 * 2. If override exists, return it with source: 'env'
 * 3. Run git rev-parse --git-common-dir to get common .git directory
 * 4. If result differs from git rev-parse --git-dir:
 *    - In linked worktree: derive main repo root from common-dir
 *    - Return with source: 'git-common-dir', isWorktree: true
 * 5. Otherwise: use standard .rp1/ resolution from CWD
 *    - Return with source: 'cwd', isWorktree: false
 *
 * @param cwd - Current working directory (defaults to process.cwd())
 * @returns TaskEither with Rp1RootResult or CLIError
 */
export const resolveRp1Root = (
	cwd: string = process.cwd(),
): TE.TaskEither<CLIError, Rp1RootResult> => {
	const envOverride = process.env.RP1_ROOT;
	if (envOverride) {
		return TE.right({
			root: path.resolve(envOverride),
			isWorktree: false,
			source: "env",
		});
	}

	return pipe(
		TE.Do,
		TE.bind("gitDir", () => getGitDir(cwd)),
		TE.bind("commonDir", () => getGitCommonDir(cwd)),
		TE.bind("branch", () => getCurrentBranch(cwd)),
		TE.chain(({ gitDir, commonDir, branch }) => {
			const normalizedGitDir = path.resolve(cwd, gitDir);
			const normalizedCommonDir = path.resolve(cwd, commonDir);
			const isWorktree = normalizedGitDir !== normalizedCommonDir;

			if (isWorktree) {
				const mainRepoRoot = deriveMainRepoRoot(normalizedCommonDir);
				const rp1Root = path.join(mainRepoRoot, ".rp1");

				return TE.right<CLIError, Rp1RootResult>({
					root: rp1Root,
					isWorktree: true,
					worktreeName: branch,
					source: "git-common-dir",
				});
			}

			const repoRoot = deriveMainRepoRoot(normalizedGitDir);
			const rp1Root = path.join(repoRoot, ".rp1");

			return TE.right<CLIError, Rp1RootResult>({
				root: rp1Root,
				isWorktree: false,
				source: "cwd",
			});
		}),
	);
};

/**
 * Synchronous check for RP1_ROOT environment variable.
 * Useful for quick checks before spawning async operations.
 */
export const hasEnvOverride = (): boolean => Boolean(process.env.RP1_ROOT);

/**
 * Get RP1_ROOT from environment variable if set.
 * Returns Either with the resolved path or None indicator.
 */
export const getEnvOverride = (): E.Either<"no-env-override", string> => {
	const envValue = process.env.RP1_ROOT;
	return envValue ? E.right(path.resolve(envValue)) : E.left("no-env-override");
};
