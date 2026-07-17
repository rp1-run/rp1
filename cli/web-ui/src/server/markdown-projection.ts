/**
 * Plain-text projection of markdown source with a per-character offset map.
 *
 * Annotation anchors are captured from the rendered DOM, where markdown
 * syntax (backticks, emphasis markers, fences, table pipes) is invisible.
 * To store anchors in source coordinates we project the source onto the
 * text the user actually sees — walking the mdast tree, whose node
 * positions are exact — and keep, for every projected character, the offset
 * of the source character it came from. Locating a rendered selection in
 * the projection then yields exact source offsets.
 */

import type { Node as MdastNode, Parent, Root } from "mdast";
import remarkFrontmatter from "remark-frontmatter";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";
import type { SourceAnchor, TextSelectionAnchor } from "../types/annotations";

export interface MarkdownProjection {
	/** The plain-text projection of the markdown source. */
	readonly text: string;
	/**
	 * map[i] = source offset where projection.text[i] begins, or -1 when the
	 * character could not be aligned to the source (selections over unmapped
	 * characters are rejected rather than anchored imprecisely).
	 */
	readonly map: readonly number[];
	/** endMap[i] = source offset just past projection.text[i], or -1. */
	readonly endMap: readonly number[];
}

/** Sentinel offset for projected characters with no exact source position. */
const UNMAPPED = -1;

const parser = unified()
	.use(remarkParse)
	.use(remarkGfm)
	.use(remarkFrontmatter, ["yaml", "toml"]);

/** Node types that never contribute visible text. */
const SKIPPED_TYPES = new Set(["yaml", "toml", "html", "image", "definition"]);

/** Block-level node types separated by a newline in the projection. */
const BLOCK_TYPES = new Set([
	"paragraph",
	"heading",
	"code",
	"blockquote",
	"list",
	"listItem",
	"table",
	"tableRow",
	"tableCell",
	"thematicBreak",
]);

interface NodeWithValue extends MdastNode {
	value: string;
}

function hasValue(node: MdastNode): node is NodeWithValue {
	return typeof (node as NodeWithValue).value === "string";
}

function isParent(node: MdastNode): node is Parent {
	return Array.isArray((node as Parent).children);
}

interface AlignedOffsets {
	readonly starts: number[];
	readonly ends: number[];
}

/**
 * Character references handled during alignment. mdast decodes the full
 * HTML5 named set; anything outside this list fails alignment and the node
 * becomes unmapped (no source anchor) rather than misaligned.
 */
const NAMED_REFERENCES: Record<string, string> = {
	amp: "&",
	lt: "<",
	gt: ">",
	quot: '"',
	apos: "'",
	// mdast decodes &nbsp; to U+00A0, not a plain space.
	nbsp: "\u00a0",
};

const MAX_REFERENCE_LENGTH = 32;

function decodeCharacterReference(body: string): string | null {
	if (body.startsWith("#x") || body.startsWith("#X")) {
		return codePointToString(Number.parseInt(body.slice(2), 16));
	}
	if (body.startsWith("#")) {
		return codePointToString(Number.parseInt(body.slice(1), 10));
	}
	return NAMED_REFERENCES[body] ?? null;
}

function codePointToString(codePoint: number): string | null {
	if (Number.isNaN(codePoint) || codePoint < 0 || codePoint > 0x10ffff) {
		return null;
	}
	try {
		return String.fromCodePoint(codePoint);
	} catch {
		return null;
	}
}

/** A '>' preceded only by whitespace and other '>' back to the line start. */
function isBlockquoteMarker(source: string, index: number): boolean {
	for (let i = index - 1; i >= 0; i--) {
		const c = source[i];
		if (c === "\n") return true;
		if (c !== " " && c !== "\t" && c !== ">") return false;
	}
	return true;
}

