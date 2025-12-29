/**
 * Worktree creation logic.
 * Creates an isolated git worktree for agent execution, with branch collision
 * handling and git version validation.
 */

import path from "node:path";
import { pipe } from "fp-ts/lib/function.js";
import * as TE from "fp-ts/lib/TaskEither.js";
import type { CLIError } from "../../../shared/errors.js";
import {
	prerequisiteError,
	runtimeError,
	usageError,
} from "../../../shared/errors.js";
import {
	branchExists,
	execGitCommand,
	type GitContext,
	getHeadCommitSha,
	isInsideWorktree,
	withGitContext,
} from "../git.js";
import { resolveRp1Root } from "../rp1-root-dir/resolver.js";
import type { WorktreeCreateResult } from "./models.js";

/**
 * Guard against worktree nesting using git's native detection.
 * Returns error if cwd is inside an existing git worktree.
 */
const guardAgainstWorktreeNesting = (
	cwd: string,
): TE.TaskEither<CLIError, void> =>
	pipe(
		isInsideWorktree(cwd),
		TE.chain((inWorktree) =>
			inWorktree
				? TE.left(
						usageError(
							`Cannot create worktree from inside another worktree: ${cwd}`,
							"Run this command from the main repository, not from inside a worktree directory.",
						),
					)
				: TE.right(undefined),
		),
	);

/** Default branch prefix for worktree branches */
const DEFAULT_PREFIX = "quick-build";

/** Minimum required git version for worktree support */
const MIN_GIT_VERSION = { major: 2, minor: 15 };

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
 * Find a unique branch name by appending -2, -3, etc. if collision detected.
 * Uses GitContext.repoRoot to check branches in the main repo.
 */
const findUniqueBranchName = (
	baseName: string,
	ctx: GitContext,
): TE.TaskEither<CLIError, string> => {
	const tryName = (
		name: string,
		suffix: number,
	): TE.TaskEither<CLIError, string> =>
		pipe(
			branchExists(name, ctx.repoRoot),
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
 * Create a git worktree with a new branch.
 * Uses GitContext.repoRoot to ensure correct HEAD is used.
 */
const createGitWorktree = (
	branchName: string,
	worktreePath: string,
	ctx: GitContext,
): TE.TaskEither<CLIError, void> =>
	pipe(
		execGitCommand(
			["worktree", "add", "-b", branchName, worktreePath, "HEAD"],
			ctx.repoRoot,
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
 * Uses GitContext to ensure all git operations use the main repository root,
 * preventing bugs when running from inside another worktree.
 *
 * Algorithm:
 * 1. Check git version (>= 2.15)
 * 2. Create GitContext (resolves main repo root)
 * 3. Resolve RP1_ROOT from main repo
 * 4. Generate branch name: {prefix}-{slug}
 * 5. Check for branch collision, append -2, -3 if needed
 * 6. Get current HEAD commit SHA from main repo
 * 7. Create worktree with git worktree add -b <branch> <path> HEAD
 * 8. Return WorktreeCreateResult
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
		// Guard: prevent creating worktrees from inside another worktree
		guardAgainstWorktreeNesting(cwd),
		TE.chain(() => checkGitVersion(cwd)),
		// Create GitContext - this resolves the main repo root upfront
		// All subsequent operations use ctx.repoRoot for safety
		TE.chain(() => withGitContext(cwd)),
		TE.bindTo("ctx"),
		// Resolve RP1_ROOT from main repo (not from nested worktree)
		TE.bind("rootResult", ({ ctx }) => resolveRp1Root(ctx.repoRoot)),
		// Find unique branch name in main repo
		TE.bind("branchName", ({ ctx }) =>
			findUniqueBranchName(baseBranchName, ctx),
		),
		// Get HEAD from main repo (critical!)
		TE.bind("basedOn", ({ ctx }) => getHeadCommitSha(ctx.repoRoot)),
		TE.bind("worktreesDir", ({ rootResult }) =>
			ensureWorktreesDir(rootResult.root),
		),
		TE.bind("worktreePath", ({ worktreesDir, branchName }) =>
			TE.right(path.join(worktreesDir, branchName)),
		),
		// Create worktree from main repo root
		TE.chain(({ ctx, branchName, basedOn, worktreePath }) =>
			pipe(
				createGitWorktree(branchName, worktreePath, ctx),
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
