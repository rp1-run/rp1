/**
 * `rp1 teach-me validate <lesson.json>` (T6).
 *
 * Renders a hand-authored `lesson.json` through the shared render core (T5) and
 * gates the produced self-contained `lesson.html` with a hybrid validator:
 *
 * - A static gate (browser-free): size budget, no external network reference, no
 *   runtime rendering library, repo `references[].path` resolution, and
 *   references-present-when-research-used (REQ-008, REQ-010).
 * - A dynamic Puppeteer gate: loads the artifact over `file://`, asserts zero
 *   external network and no console errors, and checks the a11y of interactive
 *   controls and diagram text equivalents (REQ-008, REQ-005).
 *
 * The gate reports pass/fail per check and the command exits non-zero naming the
 * failing checks (REQ-008). A missing Puppeteer-pinned Chrome surfaces as an
 * actionable prerequisite error rather than a raw launch crash (HYP-001).
 *
 * {@link validateLesson} is the file-free core (parsed JSON in, gate result out)
 * the fixture tests (T8) build on; the Commander action layers file reading,
 * JSON parsing, reporting, and the exit code on top.
 */

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
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
import {
	type BrowserGateExpectations,
	combineResults,
	type GateResult,
	runBrowserGate,
	runStaticGate,
	type StaticGateContext,
} from "../../teach-me/gate/index.js";
import { parseLesson } from "../../teach-me/schema/index.js";
import { renderLessonHtml } from "./render.js";

const isCLIError = (value: unknown): value is CLIError =>
	typeof value === "object" && value !== null && "_tag" in value;

/** The block types whose presence means interactive (button-bearing) widgets hydrate. */
const INTERACTIVE_TAGS =
	/<tm-(?:timeline|decision-tree|stepper|state-explorer|layer-explorer|compare-cards|code-walkthrough|quiz)\b/;

/** Whether validating against a lesson with diagrams (a `<tm-diagram>` is emitted). */
const hasDiagram = (html: string): boolean => /<tm-diagram\b/.test(html);

/** Whether the rendered artifact carries interactive widgets that hydrate buttons. */
const hasInteractive = (html: string): boolean => INTERACTIVE_TAGS.test(html);

/**
 * Run the full hybrid gate against a parsed lesson value.
 *
 * Renders the lesson to a self-contained HTML string (reusing the T5 render
 * core, which validates, assembles, inlines, and tears down the Mermaid
 * browser), then runs the static gate plus the dynamic `file://` gate and
 * merges their results. Invalid input short-circuits at parse/render and
 * returns the underlying `Left` (no gate runs). A missing Puppeteer Chrome
 * returns `Left(prerequisiteError)`; a gate that runs returns `Right` even when
 * checks fail.
 *
 * @param input - The already-parsed lesson value (callers own JSON syntax errors).
 * @param source - Label used in validation error messages (typically the path).
 * @param repoRoot - Root that repo `references[].path` values resolve against.
 */
export const validateLesson = (
	input: unknown,
	source = "lesson.json",
	repoRoot: string = process.cwd(),
): TE.TaskEither<CLIError, GateResult> => {
	// Parse once up front for the research signal (web references) and an early,
	// clean validation error; the render core re-validates the same input.
	const researchUsed = pipe(
		parseLesson(input, source),
		E.map((lesson) =>
			lesson.references.some((reference) => reference.kind === "web"),
		),
	);

	return pipe(
		TE.fromEither(researchUsed),
		TE.bindTo("researchUsed"),
		TE.bind("html", () => renderLessonHtml(input, source)),
		TE.chain(({ researchUsed: usedResearch, html }) =>
			runGates(html, repoRoot, usedResearch),
		),
	);
};

/** Run the static and dynamic gates against a rendered lesson and merge them. */
const runGates = (
	html: string,
	repoRoot: string,
	researchUsed: boolean,
): TE.TaskEither<CLIError, GateResult> => {
	const staticContext: StaticGateContext = { repoRoot, researchUsed };
	const expectations: BrowserGateExpectations = {
		expectInteractive: hasInteractive(html),
		expectDiagram: hasDiagram(html),
	};
	return pipe(
		TE.fromTask<GateResult, CLIError>(() => runStaticGate(html, staticContext)),
		TE.bindTo("staticResult"),
		TE.bind("dynamicResult", () => withTempFile(html, expectations)),
		TE.map(({ staticResult, dynamicResult }) =>
			combineResults([staticResult, dynamicResult]),
		),
	);
};

/**
 * Write the rendered HTML to a temp file, run the dynamic gate against its
 * `file://` URL, and remove the temp file afterwards. The dynamic gate needs a
 * real `file://` origin so request interception and `file://` semantics match
 * how a maintainer opens the artifact.
 */
const withTempFile = (
	html: string,
	expectations: BrowserGateExpectations,
): TE.TaskEither<CLIError, GateResult> =>
	TE.bracket(
		TE.tryCatch(
			async () => {
				const dir = await mkdtemp(join(tmpdir(), "tm-validate-"));
				const filePath = join(dir, "lesson.html");
				await writeFile(filePath, html, "utf8");
				return { dir, filePath };
			},
			(error) =>
				runtimeError(
					`Failed to stage the lesson for browser validation: ${error instanceof Error ? error.message : String(error)}`,
				),
		),
		({ filePath }) =>
			runBrowserGate(pathToFileURL(filePath).href, expectations),
		({ dir }) =>
			TE.fromTask(async () => {
				await rm(dir, { recursive: true, force: true });
			}),
	);

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

/** Read `inputPath`, parse it, and run the hybrid gate against the rendered lesson. */
export const validateFromFile = (
	inputPath: string,
	repoRoot: string = process.cwd(),
): TE.TaskEither<CLIError, GateResult> =>
	pipe(
		readTextFile(inputPath),
		TE.chain((text) => TE.fromEither(parseJson(text, inputPath))),
		TE.chain((parsed) => validateLesson(parsed, inputPath, repoRoot)),
	);

/** Format a gate result as a readable per-check report (passing and failing). */
export const formatGateReport = (result: GateResult): string => {
	const lines = result.checks.map((check) => {
		const mark = check.passed ? "PASS" : "FAIL";
		const detail = check.detail ? ` — ${check.detail}` : "";
		return `  [${mark}] ${check.name}${detail}`;
	});
	const header = result.passed
		? "Lesson passed all gate checks."
		: "Lesson failed validation:";
	return [header, ...lines].join("\n");
};

/** `rp1 teach-me validate` subcommand. */
export const validateCommand = new Command("validate")
	.description(
		"Validate a rendered lesson with a hybrid static + headless-browser gate",
	)
	.argument("<lesson>", "Path to the hand-authored lesson.json")
	.addHelpText(
		"after",
		`
Examples:
  rp1 teach-me validate lesson.json
`,
	)
	.action(async (lessonPath: string, _options: unknown, command: Command) => {
		const logger = command.parent?.parent?._logger as Logger;
		const isTTY = command.parent?.parent?._isTTY ?? false;

		const result = await validateFromFile(lessonPath)();
		if (E.isLeft(result)) {
			console.error(formatError(result.left, isTTY));
			process.exit(getExitCode(result.left));
		}

		const report = formatGateReport(result.right);
		if (!result.right.passed) {
			console.error(report);
			process.exit(1);
		}
		logger?.info(report);
	});