/**
 * Map each character of a text node's decoded value onto source start/end
 * offsets. Handles backslash escapes, CRLF, decoded character references,
 * and blockquote markers; skips stray source whitespace (soft wrap
 * indentation). Returns null when the value cannot be aligned — the node is
 * then projected as unmapped, so selections over it are rejected instead of
 * being anchored to a wrong source slice.
 */
function alignValueToSource(
	source: string,
	sourceStart: number,
	sourceEnd: number,
	value: string,
): AlignedOffsets | null {
	const starts = new Array<number>(value.length);
	const ends = new Array<number>(value.length);
	let s = sourceStart;
	let i = 0;

	while (i < value.length) {
		if (s >= sourceEnd) return null;
		const c = value[i];
		const sc = source[s];

		// Character references must be checked before the direct match:
		// for source "&amp;" the '&' would otherwise consume the reference's
		// own ampersand and derail the rest of the alignment.
		if (sc === "&") {
			const semi = source.indexOf(";", s + 1);
			if (semi !== -1 && semi < sourceEnd && semi - s <= MAX_REFERENCE_LENGTH) {
				const decoded = decodeCharacterReference(source.slice(s + 1, semi));
				if (decoded !== null && value.startsWith(decoded, i)) {
					for (let k = 0; k < decoded.length; k++) {
						starts[i + k] = s;
						ends[i + k] = semi + 1;
					}
					s = semi + 1;
					i += decoded.length;
					continue;
				}
			}
		}
		if (sc === c) {
			starts[i] = s;
			ends[i] = s + 1;
			s += 1;
			i += 1;
			continue;
		}
		if (sc === "\\" && s + 1 < sourceEnd && source[s + 1] === c) {
			starts[i] = s + 1;
			ends[i] = s + 2;
			s += 2;
			i += 1;
			continue;
		}
		if (sc === "\r" && c === "\n" && source[s + 1] === "\n") {
			starts[i] = s;
			ends[i] = s + 2;
			s += 2;
			i += 1;
			continue;
		}
		if (sc === ">" && isBlockquoteMarker(source, s)) {
			s += 1;
			continue;
		}
		// Source-only whitespace (soft-wrap indentation, trailing spaces).
		if (sc === " " || sc === "\t" || sc === "\n" || sc === "\r") {
			s += 1;
			continue;
		}
		return null;
	}

	return { starts, ends };
}

/**
 * Build the plain-text projection of markdown source.
 */
export function projectMarkdown(source: string): MarkdownProjection {
	const tree = parser.parse(source) as Root;
	const text: string[] = [];
	const map: number[] = [];
	const endMap: number[] = [];

	const appendChar = (char: string, startOffset: number, endOffset: number) => {
		text.push(char);
		map.push(startOffset);
		endMap.push(endOffset);
	};

	const appendValue = (value: string, offsets: AlignedOffsets) => {
		for (let i = 0; i < value.length; i++) {
			appendChar(value[i], offsets.starts[i], offsets.ends[i]);
		}
	};

	const appendUnmapped = (value: string) => {
		for (let i = 0; i < value.length; i++) {
			appendChar(value[i], UNMAPPED, UNMAPPED);
		}
	};

	const appendSeparator = (offset: number) => {
		if (text.length > 0 && text[text.length - 1] !== "\n") {
			appendChar("\n", offset, offset + 1);
		}
	};

	const visit = (node: MdastNode) => {
		if (SKIPPED_TYPES.has(node.type)) return;

		const start = node.position?.start.offset;
		const end = node.position?.end.offset;

		if (BLOCK_TYPES.has(node.type) && start != null) {
			appendSeparator(start);
		}

		if (hasValue(node) && start != null && end != null) {
			if (node.type === "break") {
				appendChar("\n", start, start + 1);
				return;
			}
			const value = node.value;
			if (node.type === "text") {
				const aligned = alignValueToSource(source, start, end, value);
				if (aligned) {
					appendValue(value, aligned);
				} else {
					appendUnmapped(value);
				}
				return;
			}
			if (node.type === "inlineCode" || node.type === "code") {
				const slice = source.slice(start, end);
				const valueIndex = slice.indexOf(value);
				if (valueIndex !== -1) {
					const base = start + valueIndex;
					const starts = new Array<number>(value.length);
					const ends = new Array<number>(value.length);
					for (let i = 0; i < value.length; i++) {
						starts[i] = base + i;
						ends[i] = base + i + 1;
					}
					appendValue(value, { starts, ends });
				} else {
					appendUnmapped(value);
				}
				return;
			}
			appendUnmapped(value);
			return;
		}

		if (node.type === "break" && start != null) {
			appendChar("\n", start, start + 1);
			return;
		}

		if (isParent(node)) {
			for (const child of node.children) {
				visit(child);
			}
		}

		if (BLOCK_TYPES.has(node.type) && end != null) {
			appendSeparator(end);
		}
	};

	visit(tree);

	return { text: text.join(""), map, endMap };
}

