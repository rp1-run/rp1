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
 * Render a registered HTML artifact as a live, interactive page inside an
 * isolated iframe. Content is fed via `srcDoc` (already fetched by the viewer),
 * so no network or origin is shared with the host. The frame fills the viewer
 * pane and scrolls its own content internally.
 */
export function SandboxedHtmlArtifact({
	content,
	title,
}: SandboxedHtmlArtifactProps) {
	return (
		<iframe
			title={title}
			srcDoc={content}
			sandbox={HTML_ARTIFACT_SANDBOX}
			className="rp1-html-artifact-frame h-full w-full flex-1 min-h-0 border-0 bg-white"
		/>
	);
}
