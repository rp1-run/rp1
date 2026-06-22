/**
 * End-to-end proof for the teach-me tooling, driven by the committed
 * hand-authored fixture `cli/src/teach-me/__fixtures__/lesson.json` (T8).
 *
 * The per-task suites (schema/render/validate/export) pin each layer's own
 * regressions with synthetic inputs and deliberately defer the fixture-driven
 * happy path to here. This suite owns exactly that integration/e2e coverage and
 * does not re-derive those matrices:
 *
 * 1. The committed fixture stays a valid lesson and exercises all 15 widgets
 *    (AC1) — a browser-free guard against fixture rot or a schema change.
 * 2. Rendering the fixture produces every `<tm-*>` widget from data, is
 *    byte-identical across runs (REQ-006 golden), and is one self-contained
 *    artifact within the size budget (REQ-004/REQ-010).
 * 3. The full hybrid gate passes the conformant fixture, and fixture-derived
 *    variants (external request, external runtime script, unresolved repo
 *    reference) each fail naming the offending check (REQ-008).
 * 4. The real command path on disk — render -> validate -> export — succeeds,
 *    and the rendered artifact hydrates its interactive controls under a real
 *    `file://` load with zero external requests (REQ-011 / REQ-004 offline).
 *
 * Everything that renders the fixture needs a launchable Puppeteer Chrome (the
 * fixture has diagrams), so it is gated behind `describeBrowser`; a bare CI box
 * still runs the validity guard.
 */

import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as E from "fp-ts/lib/Either.js";
import type { CLIError } from "../../../shared/errors.js";
import { exportFromFile } from "../../commands/teach-me/export.js";
import {
	renderFromFile,
	renderLessonHtml,
} from "../../commands/teach-me/render.js";
import {
	validateFromFile,
	validateLesson,
} from "../../commands/teach-me/validate.js";
import {
	type GateResult,
	runBrowserGate,
	runStaticGate,
	type StaticGateContext,
} from "../../teach-me/gate/index.js";
import { closeMermaidBrowser } from "../../teach-me/prerender/index.js";
import { BLOCK_TYPES, parseLesson } from "../../teach-me/schema/index.js";
import { getErrorMessage } from "../helpers/index.js";

/** Absolute path to the committed fixture (resolved from this test file). */
const FIXTURE_PATH = fileURLToPath(
	new URL("../../teach-me/__fixtures__/lesson.json", import.meta.url),
);

/** The fixture's parsed JSON value, read once (the file is the source of truth). */
const fixtureValue: unknown = await Bun.file(FIXTURE_PATH).json();

/**
 * The `<tm-*>` tag every one of the 15 block types must produce in the rendered
 * artifact (the trailing `checks` also render as a `<tm-quiz>`, so the quiz tag
 * is covered by both the block and the checks list).
 */
const WIDGET_TAGS = [
	"tm-prose",
	"tm-callout",
	"tm-code",
	"tm-table",
	"tm-key-insight",
	"tm-timeline",
	"tm-decision-tree",
	"tm-stepper",
	"tm-state-explorer",
	"tm-layer-explorer",
	"tm-compare-cards",
	"tm-code-walkthrough",
	"tm-quiz",
	"tm-glossary",
	"tm-diagram",
] as const;