interface CompactText {
	readonly chars: string;
	readonly indices: readonly number[];
}

const WHITESPACE_RE = /\s/;

function compact(input: string): CompactText {
	const chars: string[] = [];
	const indices: number[] = [];
	for (let i = 0; i < input.length; i++) {
		if (!WHITESPACE_RE.test(input[i])) {
			chars.push(input[i]);
			indices.push(i);
		}
	}
	return { chars: chars.join(""), indices };
}

const MAX_CANDIDATES = 50;

/** Minimum adjacent context characters required to claim occurrence identity. */
const MIN_CONTEXT_SCORE = 10;

/**
 * Locate rendered text within a projection, ignoring whitespace on both
 * sides (renderers join blocks and wrap lines differently than the
 * projection). Candidates are scored by surviving adjacent context, and a
 * minimum score is required whenever the anchor carries context: a lone
 * occurrence with a foreign neighborhood is a duplicate of deleted text,
 * not the annotated occurrence. Returns projection.text indices.
 */
function findInProjection(
	projection: MarkdownProjection,
	needle: string,
	contextBefore: string,
	contextAfter: string,
): { readonly start: number; readonly end: number } | null {
	const haystack = compact(projection.text);
	const target = compact(needle);
	if (target.chars.length === 0) return null;

	const candidates: number[] = [];
	let from = 0;
	while (candidates.length < MAX_CANDIDATES) {
		const at = haystack.chars.indexOf(target.chars, from);
		if (at === -1) break;
		candidates.push(at);
		from = at + 1;
	}
	if (candidates.length === 0) return null;

	const span = (candidate: number) => ({
		start: haystack.indices[candidate],
		end: haystack.indices[candidate + target.chars.length - 1] + 1,
	});

	const before = compact(contextBefore).chars;
	const after = compact(contextAfter).chars;
	const contextLength = before.length + after.length;

	// Anchors without context (block-spanning selections in small documents)
	// can only claim an unambiguous occurrence.
	if (contextLength === 0) {
		return candidates.length === 1 ? span(candidates[0]) : null;
	}

	const requiredScore = Math.min(MIN_CONTEXT_SCORE, contextLength);
	let best = -1;
	let bestScore = requiredScore - 1;
	for (const candidate of candidates) {
		let score = 0;
		let i = before.length - 1;
		let j = candidate - 1;
		while (i >= 0 && j >= 0 && before[i] === haystack.chars[j]) {
			score += 1;
			i -= 1;
			j -= 1;
		}
		const candidateEnd = candidate + target.chars.length;
		let k = 0;
		while (
			k < after.length &&
			candidateEnd + k < haystack.chars.length &&
			after[k] === haystack.chars[candidateEnd + k]
		) {
			score += 1;
			k += 1;
		}
		if (score > bestScore) {
			bestScore = score;
			best = candidate;
		}
	}
	if (best === -1) return null;

	return span(best);
}

const SOURCE_CONTEXT_LENGTH = 50;

