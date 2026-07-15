/**
 * Classify an artifact path as an HTML artifact so the viewer can route it to
 * the sandboxed renderer instead of the syntax-highlighted source view.
 * Returns true only for paths ending in `.html`/`.htm` (case-insensitive).
 */
export function isHtmlArtifact(path: string): boolean {
	const lower = path.toLowerCase();
	return lower.endsWith(".html") || lower.endsWith(".htm");
}
