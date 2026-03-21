import {
	AlertCircle,
	Check,
	ChevronDown,
	ChevronRight,
	FileText,
	RefreshCw,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MarkdownViewer } from "@/components/MarkdownViewer";
import { AnnotationLayer } from "@/components/MarkdownViewer/MarkdownViewer";
import type { MarkerClickInfo } from "@/components/MilkdownEditor/diff-tracker-plugin";
import {
	MilkdownEditor,
	type MilkdownEditorHandle,
} from "@/components/MilkdownEditor/MilkdownEditor";
import { EditDiffPopover } from "@/components/v2/EditDiffPopover";
import { useEditAnnotations } from "@/hooks/useEditAnnotations";
import type { HeadingEntry } from "@/hooks/useHeadingExtraction";
import { getCodeLanguageFromPath } from "@/lib/code-language";
import type { LineDiffEntry } from "@/lib/diff-engine";
import { useAnnotationContextSafe } from "@/providers/AnnotationProvider";
import type { EditDiffAnchor } from "@/types/annotations";

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

function FrontmatterBlock({ raw }: { readonly raw: string }) {
	const [isExpanded, setIsExpanded] = useState(false);
	const inner = raw.replace(/^---\r?\n/, "").replace(/\r?\n---\r?\n$/, "");

	return (
		<div className="mb-2 rounded border border-border bg-surface-void overflow-hidden">
			<button
				type="button"
				onClick={() => setIsExpanded(!isExpanded)}
				className="flex items-center gap-1.5 w-full px-3 py-1.5 text-left"
			>
				{isExpanded ? (
					<ChevronDown className="h-3 w-3 text-fg-ghost" strokeWidth={1.5} />
				) : (
					<ChevronRight className="h-3 w-3 text-fg-ghost" strokeWidth={1.5} />
				)}
				<span className="type-secondary text-fg-ghost tracking-wider uppercase">
					Frontmatter
				</span>
			</button>
			{isExpanded && (
				<pre className="px-3 pb-2 font-mono text-xs text-fg-ghost leading-relaxed select-text">
					{inner}
				</pre>
			)}
		</div>
	);
}

import { restoreFrontmatter, stripFrontmatter } from "@/lib/frontmatter";

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

	const { body: editorContent, frontmatter } = useMemo(
		() => stripFrontmatter(content),
		[content],
	);
	const editorContainerRef = useRef<HTMLElement>(null);
	const gutterRef = useRef<HTMLDivElement>(null);
	const editorRef = useRef<MilkdownEditorHandle>(null);

	const { handleDiffUpdate } = useEditAnnotations({
		docId,
		runId,
		artifactPath: path,
	});

	const { getAnnotationsForArtifact } = useAnnotationContextSafe();

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

	const [activeMarker, setActiveMarker] = useState<MarkerClickInfo | null>(
		null,
	);

	const onMarkerClick = useCallback((info: MarkerClickInfo) => {
		setActiveMarker(info);
	}, []);

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
						body: JSON.stringify({
							path,
							content: restoreFrontmatter(frontmatter, markdown),
						}),
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
		[runId, path, frontmatter],
	);

	// Compute persisted diffs from annotations — stable via content-based memo
	const annotations = getAnnotationsForArtifact(path);
	const persistedDiffs = useMemo(() => {
		const diffs: LineDiffEntry[] = [];
		for (const ann of annotations) {
			if (ann.anchor.type === "edit-diff" && ann.status === "open") {
				diffs.push(...(ann.anchor as EditDiffAnchor).diffs);
			}
		}
		return diffs;
	}, [annotations]);

	useEffect(() => {
		return () => {
			if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
			if (indicatorTimerRef.current) clearTimeout(indicatorTimerRef.current);
		};
	}, []);

	return (
		<div className="relative flex gap-3">
			{enableAnnotations && (
				<div
					ref={gutterRef}
					className="w-5 flex-shrink-0 relative"
					aria-hidden="true"
				/>
			)}
			<div className="flex-1 min-w-0 relative">
				<div className="absolute top-0 right-0 z-10 px-2 py-1">
					<SaveStatusIndicator status={saveStatus} />
				</div>
				{frontmatter && <FrontmatterBlock raw={frontmatter} />}
				<article ref={editorContainerRef}>
					<MilkdownEditor
						ref={editorRef}
						content={editorContent}
						artifactPath={path}
						docId={docId}
						runId={runId}
						enableAnnotations={enableAnnotations}
						onContentChange={onContentChange}
						onDiffUpdate={onDiffUpdate}
						onMarkerClick={onMarkerClick}
						persistedDiffs={persistedDiffs}
					/>
				</article>
				{activeMarker && (
					<EditDiffPopover
						entry={activeMarker.entry}
						anchorRect={activeMarker.rect}
						onClose={() => setActiveMarker(null)}
					/>
				)}
			</div>
			{enableAnnotations && (
				<AnnotationLayer
					path={path}
					containerRef={editorContainerRef}
					gutterRef={gutterRef}
					hiddenAnchors={[]}
					onEditDiffNavigate={(entry, rect) => {
						setActiveMarker({ entry, rect });
					}}
				/>
			)}
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
