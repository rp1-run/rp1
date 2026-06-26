/**
 * Shared runtime for the teach-me widget library.
 *
 * Every interactive `<tm-*>` widget hydrates from a co-located
 * `<script type="application/json">` island whose content is the block's `data`
 * object (the schema interactive-block shape). These helpers keep the widgets
 * small, data-driven, and sandbox-safe (no `localStorage`, no required
 * `navigator.clipboard`, no top-level navigation): the only DOM APIs used are
 * element creation and text content. Motion is gated declaratively in
 * `base.css` via `@media (prefers-reduced-motion: reduce)`, so no JS motion
 * guard is needed here.
 */

/**
 * Read and remove the co-located JSON island from a widget element, returning
 * its parsed payload. Returns `null` when no island is present or the JSON is
 * malformed, so a widget can render an inert fallback rather than throw inside
 * `connectedCallback`.
 */
export function readIsland<T>(host: HTMLElement): T | null {
	const script = host.querySelector(":scope > script[type='application/json']");
	if (!(script instanceof HTMLScriptElement)) {
		return null;
	}
	const raw = script.textContent ?? "";
	script.remove();
	try {
		return JSON.parse(raw) as T;
	} catch {
		return null;
	}
}

/** Create an element, optionally assigning a class and text content. */
export function el<K extends keyof HTMLElementTagNameMap>(
	tag: K,
	className?: string,
	text?: string,
): HTMLElementTagNameMap[K] {
	const node = document.createElement(tag);
	if (className) {
		node.className = className;
	}
	if (text !== undefined) {
		node.textContent = text;
	}
	return node;
}

/** Create an accessible `<button>` wired to a click handler. */
export function button(
	label: string,
	className: string,
	onClick: () => void,
): HTMLButtonElement {
	const node = el("button", className, label);
	node.type = "button";
	node.addEventListener("click", onClick);
	return node;
}

/** Escape text for safe inclusion in a generated HTML string. */
function escapeHtml(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

/**
 * Render a safe inline-markdown subset into `target`.
 *
 * Supports `**bold**`, `*italic*`/`_italic_`, `` `code` ``, and `[text](url)`
 * links (http/https/mailto/relative only). Input is escaped first, so only the
 * tags this function emits can appear in the result; this keeps lesson content
 * readable without bundling a runtime markdown library (REQ-007) and without
 * the injection surface of raw markup. Blank lines split paragraphs.
 */
export function setInlineMarkdown(target: HTMLElement, md: string): void {
	target.replaceChildren();
	const paragraphs = md.split(/\n{2,}/);
	for (const block of paragraphs) {
		const trimmed = block.trim();
		if (trimmed.length === 0) {
			continue;
		}
		const p = document.createElement("p");
		p.innerHTML = renderInline(trimmed);
		target.appendChild(p);
	}
	if (target.childElementCount === 0) {
		target.textContent = md;
	}
}

/** Inline-token renderer over already-paragraph-split text. */
function renderInline(text: string): string {
	let html = escapeHtml(text).replace(/\n/g, "<br>");
	html = html.replace(
		/`([^`]+)`/g,
		(_m, code: string) => `<code>${code}</code>`,
	);
	html = html.replace(
		/\[([^\]]+)\]\(([^)\s]+)\)/g,
		(_m, label: string, href: string) => {
			if (!isSafeHref(href)) {
				return label;
			}
			return `<a href="${href}" target="_blank" rel="noopener noreferrer">${label}</a>`;
		},
	);
	html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
	html = html.replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>");
	html = html.replace(/_([^_]+)_/g, "<em>$1</em>");
	return html;
}

/**
 * Allow only relative URLs or http/https/mailto schemes so a link cannot become
 * a `javascript:` or other active-content navigation (sandbox safety).
 */
function isSafeHref(href: string): boolean {
	if (/^(https?:|mailto:)/i.test(href)) {
		return true;
	}
	return !/^[a-z][a-z0-9+.-]*:/i.test(href);
}

/**
 * Register a custom element under `name`, ignoring a duplicate registration so
 * the bundle can be embedded more than once on a page without throwing.
 */
export function defineWidget(
	name: string,
	ctor: CustomElementConstructor,
): void {
	if (typeof customElements === "undefined") {
		return;
	}
	if (customElements.get(name)) {
		return;
	}
	customElements.define(name, ctor);
}
