import {
	AlertCircle,
	ArrowLeft,
	ChevronRight,
	List,
	Loader2,
	MessageSquare,
	PanelLeft,
	PanelRightClose,
} from "lucide-react";
import {
	useCallback,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
} from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { MarkdownViewer } from "@/components/MarkdownViewer";
import { CodeBlock } from "@/components/MarkdownViewer/CodeBlock";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import {
	ResizableHandle,
	ResizablePanel,
	ResizablePanelGroup,
} from "@/components/ui/resizable";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { AnnotationSidebar } from "@/components/v2/AnnotationSidebar";
import { ArtifactSidebar } from "@/components/v2/ArtifactSidebar";
import { FollowModeToggle } from "@/components/v2/FollowModeToggle";
import { NewUpdatesChip } from "@/components/v2/NewUpdatesChip";
import { TableOfContents } from "@/components/v2/TableOfContents";
import { useAnnotations } from "@/hooks/useAnnotations";
import { useFollowMode } from "@/hooks/useFollowMode";
import type { HeadingEntry } from "@/hooks/useHeadingExtraction";
import { useIsMobile } from "@/hooks/useMediaQuery";
import { useRunDetail } from "@/hooks/useRunDetail";
import { cn } from "@/lib/utils";
import { AnnotationProvider } from "@/providers/AnnotationProvider";
import { useWebSocket } from "@/providers/WebSocketProvider";
import type { Annotation } from "@/types/annotations";

const ANNOTATIONS_ENABLED =
	typeof import.meta !== "undefined" &&
	import.meta.env?.RP1_ANNOTATIONS_ENABLED !== "false";

const STORAGE_KEY_TOC_COLLAPSED = "rp1-toc-collapsed";
const STORAGE_KEY_ANNOTATIONS_COLLAPSED = "rp1-annotations-collapsed";

/**
 * Map file extensions to syntax highlighting languages.
 * Returns null for markdown files (which use MarkdownViewer).
 */
function getCodeLanguageFromPath(path: string): string | null {
	const ext = path.split(".").pop()?.toLowerCase();
	if (!ext) return null;

	const extToLang: Record<string, string> = {
		ts: "typescript",
		tsx: "tsx",
		js: "javascript",
		jsx: "jsx",
		py: "python",
		go: "go",
		rs: "rust",
		java: "java",
		c: "c",
		cpp: "cpp",
		cc: "cpp",
		cxx: "cpp",
		h: "c",
		hpp: "cpp",
		rb: "ruby",
		sh: "bash",
		bash: "bash",
		zsh: "bash",
		json: "json",
		yaml: "yaml",
		yml: "yaml",
		sql: "sql",
		html: "html",
		css: "css",
		xml: "xml",
		toml: "toml",
		txt: "text",
	};

	// Markdown files should use MarkdownViewer
	if (ext === "md" || ext === "mdx") return null;

	return extToLang[ext] ?? null;
}

interface ArtifactContent {
	path: string;
	content: string;
}

/**
 * Annotation toggle button component (must be inside AnnotationProvider).
 * Shows the toggle button with annotation count badge.
 */
function AnnotationToggleButton({
	selectedArtifactPath,
	annotationSidebarOpen,
	setAnnotationSidebarOpen,
}: {
	selectedArtifactPath: string;
	annotationSidebarOpen: boolean;
	setAnnotationSidebarOpen: (open: boolean) => void;
}) {
	const { count } = useAnnotations({ artifactPath: selectedArtifactPath });

	return (
		<TooltipProvider>
			<Tooltip>
				<TooltipTrigger asChild>
					<Button
						variant="ghost"
						size="icon"
						className="h-8 w-8 relative"
						onClick={() => setAnnotationSidebarOpen(!annotationSidebarOpen)}
						aria-label={
							annotationSidebarOpen
								? "Close annotations panel"
								: "Open annotations panel"
						}
						aria-expanded={annotationSidebarOpen}
					>
						{annotationSidebarOpen ? (
							<PanelRightClose className="h-4 w-4" aria-hidden="true" />
						) : (
							<MessageSquare className="h-4 w-4" aria-hidden="true" />
						)}
						{count > 0 && !annotationSidebarOpen && (
							<span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-medium text-primary-foreground">
								{count > 99 ? "99+" : count}
							</span>
						)}
					</Button>
				</TooltipTrigger>
				<TooltipContent>
					<p>Annotations {count > 0 ? `(${count})` : ""}</p>
				</TooltipContent>
			</Tooltip>
		</TooltipProvider>
	);
}

