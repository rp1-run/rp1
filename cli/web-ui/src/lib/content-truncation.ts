export const TRUNCATION_LINES = 3;
export const TRUNCATION_CHARS = 200;

export function needsTruncation(content: string): boolean {
	const lineCount = content.split("\n").length;
	return lineCount > TRUNCATION_LINES || content.length > TRUNCATION_CHARS;
}

export function truncateContent(content: string): string {
	const lines = content.split("\n");
	if (lines.length > TRUNCATION_LINES) {
		return `${lines.slice(0, TRUNCATION_LINES).join("\n")}\u2026`;
	}
	if (content.length > TRUNCATION_CHARS) {
		return `${content.slice(0, TRUNCATION_CHARS)}\u2026`;
	}
	return content;
}
