/**
 * Tests for the teach-me `validate` command and its hybrid gate (T6).
 *
 * The gate's load-bearing job is to fail a non-conformant artifact and name the
 * failing check (REQ-008), so these pin the regressions the T8 fixture's
 * happy-path golden/gate run would not localize to this layer:
 *
 * 1. Static gate (browser-free): it must reject the things a self-contained
 *    artifact must never contain — an oversized file, a fetchable external
 *    `src`/`href`, an external `<script src>` or a `<script>` inside an `<svg>`,
 *    an unresolved repo `file:line` citation — while NOT false-positiving on the
 *    W3C XML-namespace URIs every inlined Mermaid `<svg>` legitimately carries.
 *    It must also flag "research used but no references section".
 * 2. Command core: an invalid lesson short-circuits at parse/render and returns
 *    `Left` with no gate run (`validateFromFile`), and the per-check report
 *    names failing checks.
 * 3. Dynamic gate + full path: a rendered conformant lesson passes both gates,
 *    and a missing browser surfaces an actionable prerequisite error — gated on
 *    a launchable Puppeteer Chrome so a bare CI box still runs the static suite.
 */

import { afterAll, describe, expect, it } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as E from "fp-ts/lib/Either.js";
import {
	formatGateReport,
	validateFromFile,
	validateLesson,
} from "../../commands/teach-me/validate.js";
import {
	DEFAULT_SIZE_LIMIT_BYTES,
	type GateCheck,
	type GateResult,
	runStaticGate,
	type StaticGateContext,
} from "../../teach-me/gate/index.js";
import { closeMermaidBrowser } from "../../teach-me/prerender/index.js";

/** A self-contained artifact body the static gate should pass (no external refs). */
const CLEAN_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>Doc</title><style>.tm-x{color:red}</style><script>(()=>{})()</script></head>
<body><main class="tm-lesson">
<tm-prose><p>Body text.</p></tm-prose>
<tm-quiz><script type="application/json">{"questions":[]}</script></tm-quiz>
</main></body></html>`;

/** A clean context: this repo's root, no research used, default size budget. */
const ctx = (
	overrides: Partial<StaticGateContext> = {},
): StaticGateContext => ({
	repoRoot: process.cwd(),
	researchUsed: false,
	...overrides,
});

/** Find a single check by name (asserts presence). */
const check = (result: GateResult, name: string): GateCheck => {
	const found = result.checks.find((c) => c.name === name);
	if (!found) throw new Error(`expected a check named ${name}`);
	return found;
};

describe("runStaticGate", () => {
	it("passes a self-contained artifact with no external references", async () => {
		const html = `${CLEAN_HTML}
<li class="tm-ref" data-ref-kind="repo" data-ref-path="package.json">cli/package.json</li>`;
		const result = await runStaticGate(html, ctx());

		expect(result.passed).toBe(true);
		expect(check(result, "no-external-network-references").passed).toBe(true);
		expect(check(result, "no-runtime-rendering-library").passed).toBe(true);
		expect(check(result, "repo-references-resolve").passed).toBe(true);
	});

	it("does not false-positive on SVG XML-namespace URIs", async () => {
		// The xmlns/href here are W3C spec identifiers, not fetchable resources.
		const html = `${CLEAN_HTML}
<tm-diagram data-alt="a flow"><svg xmlns="http://www.w3.org/2000/svg"
xmlns:xlink="http://www.w3.org/1999/xlink"><rect/></svg></tm-diagram>`;
		const result = await runStaticGate(html, ctx());

		expect(check(result, "no-external-network-references").passed).toBe(true);
		expect(check(result, "no-runtime-rendering-library").passed).toBe(true);
	});

	it("fails on a fetchable external src/href", async () => {
		const html = CLEAN_HTML.replace(
			"<tm-prose>",
			'<img src="https://evil.example/x.png"><tm-prose>',
		);
		const result = await runStaticGate(html, ctx());

		expect(result.passed).toBe(false);
		const failing = check(result, "no-external-network-references");
		expect(failing.passed).toBe(false);
		expect(failing.detail).toBeDefined();
	});

	it("fails on a protocol-relative external reference", async () => {
		const html = CLEAN_HTML.replace(
			"<tm-prose>",
			'<link href="//cdn.example/x.css"><tm-prose>',
		);
		const result = await runStaticGate(html, ctx());

		expect(check(result, "no-external-network-references").passed).toBe(false);
	});

	it("fails on an external script and on a script inside an svg", async () => {
		const externalScript = CLEAN_HTML.replace(
			"</head>",
			'<script src="https://cdn.example/m.js"></script></head>',
		);
		expect(
			check(
				await runStaticGate(externalScript, ctx()),
				"no-runtime-rendering-library",
			).passed,
		).toBe(false);

		const scriptInSvg = `${CLEAN_HTML}
<tm-diagram data-alt="x"><svg xmlns="http://www.w3.org/2000/svg"><script>1</script></svg></tm-diagram>`;
		expect(
			check(
				await runStaticGate(scriptInSvg, ctx()),
				"no-runtime-rendering-library",
			).passed,
		).toBe(false);
	});

	it("fails when a cited repo reference does not resolve", async () => {
		const html = `${CLEAN_HTML}
<li class="tm-ref" data-ref-kind="repo" data-ref-path="does/not/exist.ts">x</li>`;
		const result = await runStaticGate(html, ctx());

		const failing = check(result, "repo-references-resolve");
		expect(failing.passed).toBe(false);
		expect(failing.detail).toContain("does/not/exist.ts");
	});

	it("rejects a path-traversal repo reference that escapes the repo root", async () => {
		const html = `${CLEAN_HTML}
