/**
 * Tests for the teach-me `render` command and its assemble/inline core (T5).
 *
 * These pin the render-owned guarantees that the T8 fixture golden/gate tests
 * would not localize to this layer:
 *
 * 1. Data-driven assembly + inline: every block becomes its `<tm-*>` markup,
 *    interactive blocks carry their `data` as a co-located JSON island, code is
 *    statically highlighted, the artifact references no external resource, and
 *    the widget bundle is injected exactly once into one self-contained document
 *    (REQ-006/REQ-007). This runs without a browser or a built bundle (a stub
 *    bundle stands in for the embedded assets).
 * 2. Failure writes no artifact: an invalid lesson makes `renderFromFile` exit
 *    `Left` and leave no output file (AC1 — "on failure exits non-zero with no
 *    artifact written"). Parse short-circuits before any asset/browser work.
 * 3. Diagram-id determinism: rendering a diagram-bearing lesson twice in one
 *    process is byte-identical because the volatile Mermaid root id is
 *    normalized to a document-position id. This is the regression behind the T8
 *    golden test and is the one part gated on a launchable Puppeteer Chrome (the
 *    schema/markup assertions above need neither), so a bare CI box still runs
 *    the rest. The exhaustive parse accept/reject matrix lives in `schema.test`.
 */

import { afterAll, describe, expect, it } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as E from "fp-ts/lib/Either.js";
import { renderFromFile } from "../../commands/teach-me/render.js";
import { assembleLesson } from "../../teach-me/assemble.js";
import type { WidgetBundle } from "../../teach-me/assets.js";
import { inlineDocument } from "../../teach-me/inline.js";
import { closeMermaidBrowser } from "../../teach-me/prerender/index.js";
import { parseLesson } from "../../teach-me/schema/index.js";

/** Distinct markers so "injected exactly once" can be counted unambiguously. */
const STUB_BUNDLE: WidgetBundle = {
	js: "/*__TM_WIDGETS_STUB__*/",
	css: "/*__TM_BASE_STUB__*/",
};

