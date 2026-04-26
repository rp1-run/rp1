export interface HiddenMarkdownHtmlComment {
	readonly text: string;
	readonly offset: number;
	readonly index: number;
}

const FENCE_RE = /^ {0,3}(`{3,}|~{3,})/;

export function stripMarkdownHtmlComments(markdown: string): {
	readonly body: string;
	readonly comments: readonly HiddenMarkdownHtmlComment[];
} {
	const htmlCommentRe = /<!--[\s\S]*?-->/g;
	const fenceRanges = findFenceRanges(markdown);
	const comments: HiddenMarkdownHtmlComment[] = [];
	let body = "";
	let cursor = 0;
	let visibleOffset = 0;
	let commentIndex = 0;
	let fenceIndex = 0;

	let match: RegExpExecArray | null;
	while ((match = htmlCommentRe.exec(markdown)) !== null) {
		const start = match.index;
		const end = start + match[0].length;

		while (
			fenceIndex < fenceRanges.length &&
			fenceRanges[fenceIndex].end <= start
		) {
			fenceIndex += 1;
		}

		if (
			fenceIndex < fenceRanges.length &&
			rangesOverlap(start, end, fenceRanges[fenceIndex])
		) {
			continue;
		}

		const visibleSegment = markdown.slice(cursor, start);
		body += visibleSegment;
		visibleOffset += visibleSegment.length;
		comments.push({
			text: match[0],
			offset: visibleOffset,
			index: commentIndex,
		});
		commentIndex += 1;
		cursor = end;
	}

	body += markdown.slice(cursor);
	return { body, comments };
}

export function restoreMarkdownHtmlComments(
	comments: readonly HiddenMarkdownHtmlComment[],
	body: string,
): string {
	if (comments.length === 0) return body;

	let restored = "";
	let cursor = 0;
	const orderedComments = [...comments].sort(
		(a, b) => a.offset - b.offset || a.index - b.index,
	);

	for (const comment of orderedComments) {
		const offset = Math.max(cursor, Math.min(comment.offset, body.length));
		restored += body.slice(cursor, offset);
		restored += comment.text;
		cursor = offset;
	}

	return restored + body.slice(cursor);
}

function findFenceRanges(markdown: string): Array<{
	readonly start: number;
	readonly end: number;
}> {
	const ranges: Array<{ readonly start: number; readonly end: number }> = [];
	let lineStart = 0;
	let fence: {
		readonly marker: "`" | "~";
		readonly length: number;
		readonly start: number;
	} | null = null;

	while (lineStart < markdown.length) {
		const newlineIndex = markdown.indexOf("\n", lineStart);
		const lineEnd = newlineIndex === -1 ? markdown.length : newlineIndex + 1;
		const line = markdown.slice(lineStart, lineEnd);
		const match = line.match(FENCE_RE);

		if (match) {
			const marker = match[1][0] as "`" | "~";
			const length = match[1].length;
			if (!fence) {
				fence = { marker, length, start: lineStart };
			} else if (fence.marker === marker && length >= fence.length) {
				ranges.push({ start: fence.start, end: lineEnd });
				fence = null;
			}
		}

		lineStart = lineEnd;
	}

	if (fence) {
		ranges.push({ start: fence.start, end: markdown.length });
	}

	return ranges;
}

function rangesOverlap(
	start: number,
	end: number,
	range: { readonly start: number; readonly end: number },
): boolean {
	return start < range.end && end > range.start;
}
