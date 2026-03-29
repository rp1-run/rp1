import path from "node:path";
import * as E from "fp-ts/lib/Either.js";
import { pipe } from "fp-ts/lib/function.js";
import * as TE from "fp-ts/lib/TaskEither.js";
import type { ResolvedDirectorySet } from "../../../shared/directory-resolution.js";
import { resolveDirectorySet } from "../../../shared/directory-resolution.js";
import type { CLIError } from "../../../shared/errors.js";
import type { Rp1RootResult } from "./models.js";

export const resolveRp1Root = (
	cwd: string = process.cwd(),
): TE.TaskEither<CLIError, Rp1RootResult> =>
	TE.fromEither(
		pipe(
			resolveDirectorySet(cwd),
			E.map(
				(directories: ResolvedDirectorySet): Rp1RootResult => ({
					root: directories.rp1Root,
					isWorktree: directories.isWorktree,
					worktreeName: directories.worktreeName,
					source:
						directories.sources.projectRoot === "git_common_dir"
							? "git-common-dir"
							: directories.sources.projectRoot === "env"
								? "env"
								: "cwd",
				}),
			),
		),
	);

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
