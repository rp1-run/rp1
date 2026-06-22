/**
 * Lesson inliner (T5).
 *
 * Wraps the assembled lesson body into a single, self-contained HTML document
 * (REQ-006): the widget base stylesheet and the self-registering widget script
 * are each injected exactly once into the `<head>`, with all diagram SVG and
 * highlighted code already inlined by the assembler. The result references no
 * external resource and ships no runtime rendering library (REQ-007), so it
 * opens directly over `file://` with zero network requests.
 *
 * The widget script is embedded as a plain inline `<script>` (not
 * `type="module"`): the bundle is an IIFE that self-registers all `<tm-*>`
 * elements, and a classic inline script avoids the `file://` ES-module CORS
 * restriction that would otherwise break offline open. Element upgrade happens
 * as the body is parsed after the definitions register in `<head>`.
 *
 * Output is deterministic: the document is built only from the assembled body
 * and the (byte-stable) widget bundle, with no timestamps or generated ids.
 */

import { type AssembledLesson, escapeHtml } from "./assemble.js";
import type { WidgetBundle } from "./assets.js";

/**
 * Build the self-contained `lesson.html` from the assembled lesson and the
 * widget bundle. Pure and deterministic for a given input.
 */
export function inlineDocument(
	assembled: AssembledLesson,
	bundle: WidgetBundle,
): string {
	const theme = assembled.themeAttr
		? ` data-theme="${assembled.themeAttr}"`
		: "";
	return `<!doctype html>
<html lang="en"${theme}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(assembled.title)}</title>
<style>${bundle.css}</style>
<script>${bundle.js}</script>
</head>
<body>
<main class="tm-lesson">
${assembled.bodyHtml}
</main>
</body>
</html>
`;
}
