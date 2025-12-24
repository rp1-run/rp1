/**
 * Mermaid block extraction from markdown documents.
 * Extracts fenced mermaid code blocks while preserving line number offsets
 * for accurate error mapping back to the source document.
 */

import * as E from "fp-ts/lib/Either.js";
import type { DiagramBlock } from "./models.js";

/**
 * Regex to match mermaid fenced code blocks.
 * Captures content between ```mermaid and closing ```.
 * Uses non-greedy matching to handle multiple blocks correctly.
 */
const MERMAID_BLOCK_REGEX = /```mermaid\r?\n([\s\S]*?)```/g;

/**
 * Known Mermaid diagram type declarations.
 * Used for detecting raw mermaid input (no markdown fences).
 */
const MERMAID_TYPE_PATTERNS: readonly RegExp[] = [
	/^graph\s/i,
	/^flowchart\s/i,
	/^sequenceDiagram/i,
	/^classDiagram/i,
	/^stateDiagram/i,
	/^erDiagram/i,
	/^gantt/i,
	/^pie/i,
	/^mindmap/i,
	/^timeline/i,
	/^journey/i,
	/^gitGraph/i,
	/^C4Context/i,
	/^C4Container/i,
	/^C4Component/i,
	/^C4Dynamic/i,
	/^C4Deployment/i,
	/^quadrantChart/i,
	/^requirementDiagram/i,
	/^sankey/i,
	/^xychart/i,
	/^block-beta/i,
	/^packet-beta/i,
	/^architecture-beta/i,
	/^kanban/i,
	/^zenuml/i,
];

/**
 * Check if content is raw mermaid (no markdown fences).
 * Detects common mermaid diagram type declarations at the start of content.
 */
export const isRawMermaid = (content: string): boolean => {
	const trimmed = content.trim();
	return MERMAID_TYPE_PATTERNS.some((regex) => regex.test(trimmed));
};

/**
 * Count newlines in a string to calculate line offset.
 */
const countLines = (text: string): number => {
	let count = 0;
	for (const char of text) {
		if (char === "\n") {
			count++;
		}
	}
	return count;
};

/**
 * Extract mermaid blocks from markdown content.
 * Returns an array of DiagramBlock with preserved line number offsets.
 *
 * Handles two input types:
 * 1. Raw mermaid: If no fenced blocks found and content starts with mermaid type,
 *    treats entire content as single diagram
 * 2. Markdown: Extracts all ```mermaid fenced code blocks
 */
export const extractMermaidBlocks = (
	content: string,
): E.Either<Error, readonly DiagramBlock[]> => {
	try {
		// Check if this is raw mermaid (not markdown with fences)
		const hasFencedBlocks = content.includes("```mermaid");

		if (!hasFencedBlocks && isRawMermaid(content)) {
			const trimmedContent = content.trim();
			const lineCount = countLines(trimmedContent);
			return E.right([
				{
					index: 0,
					content: trimmedContent,
					startLine: 1,
					endLine: 1 + lineCount,
				},
			]);
		}

		const blocks: DiagramBlock[] = [];
		let match: RegExpExecArray | null;
		let blockIndex = 0;

		// Reset regex state for fresh matching
		MERMAID_BLOCK_REGEX.lastIndex = 0;

		while ((match = MERMAID_BLOCK_REGEX.exec(content)) !== null) {
			const blockContent = match[1];
			const startOffset = match.index;

			// Calculate start line from character offset
			// Add 1 because the content starts after the ```mermaid\n line
			const textBefore = content.slice(0, startOffset);
			const startLine = countLines(textBefore) + 2; // +1 for 1-indexed, +1 for line after ```mermaid

			// Calculate end line
			const contentLineCount = countLines(blockContent);
			const endLine = startLine + contentLineCount;

			blocks.push({
				index: blockIndex++,
				content: blockContent.trim(),
				startLine,
				endLine,
			});
		}

		return E.right(blocks);
	} catch (error) {
		return E.left(error instanceof Error ? error : new Error(String(error)));
	}
};
