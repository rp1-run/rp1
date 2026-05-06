import {
	type ReactNode,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AnnotationSidebar } from "@/components/v2/AnnotationSidebar";
import {
	type ArtifactContentMode,
	ContentPanel,
} from "@/components/v2/ContentPanel";
import { TableOfContents } from "@/components/v2/TableOfContents";
import type { SaveStatus } from "@/components/v2/UnifiedContentRenderer";
import type { HeadingEntry } from "@/hooks/useHeadingExtraction";
import { cn } from "@/lib/utils";
import { parseWalkthroughSlideSource } from "@/lib/walkthrough-slide-source";
import { AnnotationProvider } from "@/providers/AnnotationProvider";
import { useWebSocket } from "@/providers/WebSocketProvider";
import type { Artifact } from "@/types/runs";

const artifactContentCache = new Map<string, string>();

export interface ArtifactContentSurfaceControls {
	readonly selectedArtifact: Artifact | null;
	readonly saveStatus: SaveStatus;
	readonly showTableOfContentsToggle: boolean;
	readonly toggleTableOfContents: () => void;
	readonly showAnnotationToggle: boolean;
	readonly toggleAnnotations: () => void;
	readonly closeSecondaryPanels: () => void;
	readonly slideModeAvailable?: boolean;
	readonly contentMode?: ArtifactContentMode;
	readonly setContentMode?: (mode: ArtifactContentMode) => void;
}

export interface ArtifactContentSurfaceProps {
	readonly selectedArtifact: Artifact | null;
	readonly runId?: string;
	readonly showFrontmatter?: boolean;
	readonly emptyMessage?: string;
	readonly className?: string;
	readonly renderHeader?: (
		controls: ArtifactContentSurfaceControls,
	) => ReactNode;
	readonly footer?: ReactNode;
	readonly sidePanel?: ReactNode;
	readonly onSecondaryPanelOpen?: () => void;
}

