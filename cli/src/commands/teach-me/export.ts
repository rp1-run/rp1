/**
 * `rp1 teach-me export <lesson.html> -o <out.html>` (T7).
 *
 * Re-asserts that an already-rendered `lesson.html` is self-contained, then
 * emits the standalone artifact to the destination path (REQ-009). It is a thin
 * pass-through over the inlined `render` output: `render` produces the
 * standalone form, and `export` is the explicit, gated emission step (PRD §15).
 *
 * The re-assertion is the self-containment subset of the T6 static gate (size
 * budget, no fetchable external network reference, no runtime rendering
 * library) — not the full validate gate, whose repo `file:line` provenance and
 * research-references checks need the repo on disk and the parsed `lesson.json`
 * that `export` (which takes the rendered HTML) does not have. When the artifact
 * is not self-contained the command writes nothing and exits non-zero naming the
 * failing check.
 *
 * {@link exportFromFile} is the core the fixture tests (T8) build on for the
 * end-to-end `render -> validate -> export` path; the Commander action layers
 * reporting and the exit code on top.
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
} from "../../../shared/errors.js";
import type { Logger } from "../../../shared/logger.js";
import {
	assertSelfContained,
	type GateResult,
} from "../../teach-me/gate/index.js";

const isCLIError = (value: unknown): value is CLIError =>
	typeof value === "object" && value !== null && "_tag" in value;

/** Read a UTF-8 file, mapping a missing file to an actionable not-found error. */
const readTextFile = (path: string): TE.TaskEither<CLIError, string> =>
	TE.tryCatch(
		async () => {
			const file = Bun.file(path);
			if (!(await file.exists())) {
				throw notFoundError(
					path,
					"Provide a path to a rendered lesson.html (run `rp1 teach-me render` first).",
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

/** Write the standalone HTML, creating any missing parent directories first. */
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
 * Read the rendered `inputPath`, re-assert its self-containment, and emit it to
 * `outputPath`.
 *
 * The destination is written **only when the artifact passes** the
 * self-containment re-assertion, so a non-self-contained artifact leaves no
 * exported file behind. A `Left(CLIError)` is a hard failure (missing input,
 * write error); a `Right(GateResult)` carries the re-assertion outcome — the
 * caller exits non-zero (naming the failing check) when `passed` is false.
 */
export const exportFromFile = (
	inputPath: string,
	outputPath: string,
): TE.TaskEither<CLIError, GateResult> =>
	pipe(
		readTextFile(inputPath),
		TE.bindTo("html"),
		TE.bind("result", ({ html }) => TE.right(assertSelfContained(html))),
		TE.chainFirst(({ html, result }) =>
			result.passed ? writeOutput(outputPath, html) : TE.right(undefined),
		),
		TE.map(({ result }) => result),
	);

/** Format a self-containment result as a readable per-check report (passing and failing). */
export const formatSelfContainmentReport = (result: GateResult): string => {
	const lines = result.checks.map((check) => {
		const mark = check.passed ? "PASS" : "FAIL";
		const detail = check.detail ? ` — ${check.detail}` : "";
		return `  [${mark}] ${check.name}${detail}`;
	});
	const header = result.passed
		? "Artifact is self-contained."
		: "Artifact is not self-contained:";
	return [header, ...lines].join("\n");
};

/** `rp1 teach-me export` subcommand. */
export const exportCommand = new Command("export")
	.description(
		"Re-assert self-containment of a rendered lesson.html and emit the standalone file",
	)
	.argument("<lesson>", "Path to a rendered lesson.html")
	.requiredOption(
		"-o, --output <file>",
		"Destination path for the standalone lesson.html",
	)
	.addHelpText(
		"after",
		`
Examples:
  rp1 teach-me export lesson.html -o dist/lesson.html
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

			const result = await exportFromFile(lessonPath, options.output)();
			if (E.isLeft(result)) {
				console.error(formatError(result.left, isTTY));
				process.exit(getExitCode(result.left));
			}

			if (!result.right.passed) {
				console.error(formatSelfContainmentReport(result.right));
				process.exit(1);
			}
			logger?.info(`Exported ${options.output}`);
		},
	);
