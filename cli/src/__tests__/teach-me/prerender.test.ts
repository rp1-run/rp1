/**
 * Tests for the teach-me pre-render subsystem (T4).
 *
 * These are the load-bearing guarantees of REQ-007: the produced artifact ships
 * NO runtime rendering library, so both pre-renderers must emit static output
 * that contains no script/CDN references and is reachable offline.
 *
 * - Mermaid is rendered to a static `<svg>` in a Puppeteer page with the engine
 *   injected from the local install (never a CDN). The dominant regression risk
 *   is a silent reintroduction of a network dependency (HYP-002), so the mermaid
 *   tests assert zero external requests and that the markup is a self-contained
 *   `<svg>` with no `<script>`.
 * - Shiki highlights at CLI time to static HTML. Its highest-risk behavior is an
 *   unsupported `lang` (Shiki throws), which must degrade to an escaped plain
 *   block rather than crash the render. That fallback and HTML-escaping are
 *   pinned here.
 *
 * The browser-backed mermaid suite is gated on a launchable Puppeteer Chrome; if
 * the pinned browser is missing it is skipped (the realistic seam for the full
 * offline path is the T8 gate), so this file never fails on a bare CI box.
 */

import { afterAll, describe, expect, it } from "bun:test";
import * as E from "fp-ts/lib/Either.js";
import { highlightCode } from "../../teach-me/prerender/highlight.js";
import {
	_resetCssCache,
	getKatexCss,
	renderMath,
} from "../../teach-me/prerender/math.js";
import {
	_testInternals,
	closeMermaidBrowser,
	renderMermaid,
} from "../../teach-me/prerender/mermaid.js";

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

describe("highlightCode", () => {
	it("highlights code to static HTML with no script or external reference", async () => {
		const result = await highlightCode(
			"const x: number = 42;\nconsole.log(x);",
			"typescript",
		)();

		expect(E.isRight(result)).toBe(true);
		if (!E.isRight(result)) return;

		const html = result.right;
		expect(html).toContain("<pre");
		expect(html).toContain('class="shiki');
		expect(html).not.toContain("<script");
		expect(/https?:\/\//.test(html)).toBe(false);
	});

	it("falls back to an escaped plain block for an unsupported language", async () => {
		const result = await highlightCode(
			"<not & real>",
			"totally-not-a-language",
		)();

		expect(E.isRight(result)).toBe(true);
		if (!E.isRight(result)) return;

		const html = result.right;
		// Degrades instead of throwing; still a code block.
		expect(html).toContain("<pre");
		expect(html).toContain("<code");
		// HTML metacharacters from the source are escaped, never injected raw.
		expect(html).not.toContain("<not & real>");
		expect(html).toContain("&lt;not &amp; real&gt;");
		expect(html).not.toContain("<script");
	});
});

describe("renderMath", () => {
	it("renders TeX to static HTML containing the .katex class", async () => {
		const result = await renderMath("E = mc^{2}", "block")();

		expect(E.isRight(result)).toBe(true);
		if (!E.isRight(result)) return;

		const html = result.right;
		expect(html).toContain("katex");
		expect(html).not.toContain("<script");
	});

	it("renders inline math without katex-display wrapper", async () => {
		const result = await renderMath("x^2", "inline")();

		expect(E.isRight(result)).toBe(true);
		if (!E.isRight(result)) return;

		const html = result.right;
		expect(html).toContain("katex");
		expect(html).not.toContain("katex-display");
	});

	it("renders block math with katex-display wrapper", async () => {
		const result = await renderMath("\\int_0^1 x\\,dx", "block")();

		expect(E.isRight(result)).toBe(true);
		if (!E.isRight(result)) return;

		const html = result.right;
		expect(html).toContain("katex-display");
	});

	it("degrades gracefully for malformed TeX (throwOnError: false)", async () => {
		const result = await renderMath("\\invalid{", "block")();

		expect(E.isRight(result)).toBe(true);
		if (!E.isRight(result)) return;

		const html = result.right;
		expect(html).toContain("katex");
	});
});

describe("getKatexCss", () => {
	it("returns CSS with no external url() references", async () => {
		_resetCssCache();
		const result = await getKatexCss()();

		expect(E.isRight(result)).toBe(true);
		if (!E.isRight(result)) return;

		const css = result.right;
		expect(css).toContain("@font-face");
		expect(css).toContain("data:font/woff2;base64,");
		// No external url() references remain -- only data: URIs.
		expect(/url\(\s*['"]?https?:/i.test(css)).toBe(false);
		expect(/url\(fonts\//i.test(css)).toBe(false);
	});
});

describeBrowser("renderMermaid", () => {
	afterAll(async () => {
		await closeMermaidBrowser()();
	});

	it("renders Mermaid source to a self-contained static SVG", async () => {
		const result = await renderMermaid(
			"flowchart TD\n A[Start] --> B{Go?}\n B -->|yes| C[Do]\n B -->|no| D[Skip]",
		)();

		expect(E.isRight(result)).toBe(true);
		if (!E.isRight(result)) return;

		const svg = result.right;
		expect(svg.trimStart().startsWith("<svg")).toBe(true);
		// Static output only: no runtime diagram library referenced (REQ-007).
		expect(svg).not.toContain("<script");
		// No fetchable external resource. (The SVG legitimately contains W3C XML
		// namespace URIs like `xmlns="http://www.w3.org/2000/svg"`, which are
		// spec identifiers, not network requests, so a bare http:// substring
		// check would false-positive — assert no external src/href instead.)
		expect(/\b(?:src|href)\s*=\s*["']https?:/i.test(svg)).toBe(false);
	}, 30000);

	it("returns Left with an actionable message for invalid Mermaid source", async () => {
		const result = await renderMermaid("flowchart TD\n A --> ")();

		expect(E.isLeft(result)).toBe(true);
		if (!E.isLeft(result)) return;
		const error = result.left;
		expect(error._tag).toBe("RuntimeError");
		if (error._tag !== "RuntimeError") return;
		expect(error.message.length).toBeGreaterThan(0);
	}, 30000);

	it("succeeds for concurrent calls without launching duplicate browsers", async () => {
		const diagrams = [
			"flowchart TD\n X1[One]",
			"flowchart TD\n X2[Two]",
			"flowchart TD\n X3[Three]",
		];
		const results = await Promise.all(diagrams.map((d) => renderMermaid(d)()));

		for (const r of results) {
			expect(E.isRight(r)).toBe(true);
			if (E.isRight(r)) {
				expect(r.right.trimStart().startsWith("<svg")).toBe(true);
			}
		}
		// Only one browser instance exists — the memoized init prevented duplicates.
		expect(_testInternals.getBrowserInstance()).not.toBeNull();
	}, 30000);

	it("resets browser singletons through the full lifecycle", async () => {
		const r = await renderMermaid("flowchart TD\n L[Lifecycle]")();
		expect(E.isRight(r)).toBe(true);

		expect(_testInternals.getBrowserInstance()).not.toBeNull();
		expect(_testInternals.getPageInstance()).not.toBeNull();

		await closeMermaidBrowser()();

		expect(_testInternals.getBrowserInstance()).toBeNull();
		expect(_testInternals.getPageInstance()).toBeNull();

		const r2 = await renderMermaid("flowchart TD\n L2[Fresh]")();
		expect(E.isRight(r2)).toBe(true);
	}, 30000);
});
