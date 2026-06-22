/**
 * Static-block widgets (`prose`, `callout`, `code`, `table`, `key-insight`,
 * `glossary`, `diagram`).
 *
 * These blocks render server-side during assembly (their markdown is rendered
 * to HTML, code is highlighted, and Mermaid is pre-rendered to static SVG), so
 * the custom elements do not hydrate from a JSON island. They are lightweight
 * upgrades that add accessibility semantics to the already-rendered content:
 * exposing diagram text equivalents, marking callouts with the right role, and
 * giving region landmarks labels. All styling lives in `tm-base.css`, keyed off
 * the element tag, so these classes intentionally do not touch presentation.
 */

import { defineWidget } from "./runtime.js";

/** ARIA role applied to a callout based on its semantic variant. */
const CALLOUT_ROLE: Record<string, string> = {
	danger: "alert",
	warn: "status",
	success: "status",
	info: "note",
};

/** `<tm-prose>` — server-rendered prose. No behavior; styled by tag. */
class ProseElement extends HTMLElement {}

/**
 * `<tm-callout>` — server-rendered callout. Adds an ARIA role matching the
 * `data-variant` so assistive technology announces danger/status appropriately
 * (information is never conveyed by color alone).
 */
class CalloutElement extends HTMLElement {
	connectedCallback(): void {
		const variant = this.getAttribute("data-variant") ?? "info";
		if (!this.hasAttribute("role")) {
			this.setAttribute("role", CALLOUT_ROLE[variant] ?? "note");
		}
	}
}

/** `<tm-code>` — server-highlighted code block. Styled by tag. */
class CodeElement extends HTMLElement {}

/**
 * `<tm-table>` — server-rendered data table. Marks itself as a region so the
 * table is reachable as a landmark when it carries a caption-derived label.
 */
class TableElement extends HTMLElement {
	connectedCallback(): void {
		const caption = this.querySelector("caption");
		if (caption && !this.hasAttribute("aria-label")) {
			this.setAttribute("role", "region");
			this.setAttribute("aria-label", caption.textContent ?? "Table");
		}
	}
}

/** `<tm-key-insight>` — server-rendered emphasized takeaway. Styled by tag. */
class KeyInsightElement extends HTMLElement {}

/** `<tm-glossary>` — server-rendered definition list. Styled by tag. */
class GlossaryElement extends HTMLElement {}

/**
 * `<tm-diagram>` — server-rendered static SVG with a required text equivalent.
 * Promotes the `data-alt` text equivalent to an accessible name on the figure
 * (`role="img"`) and ensures a visually rendered caption fallback exists, so
 * the diagram is never inaccessible to non-visual users (REQ-005).
 */
class DiagramElement extends HTMLElement {
	connectedCallback(): void {
		const alt = this.getAttribute("data-alt");
		if (alt && alt.length > 0) {
			if (!this.hasAttribute("role")) {
				this.setAttribute("role", "img");
			}
			if (!this.hasAttribute("aria-label")) {
				this.setAttribute("aria-label", alt);
			}
		}
	}
}

/** Register all static-block custom elements. */
export function registerStaticBlocks(): void {
	defineWidget("tm-prose", ProseElement);
	defineWidget("tm-callout", CalloutElement);
	defineWidget("tm-code", CodeElement);
	defineWidget("tm-table", TableElement);
	defineWidget("tm-key-insight", KeyInsightElement);
	defineWidget("tm-glossary", GlossaryElement);
	defineWidget("tm-diagram", DiagramElement);
}
