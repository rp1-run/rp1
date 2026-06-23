/**
 * CLI-time syntax highlighting for the teach-me render pipeline (T4).
 *
 * Code blocks are highlighted to static HTML at assembly time with Shiki so the
 * produced lesson artifact ships no runtime highlighting library (REQ-007). The
 * output is a self-contained `<pre class="shiki …">` whose colors are carried as
 * CSS custom properties for both light and dark themes, matching the
 * `data-theme`/`prefers-color-scheme` model the widget base stylesheet uses.
 *
 * Shiki throws when asked for a language it does not bundle. Rather than let an
 * unknown `lang` abort the whole render, an unsupported language degrades to a
 * hand-escaped plain code block of the same shape, so every code block always
 * yields static, injection-safe markup.
 */

import { pipe } from "fp-ts/lib/function.js";
import * as TE from "fp-ts/lib/TaskEither.js";
import type { BundledLanguage, Highlighter } from "shiki";
import { bundledLanguages, getSingletonHighlighter } from "shiki";
import type { CLIError } from "../../../shared/errors.js";
import { runtimeError } from "../../../shared/errors.js";

/**
 * Light/dark theme pair; emitted as CSS variables so a single block themes both
 * ways. Both are deliberately high-contrast (WCAG AA token contrast): the
 * accessibility-tuned `github-light-high-contrast` for the cream light canvas
 * and the vibrant, high-contrast `one-dark-pro` for the ink dark canvas — a
 * sharp upgrade over the muted default `github-light`/`github-dark` pair.
 */
const THEMES = {
	light: "github-light-high-contrast",
	dark: "one-dark-pro",
} as const;

/** Pre-loaded themes for the singleton highlighter. */
const THEME_NAMES = [THEMES.light, THEMES.dark] as const;

/** Cached highlighter; Shiki recommends a single long-lived instance per process. */
let highlighterPromise: Promise<Highlighter> | null = null;

const getHighlighter = (): Promise<Highlighter> => {
	if (!highlighterPromise) {
		highlighterPromise = getSingletonHighlighter({
			themes: [...THEME_NAMES],
			langs: [],
		});
	}
	return highlighterPromise;
};

const isBundledLanguage = (lang: string): lang is BundledLanguage =>
	Object.hasOwn(bundledLanguages, lang);

/** Standard HTML-entity escaping for the unsupported-language fallback. */
const escapeHtml = (value: string): string =>
	value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;");

/**
 * Render an escaped plain code block when a language is unsupported or Shiki is
 * unavailable. Shares the `shiki` class so the assembler and base stylesheet
 * treat highlighted and fallback blocks uniformly.
 */
const fallbackBlock = (code: string): string =>
	`<pre class="shiki shiki-fallback" tabindex="0"><code>${escapeHtml(code)}</code></pre>`;

/**
 * Highlight `code` to static HTML using Shiki.
 *
 * The language is loaded on demand when it is a bundled Shiki grammar; an
 * unknown language (or a Shiki failure) degrades to an escaped plain block via
 * {@link fallbackBlock} rather than failing the render. The returned markup
 * contains no `<script>` and no external references.
 *
 * @param code - Raw source text to highlight.
 * @param lang - Requested language identifier (e.g. `typescript`).
 */
export const highlightCode = (
	code: string,
	lang: string,
): TE.TaskEither<CLIError, string> =>
	pipe(
		TE.tryCatch(
			async () => {
				if (!isBundledLanguage(lang)) {
					return fallbackBlock(code);
				}

				const highlighter = await getHighlighter();
				if (!highlighter.getLoadedLanguages().includes(lang)) {
					await highlighter.loadLanguage(lang);
				}

				return highlighter.codeToHtml(code, {
					lang,
					themes: THEMES,
					defaultColor: false,
				});
			},
			(error) =>
				runtimeError(
					`Failed to highlight code (lang "${lang}"): ${error instanceof Error ? error.message : String(error)}`,
				),
		),
		// A Shiki failure (e.g. a malformed grammar load) must not abort the
		// render: recover to the escaped plain block, preserving static output.
		TE.orElse(() => TE.right(fallbackBlock(code))),
	);