/** Matches a fetchable external `src`/`href` (mirrors the gate's discrimination). */
const EXTERNAL_URL = /\b(?:src|href)\s*=\s*["']https?:/i;

/** Look up a single named check in a gate result. */
const check = (result: GateResult, name: string) => {
	const found = result.checks.find((c) => c.name === name);
	if (!found) throw new Error(`gate result is missing check "${name}"`);
	return found;
};

describe("teach-me committed fixture (browser-free validity guard)", () => {
	it("parses as a valid lesson and exercises all 15 block types", () => {
		const result = parseLesson(fixtureValue, FIXTURE_PATH);
		expect(E.isRight(result)).toBe(true);
		if (!E.isRight(result)) return;

		const present = new Set(
			result.right.sections.flatMap((section) =>
				section.blocks.map((block) => block.type),
			),
		);
		// Every allowlisted widget appears at least once (AC1).
		for (const type of BLOCK_TYPES) {
			expect(present.has(type)).toBe(true);
		}
		// The fixture uses web research, so it must carry a web reference (drives
		// the gate's references-present-when-research-used check downstream).
		expect(
			result.right.references.some((reference) => reference.kind === "web"),
		).toBe(true);
	});
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

describeBrowser(
	"teach-me fixture end-to-end (render -> validate -> export)",
	() => {
		let html = "";

		beforeAll(async () => {
			const result = await renderLessonHtml(fixtureValue, FIXTURE_PATH)();
			html = expectRenderedHtml(result);
		});

		afterAll(async () => {
			await closeMermaidBrowser()();
		});

		it("renders every <tm-*> widget from the fixture data (REQ-004)", () => {
			for (const tag of WIDGET_TAGS) {
				expect(html).toContain(`<${tag}`);
			}
			// Interactive blocks are data-driven: their payload rides in a JSON island.
			expect(html).toContain('<script type="application/json">');
			// Diagrams are static SVG with no runtime library leaked into the artifact.
			expect(html).toContain("<svg");
			expect(EXTERNAL_URL.test(html)).toBe(false);
		});

		it("renders byte-identically across two runs (REQ-006 golden)", async () => {
			const second = await renderLessonHtml(fixtureValue, FIXTURE_PATH)();
			const secondHtml = expectRenderedHtml(second);
			expect(secondHtml).toBe(html);
		});

		it("produces one self-contained artifact within the 1 MiB budget (REQ-010)", () => {
			const bytes = Buffer.byteLength(html, "utf8");
			expect(bytes).toBeLessThanOrEqual(1024 * 1024);
			// Self-containment is structural: no fetchable external src/href, and the
			// volatile per-process Mermaid id is normalized so it never leaks.
			expect(EXTERNAL_URL.test(html)).toBe(false);
			expect(html).not.toContain("tm-mermaid-");
		});

		it("passes the full hybrid gate on the conformant fixture (REQ-008)", async () => {
			// repoRoot is the cli/ dir (the test cwd) so the fixture's repo
			// references resolve. validate re-renders internally against the same
			// input and then runs the headless gate, so it needs the browser budget.
			const result = await validateLesson(
				fixtureValue,
				FIXTURE_PATH,
				process.cwd(),
			)();
			expect(E.isRight(result)).toBe(true);
			if (!E.isRight(result)) return;
			expect(result.right.passed).toBe(true);
		}, 30000);

		// Each fixture-derived defect must fail its own check and leave the rest
		// passing (AC4). The detection is the static gate's job, so these run against
		// the real rendered fixture without re-launching a browser.
		const negativeVariants: ReadonlyArray<{
			readonly name: string;
			readonly failingCheck: string;
			readonly mutate: (clean: string) => string;
		}> = [
			{
				name: "an external image request is injected",
				failingCheck: "no-external-network-references",
				mutate: (clean) =>
					clean.replace(
						"</body>",
						'<img src="https://cdn.example.com/tracker.png"></body>',
					),
			},
			{
				name: "an external runtime script is injected",
				failingCheck: "no-runtime-rendering-library",
				mutate: (clean) =>
					clean.replace(
						"</body>",
						'<script src="https://cdn.example.com/mermaid.min.js"></script></body>',
					),
			},
			{
				name: "a cited repo reference does not resolve",
				failingCheck: "repo-references-resolve",
				mutate: (clean) =>
					clean.replace(
						'data-ref-path="src/teach-me/inline.ts"',
						'data-ref-path="src/teach-me/does-not-exist.ts"',
					),
			},
		];

		for (const variant of negativeVariants) {
			it(`fails naming "${variant.failingCheck}" when ${variant.name} (REQ-008)`, async () => {
				const ctx: StaticGateContext = {
					repoRoot: process.cwd(),
					researchUsed: true,
				};
				// Sanity: the unmodified fixture passes the targeted check.
				const clean = await runStaticGate(html, ctx);
				expect(check(clean, variant.failingCheck).passed).toBe(true);

				const mutated = variant.mutate(html);
				// The mutation must actually change the artifact (guards against a
				// stale replace target if the assembler output drifts).
				expect(mutated).not.toBe(html);

				const result = await runStaticGate(mutated, ctx);
				expect(result.passed).toBe(false);
				const failed = check(result, variant.failingCheck);
				expect(failed.passed).toBe(false);
				expect(failed.detail).toBeTruthy();
			});
		}

		it("hydrates interactive controls under file:// with zero external requests (REQ-004)", async () => {
			const dir = await mkdtemp(join(tmpdir(), "tm-fixture-"));
			try {
				const filePath = join(dir, "lesson.html");
				await Bun.write(filePath, html);
				const result = await runBrowserGate(pathToFileURL(filePath).href, {
					expectInteractive: true,
					expectDiagram: true,
				})();
				expect(E.isRight(result)).toBe(true);
				if (!E.isRight(result)) return;
				expect(result.right.passed).toBe(true);
				// The product constraint: real controls hydrate, diagrams keep their
				// text equivalent, and nothing is fetched off the network.
				expect(check(result.right, "interactive-controls-present").passed).toBe(
					true,
				);
				expect(
					check(result.right, "diagram-text-equivalents-present").passed,
				).toBe(true);
				expect(check(result.right, "zero-external-network").passed).toBe(true);
				expect(check(result.right, "no-console-errors").passed).toBe(true);
			} finally {
				await rm(dir, { recursive: true, force: true });
			}
		}, 30000);

		it("proves the render -> validate -> export command path on disk (REQ-011)", async () => {
			const dir = await mkdtemp(join(tmpdir(), "tm-fixture-e2e-"));
			try {
				const renderedPath = join(dir, "lesson.html");
				const exportedPath = join(dir, "out", "lesson.html");

				// render: lesson.json -> one self-contained lesson.html on disk.
				const rendered = await renderFromFile(FIXTURE_PATH, renderedPath)();
				expect(E.isRight(rendered)).toBe(true);
				expect(await Bun.file(renderedPath).exists()).toBe(true);

				// validate: the hybrid gate passes for the fixture (repoRoot = cli/).
				const validated = await validateFromFile(FIXTURE_PATH, process.cwd())();
				expect(E.isRight(validated)).toBe(true);
				if (E.isRight(validated)) expect(validated.right.passed).toBe(true);

				// export: re-assert self-containment and emit the standalone file
				// (parent dir auto-created); the gate result must pass.
				const exported = await exportFromFile(renderedPath, exportedPath)();
				expect(E.isRight(exported)).toBe(true);
				if (E.isRight(exported)) expect(exported.right.passed).toBe(true);
				expect(await Bun.file(exportedPath).exists()).toBe(true);

				// The exported artifact is the rendered one, byte-for-byte.
				const renderedBytes = await Bun.file(renderedPath).text();
				const exportedBytes = await Bun.file(exportedPath).text();
				expect(exportedBytes).toBe(renderedBytes);
			} finally {
				await rm(dir, { recursive: true, force: true });
			}
		}, 30000);
	},
);

/** Unwrap a rendered-HTML `Right`, failing the test with the error otherwise. */
function expectRenderedHtml(result: E.Either<CLIError, string>): string {
	if (E.isLeft(result)) {
		throw new Error(`render failed: ${getErrorMessage(result.left)}`);
	}
	return result.right;
}