<li class="tm-ref" data-ref-kind="repo" data-ref-path="../../etc/hosts">x</li>`;
		const result = await runStaticGate(html, ctx());

		expect(check(result, "repo-references-resolve").passed).toBe(false);
	});

	it("fails when research was used but no references section is rendered", async () => {
		// researchUsed is true but the HTML has no `class="tm-references"`.
		const result = await runStaticGate(CLEAN_HTML, ctx({ researchUsed: true }));

		const failing = check(result, "references-present-when-research-used");
		expect(failing.passed).toBe(false);
	});

	it("passes the research check when the references section is present", async () => {
		const html = `${CLEAN_HTML}
<section class="tm-references"><ul><li data-ref-kind="web" data-ref-url="https://x.dev/">x</li></ul></section>`;
		const result = await runStaticGate(html, ctx({ researchUsed: true }));

		expect(check(result, "references-present-when-research-used").passed).toBe(
			true,
		);
	});

	it("fails when the artifact exceeds the size budget", async () => {
		const huge = `${CLEAN_HTML}${"x".repeat(DEFAULT_SIZE_LIMIT_BYTES)}`;
		const result = await runStaticGate(huge, ctx());

		const failing = check(result, "size-within-budget");
		expect(failing.passed).toBe(false);
		expect(failing.detail).toContain("budget");
	});
});

describe("formatGateReport", () => {
	it("names failing checks with their detail", () => {
		const report = formatGateReport({
			passed: false,
			checks: [
				{ name: "size-within-budget", passed: true },
				{
					name: "repo-references-resolve",
					passed: false,
					detail: "missing: x.ts",
				},
			],
		});

		expect(report).toContain("failed validation");
		expect(report).toContain("[PASS] size-within-budget");
		expect(report).toContain("[FAIL] repo-references-resolve — missing: x.ts");
	});
});

describe("validateFromFile", () => {
	it("returns Left and runs no gate when the lesson is invalid", async () => {
		const dir = await mkdtemp(join(tmpdir(), "tm-validate-cmd-"));
		try {
			const lessonPath = join(dir, "lesson.json");
			// Valid JSON, unsupported schemaVersion -> rejected by parseLesson.
			await writeFile(
				lessonPath,
				JSON.stringify({ schemaVersion: "9.9", meta: {} }),
			);

			const result = await validateFromFile(lessonPath)();

			expect(E.isLeft(result)).toBe(true);
			if (!E.isLeft(result)) return;
			expect(result.left._tag).toBe("ValidationError");
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it("returns a not-found error for a missing lesson file", async () => {
		const result = await validateFromFile("/no/such/lesson.json")();
		expect(E.isLeft(result)).toBe(true);
		if (!E.isLeft(result)) return;
		expect(result.left._tag).toBe("NotFoundError");
	});
});

/** A schema-valid lesson with a resolvable repo reference and an interactive widget. */
const conformantLesson = () => ({
	schemaVersion: "1.0",
	meta: {
		title: "Validate Test Lesson",
		topicType: "concept",
		learnerPromise: "You will understand the validation gate.",
		coreMentalModel: "render then gate",
		primarySpine: "code-path-explorer",
		learner: {
			familiarity: "intermediate",
			desiredDepth: "practical",
			targetOutcome: "validate a lesson",
			constraints: [],
		},
		theme: "light",
		libraryVersion: "1.0",
	},
	sections: [
		{
			id: "intro",
			heading: "Intro",
			intent: "set up",
			blocks: [
				{ type: "prose", md: "A self-contained lesson." },
				{
					type: "quiz",
					data: {
						questions: [
							{
								q: "Is it self-contained?",
								choices: ["No", "Yes"],
								answer: 1,
								explanation: "Everything is inlined.",
							},
						],
					},
				},
			],
		},
	],
	checks: [
		{
			q: "Is the artifact self-contained?",
			choices: ["No", "Yes"],
			answer: 1,
			explanation: "All assets are inlined.",
		},
		{
			q: "Does the gate run?",
			choices: ["No", "Yes"],
			answer: 1,
			explanation: "The gate validates self-containment.",
		},
		{
			q: "What does validate check?",
			choices: ["Syntax only", "Self-containment"],
			answer: 1,
			explanation: "Validate checks self-containment.",
		},
	],
	glossary: [{ term: "gate", def: "the self-containment checker" }],
	misconceptions: ["The gate only checks file size."],
	next: ["Read the export command."],
	references: [{ kind: "repo", path: "package.json", why: "the cli manifest" }],
});

const canLaunchBrowser = await (async (): Promise<boolean> => {
	try {
		const { default: puppeteer } = await import("puppeteer");
		const browser = await puppeteer.launch({
			headless: true,
			args: ["--no-sandbox", "--disable-setuid-sandbox"],
		});
		await browser.close();
		return true;
	} catch {
		return false;
	}
})();

const describeBrowser = canLaunchBrowser ? describe : describe.skip;

describeBrowser("validateLesson (full hybrid gate)", () => {
	afterAll(async () => {
		await closeMermaidBrowser()();
	});

	it("passes a rendered conformant lesson through static + dynamic gates", async () => {
		// repoRoot is the cli/ dir so the `package.json` repo reference resolves.
		const result = await validateLesson(
			conformantLesson(),
			"lesson.json",
			process.cwd(),
		)();

		expect(E.isRight(result)).toBe(true);
		if (!E.isRight(result)) return;
		// Both gate halves contributed checks and all passed.
		expect(result.right.passed).toBe(true);
		expect(check(result.right, "zero-external-network").passed).toBe(true);
		expect(check(result.right, "no-console-errors").passed).toBe(true);
		// The interactive quiz hydrated a labelled <button>.
		expect(check(result.right, "interactive-controls-present").passed).toBe(
			true,
		);
	}, 30000);
});
