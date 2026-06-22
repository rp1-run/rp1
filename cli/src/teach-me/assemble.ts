/**
 * Lesson assembler (T5).
 *
 * Walks a validated {@link LessonModel} in document order and turns every block
 * into the markup the bundled widget library expects:
 *
 * - Static blocks (`prose`, `callout`, `code`, `table`, `key-insight`,
 *   `glossary`, `diagram`) are rendered server-side here — their `<tm-*>`
 *   elements only add accessibility semantics to the children this module emits.
 *   `code` is highlighted via Shiki and `diagram` is pre-rendered to a static
 *   `<svg>` via Mermaid (T4), so the artifact ships no runtime library (REQ-007).
 * - Interactive blocks emit a `<tm-*>` element wrapping a co-located
 *   `<script type="application/json">` island whose content is exactly the
 *   schema block's `data` object; the widget hydrates from it at runtime.
 *
 * The output is deterministic (REQ-006): blocks render in document order with no
 * timestamps or randomness, and each diagram's volatile Mermaid root id is
 * rewritten to a document-position-derived id (see {@link normalizeDiagramId}),
 * so re-rendering the same lesson in the same process is byte-identical even
 * though the T4 renderer uses a process-monotonic id counter.
 *
 * Diagram and code blocks are rendered through T4's `TaskEither` pre-renderers,
 * so the whole walk is a `TaskEither`; blocks are sequenced strictly in order
 * (never in parallel) to keep the Mermaid singleton page and the diagram-id
 * normalization stable. The caller is responsible for `closeMermaidBrowser()`
 * after assembly (see `render.ts`).
 */

import { pipe } from "fp-ts/lib/function.js";
import * as TE from "fp-ts/lib/TaskEither.js";
import type { CLIError } from "../../shared/errors.js";
import { highlightCode, renderMermaid } from "./prerender/index.js";
import type {
	Block,
	GlossaryEntry,
	LessonModel,
	Reference,
	Section,
} from "./schema/index.js";

/** The block types whose payload is a JSON island the widget hydrates from. */
const INTERACTIVE_BLOCK_TYPES = new Set([
	"timeline",
	"decision-tree",
	"stepper",
	"state-explorer",
	"layer-explorer",
	"compare-cards",
	"code-walkthrough",
	"quiz",
]);

/**
 * The assembled lesson body plus the document-level metadata the inliner needs.
 * `bodyHtml` is the full `<main>` inner markup (lesson header + sections +
 * trailing lesson material); it carries no `<html>`/`<head>` and no widget
 * bundle — the inliner wraps it into the self-contained document.
 */
export interface AssembledLesson {
	/** Lesson title (`meta.title`), raw; the inliner escapes it for the page title. */
	readonly title: string;
	/**
	 * `data-theme` value for the root element: `"light"`/`"dark"` from
	 * `meta.theme`, or `null` for `auto` (CSS then follows `prefers-color-scheme`).
	 */
	readonly themeAttr: "light" | "dark" | null;
	/** Assembled `<main>` inner HTML, deterministic and self-contained-ready. */
	readonly bodyHtml: string;
}

