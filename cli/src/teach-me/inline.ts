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
 * restriction that would otherwise break offline open.
 *
 * The script is placed at the END of `<body>`, after the lesson markup, not in
 * `<head>`. Interactive widgets hydrate from a co-located
 * `<script type="application/json">` island child, and a custom element's
 * `connectedCallback` runs when its start tag is parsed — before its island
 * child exists if the definition is already registered (a head script). Defining
 * the elements only after the body is fully parsed means each element is upgraded
 * with its island present, so it hydrates (verified under a real `file://` load;
 * a head script leaves interactive widgets inert — REQ-004). The stylesheet stays
 * in `<head>` so styling applies before paint.
 *
 * Output is deterministic: the document is built only from the assembled body
 * and the (byte-stable) widget bundle, with no timestamps or generated ids.
 */

import { type AssembledLesson, escapeHtml } from "./assemble.js";
import type { WidgetBundle } from "./assets.js";

/**
 * Inline `<script>` that listens for `postMessage` theme-sync messages from
 * the Arcade host and applies the theme to the lesson document. The host sends
 * `{type:'rp1-teach-me-theme', theme:'light'|'dark'}` on iframe load and on
 * every theme toggle; the listener validates the shape strictly (type-check the
 * data object, confirm the `type` string and `theme` enum) and sets
 * `document.documentElement.dataset.theme` on match, which swaps the CSS custom
 * property set in `base.css`. Malformed or unrelated messages are silently
 * ignored. The script is a no-op when opened standalone (no parent posts).
 */
export const THEME_SYNC_SCRIPT = [
	'window.addEventListener("message",function(e){',
	"var d=e.data;",
	'if(d&&typeof d==="object"&&d.type==="rp1-teach-me-theme"',
	'&&(d.theme==="light"||d.theme==="dark")){',
	"document.documentElement.dataset.theme=d.theme}",
	"});",
].join("");

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
	const katexStyle =
		assembled.hasMath && assembled.katexCss
			? `<style>${assembled.katexCss}</style>\n`
			: "";
	return `<!doctype html>
<html lang="en"${theme}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(assembled.title)}</title>
<style>${bundle.css}</style>
${katexStyle}</head>
<body>
<main class="tm-lesson">
${assembled.bodyHtml}
</main>
<script>${bundle.js}</script>
<script>${THEME_SYNC_SCRIPT}</script>
</body>
</html>
`;
}