/**
 * Mobile annotation toolbar button (inside AnnotationProvider).
 */
function MobileAnnotationButton({
	selectedArtifactPath,
	onClick,
}: {
	selectedArtifactPath: string;
	onClick: () => void;
}) {
	const { count } = useAnnotations({ artifactPath: selectedArtifactPath });

	return (
		<TooltipProvider>
			<Tooltip>
				<TooltipTrigger asChild>
					<Button
						variant="ghost"
						size="icon"
						className="h-8 w-8 relative"
						onClick={onClick}
						aria-label="Open annotations"
					>
						<MessageSquare className="h-4 w-4" aria-hidden="true" />
						{count > 0 && (
							<span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-medium text-primary-foreground">
								{count > 99 ? "99+" : count}
							</span>
						)}
					</Button>
				</TooltipTrigger>
				<TooltipContent>
					<p>Annotations {count > 0 ? `(${count})` : ""}</p>
				</TooltipContent>
			</Tooltip>
		</TooltipProvider>
	);
}

export function ArtifactViewerPage() {
	const { runId, "*": artifactPathParam } = useParams();
	const navigate = useNavigate();
	const { run, isLoading, error, refetch } = useRunDetail(runId);
	const { onFileChange } = useWebSocket();
	const isMobile = useIsMobile();

	const [artifactContent, setArtifactContent] =
		useState<ArtifactContent | null>(null);
	const [contentLoading, setContentLoading] = useState(false);
	const [contentError, setContentError] = useState<string | null>(null);
	const [headings, setHeadings] = useState<readonly HeadingEntry[]>([]);
	const [activeHeadingId, setActiveHeadingId] = useState<string | null>(null);
	const [tocCollapsed, setTocCollapsed] = useState<boolean>(() => {
		if (typeof window === "undefined") return true;
		const stored = sessionStorage.getItem(STORAGE_KEY_TOC_COLLAPSED);
		// Default to collapsed (hidden) unless explicitly set to false
		return stored === null ? true : stored === "true";
	});
	const [annotationSidebarOpen, setAnnotationSidebarOpen] = useState<boolean>(
		() => {
			if (typeof window === "undefined") return false;
			const stored = sessionStorage.getItem(STORAGE_KEY_ANNOTATIONS_COLLAPSED);
			return stored !== "true"; // Default to open
		},
	);
	const [sidebarDrawerOpen, setSidebarDrawerOpen] = useState(false);
	const [tocDrawerOpen, setTocDrawerOpen] = useState(false);
	const [annotationDrawerOpen, setAnnotationDrawerOpen] = useState(false);
	const [liveAnnouncement, setLiveAnnouncement] = useState<string>("");

	const scrollViewportRef = useRef<HTMLDivElement>(null);
	const headingElementsRef = useRef<Map<string, Element>>(new Map());
	const savedScrollState = useRef<{
		scrollTop: number;
		scrollHeight: number;
	} | null>(null);

	const {
		followMode,
		hasNewUpdates,
		setFollowMode,
		scrollToNew,
		handleScroll,
	} = useFollowMode(scrollViewportRef);

	const selectedArtifactPath = artifactPathParam || "";

	const handleToggleTocCollapse = useCallback(() => {
		setTocCollapsed((prev) => {
			const newValue = !prev;
			if (typeof window !== "undefined") {
				sessionStorage.setItem(STORAGE_KEY_TOC_COLLAPSED, String(newValue));
			}
			return newValue;
		});
	}, []);

	const handleToggleAnnotationSidebar = useCallback((open: boolean) => {
		setAnnotationSidebarOpen(open);
		if (typeof window !== "undefined") {
			sessionStorage.setItem(STORAGE_KEY_ANNOTATIONS_COLLAPSED, String(!open));
		}
	}, []);

	const handleNavigateToAnnotation = useCallback(
		(annotation: Annotation) => {
			const anchor = annotation.anchor;
			let targetElement: Element | null = null;

			switch (anchor.type) {
				case "hidden-anchor": {
					targetElement = document.getElementById(anchor.anchorId);
					break;
				}
				case "line": {
					// Line annotations are in code blocks - find the line element
					const lineElements = document.querySelectorAll(
						`[data-line-number="${anchor.lineNumber}"]`,
					);
					if (lineElements.length > 0) {
						targetElement = lineElements[0];
					}
					break;
				}
				case "text-selection": {
					// For text selections, we try to find the text in the document
					// The annotation highlight should already be visible
					const highlightElements = document.querySelectorAll(
						`[data-annotation-id="${annotation.id}"]`,
					);
					if (highlightElements.length > 0) {
						targetElement = highlightElements[0];
					}
					break;
				}
			}

			if (targetElement) {
				targetElement.scrollIntoView({ behavior: "smooth", block: "center" });
				// Add a brief highlight effect
				targetElement.classList.add("ring-2", "ring-primary", "ring-offset-2");
				setTimeout(() => {
					targetElement?.classList.remove(
						"ring-2",
						"ring-primary",
						"ring-offset-2",
					);
				}, 2000);
			}

			// Close mobile drawer if open
			if (isMobile) {
				setAnnotationDrawerOpen(false);
			}
		},
		[isMobile],
	);

	const handleArtifactSelect = useCallback(
		(path: string) => {
			navigate(`/v2/runs/${runId}/artifacts/${path}`);
			if (isMobile) {
				setSidebarDrawerOpen(false);
			}
		},
		[navigate, runId, isMobile],
	);

	const handleTocNavigateMobile = useCallback(
		(id: string) => {
			const element = document.getElementById(id);
			if (element) {
				element.scrollIntoView({ behavior: "smooth", block: "start" });
			}
			if (isMobile) {
				setTocDrawerOpen(false);
			}
		},
		[isMobile],
	);

	const handleTocNavigate = useCallback((id: string) => {
		const element = document.getElementById(id);
		if (element) {
			element.scrollIntoView({ behavior: "smooth", block: "start" });
		}
	}, []);

	const handleHeadingsExtracted = useCallback((newHeadings: HeadingEntry[]) => {
		setHeadings(newHeadings);
	}, []);

	const fetchArtifactContentWithScrollPreservation = useCallback(
		async (preserveScroll: boolean) => {
			if (!run || !selectedArtifactPath) {
				setArtifactContent(null);
				return;
			}

			const artifact = run.artifacts.find(
				(a) => a.path === selectedArtifactPath,
			);
			if (!artifact) {
				setContentError("Artifact not found");
				setArtifactContent(null);
				return;
			}

			if (preserveScroll && scrollViewportRef.current) {
				savedScrollState.current = {
					scrollTop: scrollViewportRef.current.scrollTop,
					scrollHeight: scrollViewportRef.current.scrollHeight,
				};
			}

			if (!preserveScroll) {
				setContentLoading(true);
			}
			setContentError(null);

			try {
				const response = await fetch(
					`/api/v2/runs/${runId}/artifacts/${encodeURIComponent(selectedArtifactPath)}`,
				);
				if (!response.ok) {
					if (response.status === 404) {
						throw new Error("Artifact content not found");
					}
					throw new Error(`Failed to fetch artifact: ${response.statusText}`);
				}
				const data = (await response.json()) as { content: string };
				setArtifactContent({
					path: selectedArtifactPath,
					content: data.content,
				});
			} catch (err) {
				setContentError(err instanceof Error ? err.message : String(err));
				setArtifactContent(null);
			} finally {
				if (!preserveScroll) {
					setContentLoading(false);
				}
			}
		},
		[run, runId, selectedArtifactPath],
	);

	useEffect(() => {
		fetchArtifactContentWithScrollPreservation(false);
	}, [fetchArtifactContentWithScrollPreservation]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: intentionally depends on artifactContent to restore scroll after content changes
	useLayoutEffect(() => {
		if (savedScrollState.current && scrollViewportRef.current) {
			const element = scrollViewportRef.current;
			const state = savedScrollState.current;
			const newScrollHeight = element.scrollHeight;
			const heightDelta = newScrollHeight - state.scrollHeight;

			if (state.scrollTop > 0 && heightDelta > 0) {
				element.scrollTop = state.scrollTop + heightDelta;
			} else {
				element.scrollTop = state.scrollTop;
			}

			savedScrollState.current = null;
		}
	}, [artifactContent]);

	useEffect(() => {
		if (!selectedArtifactPath || !run) return;

		const unsubscribe = onFileChange((msg) => {
			if (msg.path === selectedArtifactPath && msg.changeType === "modify") {
				fetchArtifactContentWithScrollPreservation(true);
			}
		});

		return unsubscribe;
	}, [
		selectedArtifactPath,
		run,
		onFileChange,
		fetchArtifactContentWithScrollPreservation,
	]);

	useEffect(() => {
		if (!scrollViewportRef.current || headings.length === 0) return;

		const scrollViewport = scrollViewportRef.current;
		const observerCallback: IntersectionObserverCallback = (entries) => {
			const visibleEntries = entries.filter((entry) => entry.isIntersecting);

			if (visibleEntries.length > 0) {
				const topEntry = visibleEntries.reduce((top, entry) => {
					return entry.boundingClientRect.top < top.boundingClientRect.top
						? entry
						: top;
				});
				setActiveHeadingId(topEntry.target.id);
			}
		};

		const observer = new IntersectionObserver(observerCallback, {
			root: scrollViewport,
			rootMargin: "-10% 0px -80% 0px",
			threshold: 0,
		});

		headingElementsRef.current.clear();
		for (const heading of headings) {
			const element = document.getElementById(heading.id);
			if (element) {
				headingElementsRef.current.set(heading.id, element);
				observer.observe(element);
			}
		}

		return () => observer.disconnect();
	}, [headings]);

	// Announce active heading changes to screen readers
	useEffect(() => {
		if (activeHeadingId) {
			const heading = headings.find((h) => h.id === activeHeadingId);
			if (heading) {
				setLiveAnnouncement(`Current section: ${heading.text}`);
			}
		}
	}, [activeHeadingId, headings]);

	const handleEscapeKey = useCallback(
		(event: KeyboardEvent) => {
			if (event.key === "Escape") {
				navigate(`/v2/runs/${runId}`);
			}
		},
		[navigate, runId],
	);

	useEffect(() => {
		document.addEventListener("keydown", handleEscapeKey);
		return () => {
			document.removeEventListener("keydown", handleEscapeKey);
		};
	}, [handleEscapeKey]);

	if (isLoading) {
		return (
			<div className="flex flex-col items-center justify-center h-full text-muted-foreground">
				<Loader2 className="h-8 w-8 mb-4 animate-spin" />
				<p className="text-sm">Loading run...</p>
			</div>
		);
	}

	if (error) {
		return (
			<div className="flex flex-col items-center justify-center gap-4 py-12">
				<AlertCircle className="h-12 w-12 text-destructive opacity-70" />
				<p className="text-status-failed">{error.message}</p>
				<div className="flex gap-2">
					<button
						type="button"
						onClick={() => navigate("/v2/runs")}
						className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm hover:bg-muted/50 transition-colors"
					>
						<ArrowLeft className="h-4 w-4" />
						Back to Runs
					</button>
					<button
						type="button"
						onClick={refetch}
						className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm hover:bg-muted/50 transition-colors"
					>
						Retry
					</button>
				</div>
			</div>
		);
	}

	if (!run) {
		return (
			<div className="flex flex-col items-center justify-center gap-4 py-12">
				<p className="text-muted-foreground">Run not found</p>
				<button
					type="button"
					onClick={() => navigate("/v2/runs")}
					className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm hover:bg-muted/50 transition-colors"
				>
					<ArrowLeft className="h-4 w-4" />
					Back to Runs
				</button>
			</div>
		);
	}

	const contentArea = (
		<>
			{contentLoading ? (
				<div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
					<Loader2 className="h-8 w-8 mb-4 animate-spin" />
					<p className="text-sm">Loading artifact...</p>
				</div>
			) : contentError ? (
				<div className="flex flex-col items-center justify-center h-64">
					<AlertCircle className="h-12 w-12 mb-4 text-destructive opacity-70" />
					<p className="text-lg text-destructive mb-2">
						Failed to load artifact
					</p>
					<p className="text-sm text-muted-foreground">{contentError}</p>
				</div>
			) : !selectedArtifactPath ? (
				<div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
					<p className="text-lg">Select an artifact from the sidebar</p>
				</div>
			) : artifactContent ? (
				(() => {
					const codeLanguage = getCodeLanguageFromPath(artifactContent.path);
					if (codeLanguage) {
						return (
							<CodeBlock
								code={artifactContent.content}
								language={codeLanguage}
								artifactPath={artifactContent.path}
								enableAnnotations={ANNOTATIONS_ENABLED}
							/>
						);
					}
					return (
						<MarkdownViewer
							content={artifactContent.content}
							path={artifactContent.path}
							onHeadingsExtracted={handleHeadingsExtracted}
							enableAnnotations={ANNOTATIONS_ENABLED}
						/>
					);
				})()
			) : null}
		</>
	);

	// Live region for screen reader announcements
	const liveRegion = (
		<div aria-live="polite" aria-atomic="true" className="sr-only">
			{liveAnnouncement}
		</div>
	);

	if (isMobile) {
		const mobileContent = (
			<div className="flex h-full flex-col">
				{liveRegion}
				<nav
					aria-label="Breadcrumb"
					className="flex items-center gap-2 p-4 text-sm text-muted-foreground border-b"
				>
					<ol className="flex items-center gap-2">
						<li>
							<Link
								to="/v2/projects"
								className="hover:text-foreground transition-colors"
							>
								{run.projectName}
							</Link>
						</li>
						<li aria-hidden="true">
							<ChevronRight className="h-4 w-4" />
						</li>
						<li>
							<Link
								to={`/v2/runs/${runId}`}
								className="hover:text-foreground transition-colors"
							>
								{run.featureName}
							</Link>
						</li>
						<li aria-hidden="true">
							<ChevronRight className="h-4 w-4" />
						</li>
						<li aria-current="page">
							<span className="text-foreground truncate max-w-[100px]">
								{selectedArtifactPath
									? selectedArtifactPath.split("/").pop()
									: "Artifacts"}
							</span>
						</li>
					</ol>
				</nav>

				<main className="relative flex h-full flex-1 flex-col">
					<div
						className="flex items-center justify-between gap-2 border-b px-4 py-2"
						role="toolbar"
						aria-label="Artifact viewer controls"
					>
						<TooltipProvider>
							<Tooltip>
								<TooltipTrigger asChild>
									<Button
										variant="ghost"
										size="icon"
										className="h-8 w-8"
										onClick={() => setSidebarDrawerOpen(true)}
										aria-label="Open artifact list"
									>
										<PanelLeft className="h-4 w-4" aria-hidden="true" />
									</Button>
								</TooltipTrigger>
								<TooltipContent>
									<p>Artifacts</p>
								</TooltipContent>
							</Tooltip>
						</TooltipProvider>

						<div className="flex items-center gap-2">
							<FollowModeToggle
								enabled={followMode}
								onToggle={() => setFollowMode(!followMode)}
							/>
							{ANNOTATIONS_ENABLED && (
								<MobileAnnotationButton
									selectedArtifactPath={selectedArtifactPath}
									onClick={() => setAnnotationDrawerOpen(true)}
								/>
							)}
							<TooltipProvider>
								<Tooltip>
									<TooltipTrigger asChild>
										<Button
											variant="ghost"
											size="icon"
											className="h-8 w-8"
											onClick={() => setTocDrawerOpen(true)}
											aria-label="Open table of contents"
										>
											<List className="h-4 w-4" aria-hidden="true" />
										</Button>
									</TooltipTrigger>
									<TooltipContent>
										<p>Table of contents</p>
									</TooltipContent>
								</Tooltip>
							</TooltipProvider>
						</div>
					</div>

					<ScrollArea className="flex-1" viewportRef={scrollViewportRef}>
						<article
							className="p-4"
							onScroll={handleScroll as unknown as React.UIEventHandler}
							aria-label={
								selectedArtifactPath
									? `Content of ${selectedArtifactPath.split("/").pop()}`
									: "Artifact content"
							}
						>
							{contentArea}
						</article>
					</ScrollArea>

					<NewUpdatesChip visible={hasNewUpdates} onClick={scrollToNew} />
				</main>

				<Drawer
					open={sidebarDrawerOpen}
					onClose={() => setSidebarDrawerOpen(false)}
					side="left"
					title="Artifacts"
				>
					<ScrollArea className="h-full">
						<ArtifactSidebar
							artifacts={run.artifacts}
							selectedPath={selectedArtifactPath}
							onSelect={handleArtifactSelect}
						/>
					</ScrollArea>
				</Drawer>

				<Drawer
					open={tocDrawerOpen}
					onClose={() => setTocDrawerOpen(false)}
					side="right"
					title="On this page"
				>
					<TableOfContents
						headings={headings}
						activeId={activeHeadingId}
						onNavigate={handleTocNavigateMobile}
						collapsed={false}
					/>
				</Drawer>

				{ANNOTATIONS_ENABLED && (
					<Drawer
						open={annotationDrawerOpen}
						onClose={() => setAnnotationDrawerOpen(false)}
						side="right"
						title="Annotations"
					>
						<AnnotationSidebar
							artifactPath={selectedArtifactPath}
							isOpen={true}
							onToggle={() => setAnnotationDrawerOpen(false)}
							onNavigateToAnnotation={handleNavigateToAnnotation}
							className="border-l-0 w-full"
						/>
					</Drawer>
				)}

				<footer className="border-t px-4 py-2 text-xs text-muted-foreground">
					Press{" "}
					<kbd className="rounded bg-muted px-1.5 py-0.5 font-mono">Esc</kbd> to
					return to run details
				</footer>
			</div>
		);

		// Wrap mobile content with AnnotationProvider when annotations are enabled
		if (ANNOTATIONS_ENABLED) {
			return (
				<AnnotationProvider artifactPath={selectedArtifactPath}>
					{mobileContent}
				</AnnotationProvider>
			);
		}

		return mobileContent;
	}

	// Desktop content
	const desktopContent = (
		<div className="flex h-full flex-col">
			{liveRegion}
			<nav
				aria-label="Breadcrumb"
				className="flex items-center gap-2 p-4 text-sm text-muted-foreground border-b"
			>
				<ol className="flex items-center gap-2">
					<li>
						<Link
							to="/v2/projects"
							className="hover:text-foreground transition-colors"
						>
							{run.projectName}
						</Link>
					</li>
					<li aria-hidden="true">
						<ChevronRight className="h-4 w-4" />
					</li>
					<li>
						<Link
							to={`/v2/runs/${runId}`}
							className="hover:text-foreground transition-colors"
						>
							{run.featureName}
						</Link>
					</li>
					<li aria-hidden="true">
						<ChevronRight className="h-4 w-4" />
					</li>
					<li aria-current={selectedArtifactPath ? undefined : "page"}>
						<span className="text-foreground">Artifacts</span>
					</li>
					{selectedArtifactPath && (
						<>
							<li aria-hidden="true">
								<ChevronRight className="h-4 w-4" />
							</li>
							<li aria-current="page">
								<span className="text-foreground truncate max-w-[200px]">
									{selectedArtifactPath.split("/").pop()}
								</span>
							</li>
						</>
					)}
				</ol>
			</nav>

			<ResizablePanelGroup
				direction="horizontal"
				className="flex-1"
				autoSaveId="artifact-viewer-panels"
			>
				<ResizablePanel
					defaultSize={15}
					minSize={12}
					maxSize={22}
					collapsible
					className="bg-card"
				>
					<aside aria-label="Artifact list">
						<ScrollArea className="h-full">
							<ArtifactSidebar
								artifacts={run.artifacts}
								selectedPath={selectedArtifactPath}
								onSelect={handleArtifactSelect}
							/>
						</ScrollArea>
					</aside>
				</ResizablePanel>

				<ResizableHandle withHandle aria-label="Resize sidebar" />

				<ResizablePanel
					defaultSize={ANNOTATIONS_ENABLED ? 55 : 70}
					minSize={40}
				>
					<main className="relative flex h-full flex-col">
						<div
							className="flex items-center justify-end gap-2 border-b px-4 py-2"
							role="toolbar"
							aria-label="Artifact viewer controls"
						>
							<FollowModeToggle
								enabled={followMode}
								onToggle={() => setFollowMode(!followMode)}
							/>
							{ANNOTATIONS_ENABLED && (
								<AnnotationToggleButton
									selectedArtifactPath={selectedArtifactPath}
									annotationSidebarOpen={annotationSidebarOpen}
									setAnnotationSidebarOpen={handleToggleAnnotationSidebar}
								/>
							)}
						</div>

						<ScrollArea className="flex-1" viewportRef={scrollViewportRef}>
							<article
								className="p-6"
								onScroll={handleScroll as unknown as React.UIEventHandler}
								aria-label={
									selectedArtifactPath
										? `Content of ${selectedArtifactPath.split("/").pop()}`
										: "Artifact content"
								}
							>
								{contentArea}
							</article>
						</ScrollArea>

						<NewUpdatesChip visible={hasNewUpdates} onClick={scrollToNew} />
					</main>
				</ResizablePanel>

				<ResizableHandle withHandle aria-label="Resize table of contents" />

				<ResizablePanel
					defaultSize={15}
					minSize={11}
					maxSize={19}
					collapsible
					collapsedSize={3}
					className={cn(tocCollapsed && "min-w-[40px]")}
				>
					<aside aria-label="Table of contents">
						<TableOfContents
							headings={headings}
							activeId={activeHeadingId}
							onNavigate={handleTocNavigate}
							collapsed={tocCollapsed}
							onToggleCollapse={handleToggleTocCollapse}
						/>
					</aside>
				</ResizablePanel>

				{ANNOTATIONS_ENABLED && annotationSidebarOpen && (
					<>
						<ResizableHandle withHandle aria-label="Resize annotations panel" />
						<ResizablePanel
							defaultSize={15}
							minSize={12}
							maxSize={25}
							collapsible
							className="bg-card"
						>
							<AnnotationSidebar
								artifactPath={selectedArtifactPath}
								isOpen={annotationSidebarOpen}
								onToggle={() =>
									handleToggleAnnotationSidebar(!annotationSidebarOpen)
								}
								onNavigateToAnnotation={handleNavigateToAnnotation}
								className="h-full"
							/>
						</ResizablePanel>
					</>
				)}
			</ResizablePanelGroup>

			<footer className="border-t px-4 py-2 text-xs text-muted-foreground">
				Press{" "}
				<kbd className="rounded bg-muted px-1.5 py-0.5 font-mono">Esc</kbd> to
				return to run details
			</footer>
		</div>
	);

	// Wrap desktop content with AnnotationProvider when annotations are enabled
	if (ANNOTATIONS_ENABLED) {
		return (
			<AnnotationProvider artifactPath={selectedArtifactPath}>
				{desktopContent}
			</AnnotationProvider>
		);
	}

	return desktopContent;
}
