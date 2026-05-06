import { AlertCircle, Loader2 } from "lucide-react";
import {
	type SaveStatus,
	UnifiedContentRenderer,
} from "@/components/v2/UnifiedContentRenderer";
import { WalkthroughRevealReader } from "@/components/v2/WalkthroughRevealReader";
import type { HeadingEntry } from "@/hooks/useHeadingExtraction";
import type { WalkthroughDeck } from "@/lib/walkthrough-slide-source";

export type ArtifactContentMode = "slides" | "markdown";

export interface ContentPanelProps {
	readonly content: string | null;
	readonly path: string | null;
	readonly isLoading: boolean;
	readonly error: string | null;
	readonly emptyMessage?: string;
	readonly frontmatter?: Record<string, unknown>;
	readonly showFrontmatter?: boolean;
	readonly isRefreshing?: boolean;
	readonly onHeadingsExtracted?: (headings: HeadingEntry[]) => void;
	readonly onSaveStatusChange?: (status: SaveStatus) => void;
	readonly runId?: string;
	readonly docId?: string;
	readonly projectId?: string;
	readonly filePath?: string;
	readonly enableAnnotations?: boolean;
	readonly contentMode?: ArtifactContentMode;
	readonly walkthroughDeck?: WalkthroughDeck | null;
	readonly walkthroughFallbackMessage?: string | null;
	readonly onContentModeChange?: (mode: ArtifactContentMode) => void;
	readonly onWalkthroughRenderFailure?: (message: string) => void;
	readonly scrollViewportRef?: React.RefObject<HTMLDivElement>;
}

export function ContentPanel({
	content,
	path,
	isLoading,
	error,
	emptyMessage = "No content to display.",
	frontmatter,
	showFrontmatter = false,
	isRefreshing,
	onHeadingsExtracted,
	runId,
	docId,
	projectId,
	filePath,
	enableAnnotations = true,
	contentMode = "markdown",
	walkthroughDeck = null,
	walkthroughFallbackMessage = null,
	onContentModeChange,
	onWalkthroughRenderFailure,
	onSaveStatusChange,
}: ContentPanelProps) {
	const slideDeck = contentMode === "slides" && path ? walkthroughDeck : null;

	return (
		<div
			className={
				slideDeck
					? "h-full min-h-[680px] max-w-full min-w-0 p-4"
					: "artifact-viewer-content max-w-full min-w-0 break-words px-4 md:px-[40px]"
			}
			style={
				slideDeck
					? undefined
					: {
							paddingTop: "16px",
							paddingBottom: "40px",
							fontSize: "14px",
							lineHeight: "1.7",
							fontFamily: "var(--font-mono, 'Commit Mono', monospace)",
							overflowWrap: "break-word",
							wordBreak: "break-word",
						}
			}
		>
			{isLoading ? (
				<div className="flex items-center justify-center py-16">
					<Loader2 className="h-4 w-4 animate-spin text-fg-ghost" />
				</div>
			) : error ? (
				<div className="flex flex-col items-center justify-center py-16">
					<p className="type-secondary text-failure">Failed to load artifact</p>
					<p className="mt-2 type-secondary text-fg-ghost">{error}</p>
				</div>
			) : content !== null && path ? (
				slideDeck ? (
					<WalkthroughRevealReader
						deck={slideDeck}
						path={path}
						onMarkdownModeRequested={() => onContentModeChange?.("markdown")}
						onRenderFailure={onWalkthroughRenderFailure}
					/>
				) : (
					<>
						<WalkthroughFallbackNotice message={walkthroughFallbackMessage} />
						<UnifiedContentRenderer
							content={content}
							path={path}
							frontmatter={frontmatter}
							showFrontmatter={showFrontmatter}
							isRefreshing={isRefreshing}
							onHeadingsExtracted={onHeadingsExtracted}
							onSaveStatusChange={onSaveStatusChange}
							runId={runId}
							docId={docId}
							projectId={projectId}
							filePath={filePath}
							enableAnnotations={enableAnnotations}
						/>
					</>
				)
			) : (
				<div className="flex items-center justify-center py-16">
					<span className="text-fg-ghost">{emptyMessage}</span>
				</div>
			)}
		</div>
	);
}

export function WalkthroughFallbackNotice({
	message,
}: {
	readonly message: string | null;
}) {
	if (!message) return null;

	return (
		<div className="mb-4 flex gap-2 rounded border border-border bg-surface px-3 py-2 type-secondary text-fg-muted">
			<AlertCircle
				className="mt-0.5 h-3.5 w-3.5 shrink-0 text-fg-ghost"
				aria-hidden="true"
			/>
			<p>{message}</p>
		</div>
	);
}
