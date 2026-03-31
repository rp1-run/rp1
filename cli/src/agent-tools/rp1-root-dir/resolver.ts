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
					projectRoot: directories.projectRoot,
					projectId: directories.projectId,
					kbRoot: directories.kbRoot,
					workRoot: directories.workRoot,
					isWorktree: directories.isWorktree,
					worktreeName: directories.worktreeName,
				}),
			),
		),
	);
