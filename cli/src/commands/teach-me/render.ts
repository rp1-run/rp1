/**
 * `rp1 teach-me render <lesson.json> -o <out.html>` (T5).
 *
 * Parses and version-checks a hand-authored `lesson.json` (T1), assembles it
 * into widget markup with diagrams/code pre-rendered to static output (T4), and
 * inlines the embedded widget bundle (T3) into a single self-contained
 * `lesson.html` (REQ-006/REQ-007). On any parse, version, or assembly failure
 * the command exits non-zero and writes no artifact.
 *
 * {@link renderLessonHtml} is the file-free core (parsed JSON in, HTML string
 * out) that `validate`/`export` (T6/T7) and the fixture tests (T8) build on; the
 * Commander action layers file reading, JSON parsing, and output writing on top.
 */

import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { Command } from "commander";
import * as E from "fp-ts/lib/Either.js";
import { pipe } from "fp-ts/lib/function.js";
import * as TE from "fp-ts/lib/TaskEither.js";
import {
	type CLIError,
	formatError,
	getExitCode,
	notFoundError,
	runtimeError,
	validationError,
} from "../../../shared/errors.js";
import type { Logger } from "../../../shared/logger.js";
import { assembleLesson } from "../../teach-me/assemble.js";
import { getWidgetBundle } from "../../teach-me/assets.js";
import { inlineDocument } from "../../teach-me/inline.js";
import { closeMermaidBrowser } from "../../teach-me/prerender/index.js";
import { parseLesson } from "../../teach-me/schema/index.js";

const isCLIError = (value: unknown): value is CLIError =>
	typeof value === "object" && value !== null && "_tag" in value;

/**
 * Render a parsed `lesson.json` value into a single self-contained HTML string.
 *
 * Validates the model, assembles the body (pre-rendering diagrams and code),
 * reads the embedded widget bundle, and inlines everything into one document.
 * The Mermaid pre-render browser is released afterwards regardless of outcome
 * (a no-op when the lesson has no diagrams); a teardown failure never masks a
 * successful render or its primary error.
 *
 * @param input - The already-parsed lesson value (callers own JSON syntax errors).
 * @param source - Label used in validation error messages (typically the path).
 */
export const renderLessonHtml = (
	input: unknown,
	source = "lesson.json",
): TE.TaskEither<CLIError, string> => {
	return async () => {
		const result = await pipe(
			TE.fromEither(parseLesson(input, source)),
			TE.bindTo("lesson"),
			TE.bind("assembled", ({ lesson }) => assembleLesson(lesson)),
			TE.bind("bundle", () => getWidgetBundle()),
			TE.map(({ assembled, bundle }) => inlineDocument(assembled, bundle)),
		)();
		// Best-effort teardown of the shared Mermaid browser; ignore its result so
		// it neither masks a successful render nor overrides the primary error.
		await closeMermaidBrowser()();
		return result;
	};
};

/** Read a UTF-8 file, mapping a missing file to an actionable not-found error. */
const readTextFile = (path: string): TE.TaskEither<CLIError, string> =>
	TE.tryCatch(
		async () => {
			const file = Bun.file(path);
			if (!(await file.exists())) {
				throw notFoundError(
					path,
					"Provide a path to an existing lesson.json file.",
				);
			}
			return file.text();
		},
		(error) =>
			isCLIError(error)
				? error
				: runtimeError(
						`Failed to read ${path}: ${error instanceof Error ? error.message : String(error)}`,
					),
	);

/** Parse JSON text, surfacing a syntax error as an actionable L1 validation error. */
const parseJson = (
	text: string,
	source: string,
): E.Either<CLIError, unknown> => {
	try {
		return E.right(JSON.parse(text));
	} catch (error) {
		return E.left(
			validationError(
				source,
				"L1",
				`Invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
			),
		);
	}
};

/** Write the rendered HTML, creating any missing parent directories first. */
const writeOutput = (
	path: string,
	html: string,
): TE.TaskEither<CLIError, void> =>
	TE.tryCatch(
		async () => {
			await mkdir(dirname(path), { recursive: true });
			await Bun.write(path, html);
		},
		(error) =>
			runtimeError(
				`Failed to write ${path}: ${error instanceof Error ? error.message : String(error)}`,
			),
	);

/**
 * Read `inputPath`, render it, and write the self-contained HTML to
 * `outputPath`. The output is written only on success, so a parse/version
 * failure leaves no partial artifact behind.
 */
export const renderFromFile = (
	inputPath: string,
	outputPath: string,
): TE.TaskEither<CLIError, void> =>
	pipe(
		readTextFile(inputPath),
		TE.chain((text) => TE.fromEither(parseJson(text, inputPath))),
		TE.chain((parsed) => renderLessonHtml(parsed, inputPath)),
		TE.chain((html) => writeOutput(outputPath, html)),
	);

/** `rp1 teach-me render` subcommand. */
export const renderCommand = new Command("render")
	.description(
		"Assemble a lesson.json into a single self-contained lesson.html",
	)
	.argument("<lesson>", "Path to the hand-authored lesson.json")
	.requiredOption(
		"-o, --output <file>",
		"Destination path for the rendered lesson.html",
	)
	.addHelpText(
		"after",
		`
Examples:
  rp1 teach-me render lesson.json -o lesson.html
`,
	)
	.action(
		async (
			lessonPath: string,
			options: { output: string },
			command: Command,
		) => {
			const logger = command.parent?.parent?._logger as Logger;
			const isTTY = command.parent?.parent?._isTTY ?? false;

			const result = await renderFromFile(lessonPath, options.output)();
			if (E.isLeft(result)) {
				console.error(formatError(result.left, isTTY));
				process.exit(getExitCode(result.left));
			}
			logger?.info(`Rendered ${options.output}`);
		},
	);