/** Build a SourceAnchor for the given source slice, capturing its contexts. */
export function makeSourceAnchor(
	source: string,
	start: number,
	end: number,
): SourceAnchor {
	return {
		start,
		end,
		text: source.slice(start, end),
		contextBefore: source.slice(
			Math.max(0, start - SOURCE_CONTEXT_LENGTH),
			start,
		),
		contextAfter: source.slice(
			end,
			Math.min(source.length, end + SOURCE_CONTEXT_LENGTH),
		),
	};
}

/**
 * Resolve a rendered-text selection anchor to source coordinates.
 * Returns null when the selection cannot be located (content changed, the
 * anchor carries non-content text such as legacy line-number captures, or
 * the selection covers characters with no exact source mapping).
 */
export function resolveSourceAnchor(
	anchor: TextSelectionAnchor,
	source: string,
	projection: MarkdownProjection = projectMarkdown(source),
): SourceAnchor | null {
	const found = findInProjection(
		projection,
		anchor.selectedText,
		anchor.contextBefore,
		anchor.contextAfter,
	);
	if (!found) return null;

	for (let i = found.start; i < found.end; i++) {
		if (projection.map[i] === UNMAPPED) return null;
	}

	const start = projection.map[found.start];
	const end = projection.endMap[found.end - 1];
	if (start == null || end == null || end <= start || end > source.length) {
		return null;
	}

	return makeSourceAnchor(source, start, end);
}

/**
 * Locate a stored source anchor in (possibly edited) content, preserving
 * occurrence identity. Exact coordinates are checked first; otherwise every
 * occurrence of the stored text is scored by how much of the stored source
 * context survives around it. When no occurrence retains any context — the
 * annotated occurrence was deleted while identical text survives elsewhere —
 * the anchor is reported missing rather than redirected to a duplicate.
 */
export function locateSourceAnchor(
	anchor: SourceAnchor,
	content: string,
): { readonly start: number; readonly end: number } | null {
	if (
		anchor.text.length > 0 &&
		content.slice(anchor.start, anchor.end) === anchor.text
	) {
		return { start: anchor.start, end: anchor.end };
	}
	if (anchor.text.length === 0) return null;

	const candidates: number[] = [];
	let from = 0;
	while (candidates.length < MAX_CANDIDATES) {
		const at = content.indexOf(anchor.text, from);
		if (at === -1) break;
		candidates.push(at);
		from = at + 1;
	}
	if (candidates.length === 0) return null;

	// Anchors at document boundaries can legitimately carry no context;
	// accept only an unambiguous occurrence in that case.
	const contextLength =
		anchor.contextBefore.length + anchor.contextAfter.length;
	if (contextLength === 0) {
		return candidates.length === 1
			? { start: candidates[0], end: candidates[0] + anchor.text.length }
			: null;
	}

	// Coincidental adjacency (a shared space or letter) must not count as
	// identity: demand a meaningful run of surviving context. A foreign
	// duplicate rarely reproduces 10 adjacent characters; a true occurrence
	// after nearby edits usually keeps far more. Rejection here is safe —
	// callers fall back to whitespace-insensitive rendered-text resolution.
	const requiredScore = Math.min(MIN_CONTEXT_SCORE, contextLength);

	let best = -1;
	let bestScore = requiredScore - 1;
	for (const candidate of candidates) {
		let score = 0;
		let i = anchor.contextBefore.length - 1;
		let j = candidate - 1;
		while (i >= 0 && j >= 0 && anchor.contextBefore[i] === content[j]) {
			score += 1;
			i -= 1;
			j -= 1;
		}
		const candidateEnd = candidate + anchor.text.length;
		let k = 0;
		while (
			k < anchor.contextAfter.length &&
			candidateEnd + k < content.length &&
			anchor.contextAfter[k] === content[candidateEnd + k]
		) {
			score += 1;
			k += 1;
		}
		if (score > bestScore) {
			bestScore = score;
			best = candidate;
		}
	}
	if (best === -1) return null;
	return { start: best, end: best + anchor.text.length };
}
