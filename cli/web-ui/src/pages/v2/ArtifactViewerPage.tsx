import {
	AlertCircle,
	ArrowLeft,
	ChevronRight,
	List,
	Loader2,
	PanelLeft,
} from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { MarkdownViewer } from "@/components/MarkdownViewer";
import { ArtifactSidebar } from "@/components/v2/ArtifactSidebar";
import { FollowModeToggle } from "@/components/v2/FollowModeToggle";
import { NewUpdatesChip } from "@/components/v2/NewUpdatesChip";
import { TableOfContents } from "@/components/v2/TableOfContents";
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
import { useFollowMode } from "@/hooks/useFollowMode";
import type { HeadingEntry } from "@/hooks/useHeadingExtraction";
import { useIsMobile } from "@/hooks/useMediaQuery";
import { useRunDetail } from "@/hooks/useRunDetail";
import { cn } from "@/lib/utils";
import { useWebSocket } from "@/providers/WebSocketProvider";

const STORAGE_KEY_TOC_COLLAPSED = "rp1-toc-collapsed";

interface ArtifactContent {
	path: string;
	content: string;
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
		if (typeof window === "undefined") return false;
		const stored = sessionStorage.getItem(STORAGE_KEY_TOC_COLLAPSED);
		return stored === "true";
	});
	const [sidebarDrawerOpen, setSidebarDrawerOpen] = useState(false);
	const [tocDrawerOpen, setTocDrawerOpen] = useState(false);

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
	}, [selectedArtifactPath, run, onFileChange, fetchArtifactContentWithScrollPreservation]);

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
					<p className="text-sm text-muted-foreground">
						{contentError}
					</p>
				</div>
			) : !selectedArtifactPath ? (
				<div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
					<p className="text-lg">
						Select an artifact from the sidebar
					</p>
				</div>
			) : artifactContent ? (
				<MarkdownViewer
					content={artifactContent.content}
					path={artifactContent.path}
					onHeadingsExtracted={handleHeadingsExtracted}
				/>
			) : null}
		</>
	);

	if (isMobile) {
		return (
			<div className="flex h-full flex-col">
				<nav className="flex items-center gap-2 p-4 text-sm text-muted-foreground border-b">
					<Link
						to="/v2/projects"
						className="hover:text-foreground transition-colors"
					>
						{run.projectName}
					</Link>
					<ChevronRight className="h-4 w-4" aria-hidden="true" />
					<Link
						to={`/v2/runs/${runId}`}
						className="hover:text-foreground transition-colors"
					>
						{run.featureName}
					</Link>
					<ChevronRight className="h-4 w-4" aria-hidden="true" />
					<span className="text-foreground truncate max-w-[100px]">
						{selectedArtifactPath
							? selectedArtifactPath.split("/").pop()
							: "Artifacts"}
					</span>
				</nav>

				<div className="relative flex h-full flex-1 flex-col">
					<div className="flex items-center justify-between gap-2 border-b px-4 py-2">
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
										<PanelLeft className="h-4 w-4" />
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
											<List className="h-4 w-4" />
										</Button>
									</TooltipTrigger>
									<TooltipContent>
										<p>Table of contents</p>
									</TooltipContent>
								</Tooltip>
							</TooltipProvider>
						</div>
					</div>

					<ScrollArea
						className="flex-1"
						viewportRef={scrollViewportRef}
					>
						<div
							className="p-4"
							onScroll={handleScroll as unknown as React.UIEventHandler}
						>
							{contentArea}
						</div>
					</ScrollArea>

					<NewUpdatesChip visible={hasNewUpdates} onClick={scrollToNew} />
				</div>

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

				<p className="border-t px-4 py-2 text-xs text-muted-foreground">
					Press <kbd className="rounded bg-muted px-1.5 py-0.5">Esc</kbd> to
					return to run details
				</p>
			</div>
		);
	}

	return (
		<div className="flex h-full flex-col">
			<nav className="flex items-center gap-2 p-4 text-sm text-muted-foreground border-b">
				<Link
					to="/v2/projects"
					className="hover:text-foreground transition-colors"
				>
					{run.projectName}
				</Link>
				<ChevronRight className="h-4 w-4" aria-hidden="true" />
				<Link
					to={`/v2/runs/${runId}`}
					className="hover:text-foreground transition-colors"
				>
					{run.featureName}
				</Link>
				<ChevronRight className="h-4 w-4" aria-hidden="true" />
				<span className="text-foreground">Artifacts</span>
				{selectedArtifactPath && (
					<>
						<ChevronRight className="h-4 w-4" aria-hidden="true" />
						<span className="text-foreground truncate max-w-[200px]">
							{selectedArtifactPath.split("/").pop()}
						</span>
					</>
				)}
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
					<ScrollArea className="h-full">
						<ArtifactSidebar
							artifacts={run.artifacts}
							selectedPath={selectedArtifactPath}
							onSelect={handleArtifactSelect}
						/>
					</ScrollArea>
				</ResizablePanel>

				<ResizableHandle withHandle />

				<ResizablePanel defaultSize={70} minSize={40}>
					<div className="relative flex h-full flex-col">
						<div className="flex items-center justify-end gap-2 border-b px-4 py-2">
							<FollowModeToggle
								enabled={followMode}
								onToggle={() => setFollowMode(!followMode)}
							/>
						</div>

						<ScrollArea
							className="flex-1"
							viewportRef={scrollViewportRef}
						>
							<div
								className="p-6"
								onScroll={handleScroll as unknown as React.UIEventHandler}
							>
								{contentArea}
							</div>
						</ScrollArea>

						<NewUpdatesChip visible={hasNewUpdates} onClick={scrollToNew} />
					</div>
				</ResizablePanel>

				<ResizableHandle withHandle />

				<ResizablePanel
					defaultSize={15}
					minSize={11}
					maxSize={19}
					collapsible
					collapsedSize={3}
					className={cn(tocCollapsed && "min-w-[40px]")}
				>
					<TableOfContents
						headings={headings}
						activeId={activeHeadingId}
						onNavigate={handleTocNavigate}
						collapsed={tocCollapsed}
						onToggleCollapse={handleToggleTocCollapse}
					/>
				</ResizablePanel>
			</ResizablePanelGroup>

			<p className="border-t px-4 py-2 text-xs text-muted-foreground">
				Press <kbd className="rounded bg-muted px-1.5 py-0.5">Esc</kbd> to
				return to run details
			</p>
		</div>
	);
}