/** A schema-valid lesson exercising representative static + interactive blocks. */
const baseLesson = (overrides: Record<string, unknown> = {}) => ({
	schemaVersion: "1.0",
	meta: {
		title: "Render Test Lesson",
		topicType: "concept",
		learnerPromise: "You will understand the render path.",
		coreMentalModel: "data in, one html out",
		primarySpine: "code-path",
		learner: {
			familiarity: "intermediate",
			desiredDepth: "working",
			targetOutcome: "render a lesson",
			constraints: [],
		},
		theme: "light",
		libraryVersion: "1.0",
	},
	sections: [
		{
			id: "intro",
			heading: "Intro Section",
			intent: "set the stage",
			blocks: [
				{ type: "prose", md: "A **bold** idea." },
				{ type: "callout", variant: "warn", md: "Mind the gap." },
				{ type: "code", lang: "typescript", code: "const x: number = 1;" },
				{
					type: "table",
					headers: ["A", "B"],
					rows: [["1", "2"]],
				},
				{
					type: "quiz",
					data: {
						questions: [
							{
								q: "What is 2+2?",
								choices: ["3", "4"],
								answer: 1,
								explanation: "Basic arithmetic.",
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
	],
	glossary: [{ term: "Inliner", def: "Embeds assets into one file." }],
	misconceptions: ["It needs a server."],
	next: ["Run the validate gate."],
	references: [
		{ kind: "repo", path: "cli/src/foo.ts", lines: "1-3", why: "the seam" },
		{
			kind: "web",
			title: "MDN",
			url: "https://developer.mozilla.org/",
			usedFor: "background",
		},
	],
	...overrides,
});

/** Parse + assemble + inline with the stub bundle (no browser for diagram-free lessons). */
const renderWithStub = async (input: unknown): Promise<string> => {
	const parsed = parseLesson(input);
	if (!E.isRight(parsed)) {
		throw new Error("fixture lesson should be valid");
	}
	const assembled = await assembleLesson(parsed.right)();
	if (!E.isRight(assembled)) {
		throw new Error("assembly should succeed");
	}
	return inlineDocument(assembled.right, STUB_BUNDLE);
};

describe("assemble + inline", () => {
	it("produces one self-contained document with each block as its <tm-*> markup", async () => {
		const html = await renderWithStub(baseLesson());

		expect(html.startsWith("<!doctype html>")).toBe(true);
		expect(html).toContain("<title>Render Test Lesson</title>");
		// Static blocks render server-side as their elements.
		expect(html).toContain("<tm-prose>");
		expect(html).toContain('<tm-callout data-variant="warn">');
		expect(html).toContain("<strong>bold</strong>");
		expect(html).toContain("<tm-table>");
		// Code is statically highlighted (no runtime highlighter shipped).
		expect(html).toContain("<tm-code>");
		expect(html).toContain('class="shiki');
	});

	it("emits interactive block data as a co-located JSON island", async () => {
		const html = await renderWithStub(baseLesson());

		// The quiz hydrates from exactly its schema `data` object.
		expect(html).toContain('<tm-quiz><script type="application/json">');
		expect(html).toContain('"q":"What is 2+2?"');
		expect(html).toContain('"answer":1');
		// The lesson-level `checks` also render as a quiz island.
		expect(html).toContain("Is the artifact self-contained?");
	});

	it("references no external resource and injects the widget bundle exactly once", async () => {
		const html = await renderWithStub(baseLesson());

		// No fetchable external src/href. A web reference is shown as text +
		// data-ref-url, never a live href, so the artifact stays self-contained.
		expect(/\b(?:src|href)\s*=\s*["']https?:/i.test(html)).toBe(false);
		expect(html).not.toContain("<script src=");
		// Bundle injected once each.
		expect(html.split(STUB_BUNDLE.js).length - 1).toBe(1);
		expect(html.split(STUB_BUNDLE.css).length - 1).toBe(1);
		// References carry machine-extractable attributes for the T6 gate.
		expect(html).toContain(
			'data-ref-kind="repo" data-ref-path="cli/src/foo.ts"',
		);
		expect(html).toContain(
			'data-ref-kind="web" data-ref-url="https://developer.mozilla.org/"',
		);
	});

	it("is deterministic across repeated renders in one process", async () => {
		const first = await renderWithStub(baseLesson());
		const second = await renderWithStub(baseLesson());
		expect(first).toBe(second);
	});
});

describe("renderFromFile", () => {
	it("writes no artifact when the lesson is invalid", async () => {
		const dir = await mkdtemp(join(tmpdir(), "tm-render-"));
		try {
			const lessonPath = join(dir, "lesson.json");
			const outPath = join(dir, "lesson.html");
			// Valid JSON but an unsupported schemaVersion (rejected by parseLesson).
			await writeFile(
				lessonPath,
				JSON.stringify(baseLesson({ schemaVersion: "9.9" })),
			);

			const result = await renderFromFile(lessonPath, outPath)();

			expect(E.isLeft(result)).toBe(true);
			if (!E.isLeft(result)) return;
			expect(result.left._tag).toBe("ValidationError");
			// AC1: no partial artifact is written on failure.
			expect(await Bun.file(outPath).exists()).toBe(false);
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
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

describeBrowser("diagram rendering", () => {
	afterAll(async () => {
		await closeMermaidBrowser()();
	});

	const diagramLesson = baseLesson({
		sections: [
			{
				id: "diagrams",
				heading: "Diagrams",
				intent: "show a flow",
				blocks: [
					{
						type: "diagram",
						source: "flowchart TD\n A[Start] --> B[End]",
						alt: "Start flows to End",
					},
				],
			},
		],
	});

	it("inlines a static SVG with a normalized, deterministic id", async () => {
		const parsed = parseLesson(diagramLesson);
		expect(E.isRight(parsed)).toBe(true);
		if (!E.isRight(parsed)) return;

		const assembled = await assembleLesson(parsed.right)();
		expect(E.isRight(assembled)).toBe(true);
		if (!E.isRight(assembled)) return;

		const body = assembled.right.bodyHtml;
		expect(body).toContain('<tm-diagram data-alt="Start flows to End">');
		expect(body).toContain("<svg");
		// The volatile per-process Mermaid id is rewritten to a position id.
		expect(body).toContain("tm-diagram-0");
		expect(body).not.toContain("tm-mermaid-");
		// The diagram itself is static SVG: no runtime diagram library inside it
		// (the only scripts elsewhere in the body are `application/json` data
		// islands, which are data, not executable libraries — REQ-007).
		const svg = body.match(/<svg[\s\S]*?<\/svg>/)?.[0] ?? "";
		expect(svg.length).toBeGreaterThan(0);
		expect(svg).not.toContain("<script");
		// No fetchable external resource anywhere in the body.
		expect(/\b(?:src|href)\s*=\s*["']https?:/i.test(body)).toBe(false);
	}, 30000);

	it("renders byte-identically when assembled twice in the same process", async () => {
		const parsed = parseLesson(diagramLesson);
		if (!E.isRight(parsed)) throw new Error("valid");

		const a = await assembleLesson(parsed.right)();
		const b = await assembleLesson(parsed.right)();
		expect(E.isRight(a)).toBe(true);
		expect(E.isRight(b)).toBe(true);
		if (!E.isRight(a) || !E.isRight(b)) return;
		// Counter drift in the T4 renderer must not leak: normalized ids make the
		// two renders identical (the regression behind the T8 golden test).
		expect(a.right.bodyHtml).toBe(b.right.bodyHtml);
	}, 30000);
});
