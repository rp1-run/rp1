import { useMemo } from "react";

/**
 * Sandbox tokens for HTML artifact rendering. Intentionally `allow-scripts`
 * only: omitting `allow-same-origin` yields an opaque origin so the artifact
 * cannot reach Arcade's DOM, storage, cookies, or top-level navigation. Adding
 * `allow-same-origin` here would defeat the isolation boundary (see design D2).
 */
const HTML_ARTIFACT_SANDBOX = "allow-scripts";

interface SandboxedHtmlArtifactProps {
	readonly content: string;
	readonly title: string;
}

/**
 * A cheap 32-bit signature of the content. Used as the iframe's React `key` so
 * the element is REMOUNTED whenever the content changes. A browser does not
 * reliably reload an `<iframe>` when its `srcDoc` is mutated on an existing
 * element; if the viewer ever updates `content` on a persisted iframe (e.g. the
 * fetched content for a newly selected artifact replaces the previous one on
 * the same element during a tab-switch), the iframe keeps displaying its FIRST
 * document — the "wrong tab / stale content" leak. Keying by content forces a
 * fresh element per distinct document, so the rendered page always matches
 * `srcDoc`. Memoized so the hash runs only when content actually changes.
 */
function useContentKey(content: string): string {
	return useMemo(() => {
		let hash = 0;
		for (let i = 0; i < content.length; i++) {
			hash = (hash * 31 + content.charCodeAt(i)) | 0;
		}
		return `${content.length}:${hash}`;
	}, [content]);
}

/**
 * Render a registered HTML artifact as a live, interactive page inside an
 * isolated iframe. Content is fed via `srcDoc` (already fetched by the viewer),
 * so no network or origin is shared with the host. The frame fills the viewer
 * pane and scrolls its own content internally.
 */
export function SandboxedHtmlArtifact({
	content,
	title,
}: SandboxedHtmlArtifactProps) {
	const contentKey = useContentKey(content);
	return (
		<iframe
			key={contentKey}
			title={title}
			srcDoc={content}
			sandbox={HTML_ARTIFACT_SANDBOX}
			className="rp1-html-artifact-frame absolute inset-0 h-full w-full border-0 bg-white"
		/>
	);
}
