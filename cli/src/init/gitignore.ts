import * as E from "fp-ts/lib/Either.js";
import type { CLIError } from "../../shared/errors.js";
import { GITIGNORE_PRESETS, type GitignorePreset } from "./models.js";

export const buildManagedGitignoreContent = (
	_cwd: string,
	preset: GitignorePreset,
): E.Either<CLIError, string> => {
	return E.right(GITIGNORE_PRESETS[preset]);
};
