/**
 * CLI-time KaTeX math rendering for the teach-me render pipeline.
 *
 * Math blocks are rendered to static HTML at assembly time with KaTeX's
 * `renderToString` so the produced lesson artifact ships no runtime math
 * library (REQ-007). The output is a self-contained `<span class="katex …">`
 * (inline) or `<span class="katex-display …">` (block) whose fonts are
 * carried as base64 `data:` URIs in the companion CSS, so the artifact
 * makes zero external requests (HYP-002).
 *
 * The KaTeX CSS is read once from `node_modules/katex/dist/katex.min.css`,
 * and every `url(fonts/…)` reference is replaced with an inline base64
 * `data:font/woff2;base64,…` URI built from the co-located woff2 files.
 * Non-woff2 fallbacks (woff, ttf) are stripped since woff2 is universally
 * supported. The result is memoized so multiple math blocks pay the font
 * inlining cost only once.
 */

import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import * as TE from "fp-ts/lib/TaskEither.js";
import type { CLIError } from "../../../shared/errors.js";
import { runtimeError } from "../../../shared/errors.js";

/** Resolve the katex dist directory from the local install. */
const katexDistDir = (): string => {
	const katexEntry = createRequire(import.meta.url).resolve("katex");
	// katex resolves to katex/dist/katex.js; dirname gives the dist dir directly.
	return dirname(katexEntry);
};

/**
 * Render TeX source to static HTML using KaTeX.
 *
 * Uses `throwOnError: false` so malformed TeX degrades to KaTeX's red error
 * markup rather than aborting the render. The `displayMode` flag mirrors the
 * schema's `display` enum: `"block"` renders as a centered display equation,
 * `"inline"` renders inline.
 */
export const renderMath = (
	tex: string,
	display: "block" | "inline",
): TE.TaskEither<CLIError, string> =>
	TE.tryCatch(
		async () => {
			const katex = await import("katex");
			const render = katex.default?.renderToString ?? katex.renderToString;
			return render(tex, {
				throwOnError: false,
				displayMode: display === "block",
			});
		},
		(error) =>
			runtimeError(
				`Failed to render math (TeX "${tex.slice(0, 60)}"): ${error instanceof Error ? error.message : String(error)}`,
			),
	);

/** Memoized KaTeX CSS with all fonts inlined as base64 data: URIs. */
let katexCssCache: string | null = null;

/**
 * Get the self-contained KaTeX CSS string with all font files inlined as
 * base64 `data:font/woff2;base64,…` URIs. The result is memoized so
 * multiple math blocks pay the I/O and base64 encoding cost only once.
 *
 * The strategy:
 * 1. Read `katex.min.css` from the installed katex package.
 * 2. For each `url(fonts/…woff2)` reference, read the font file and replace
 *    the URL with an inline `data:font/woff2;base64,…` URI.
 * 3. Strip non-woff2 font fallbacks (`url(fonts/…woff)`, `url(fonts/…ttf)`)
 *    from each `src:` declaration since woff2 is universally supported.
 */
export const getKatexCss = (): TE.TaskEither<CLIError, string> =>
	TE.tryCatch(
		async () => {
			if (katexCssCache !== null) {
				return katexCssCache;
			}

			const distDir = katexDistDir();
			let css = await readFile(join(distDir, "katex.min.css"), "utf8");
			const fontsDir = join(distDir, "fonts");

			const woff2Refs = new Set<string>();
			for (const match of css.matchAll(/url\(fonts\/([\w-]+\.woff2)\)/g)) {
				woff2Refs.add(match[1]);
			}

			for (const fontFile of woff2Refs) {
				const fontPath = join(fontsDir, fontFile);
				const fontData = await readFile(fontPath);
				const b64 = fontData.toString("base64");
				const dataUri = `data:font/woff2;base64,${b64}`;
				css = css.split(`url(fonts/${fontFile})`).join(`url(${dataUri})`);
			}

			css = css.replace(
				/,url\(fonts\/[\w-]+\.(?:woff|ttf)\)\s*format\("[^"]+"\)/g,
				"",
			);

			katexCssCache = css;
			return css;
		},
		(error) =>
			runtimeError(
				`Failed to build self-contained KaTeX CSS: ${error instanceof Error ? error.message : String(error)}`,
			),
	);

/** @internal Reset the memoized CSS cache (for tests). */
export const _resetCssCache = (): void => {
	katexCssCache = null;
};
