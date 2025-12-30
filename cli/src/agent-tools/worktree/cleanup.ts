/**
 * Worktree cleanup logic.
 * Removes a git worktree and optionally deletes the associated branch.
 */

import path from "node:path";
import { pipe } from "fp-ts/lib/function.js";
import * as TE from "fp-ts/lib/TaskEither.js";
import type { CLIError } from "../../../shared/errors.js";
import { usageError } from "../../../shared/errors.js";
import {
	execGitCommand,
	execGitCommandMayFail,
	type GitContext,
	withGitContext,
} from "../git.js";
import type { WorktreeCleanupResult } from "./models.js";

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
		if (line.startsWith("worktree ")) {
			const worktreePath = path.normalize(line.slice("worktree ".length));
			if (worktreePath === normalizedTarget) {
				for (let j = i + 1; j < lines.length && lines[j] !== ""; j++) {
					const nextLine = lines[j];
					if (nextLine.startsWith("branch refs/heads/")) {
						return nextLine.slice("branch refs/heads/".length);
					}
				}
				return "";
			}
		}
	}

	return undefined;
};

/**
 * Verify that the given path is a valid git worktree.
 * Returns the branch name if valid, or Left with error if not.
 * Uses GitContext.repoRoot for the query.
 */
const verifyWorktree = (
	worktreePath: string,
	ctx: GitContext,
): TE.TaskEither<CLIError, string | undefined> =>
	pipe(
		execGitCommand(["worktree", "list", "--porcelain"], ctx.repoRoot),
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
			return TE.right(branch || undefined);
		}),
	);

/**
 * Remove a git worktree.
 * Uses GitContext.repoRoot to ensure the command runs from a directory
 * that will still exist after the worktree is removed.
 */
const removeWorktree = (
	worktreePath: string,
	force: boolean,
	ctx: GitContext,
): TE.TaskEither<CLIError, void> => {
	const args = force
		? ["worktree", "remove", "--force", worktreePath]
		: ["worktree", "remove", worktreePath];

	return pipe(
		execGitCommand(args, ctx.repoRoot),
		TE.map(() => undefined),
	);
};

/**
 * Delete a local git branch.
 * Uses -D to force delete even if not merged.
 */
const deleteBranch = (
	branchName: string,
	ctx: GitContext,
): TE.TaskEither<CLIError, boolean> =>
	pipe(
		execGitCommandMayFail(["branch", "-D", branchName], ctx.repoRoot),
		TE.map(({ success }) => success),
	);

/**
 * Prune stale worktree references.
 */
const pruneWorktrees = (ctx: GitContext): TE.TaskEither<CLIError, void> =>
	pipe(
		execGitCommand(["worktree", "prune"], ctx.repoRoot),
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
 * Remove a git worktree and optionally delete the associated branch.
 *
 * Uses GitContext to ensure all git operations use the main repository root,
 * so cleanup works correctly regardless of cwd location.
 *
 * Algorithm:
 * 1. Create GitContext (resolves main repo root)
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
		withGitContext(cwd),
		TE.bindTo("ctx"),
		TE.bind("branchName", ({ ctx }) => verifyWorktree(absolutePath, ctx)),
		TE.chain(({ ctx, branchName }) =>
			pipe(
				removeWorktree(absolutePath, force, ctx),
				TE.map(() => ({ ctx, branchName })),
			),
		),
		TE.bind("branchDeleted", ({ ctx, branchName }) => {
			if (keepBranch || !branchName) {
				return TE.right(false);
			}
			return deleteBranch(branchName, ctx);
		}),
		TE.chain(({ ctx, branchDeleted }) =>
			pipe(
				pruneWorktrees(ctx),
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
