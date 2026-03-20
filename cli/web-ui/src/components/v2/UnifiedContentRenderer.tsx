import { AlertCircle, Check, FileText, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { MarkdownViewer } from "@/components/MarkdownViewer";
import { MilkdownEditor } from "@/components/MilkdownEditor/MilkdownEditor";
import { useEditAnnotations } from "@/hooks/useEditAnnotations";
import type { HeadingEntry } from "@/hooks/useHeadingExtraction";
import { getCodeLanguageFromPath } from "@/lib/code-language";
import type { LineDiffEntry } from "@/lib/diff-engine";

type SaveStatus = "idle" | "saving" | "saved" | "error";

const SAVE_DEBOUNCE_MS = 1000;
const SAVE_INDICATOR_DURATION_MS = 2000;

interface UnifiedContentRendererProps {
	readonly content: string;
	readonly path: string;
	readonly frontmatter?: Record<string, unknown>;
	readonly isRefreshing?: boolean;
	readonly enableAnnotations?: boolean;
	readonly onHeadingsExtracted?: (headings: HeadingEntry[]) => void;
	readonly runId?: string;
	readonly docId?: string;
}

function SaveStatusIndicator({ status }: { readonly status: SaveStatus }) {
	if (status === "idle") return null;

	return (
		<div className="flex items-center gap-1 text-fg-ghost type-secondary transition-opacity duration-300">
			{status === "saving" && <span>Saving...</span>}
			{status === "saved" && (
				<>
					<Check className="h-3 w-3" />
					<span>Saved</span>
				</>
			)}
			{status === "error" && (
				<span className="text-failure flex items-center gap-1">
					<AlertCircle className="h-3 w-3" />
					Save failed
				</span>
			)}
		</div>
	);
}

function MarkdownEditorWithSave({
	content,
	path,
	runId,
	docId,
	enableAnnotations,
}: {
	readonly content: string;
	readonly path: string;
	readonly runId?: string;
	readonly docId?: string;
	readonly enableAnnotations?: boolean;
}) {
	const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
	const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const indicatorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const baselineHashRef = useRef<string>("");

	const { handleDiffUpdate } = useEditAnnotations({
		docId,
		runId,
		artifactPath: path,
	});

	useEffect(() => {
		async function computeHash() {
			const encoder = new TextEncoder();
			const data = encoder.encode(content);
			const hashBuffer = await crypto.subtle.digest("SHA-256", data);
			const hashArray = Array.from(new Uint8Array(hashBuffer));
			baselineHashRef.current = hashArray
				.map((b) => b.toString(16).padStart(2, "0"))
				.join("");
		}
		computeHash();
	}, [content]);

	const onDiffUpdate = useCallback(
		(diffs: LineDiffEntry[]) => {
			if (!enableAnnotations) return;
			handleDiffUpdate(diffs, baselineHashRef.current);
		},
		[enableAnnotations, handleDiffUpdate],
	);

	const onContentChange = useCallback(
		(markdown: string) => {
			if (!runId) return;

			if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
			if (indicatorTimerRef.current) clearTimeout(indicatorTimerRef.current);

			saveTimerRef.current = setTimeout(async () => {
				setSaveStatus("saving");
				try {
					const response = await fetch(`/api/v2/runs/${runId}/artifacts/save`, {
						method: "PUT",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({ path, content: markdown }),
					});
					if (!response.ok) {
						setSaveStatus("error");
					} else {
						setSaveStatus("saved");
					}
				} catch {
					setSaveStatus("error");
				}

				indicatorTimerRef.current = setTimeout(() => {
					setSaveStatus("idle");
				}, SAVE_INDICATOR_DURATION_MS);
			}, SAVE_DEBOUNCE_MS);
		},
		[runId, path],
	);

	useEffect(() => {
		return () => {
			if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
			if (indicatorTimerRef.current) clearTimeout(indicatorTimerRef.current);
		};
	}, []);

	return (
		<div className="relative">
			<div className="absolute top-0 right-0 z-10 px-2 py-1">
				<SaveStatusIndicator status={saveStatus} />
			</div>
			<MilkdownEditor
				content={content}
				artifactPath={path}
				docId={docId}
				runId={runId}
				enableAnnotations={enableAnnotations}
				onContentChange={onContentChange}
				onDiffUpdate={onDiffUpdate}
			/>
		</div>
	);
}

export function UnifiedContentRenderer({
	content,
	path,
	frontmatter: _frontmatter,
	isRefreshing,
	enableAnnotations,
	onHeadingsExtracted: _onHeadingsExtracted,
	runId,
	docId,
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
				<MarkdownEditorWithSave
					content={content}
					path={path}
					runId={runId}
					docId={docId}
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

	const wrappedContent = `\`\`\`${codeLanguage}\n${content}\n\`\`\``;

	return (
		<div className="relative">
			{refreshingOverlay}
			<MarkdownViewer
				content={wrappedContent}
				path={path}
				showFrontmatter={false}
				enableAnnotations={enableAnnotations}
			/>
		</div>
	);
}
