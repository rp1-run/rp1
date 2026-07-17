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
	/** map[i] = offset in the source of the character projection.text[i]. */
	readonly map: readonly number[];
}

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

/**
 * Map each character of a text node's decoded value onto source offsets.
 * Handles backslash escapes and CRLF; skips stray source whitespace (soft
 * wrap indentation). Returns null when the value cannot be aligned (e.g.
 * character references or blockquote prefixes) — callers fall back to a
 * coarse in-range mapping, which keeps stored slices verbatim at slightly
 * reduced boundary precision.
 */
function alignValueToSource(
	source: string,
	sourceStart: number,
	sourceEnd: number,
	value: string,
): number[] | null {
	const offsets = new Array<number>(value.length);
	let s = sourceStart;

	for (let i = 0; i < value.length; i++) {
		const c = value[i];
		while (true) {
			if (s >= sourceEnd) return null;
			const sc = source[s];
			if (sc === c) {
				offsets[i] = s;
				s += 1;
				break;
			}
			if (sc === "\\" && s + 1 < sourceEnd && source[s + 1] === c) {
				offsets[i] = s + 1;
				s += 2;
				break;
			}
			if (sc === "\r" && c === "\n" && source[s + 1] === "\n") {
				offsets[i] = s;
				s += 2;
				break;
			}
			// Source-only whitespace (soft-wrap indentation, trailing spaces).
			if (sc === " " || sc === "\t" || sc === "\n" || sc === "\r") {
				s += 1;
				continue;
			}
			return null;
		}
	}

	return offsets;
}

function coarseOffsets(
	sourceStart: number,
	sourceEnd: number,
	length: number,
): number[] {
	const offsets = new Array<number>(length);
	const span = Math.max(1, sourceEnd - sourceStart);
	for (let i = 0; i < length; i++) {
		offsets[i] = sourceStart + Math.min(span - 1, i);
	}
	return offsets;
}

/**
 * Build the plain-text projection of markdown source.
 */
export function projectMarkdown(source: string): MarkdownProjection {
	const tree = parser.parse(source) as Root;
	const text: string[] = [];
	const map: number[] = [];

	const appendChar = (char: string, offset: number) => {
		text.push(char);
		map.push(offset);
	};

	const appendValue = (value: string, offsets: number[]) => {
		for (let i = 0; i < value.length; i++) {
			appendChar(value[i], offsets[i]);
		}
	};

	const appendSeparator = (offset: number) => {
		if (text.length > 0 && text[text.length - 1] !== "\n") {
			appendChar("\n", offset);
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
				appendChar("\n", start);
				return;
			}
			const value = node.value;
			if (node.type === "text") {
				const aligned = alignValueToSource(source, start, end, value);
				appendValue(value, aligned ?? coarseOffsets(start, end, value.length));
				return;
			}
			if (node.type === "inlineCode" || node.type === "code") {
				const slice = source.slice(start, end);
				const valueIndex = slice.indexOf(value);
				if (valueIndex !== -1) {
					const base = start + valueIndex;
					const offsets = new Array<number>(value.length);
					for (let i = 0; i < value.length; i++) offsets[i] = base + i;
					appendValue(value, offsets);
				} else {
					appendValue(value, coarseOffsets(start, end, value.length));
				}
				return;
			}
			appendValue(value, coarseOffsets(start, end, value.length));
			return;
		}

		if (node.type === "break" && start != null) {
			appendChar("\n", start);
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

	return { text: text.join(""), map };
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

/**
 * Locate rendered text within a projection, ignoring whitespace on both
 * sides (renderers join blocks and wrap lines differently than the
 * projection). When the needle occurs multiple times, rendered contexts
 * disambiguate by longest adjacent match. Returns projection.text indices.
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

	let best = candidates[0];
	if (candidates.length > 1) {
		const before = compact(contextBefore).chars;
		const after = compact(contextAfter).chars;
		let bestScore = -1;
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
	}

	return {
		start: haystack.indices[best],
		end: haystack.indices[best + target.chars.length - 1] + 1,
	};
}

const SOURCE_CONTEXT_LENGTH = 50;

/**
 * Resolve a rendered-text selection anchor to source coordinates.
 * Returns null when the selection cannot be located (content changed, or
 * the anchor carries non-content text such as legacy line-number captures).
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

	const start = projection.map[found.start];
	const end = projection.map[found.end - 1] + 1;
	if (start == null || end == null || end <= start || end > source.length) {
		return null;
	}

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
