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
import {
	deriveRepoRootFromGitDir,
	getCurrentBranch,
	getGitCommonDir,
	getGitDir,
} from "../git.js";
import type { Rp1RootResult } from "./models.js";

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
				const mainRepoRoot = deriveRepoRootFromGitDir(normalizedCommonDir);
				const rp1Root = path.join(mainRepoRoot, ".rp1");

				return TE.right<CLIError, Rp1RootResult>({
					root: rp1Root,
					isWorktree: true,
					worktreeName: branch,
					source: "git-common-dir",
				});
			}

			const repoRoot = deriveRepoRootFromGitDir(normalizedGitDir);
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
