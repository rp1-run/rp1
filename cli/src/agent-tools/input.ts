/**
 * Input handling for agent-tools framework.
 * Provides utilities for reading content from file paths or stdin.
 */

import { readFile } from "node:fs/promises";
import { pipe } from "fp-ts/lib/function.js";
import * as TE from "fp-ts/lib/TaskEither.js";
import type { CLIError } from "../../shared/errors.js";
import { notFoundError, usageError } from "../../shared/errors.js";

/**
 * Read input from a file path.
 * Returns a TaskEither that resolves to the file content or a NotFoundError.
 */
export const readFromFile = (
	filePath: string,
): TE.TaskEither<CLIError, string> =>
	TE.tryCatch(
		() => readFile(filePath, "utf-8"),
		() => notFoundError(filePath, "Check the file path and try again"),
	);

/**
 * Read input from stdin.
 * Returns a TaskEither that resolves to the stdin content or a UsageError if empty.
 */
export const readFromStdin = (): TE.TaskEither<CLIError, string> =>
	TE.tryCatch(
		async () => {
			const chunks: Buffer[] = [];
			for await (const chunk of process.stdin) {
				chunks.push(chunk);
			}
			const content = Buffer.concat(chunks).toString("utf-8");
			if (!content.trim()) {
				throw new Error("Empty input");
			}
			return content;
		},
		() =>
			usageError(
				"No input provided",
				"Provide a file path or pipe content via stdin",
			),
	);

/**
 * Determine input source and read content.
 * Auto-selects file reading if filePath is provided, otherwise reads from stdin.
 * Returns the content along with the source type for downstream processing.
 */
export const readInput = (
	filePath?: string,
): TE.TaskEither<CLIError, { content: string; source: "file" | "stdin" }> => {
	if (filePath) {
		return pipe(
			readFromFile(filePath),
			TE.map((content) => ({ content, source: "file" as const })),
		);
	}
	return pipe(
		readFromStdin(),
		TE.map((content) => ({ content, source: "stdin" as const })),
	);
};
