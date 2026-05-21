import * as E from "fp-ts/lib/Either.js";
import { type CLIError, validationError } from "../../../shared/errors.js";

export const validateAntigravityCommandToml = (
	content: string,
	file: string,
): E.Either<CLIError, void> => {
	let parsed: unknown;
	try {
		parsed = Bun.TOML.parse(content);
	} catch (error) {
		return E.left(
			validationError(file, "L1", `Invalid Antigravity command TOML: ${error}`),
		);
	}

	if (
		typeof parsed !== "object" ||
		parsed === null ||
		typeof (parsed as { prompt?: unknown }).prompt !== "string" ||
		(parsed as { prompt: string }).prompt.trim().length === 0
	) {
		return E.left(
			validationError(
				file,
				"L2",
				"Antigravity command TOML requires a non-empty prompt string",
			),
		);
	}

	if (
		"description" in parsed &&
		typeof (parsed as { description?: unknown }).description !== "string"
	) {
		return E.left(
			validationError(
				file,
				"L2",
				"Antigravity command TOML description must be a string when present",
			),
		);
	}

	return E.right(undefined);
};
