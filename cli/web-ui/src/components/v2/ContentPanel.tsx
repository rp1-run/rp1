import { Loader2 } from "lucide-react";
import {
	type SaveStatus,
	UnifiedContentRenderer,
} from "@/components/v2/UnifiedContentRenderer";
import type { HeadingEntry } from "@/hooks/useHeadingExtraction";

export interface ContentPanelProps {
	readonly content: string | null;
	readonly path: string | null;
	readonly isLoading: boolean;
	readonly error: string | null;
	readonly emptyMessage?: string;
	readonly frontmatter?: Record<string, unknown>;
	readonly isRefreshing?: boolean;
	readonly onHeadingsExtracted?: (headings: HeadingEntry[]) => void;
	readonly onSaveStatusChange?: (status: SaveStatus) => void;
	readonly runId?: string;
	readonly docId?: string;
	readonly projectId?: string;
	readonly filePath?: string;
	readonly enableAnnotations?: boolean;
	readonly scrollViewportRef?: React.RefObject<HTMLDivElement>;
}

export function ContentPanel({
	content,
	path,
	isLoading,
	error,
	emptyMessage = "No content to display.",
	frontmatter,
	isRefreshing,
	onHeadingsExtracted,
	runId,
	docId,
	projectId,
	filePath,
	enableAnnotations = true,
	onSaveStatusChange,
}: ContentPanelProps) {
	return (
		<div
			className="artifact-viewer-content max-w-full overflow-hidden break-words px-4 md:px-[40px]"
			style={{
				paddingTop: "40px",
				paddingBottom: "40px",
				fontSize: "14px",
				lineHeight: "1.7",
				fontFamily: "var(--font-mono, 'Commit Mono', monospace)",
				overflowWrap: "break-word",
				wordBreak: "break-word",
			}}
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
				<UnifiedContentRenderer
					content={content}
					path={path}
					frontmatter={frontmatter}
					isRefreshing={isRefreshing}
					onHeadingsExtracted={onHeadingsExtracted}
					onSaveStatusChange={onSaveStatusChange}
					runId={runId}
					docId={docId}
					projectId={projectId}
					filePath={filePath}
					enableAnnotations={enableAnnotations}
				/>
			) : (
				<div className="flex items-center justify-center py-16">
					<span className="text-fg-ghost">{emptyMessage}</span>
				</div>
			)}
		</div>
	);
}
