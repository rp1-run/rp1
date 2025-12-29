/**
 * Worktree status detection.
 * Determines if currently running in a git worktree and provides
 * information about the worktree path, branch, and main repository.
 *
 * NOTE: Unlike create/cleanup, this is a READ-ONLY query about the
 * current context. It intentionally uses the provided cwd to answer
 * "where am I running from?" rather than "what's the main repo?"
 */

import path from "node:path";
import { pipe } from "fp-ts/lib/function.js";
import * as TE from "fp-ts/lib/TaskEither.js";
import type { CLIError } from "../../../shared/errors.js";
import {
	deriveRepoRootFromGitDir,
	getCurrentBranch,
	getGitCommonDir,
	getGitDir,
} from "../git.js";
import type { WorktreeStatusResult } from "./models.js";

/**
 * Check if currently running in a git worktree.
 *
 * This is a READ-ONLY query that reports on the current context.
 * It uses the provided cwd (not the main repo root) because the
 * purpose is to answer "where am I?" not "mutate something."
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
		// Query git state from the provided cwd (intentional - this is a context query)
		TE.bind("gitDir", () => getGitDir(cwd)),
		TE.bind("commonDir", () => getGitCommonDir(cwd)),
		TE.bind("branch", () => getCurrentBranch(cwd)),
		TE.map(({ gitDir, commonDir, branch }) => {
			const normalizedGitDir = path.resolve(cwd, gitDir);
			const normalizedCommonDir = path.resolve(cwd, commonDir);
			const isWorktree = normalizedGitDir !== normalizedCommonDir;

			if (isWorktree) {
				const mainRepoPath = deriveRepoRootFromGitDir(normalizedCommonDir);

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