function ArtifactContentSurfaceInner({
	selectedArtifact,
	runId,
	showFrontmatter = false,
	emptyMessage = "No content to display.",
	className,
	renderHeader,
	footer,
	sidePanel,
	onSecondaryPanelOpen,
}: ArtifactContentSurfaceProps) {
	const artifactPath = selectedArtifact?.path ?? null;
	const artifactCacheKey =
		runId && artifactPath ? `${runId}:${artifactPath}` : null;
	const [content, setContent] = useState<string | null>(() =>
		artifactCacheKey
			? (artifactContentCache.get(artifactCacheKey) ?? null)
			: null,
	);
	const [contentLoading, setContentLoading] = useState(
		() =>
			artifactCacheKey !== null && !artifactContentCache.has(artifactCacheKey),
	);
	const [contentError, setContentError] = useState<string | null>(null);
	const [headings, setHeadings] = useState<readonly HeadingEntry[]>([]);
	const [annotationSidebarOpen, setAnnotationSidebarOpen] = useState(false);
	const [tocOpen, setTocOpen] = useState(false);
	const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
	const [contentMode, setContentMode] = useState<ArtifactContentMode>("slides");
	const [readerFallbackMessage, setReaderFallbackMessage] = useState<
		string | null
	>(null);
	const scrollViewportRef = useRef<HTMLDivElement>(null);
	const activeArtifactCacheKeyRef = useRef<string | null>(artifactCacheKey);
	const { onFileChange } = useWebSocket();
	activeArtifactCacheKeyRef.current = artifactCacheKey;

	const walkthroughResult = useMemo(() => {
		if (content === null || !selectedArtifact) return null;
		return parseWalkthroughSlideSource({
			artifact: selectedArtifact,
			markdown: content,
		});
	}, [content, selectedArtifact]);
	const walkthroughDeck =
		walkthroughResult?.kind === "deck" ? walkthroughResult.deck : null;
	const slideModeAvailable = walkthroughDeck !== null;
	const parserFallbackMessage =
		getWalkthroughFallbackMessage(walkthroughResult);
	const walkthroughFallbackMessage =
		readerFallbackMessage ?? parserFallbackMessage;
	const effectiveContentMode: ArtifactContentMode =
		slideModeAvailable && contentMode === "slides" ? "slides" : "markdown";

	const fetchContent = useCallback(
		async (preserveScroll: boolean) => {
			const requestArtifactPath = artifactPath;
			const requestCacheKey = artifactCacheKey;
			const requestRunId = runId;
			const isActiveArtifactRequest = () =>
				activeArtifactCacheKeyRef.current === requestCacheKey;

			if (!requestArtifactPath || !requestRunId || !requestCacheKey) {
				setContent(null);
				return;
			}

			const cachedContent = artifactContentCache.get(requestCacheKey) ?? null;

			if (!preserveScroll && cachedContent === null) {
				setContentLoading(true);
				setHeadings([]);
			}
			setContentError(null);

			try {
				const response = await fetch(
					`/api/v2/runs/${requestRunId}/artifacts/${encodeURIComponent(requestArtifactPath)}`,
				);
				if (!isActiveArtifactRequest()) return;
				if (!response.ok) {
					let errorMessage = `Failed to fetch artifact: ${response.statusText}`;
					try {
						const errorData = (await response.json()) as {
							error?: string;
						};
						if (errorData.error) {
							errorMessage = errorData.error;
						}
					} catch {}
					throw new Error(errorMessage);
				}
				const data = (await response.json()) as { content: string };
				if (!isActiveArtifactRequest()) return;
				artifactContentCache.set(requestCacheKey, data.content);
				setReaderFallbackMessage(null);
				setContent((current) =>
					current === data.content ? current : data.content,
				);
			} catch (err) {
				if (!isActiveArtifactRequest()) return;
				const message = err instanceof Error ? err.message : String(err);
				const isTerminalError =
					message.startsWith("Artifact not found:") ||
					message.startsWith("Run not found");
				if (isTerminalError || cachedContent === null) {
					if (isTerminalError) {
						artifactContentCache.delete(requestCacheKey);
					}
					setContentError(message);
					setContent(null);
				}
			} finally {
				if (isActiveArtifactRequest() && !preserveScroll) {
					setContentLoading(false);
				}
			}
		},
		[artifactPath, artifactCacheKey, runId],
	);

	useEffect(() => {
		if (!artifactCacheKey) {
			setContent(null);
			setContentLoading(false);
			setContentError(null);
			return;
		}

		const cachedContent = artifactContentCache.get(artifactCacheKey) ?? null;
		setContent(cachedContent);
		setContentLoading(cachedContent === null);
		setContentError(null);
		setContentMode("slides");
		setReaderFallbackMessage(null);
		void fetchContent(false);
	}, [artifactCacheKey, fetchContent]);

	useEffect(() => {
		if (effectiveContentMode === "slides") {
			setTocOpen(false);
		}
	}, [effectiveContentMode]);

	useEffect(() => {
		if (!artifactPath || !runId) return;

		const normalizedArtifactPath = artifactPath.replace(/^\.rp1\//, "");

		const unsubscribe = onFileChange((msg) => {
			if (
				msg.changeType === "modify" &&
				(msg.path === artifactPath || msg.path === normalizedArtifactPath)
			) {
				fetchContent(true);
			}
		});

		return unsubscribe;
	}, [artifactPath, runId, onFileChange, fetchContent]);

	const handleHeadingsExtracted = useCallback((newHeadings: HeadingEntry[]) => {
		setHeadings(newHeadings);
	}, []);

	const handleTocNavigate = useCallback((id: string) => {
		const element = document.getElementById(id);
		if (element) {
			element.scrollIntoView({ behavior: "smooth", block: "start" });
		}
	}, []);

	const closeSecondaryPanels = useCallback(() => {
		setTocOpen(false);
		setAnnotationSidebarOpen(false);
	}, []);

	const handleToggleToc = useCallback(() => {
		setTocOpen((prev) => {
			const next = !prev;
			if (next) {
				setAnnotationSidebarOpen(false);
				onSecondaryPanelOpen?.();
			}
			return next;
		});
	}, [onSecondaryPanelOpen]);

	const handleToggleAnnotations = useCallback(() => {
		setAnnotationSidebarOpen((prev) => {
			const next = !prev;
			if (next) {
				setTocOpen(false);
				onSecondaryPanelOpen?.();
			}
			return next;
		});
	}, [onSecondaryPanelOpen]);

	const handleContentModeChange = useCallback((mode: ArtifactContentMode) => {
		setReaderFallbackMessage(null);
		setContentMode(mode);
	}, []);

	const handleWalkthroughRenderFailure = useCallback((message: string) => {
		setReaderFallbackMessage(message);
		setContentMode("markdown");
	}, []);

	const controls: ArtifactContentSurfaceControls = {
		selectedArtifact,
		saveStatus,
		showTableOfContentsToggle:
			effectiveContentMode === "markdown" && headings.length > 0 && !tocOpen,
		toggleTableOfContents: handleToggleToc,
		showAnnotationToggle: selectedArtifact !== null,
		toggleAnnotations: handleToggleAnnotations,
		closeSecondaryPanels,
		slideModeAvailable,
		contentMode: effectiveContentMode,
		setContentMode: handleContentModeChange,
	};

	return (
		<div
			className={cn("flex h-full flex-col overflow-hidden min-w-0", className)}
		>
			{renderHeader?.(controls)}

			<div className="flex flex-1 min-h-0 min-w-0 overflow-hidden">
				<ScrollArea
					className="flex-1 min-h-0 min-w-0"
					viewportRef={scrollViewportRef}
				>
					<ContentPanel
						content={content}
						path={selectedArtifact?.path ?? null}
						isLoading={contentLoading}
						error={contentError}
						emptyMessage={emptyMessage}
						onHeadingsExtracted={handleHeadingsExtracted}
						onSaveStatusChange={setSaveStatus}
						runId={runId}
						docId={selectedArtifact?.docId}
						showFrontmatter={showFrontmatter}
						contentMode={effectiveContentMode}
						walkthroughDeck={walkthroughDeck}
						walkthroughFallbackMessage={walkthroughFallbackMessage}
						onContentModeChange={handleContentModeChange}
						onWalkthroughRenderFailure={handleWalkthroughRenderFailure}
						scrollViewportRef={scrollViewportRef}
					/>
				</ScrollArea>

				{effectiveContentMode === "markdown" &&
					tocOpen &&
					headings.length > 0 && (
						<div className="w-[200px] shrink-0 border-l border-border overflow-y-auto">
							<TableOfContents
								headings={headings}
								activeId={null}
								onNavigate={handleTocNavigate}
								onClose={handleToggleToc}
							/>
						</div>
					)}

				{annotationSidebarOpen && selectedArtifact && (
					<div className="w-[280px] shrink-0 border-l border-border overflow-y-auto">
						<AnnotationSidebar
							artifactPath={selectedArtifact.path}
							onClose={() => setAnnotationSidebarOpen(false)}
							className="h-full"
						/>
					</div>
				)}

				{sidePanel}
			</div>

			{footer}
		</div>
	);
}

function getWalkthroughFallbackMessage(
	result: ReturnType<typeof parseWalkthroughSlideSource> | null,
): string | null {
	if (result?.kind !== "fallback") return null;

	switch (result.reason) {
		case "unsupported-contract-version":
		case "invalid-slide-marker":
		case "missing-horizontal-slide":
		case "vertical-without-horizontal":
		case "missing-slide-metadata":
		case "invalid-slide-metadata":
		case "invalid-slide-depth":
			return `${result.message} Showing the markdown artifact instead.`;
		default:
			return null;
	}
}

export function ArtifactContentSurface(props: ArtifactContentSurfaceProps) {
	return (
		<AnnotationProvider
			artifactPath={props.selectedArtifact?.path ?? ""}
			docId={props.selectedArtifact?.docId}
			runId={props.runId}
		>
			<ArtifactContentSurfaceInner {...props} />
		</AnnotationProvider>
	);
}
