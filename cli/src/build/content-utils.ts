/**
 * Shared content utilities for build pipeline transformations.
 * Used by both OpenCode and Codex transformation pipelines.
 */

/**
 * Check if a position in text is inside a code block (```...```).
 */
export const isInCodeBlock = (text: string, position: number): boolean => {
	const textBefore = text.slice(0, position);
	const delimiterCount = (textBefore.match(/```/g) || []).length;
	return delimiterCount % 2 === 1;
};

/**
 * Find regex matches that are NOT inside code blocks.
 */
export const findMatchesOutsideCodeBlocks = (
	pattern: RegExp,
	text: string,
): RegExpMatchArray[] => {
	const matches: RegExpMatchArray[] = [];
	let match: RegExpExecArray | null;
	const regex = new RegExp(
		pattern.source,
		pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`,
	);

	while ((match = regex.exec(text)) !== null) {
		if (!isInCodeBlock(text, match.index)) {
			matches.push(match);
		}
	}

	return matches;
};
