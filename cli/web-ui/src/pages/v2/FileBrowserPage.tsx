import {
	AlertCircle,
	ChevronRight,
	FileText,
	List,
	Loader2,
	MessageSquare,
	PanelLeft,
} from "lucide-react";
import {
	useCallback,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
} from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { FileTree } from "@/components/FileTree";
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
import { KeyHints, VIEWER_HINTS } from "@/components/v2/KeyHints";
import { TableOfContents } from "@/components/v2/TableOfContents";
import { UnifiedContentRenderer } from "@/components/v2/UnifiedContentRenderer";
import { useAnnotations } from "@/hooks/useAnnotations";
import { useContextualShortcuts } from "@/hooks/useContextualShortcuts";
import type { HeadingEntry } from "@/hooks/useHeadingExtraction";
import { useIsMobile } from "@/hooks/useMediaQuery";
import { useProjectFileTree } from "@/hooks/useProjectFileTree";
import { AnnotationProvider } from "@/providers/AnnotationProvider";
import { useWebSocket } from "@/providers/WebSocketProvider";
import type { Annotation } from "@/types/annotations";
import type { V2Project } from "@/types/projects";
import type { FileContent } from "../../server/routes/content-utils";

const ANNOTATIONS_ENABLED =
	typeof import.meta !== "undefined" &&
	import.meta.env?.RP1_ANNOTATIONS_ENABLED !== "false";

const STORAGE_KEY_TOC_COLLAPSED = "rp1-file-browser-toc-collapsed";
const STORAGE_KEY_ANNOTATIONS_COLLAPSED =
	"rp1-file-browser-annotations-collapsed";

