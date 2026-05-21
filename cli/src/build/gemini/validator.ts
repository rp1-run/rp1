import * as E from "fp-ts/lib/Either.js";
import { parse as parseToml } from "smol-toml";
import type { CLIError } from "../../../shared/errors.js";
import { validationError } from "../../../shared/errors.js";

export const validateGeminiCommandToml = (
	content: string,
	file: string,
): E.Either<CLIError, void> => {
	let parsed: Record<string, unknown>;
	try {
		parsed = parseToml(content) as Record<string, unknown>;
	} catch (error) {
		return E.left(
			validationError(file, "L1", `Invalid Gemini command TOML: ${error}`),
		);
	}

	if (typeof parsed.prompt !== "string" || parsed.prompt.trim().length === 0) {
		return E.left(
			validationError(
				file,
				"L2",
				"Gemini command TOML requires a non-empty prompt string",
			),
		);
	}

	if (
		parsed.description !== undefined &&
		typeof parsed.description !== "string"
	) {
		return E.left(
			validationError(
				file,
				"L2",
				"Gemini command TOML description must be a string when present",
			),
		);
	}

	return E.right(undefined);
};
