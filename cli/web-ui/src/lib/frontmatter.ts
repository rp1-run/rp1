const FRONTMATTER_RE = /^---\r?\n[\s\S]*?\r?\n---\r?\n/;

export function stripFrontmatter(markdown: string): {
	body: string;
	frontmatter: string;
} {
	const match = markdown.match(FRONTMATTER_RE);
	if (!match) return { body: markdown, frontmatter: "" };
	return { body: markdown.slice(match[0].length), frontmatter: match[0] };
}

export function restoreFrontmatter(frontmatter: string, body: string): string {
	return frontmatter + body;
}

export function frontmatterLineCount(frontmatter: string): number {
	if (!frontmatter) return 0;
	return frontmatter.split(/\r?\n/).length - 1;
}
