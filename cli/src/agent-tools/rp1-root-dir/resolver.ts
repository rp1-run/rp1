import { existsSync } from "node:fs";
import path from "node:path";
import * as E from "fp-ts/lib/Either.js";
import { pipe } from "fp-ts/lib/function.js";
import * as TE from "fp-ts/lib/TaskEither.js";
import type { ResolvedDirectorySet } from "../../../shared/directory-resolution.js";
import { resolveDirectorySet } from "../../../shared/directory-resolution.js";
import type { CLIError } from "../../../shared/errors.js";
import type { Rp1RootResult } from "./models.js";

export interface Rp1RootResolutionOptions {
	readonly requireProjectId?: boolean;
	readonly allowHomeProjectRoot?: boolean;
	readonly homeDir?: string;
}

/** Guidance surfaced when the resolved kbRoot does not exist on disk yet. */
const KB_NOT_INITIALIZED_HINT =
	"Knowledge base not found. Run /rp1-base:knowledge-build to initialize it.";

/**
 * KB presence is defined by content, not bare directory existence: `rp1 init`
 * unconditionally pre-creates an empty kbRoot, so `existsSync(kbRoot)` alone
 * would report every freshly-initialized project as KB-initialized. Mirrors
 * the `hasKBContent` semantics in `cli/src/init/directory-model.ts`.
 */
const hasKBContent = (kbRoot: string): boolean =>
	existsSync(path.join(kbRoot, "index.md"));

export const resolveRp1Root = (
	cwd: string = process.cwd(),
	options: Rp1RootResolutionOptions = {},
): TE.TaskEither<CLIError, Rp1RootResult> =>
	TE.fromEither(
		pipe(
			resolveDirectorySet(cwd, {
				requireProjectId: options.requireProjectId,
				allowHomeProjectRoot: options.allowHomeProjectRoot,
				homeDir: options.homeDir,
			}),
			E.map((directories: ResolvedDirectorySet): Rp1RootResult => {
				const kbInitialized = hasKBContent(directories.kbRoot);
				return {
					projectRoot: directories.projectRoot,
					projectId: directories.projectId,
					kbRoot: directories.kbRoot,
					workRoot: directories.workRoot,
					codeRoot: directories.codeRoot,
					isWorktree: directories.isWorktree,
					worktreeName: directories.worktreeName,
					storageMode: directories.storageMode,
					kbInitialized,
					...(!kbInitialized && { kbNextStepHint: KB_NOT_INITIALIZED_HINT }),
				};
			}),
		),
	);
