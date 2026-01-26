import GithubSlugger from "github-slugger";
import { useMemo } from "react";

export interface HeadingEntry {
	readonly id: string;
	readonly text: string;
	readonly level: 1 | 2 | 3 | 4 | 5 | 6;
}

const HEADING_REGEX = /^(#{1,6})\s+(.+)$/gm;

/**
 * Extract h1-h6 headings from markdown content.
 * IDs are generated using github-slugger to match rehype-slug output.
 * Duplicate headings get suffixed IDs (heading, heading-1, heading-2).
 */
export function useHeadingExtraction(content: string): readonly HeadingEntry[] {
	return useMemo(() => extractHeadings(content), [content]);
}

/**
 * Pure function to extract headings from markdown content.
 * Exported for testing and reuse outside React context.
 */
export function extractHeadings(content: string): readonly HeadingEntry[] {
	if (!content) {
		return [];
	}

	const slugger = new GithubSlugger();
	const headings: HeadingEntry[] = [];

	let match: RegExpExecArray | null;
	while ((match = HEADING_REGEX.exec(content)) !== null) {
		const hashes = match[1];
		const text = match[2].trim();
		const level = hashes.length as 1 | 2 | 3 | 4 | 5 | 6;

		if (level >= 1 && level <= 6 && text) {
			headings.push({
				id: slugger.slug(text),
				text,
				level,
			});
		}
	}

	return headings;
}
