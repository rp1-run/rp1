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

/** Human-readable label for each callout variant. */
const CALLOUT_LABEL: Record<string, string> = {
	danger: "Danger callout",
	warn: "Warning callout",
	success: "Success callout",
	info: "Information callout",
};

/** `<tm-prose>` — server-rendered prose. No behavior; styled by tag. */
class ProseElement extends HTMLElement {}

/**
 * `<tm-callout>` — server-rendered callout. Marks the element as a labelled
 * region so assistive technology can announce its variant and purpose.
 */
class CalloutElement extends HTMLElement {
	connectedCallback(): void {
		const variant = this.getAttribute("data-variant") ?? "info";
		if (!this.hasAttribute("role")) {
			this.setAttribute("role", "region");
		}
		if (!this.hasAttribute("aria-label")) {
			this.setAttribute(
				"aria-label",
				CALLOUT_LABEL[variant] ?? "Information callout",
			);
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

/**
 * `<tm-key-insight>` — server-rendered emphasized takeaway. Marks the element
 * as a labelled region so screen readers announce it as a distinct key insight.
 */
class KeyInsightElement extends HTMLElement {
	connectedCallback(): void {
		if (!this.hasAttribute("role")) {
			this.setAttribute("role", "region");
		}
		if (!this.hasAttribute("aria-label")) {
			this.setAttribute("aria-label", "Key insight");
		}
	}
}

/**
 * `<tm-glossary>` — server-rendered definition list. Marks the element as a
 * labelled region so screen readers announce it as a glossary section.
 */
class GlossaryElement extends HTMLElement {
	connectedCallback(): void {
		if (!this.hasAttribute("role")) {
			this.setAttribute("role", "region");
		}
		if (!this.hasAttribute("aria-label")) {
			this.setAttribute("aria-label", "Glossary");
		}
	}
}

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

/**
 * `<tm-math>` — server-rendered KaTeX math. Promotes the `data-tex` source
 * to an accessible name (`role="math"`, `aria-label`) so screen readers
 * announce the original TeX rather than the rendered markup.
 */
class MathElement extends HTMLElement {
	connectedCallback(): void {
		const tex = this.getAttribute("data-tex");
		if (tex && tex.length > 0) {
			if (!this.hasAttribute("role")) {
				this.setAttribute("role", "math");
			}
			if (!this.hasAttribute("aria-label")) {
				this.setAttribute("aria-label", tex);
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
	defineWidget("tm-math", MathElement);
}
