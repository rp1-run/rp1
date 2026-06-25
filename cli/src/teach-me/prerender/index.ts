/**
 * Public surface for the teach-me pre-render subsystem (T4).
 *
 * Both pre-renderers run at CLI assembly time and emit static output only, so
 * the produced lesson artifact ships no runtime diagram or highlighting library
 * (REQ-007):
 *
 * - {@link renderMermaid} renders Mermaid source to a self-contained `<svg>`
 *   using an offline-injected engine (zero external requests).
 * - {@link highlightCode} renders code to static highlighted HTML via Shiki.
 *
 * {@link closeMermaidBrowser} releases the shared headless browser after a batch
 * of diagrams.
 */

export { highlightCode } from "./highlight.js";
export { getKatexCss, renderMath } from "./math.js";
export { closeMermaidBrowser, renderMermaid } from "./mermaid.js";
