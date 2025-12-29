/**
 * Worktree creation logic.
 * Creates an isolated git worktree for agent execution, with branch collision
 * handling and git version validation.
 */

import path from "node:path";
import { pipe } from "fp-ts/lib/function.js";
import * as TE from "fp-ts/lib/TaskEither.js";
import type { CLIError } from "../../../shared/errors.js";
import { prerequisiteError, runtimeError } from "../../../shared/errors.js";
import { resolveRp1Root } from "../rp1-root-dir/resolver.js";
import type { WorktreeCreateResult } from "./models.js";

/** Default branch prefix for worktree branches */
const DEFAULT_PREFIX = "quick-build";

/** Minimum required git version for worktree support */
const MIN_GIT_VERSION = { major: 2, minor: 15 };

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
 * Parse git version string (e.g., "git version 2.39.0").
 * Returns major and minor version numbers.
 */
const parseGitVersion = (
	versionStr: string,
): { major: number; minor: number } | null => {
	const match = versionStr.match(/git version (\d+)\.(\d+)/);
	if (!match) return null;
	return {
		major: parseInt(match[1], 10),
		minor: parseInt(match[2], 10),
	};
};

/**
 * Check that git version meets minimum requirements (>= 2.15).
 * Git 2.15 introduced improved worktree support.
 */
const checkGitVersion = (cwd: string): TE.TaskEither<CLIError, void> =>
	pipe(
		execGitCommand(["--version"], cwd),
		TE.chain((versionStr) => {
			const version = parseGitVersion(versionStr);
			if (!version) {
				return TE.left(
					prerequisiteError(
						"git-version",
						`Could not parse git version from: ${versionStr}`,
						"Ensure git is properly installed",
					),
				);
			}

			const isVersionOk =
				version.major > MIN_GIT_VERSION.major ||
				(version.major === MIN_GIT_VERSION.major &&
					version.minor >= MIN_GIT_VERSION.minor);

			if (!isVersionOk) {
				return TE.left(
					prerequisiteError(
						"git-version",
						`Git version ${version.major}.${version.minor} is too old. Worktrees require git >= ${MIN_GIT_VERSION.major}.${MIN_GIT_VERSION.minor}`,
						"Please upgrade git to version 2.15 or later",
					),
				);
			}

			return TE.right(undefined);
		}),
	);

/**
 * Check if a git branch exists locally.
 */
const branchExists = (
	branchName: string,
	cwd: string,
): TE.TaskEither<CLIError, boolean> =>
	pipe(
		TE.tryCatch(
			async () => {
				const proc = Bun.spawn(
					[
						"git",
						"show-ref",
						"--verify",
						"--quiet",
						`refs/heads/${branchName}`,
					],
					{
						cwd,
						stdout: "pipe",
						stderr: "pipe",
					},
				);
				const exitCode = await proc.exited;
				return exitCode === 0;
			},
			(error) =>
				runtimeError(
					`Failed to check branch existence: ${error instanceof Error ? error.message : String(error)}`,
				),
		),
	);

/**
 * Find a unique branch name by appending -2, -3, etc. if collision detected.
 */
const findUniqueBranchName = (
	baseName: string,
	cwd: string,
): TE.TaskEither<CLIError, string> => {
	const tryName = (
		name: string,
		suffix: number,
	): TE.TaskEither<CLIError, string> =>
		pipe(
			branchExists(name, cwd),
			TE.chain((exists) => {
				if (!exists) {
					return TE.right(name);
				}
				const nextName = `${baseName}-${suffix}`;
				return tryName(nextName, suffix + 1);
			}),
		);

	return tryName(baseName, 2);
};

/**
 * Get current HEAD commit SHA.
 */
const getHeadCommitSha = (cwd: string): TE.TaskEither<CLIError, string> =>
	execGitCommand(["rev-parse", "HEAD"], cwd);

/**
 * Create a git worktree with a new branch.
 */
const createGitWorktree = (
	branchName: string,
	worktreePath: string,
	cwd: string,
): TE.TaskEither<CLIError, void> =>
	pipe(
		execGitCommand(
			["worktree", "add", "-b", branchName, worktreePath, "HEAD"],
			cwd,
		),
		TE.map(() => undefined),
	);

/**
 * Ensure the worktrees directory exists.
 */
const ensureWorktreesDir = (rp1Root: string): TE.TaskEither<CLIError, string> =>
	TE.tryCatch(
		async () => {
			const worktreesDir = path.join(rp1Root, "work", "worktrees");
			await Bun.write(path.join(worktreesDir, ".gitkeep"), "");
			return worktreesDir;
		},
		(error) =>
			runtimeError(
				`Failed to create worktrees directory: ${error instanceof Error ? error.message : String(error)}`,
			),
	);

export interface CreateWorktreeOptions {
	/** Task slug for branch naming */
	readonly slug: string;
	/** Branch prefix (default: "quick-build") */
	readonly prefix?: string;
}

/**
 * Create an isolated git worktree for agent execution.
 *
 * Algorithm:
 * 1. Check git version (>= 2.15)
 * 2. Resolve RP1_ROOT (reuse rp1-root-dir logic)
 * 3. Generate branch name: {prefix}-{slug}
 * 4. Check for branch collision, append -2, -3 if needed
 * 5. Get current HEAD commit SHA
 * 6. Create worktree with git worktree add -b <branch> {RP1_ROOT}/work/worktrees/<branch> HEAD
 * 7. Return WorktreeCreateResult
 *
 * @param options - Worktree creation options
 * @param cwd - Current working directory (defaults to process.cwd())
 * @returns TaskEither with WorktreeCreateResult or CLIError
 */
export const createWorktree = (
	options: CreateWorktreeOptions,
	cwd: string = process.cwd(),
): TE.TaskEither<CLIError, WorktreeCreateResult> => {
	const { slug, prefix = DEFAULT_PREFIX } = options;
	const baseBranchName = `${prefix}-${slug}`;

	return pipe(
		checkGitVersion(cwd),
		TE.chain(() => resolveRp1Root(cwd)),
		TE.bindTo("rootResult"),
		TE.bind("branchName", () => findUniqueBranchName(baseBranchName, cwd)),
		TE.bind("basedOn", () => getHeadCommitSha(cwd)),
		TE.bind("worktreesDir", ({ rootResult }) =>
			ensureWorktreesDir(rootResult.root),
		),
		TE.bind("worktreePath", ({ worktreesDir, branchName }) =>
			TE.right(path.join(worktreesDir, branchName)),
		),
		TE.chain(({ branchName, basedOn, worktreePath }) =>
			pipe(
				createGitWorktree(branchName, worktreePath, cwd),
				TE.map(
					(): WorktreeCreateResult => ({
						path: worktreePath,
						branch: branchName,
						basedOn,
					}),
				),
			),
		),
	);
};

export { DEFAULT_PREFIX };