function AnnotationToggleButton({
	artifactPath,
	onOpen,
}: {
	artifactPath: string;
	onOpen: () => void;
}) {
	const { count } = useAnnotations({ artifactPath });

	return (
		<TooltipProvider>
			<Tooltip>
				<TooltipTrigger asChild>
					<Button
						variant="ghost"
						size="icon"
						className="h-8 w-8 relative"
						onClick={onOpen}
						aria-label="Open annotations panel"
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

function MobileAnnotationButton({
	artifactPath,
	onClick,
}: {
	artifactPath: string;
	onClick: () => void;
}) {
	const { count } = useAnnotations({ artifactPath });

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

export function FileBrowserPage() {
	const { projectId, "*": filePath } = useParams<{
		projectId: string;
		"*": string;
	}>();
	const navigate = useNavigate();
	const isMobile = useIsMobile();
	const selectedPath = filePath || null;

	const {
		tree,
		loading: treeLoading,
		error: treeError,
		refetch: refetchTree,
	} = useProjectFileTree(projectId);
	const { setProjectId, onTreeChange, onFileChange } = useWebSocket();

	const [projectName, setProjectName] = useState<string | null>(null);
	const [content, setContent] = useState<FileContent | null>(null);
	const [contentLoading, setContentLoading] = useState(false);
	const [contentError, setContentError] = useState<string | null>(null);
	const [isRefreshing, setIsRefreshing] = useState(false);
	const [headings, setHeadings] = useState<readonly HeadingEntry[]>([]);
	const [activeHeadingId, setActiveHeadingId] = useState<string | null>(null);
	const [tocCollapsed, setTocCollapsed] = useState<boolean>(() => {
		if (typeof window === "undefined") return true;
		const stored = sessionStorage.getItem(STORAGE_KEY_TOC_COLLAPSED);
		return stored === null ? true : stored === "true";
	});
	const [annotationSidebarOpen, setAnnotationSidebarOpen] = useState<boolean>(
		() => {
			if (typeof window === "undefined") return false;
			const stored = sessionStorage.getItem(STORAGE_KEY_ANNOTATIONS_COLLAPSED);
			return stored !== "true";
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

	const isMarkdown =
		selectedPath?.endsWith(".md") || content?.mimeType === "text/markdown";

	useEffect(() => {
		setProjectId(projectId ?? null);
		return () => {
			setProjectId(null);
		};
	}, [projectId, setProjectId]);

	useEffect(() => {
		if (!projectId) return;
		fetch(`/api/v2/projects/${projectId}`)
			.then((res) => {
				if (res.ok) return res.json();
				return null;
			})
			.then((data: V2Project | null) => {
				if (data) setProjectName(data.name);
			})
			.catch(() => {});
	}, [projectId]);

	useEffect(() => {
		return onTreeChange(() => {
			refetchTree().catch(() => {});
		});
	}, [onTreeChange, refetchTree]);

	const fetchContent = useCallback(
		async (preserveScroll = false) => {
			if (!selectedPath || !projectId) {
				setContent(null);
				setContentLoading(false);
				setContentError(null);
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
				setHeadings([]);
				setActiveHeadingId(null);
			}
			setContentError(null);

			try {
				const response = await fetch(
					`/api/v2/projects/${encodeURIComponent(projectId)}/content/${encodeURIComponent(selectedPath)}`,
				);
				if (!response.ok) {
					if (response.status === 404) {
						throw new Error(`File not found: ${selectedPath}`);
					}
					if (response.status === 410) {
						throw new Error(`Project unavailable: ${projectId}`);
					}
					throw new Error(`Failed to fetch content: ${response.statusText}`);
				}
				const data = (await response.json()) as FileContent;
				setContent(data);
			} catch (err) {
				setContentError(err instanceof Error ? err.message : String(err));
				setContent(null);
			} finally {
				if (!preserveScroll) {
					setContentLoading(false);
				}
			}
		},
		[selectedPath, projectId],
	);

	useEffect(() => {
		fetchContent(false);
	}, [fetchContent]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: restore scroll after content changes
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
	}, [content]);

	const handleRefresh = useCallback(async () => {
		setIsRefreshing(true);
		await fetchContent(true);
		setIsRefreshing(false);
	}, [fetchContent]);

	useEffect(() => {
		if (!selectedPath || !projectId) return;

		return onFileChange((msg) => {
			if (msg.path === selectedPath) {
				handleRefresh().catch(() => {});
			}
		});
	}, [selectedPath, projectId, onFileChange, handleRefresh]);

	const handleFileSelect = useCallback(
		(path: string) => {
			if (projectId) {
				navigate(`/projects/${projectId}/files/${path}`);
			}
			if (isMobile) {
				setSidebarDrawerOpen(false);
			}
		},
		[navigate, projectId, isMobile],
	);

	const handleHeadingsExtracted = useCallback((newHeadings: HeadingEntry[]) => {
		setHeadings(newHeadings);
	}, []);

	const handleToggleTocCollapse = useCallback(() => {
		setTocCollapsed((prev) => {
			const newValue = !prev;
			if (!newValue) {
				setAnnotationSidebarOpen(false);
				if (typeof window !== "undefined") {
					sessionStorage.setItem(STORAGE_KEY_ANNOTATIONS_COLLAPSED, "true");
				}
			}
			if (typeof window !== "undefined") {
				sessionStorage.setItem(STORAGE_KEY_TOC_COLLAPSED, String(newValue));
			}
			return newValue;
		});
	}, []);

	const handleToggleAnnotationSidebar = useCallback((open: boolean) => {
		setAnnotationSidebarOpen(open);
		if (open) {
			setTocCollapsed(true);
			if (typeof window !== "undefined") {
				sessionStorage.setItem(STORAGE_KEY_TOC_COLLAPSED, "true");
			}
		}
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
					const lineElements = document.querySelectorAll(
						`[data-line-number="${anchor.lineNumber}"]`,
					);
					if (lineElements.length > 0) {
						targetElement = lineElements[0];
					}
					break;
				}
				case "text-selection": {
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
				targetElement.scrollIntoView({
					behavior: "smooth",
					block: "center",
				});
			}

			if (isMobile) {
				setAnnotationDrawerOpen(false);
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

	useEffect(() => {
		if (activeHeadingId) {
			const heading = headings.find((h) => h.id === activeHeadingId);
			if (heading) {
				setLiveAnnouncement(`Current section: ${heading.text}`);
			}
		}
	}, [activeHeadingId, headings]);

	const handleKeyDown = useCallback(
		(event: KeyboardEvent) => {
			const target = event.target as HTMLElement;
			const isTextInput =
				target.tagName === "INPUT" ||
				target.tagName === "TEXTAREA" ||
				target.isContentEditable;

			if (isTextInput) return;

			if (event.key === "h" || event.key === "ArrowLeft") {
				event.preventDefault();
				if (projectId) {
					navigate(`/projects/${projectId}`);
				}
			}
		},
		[navigate, projectId],
	);

	useEffect(() => {
		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, [handleKeyDown]);

	useContextualShortcuts({
		viewId: "file-browser",
		viewLabel: "File Browser",
		shortcuts: [
			{
				key: "e",
				label: "Expand",
				description: "Toggle table of contents",
				action: () => {
					handleToggleTocCollapse();
				},
			},
			{
				key: "c",
				label: "Copy",
				description: "Copy file content",
				action: () => {
					if (content?.content) {
						navigator.clipboard.writeText(content.content);
					}
				},
			},
		],
		enabled: !!selectedPath,
	});

	const pathSegments = selectedPath
		? selectedPath.split("/").filter(Boolean)
		: [];

	const contentArea = (
		<>
			{contentLoading ? (
				<div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
					<Loader2 className="h-8 w-8 mb-4 animate-spin" />
					<p className="text-sm">Loading content...</p>
				</div>
			) : contentError ? (
				<div className="flex flex-col items-center justify-center h-64 text-destructive">
					<AlertCircle className="h-12 w-12 mb-4 opacity-70" />
					<p className="text-lg mb-2">Failed to load content</p>
					<p className="text-sm text-muted-foreground">{contentError}</p>
				</div>
			) : !selectedPath ? (
				<div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
					<FileText className="h-12 w-12 mb-4 opacity-50" />
					<p className="text-lg">
						Select a file from the sidebar to view its contents.
					</p>
				</div>
			) : content ? (
				<UnifiedContentRenderer
					content={content.content}
					path={content.path}
					frontmatter={content.frontmatter}
					isRefreshing={isRefreshing}
					onHeadingsExtracted={handleHeadingsExtracted}
					enableAnnotations={ANNOTATIONS_ENABLED}
				/>
			) : null}
		</>
	);

	const liveRegion = (
		<div aria-live="polite" aria-atomic="true" className="sr-only">
			{liveAnnouncement}
		</div>
	);

	const breadcrumb = (
		<nav
			aria-label="Breadcrumb"
			className="flex items-center gap-2 p-4 text-sm text-muted-foreground border-b"
		>
			<ol className="flex items-center gap-1.5">
				<li>
					<Link
						to="/projects"
						className="transition-colors hover:text-foreground"
					>
						Projects
					</Link>
				</li>
				<li aria-hidden="true">
					<ChevronRight className="h-3.5 w-3.5" />
				</li>
				<li>
					<Link
						to={`/projects/${projectId}`}
						className="transition-colors hover:text-foreground"
					>
						{projectName ?? "..."}
					</Link>
				</li>
				<li aria-hidden="true">
					<ChevronRight className="h-3.5 w-3.5" />
				</li>
				<li className={selectedPath ? "" : "text-foreground font-medium"}>
					{selectedPath ? (
						<Link
							to={`/projects/${projectId}/files`}
							className="transition-colors hover:text-foreground"
						>
							Files
						</Link>
					) : (
						"Files"
					)}
				</li>
				{pathSegments.map((segment, index) => {
					const isLast = index === pathSegments.length - 1;
					return (
						<li
							key={pathSegments.slice(0, index + 1).join("/")}
							className="flex items-center gap-1.5"
						>
							<ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
							<span
								className={
									isLast
										? "text-foreground font-medium truncate max-w-[200px]"
										: ""
								}
							>
								{segment}
							</span>
						</li>
					);
				})}
			</ol>
		</nav>
	);

	if (isMobile) {
		const mobileContent = (
			<div className="flex h-full flex-col">
				{liveRegion}
				{breadcrumb}

				<main className="relative flex h-full flex-1 flex-col">
					<div
						className="flex h-10 items-center justify-between gap-2 border-b px-4"
						role="toolbar"
						aria-label="File browser controls"
					>
						<TooltipProvider>
							<Tooltip>
								<TooltipTrigger asChild>
									<Button
										variant="ghost"
										size="icon"
										className="h-8 w-8"
										onClick={() => setSidebarDrawerOpen(true)}
										aria-label="Open file tree"
									>
										<PanelLeft className="h-4 w-4" aria-hidden="true" />
									</Button>
								</TooltipTrigger>
								<TooltipContent>
									<p>File tree</p>
								</TooltipContent>
							</Tooltip>
						</TooltipProvider>

						<div className="flex items-center gap-2">
							{ANNOTATIONS_ENABLED && (
								<MobileAnnotationButton
									artifactPath={selectedPath ?? ""}
									onClick={() => setAnnotationDrawerOpen(true)}
								/>
							)}
							{isMarkdown && (
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
							)}
						</div>
					</div>

					<ScrollArea className="flex-1" viewportRef={scrollViewportRef}>
						<article
							className="p-4"
							aria-label={
								selectedPath
									? `Content of ${selectedPath.split("/").pop()}`
									: "File content"
							}
						>
							{contentArea}
						</article>
					</ScrollArea>
				</main>

				<Drawer
					open={sidebarDrawerOpen}
					onClose={() => setSidebarDrawerOpen(false)}
					side="left"
					title="Files"
				>
					<ScrollArea className="h-full">
						<FileTree
							tree={tree}
							loading={treeLoading}
							error={treeError}
							selectedPath={selectedPath}
							onSelect={handleFileSelect}
						/>
					</ScrollArea>
				</Drawer>

				{isMarkdown && (
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
						/>
					</Drawer>
				)}

				{ANNOTATIONS_ENABLED && (
					<Drawer
						open={annotationDrawerOpen}
						onClose={() => setAnnotationDrawerOpen(false)}
						side="right"
						title="Annotations"
					>
						<AnnotationSidebar
							artifactPath={selectedPath ?? ""}
							onClose={() => setAnnotationDrawerOpen(false)}
							onNavigateToAnnotation={handleNavigateToAnnotation}
							className="border-l-0 w-full"
						/>
					</Drawer>
				)}

				<footer className="border-t px-4 py-2">
					<KeyHints hints={VIEWER_HINTS} />
				</footer>
			</div>
		);

		if (ANNOTATIONS_ENABLED) {
			return (
				<AnnotationProvider artifactPath={selectedPath ?? ""}>
					{mobileContent}
				</AnnotationProvider>
			);
		}

		return mobileContent;
	}

	const desktopContent = (
		<div className="flex h-full flex-col">
			{liveRegion}
			{breadcrumb}

			<ResizablePanelGroup
				direction="horizontal"
				className="flex-1 overflow-hidden"
				autoSaveId="file-browser-panels"
			>
				<ResizablePanel
					defaultSize={18}
					minSize={12}
					maxSize={30}
					collapsible
					className="border-r"
				>
					<aside aria-label="File tree" className="h-full">
						<FileTree
							tree={tree}
							loading={treeLoading}
							error={treeError}
							selectedPath={selectedPath}
							onSelect={handleFileSelect}
						/>
					</aside>
				</ResizablePanel>

				<ResizableHandle withHandle aria-label="Resize file tree" />

				<ResizablePanel
					defaultSize={ANNOTATIONS_ENABLED && isMarkdown ? 55 : 67}
					minSize={40}
				>
					<main className="relative flex h-full flex-col overflow-hidden">
						<div
							className="flex h-10 items-center justify-end gap-2 border-b px-4"
							role="toolbar"
							aria-label="File browser controls"
						>
							{isMarkdown && tocCollapsed && headings.length > 0 && (
								<TooltipProvider>
									<Tooltip>
										<TooltipTrigger asChild>
											<Button
												variant="ghost"
												size="icon"
												className="h-8 w-8"
												onClick={handleToggleTocCollapse}
												aria-label="Open table of contents"
											>
												<List className="h-4 w-4" aria-hidden="true" />
											</Button>
										</TooltipTrigger>
										<TooltipContent>
											<p>Table of contents ({headings.length})</p>
										</TooltipContent>
									</Tooltip>
								</TooltipProvider>
							)}
							{ANNOTATIONS_ENABLED && !annotationSidebarOpen && (
								<AnnotationToggleButton
									artifactPath={selectedPath ?? ""}
									onOpen={() => handleToggleAnnotationSidebar(true)}
								/>
							)}
						</div>

						<ScrollArea
							className="flex-1 min-h-0"
							viewportRef={scrollViewportRef}
						>
							<article
								className="mx-auto max-w-4xl p-6"
								aria-label={
									selectedPath
										? `Content of ${selectedPath.split("/").pop()}`
										: "File content"
								}
							>
								{contentArea}
							</article>
						</ScrollArea>
					</main>
				</ResizablePanel>

				{isMarkdown && !tocCollapsed && (
					<>
						<ResizableHandle withHandle aria-label="Resize table of contents" />

						<ResizablePanel
							defaultSize={15}
							minSize={11}
							maxSize={19}
							collapsible
						>
							<aside aria-label="Table of contents" className="h-full">
								<TableOfContents
									headings={headings}
									activeId={activeHeadingId}
									onNavigate={handleTocNavigate}
									onClose={handleToggleTocCollapse}
								/>
							</aside>
						</ResizablePanel>
					</>
				)}

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
								artifactPath={selectedPath ?? ""}
								onClose={() => handleToggleAnnotationSidebar(false)}
								onNavigateToAnnotation={handleNavigateToAnnotation}
								className="h-full"
							/>
						</ResizablePanel>
					</>
				)}
			</ResizablePanelGroup>

			<footer className="border-t px-4 py-2">
				<KeyHints hints={VIEWER_HINTS} />
			</footer>
		</div>
	);

	if (ANNOTATIONS_ENABLED) {
		return (
			<AnnotationProvider artifactPath={selectedPath ?? ""}>
				{desktopContent}
			</AnnotationProvider>
		);
	}

	return desktopContent;
}
