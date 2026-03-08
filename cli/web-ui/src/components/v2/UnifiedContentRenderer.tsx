import { FileText, RefreshCw } from "lucide-react";
import { MarkdownViewer } from "@/components/MarkdownViewer";
import { CodeBlock } from "@/components/MarkdownViewer/CodeBlock";
import type { HeadingEntry } from "@/hooks/useHeadingExtraction";
import { getCodeLanguageFromPath } from "@/lib/code-language";

interface UnifiedContentRendererProps {
	readonly content: string;
	readonly path: string;
	readonly frontmatter?: Record<string, unknown>;
	readonly isRefreshing?: boolean;
	readonly enableAnnotations?: boolean;
	readonly onHeadingsExtracted?: (headings: HeadingEntry[]) => void;
}

export function UnifiedContentRenderer({
	content,
	path,
	frontmatter,
	isRefreshing,
	enableAnnotations,
	onHeadingsExtracted,
}: UnifiedContentRendererProps) {
	const refreshingOverlay = isRefreshing ? (
		<div className="absolute top-0 right-0 flex items-center gap-1.5 px-2 py-1 text-xs text-muted-foreground bg-background/80 backdrop-blur-sm rounded-bl border-l border-b z-10">
			<RefreshCw className="h-3 w-3 animate-spin" />
			<span>Refreshing...</span>
		</div>
	) : null;

	const codeLanguage = getCodeLanguageFromPath(path);

	if (!codeLanguage) {
		return (
			<div className="relative">
				{refreshingOverlay}
				<MarkdownViewer
					content={content}
					path={path}
					frontmatter={frontmatter}
					showFrontmatter={false}
					onHeadingsExtracted={onHeadingsExtracted}
					enableAnnotations={enableAnnotations}
				/>
			</div>
		);
	}

	if (codeLanguage === "text") {
		return (
			<div className="relative">
				{refreshingOverlay}
				<div className="rounded-lg border bg-muted/50 p-4">
					<div className="flex items-center gap-2 text-xs text-muted-foreground mb-3 pb-2 border-b">
						<FileText className="h-3.5 w-3.5" />
						<span>{path}</span>
					</div>
					<pre className="text-sm overflow-x-auto whitespace-pre-wrap">
						<code>{content}</code>
					</pre>
				</div>
			</div>
		);
	}

	return (
		<div className="relative">
			{refreshingOverlay}
			<CodeBlock
				code={content}
				language={codeLanguage}
				artifactPath={path}
				enableAnnotations={enableAnnotations}
			/>
		</div>
	);
}