/** Escape text for safe inclusion in HTML element content or an attribute value. */
export function escapeHtml(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

/**
 * Serialize a block's `data` object into a co-located JSON island.
 *
 * The markup-significant characters (`<`, `>`, `&`) and the JS line separators
 * (U+2028/U+2029) are escaped to their `\uXXXX` JSON escapes so the serialized
 * payload can never close the surrounding `</script>` tag or break out of the
 * island, while staying valid JSON the widget can `JSON.parse`. Key order
 * follows the parsed object (schema field order), keeping the island
 * deterministic.
 */
function serializeIsland(data: unknown): string {
	const json = JSON.stringify(data).replace(
		/[<>&\u2028\u2029]/g,
		(char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`,
	);
	return `<script type="application/json">${json}</script>`;
}

/**
 * Allow only relative URLs or http/https/mailto schemes, mirroring the widget
 * runtime so server-rendered and client-rendered markdown links agree on the
 * sandbox-safety boundary (a `javascript:` URL is rendered as plain text).
 */
function isSafeHref(href: string): boolean {
	if (/^(https?:|mailto:)/i.test(href)) {
		return true;
	}
	return !/^[a-z][a-z0-9+.-]*:/i.test(href);
}

/** Render a single already-paragraph-split run of inline markdown to HTML. */
function renderInline(text: string): string {
	let html = escapeHtml(text).replace(/\n/g, "<br>");
	html = html.replace(
		/`([^`]+)`/g,
		(_m, code: string) => `<code>${code}</code>`,
	);
	html = html.replace(
		/\[([^\]]+)\]\(([^)\s]+)\)/g,
		(_m, label: string, href: string) =>
			isSafeHref(href)
				? `<a href="${href}" rel="noopener noreferrer">${label}</a>`
				: label,
	);
	html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
	html = html.replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>");
	html = html.replace(/_([^_]+)_/g, "<em>$1</em>");
	return html;
}

/**
 * Render the safe inline-markdown subset to paragraph HTML.
 *
 * This is the server-side twin of the widget runtime's `setInlineMarkdown`
 * (same token rules, escape-first), so the static `prose`/`callout`/
 * `key-insight` blocks read identically to the client-rendered `stepper` and
 * `code-walkthrough` step text without bundling a runtime markdown library
 * (REQ-007). Blank lines split paragraphs.
 */
export function renderMarkdown(md: string): string {
	const paragraphs = md
		.split(/\n{2,}/)
		.map((block) => block.trim())
		.filter((block) => block.length > 0)
		.map((block) => `<p>${renderInline(block)}</p>`);
	return paragraphs.length > 0
		? paragraphs.join("")
		: `<p>${escapeHtml(md)}</p>`;
}

/** Render a glossary term/definition list (shared by the block and lesson glossary). */
function renderGlossaryList(terms: readonly GlossaryEntry[]): string {
	const items = terms
		.map(
			(entry) =>
				`<dt>${escapeHtml(entry.term)}</dt><dd>${escapeHtml(entry.def)}</dd>`,
		)
		.join("");
	return `<dl class="tm-glossary__list">${items}</dl>`;
}

/**
 * Rewrite a Mermaid SVG's volatile root id to a deterministic, position-derived
 * id.
 *
 * T4's renderer assigns the SVG root id from a process-monotonic counter
 * (`tm-mermaid-1`, `-2`, …), which also seeds the SVG's internal references
 * (`#tm-mermaid-N`, marker ids `tm-mermaid-N_…`). That id therefore differs
 * between two renders in the same process, which would break the byte-identical
 * golden output (REQ-006). Replacing every occurrence of the exact root id with
 * `tm-diagram-<index>` (the diagram's document-order position) makes the SVG
 * stable across re-renders and unique within the document. A diagram without a
 * recognizable `tm-mermaid-N` root id is returned unchanged.
 */
function normalizeDiagramId(svg: string, index: number): string {
	const match = svg.match(/<svg\b[^>]*\bid="(tm-mermaid-\d+)"/);
	if (!match) {
		return svg;
	}
	return svg.split(match[1]).join(`tm-diagram-${index}`);
}

/** Render a static block (no island); these are server-rendered with a11y semantics. */
function renderStaticBlock(block: Block): TE.TaskEither<CLIError, string> {
	switch (block.type) {
		case "prose":
			return TE.right(`<tm-prose>${renderMarkdown(block.md)}</tm-prose>`);
		case "callout": {
			const title = block.title
				? `<p class="tm-callout__title">${escapeHtml(block.title)}</p>`
				: "";
			return TE.right(
				`<tm-callout data-variant="${block.variant}">${title}${renderMarkdown(block.md)}</tm-callout>`,
			);
		}
		case "code": {
			const filename = block.filename
				? `<p class="tm-code__filename">${escapeHtml(block.filename)}</p>`
				: "";
			return pipe(
				highlightCode(block.code, block.lang),
				TE.map((html) => `<tm-code>${filename}${html}</tm-code>`),
			);
		}
		case "table": {
			const caption = block.caption
				? `<caption>${escapeHtml(block.caption)}</caption>`
				: "";
			const head = `<thead><tr>${block.headers
				.map((h) => `<th scope="col">${escapeHtml(h)}</th>`)
				.join("")}</tr></thead>`;
			const body = `<tbody>${block.rows
				.map(
					(row) =>
						`<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`,
				)
				.join("")}</tbody>`;
			return TE.right(
				`<tm-table><table>${caption}${head}${body}</table></tm-table>`,
			);
		}
		case "key-insight": {
			const title = block.title
				? `<p class="tm-key-insight__title">${escapeHtml(block.title)}</p>`
				: "";
			return TE.right(
				`<tm-key-insight>${title}${renderMarkdown(block.md)}</tm-key-insight>`,
			);
		}
		case "glossary":
			return TE.right(
				`<tm-glossary>${renderGlossaryList(block.terms)}</tm-glossary>`,
			);
		default:
			// Unreachable: `diagram` is handled by the caller (it needs a position
			// index for id normalization), and interactive blocks never reach here.
			return TE.right("");
	}
}

/** Render a `diagram` block: pre-render to SVG (T4), normalize id, wrap with a11y. */
function renderDiagramBlock(
	block: Extract<Block, { type: "diagram" }>,
	index: number,
): TE.TaskEither<CLIError, string> {
	const title = block.title
		? `<p class="tm-diagram__title">${escapeHtml(block.title)}</p>`
		: "";
	return pipe(
		renderMermaid(block.source),
		TE.map((svg) => normalizeDiagramId(svg, index)),
		TE.map(
			(svg) =>
				`<tm-diagram data-alt="${escapeHtml(block.alt)}">${title}${svg}</tm-diagram>`,
		),
	);
}

/**
 * Render a single block to its markup task. `diagramIndex` is the diagram's
 * document-order position, used only by `diagram` blocks to derive a
 * deterministic id.
 */
function renderBlock(
	block: Block,
	diagramIndex: number,
): TE.TaskEither<CLIError, string> {
	if (block.type === "diagram") {
		return renderDiagramBlock(block, diagramIndex);
	}
	if (INTERACTIVE_BLOCK_TYPES.has(block.type)) {
		// Interactive blocks carry a `data` payload that becomes the JSON island.
		const data = (block as { data: unknown }).data;
		return TE.right(
			`<tm-${block.type}>${serializeIsland(data)}</tm-${block.type}>`,
		);
	}
	return renderStaticBlock(block);
}

/** Slugify an arbitrary id string into an HTML-id/CSS-selector-safe token. */
function slug(value: string): string {
	return value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

/**
 * Render one section: a labelled `<section>` with a heading and its blocks.
 * `startDiagramIndex` is the document-order index of this section's first
 * diagram, so diagram ids stay contiguous and stable across sections.
 */
function renderSection(
	section: Section,
	startDiagramIndex: number,
): TE.TaskEither<CLIError, string> {
	let diagramIndex = startDiagramIndex;
	const tasks = section.blocks.map((block) =>
		renderBlock(
			block,
			block.type === "diagram" ? diagramIndex++ : diagramIndex,
		),
	);
	const headingId = `tm-section-${slug(section.id)}`;
	return pipe(
		TE.sequenceSeqArray(tasks),
		TE.map(
			(blocks) =>
				`<section class="tm-section" aria-labelledby="${headingId}"><h2 id="${headingId}" class="tm-section__heading">${escapeHtml(section.heading)}</h2>${blocks.join("")}</section>`,
		),
	);
}

/** Count the diagram blocks in a section (to advance the document-order index). */
function diagramCount(section: Section): number {
	return section.blocks.filter((block) => block.type === "diagram").length;
}

/** Render the lesson header (title + learner promise) shown above the sections. */
function renderHeader(lesson: LessonModel): string {
	const promise = `<p class="tm-lesson__promise">${escapeHtml(lesson.meta.learnerPromise)}</p>`;
	return `<header class="tm-lesson__header"><h1 class="tm-lesson__title">${escapeHtml(lesson.meta.title)}</h1>${promise}</header>`;
}

/** Render the optional comprehension-check quiz from the lesson-level `checks`. */
function renderChecks(lesson: LessonModel): string {
	if (lesson.checks.length === 0) {
		return "";
	}
	const island = serializeIsland({ questions: lesson.checks });
	return `<section class="tm-checks" aria-labelledby="tm-checks-heading"><h2 id="tm-checks-heading">Check your understanding</h2><tm-quiz>${island}</tm-quiz></section>`;
}

/** Render the optional lesson-level glossary. */
function renderGlossary(lesson: LessonModel): string {
	if (lesson.glossary.length === 0) {
		return "";
	}
	return `<section class="tm-glossary-section" aria-labelledby="tm-glossary-heading"><h2 id="tm-glossary-heading">Glossary</h2><tm-glossary>${renderGlossaryList(lesson.glossary)}</tm-glossary></section>`;
}

/** Render a labelled list section from a list of plain strings (e.g. `next`). */
function renderStringList(
	id: string,
	heading: string,
	items: readonly string[],
): string {
	if (items.length === 0) {
		return "";
	}
	const list = items.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
	return `<section class="tm-${id}" aria-labelledby="tm-${id}-heading"><h2 id="tm-${id}-heading">${heading}</h2><ul>${list}</ul></section>`;
}

/**
 * Render a single reference as a list item carrying machine-extractable
 * attributes for the validation gate (T6).
 *
 * A repo reference exposes `data-ref-path` (and optional `data-ref-lines`) so
 * the gate can spot-check that the cited `file:line` resolves. A web reference
 * exposes its URL as `data-ref-url` and visible text rather than a live
 * `<a href="https://…">`: this keeps the artifact free of any fetchable
 * external `href`/`src` (so the gate's external-network check stays accurate)
 * and honors the sandbox no-top-level-navigation constraint.
 */
function renderReference(reference: Reference): string {
	if (reference.kind === "repo") {
		const loc = reference.lines
			? `${reference.path}:${reference.lines}`
			: reference.path;
		const symbol = reference.symbol
			? ` (<code>${escapeHtml(reference.symbol)}</code>)`
			: "";
		const lines = reference.lines
			? ` data-ref-lines="${escapeHtml(reference.lines)}"`
			: "";
		return `<li class="tm-ref" data-ref-kind="repo" data-ref-path="${escapeHtml(reference.path)}"${lines}><code class="tm-ref__loc">${escapeHtml(loc)}</code>${symbol} — ${escapeHtml(reference.why)}</li>`;
	}
	const org = reference.org
		? ` <span class="tm-ref__org">(${escapeHtml(reference.org)})</span>`
		: "";
	return `<li class="tm-ref" data-ref-kind="web" data-ref-url="${escapeHtml(reference.url)}"><span class="tm-ref__title">${escapeHtml(reference.title)}</span>${org} — ${escapeHtml(reference.usedFor)} <span class="tm-ref__url">${escapeHtml(reference.url)}</span></li>`;
}

/** Render the optional references section. */
function renderReferences(lesson: LessonModel): string {
	if (lesson.references.length === 0) {
		return "";
	}
	const items = lesson.references.map(renderReference).join("");
	return `<section class="tm-references" aria-labelledby="tm-references-heading"><h2 id="tm-references-heading">References</h2><ul class="tm-references__list">${items}</ul></section>`;
}

/**
 * Assemble a validated lesson into its deterministic `<main>` body markup and
 * the document metadata the inliner needs.
 *
 * Sections render in order, then the trailing lesson material (checks, glossary,
 * misconceptions, next steps, references). Diagram and code blocks are rendered
 * through T4 (static SVG / highlighted HTML), so the result is a `TaskEither`;
 * the caller must release the Mermaid browser after this resolves.
 */
export function assembleLesson(
	lesson: LessonModel,
): TE.TaskEither<CLIError, AssembledLesson> {
	let diagramIndex = 0;
	const sectionTasks = lesson.sections.map((section) => {
		const task = renderSection(section, diagramIndex);
		// Reserve this section's diagram indices before the next one renders.
		diagramIndex += diagramCount(section);
		return task;
	});

	const themeAttr = lesson.meta.theme === "auto" ? null : lesson.meta.theme;

	return pipe(
		TE.sequenceSeqArray(sectionTasks),
		TE.map((sections) => {
			const sectionsHtml = sections.join("");
			const trailing = [
				renderChecks(lesson),
				renderGlossary(lesson),
				renderStringList(
					"misconceptions",
					"Common misconceptions",
					lesson.misconceptions,
				),
				renderStringList("next", "Where to go next", lesson.next),
				renderReferences(lesson),
			].join("");
			return {
				title: lesson.meta.title,
				themeAttr,
				bodyHtml: `${renderHeader(lesson)}${sectionsHtml}${trailing}`,
			};
		}),
	);
}
