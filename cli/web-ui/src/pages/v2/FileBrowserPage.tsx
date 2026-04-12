import { List, PanelLeft } from "lucide-react";
import {
	useCallback,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
} from "react";
import { useNavigate, useParams } from "react-router-dom";
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
import { ContentPanel } from "@/components/v2/ContentPanel";
import { TableOfContents } from "@/components/v2/TableOfContents";
import { useBreadcrumbContext } from "@/hooks/useBreadcrumbContext";
import { useContextualShortcuts } from "@/hooks/useContextualShortcuts";
import type { HeadingEntry } from "@/hooks/useHeadingExtraction";
import { useIsMobile } from "@/hooks/useMediaQuery";
import { useProjectFileTree } from "@/hooks/useProjectFileTree";
import { useProjects } from "@/hooks/useProjects";
import { useReconnectRecovery } from "@/hooks/useReconnectRecovery";
import { useWorkspaceDescriptor } from "@/hooks/useWorkspaceDescriptor";
import { useWebSocket } from "@/providers/WebSocketProvider";

import type { FileContent } from "../../server/routes/content-utils";

const STORAGE_KEY_TOC_COLLAPSED = "rp1-file-browser-toc-collapsed";
const STORAGE_KEY_FRONTMATTER_VISIBLE = "rp1-file-browser-frontmatter-visible";
const fileBrowserContentCache = new Map<string, FileContent>();

function isSameFileContent(
	left: FileContent | null,
	right: FileContent | null,
): boolean {
	if (left === right) return true;
	if (!left || !right) return false;
	return (
		left.path === right.path &&
		left.content === right.content &&
		left.mimeType === right.mimeType
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
	const contentCacheKey =
		projectId && selectedPath ? `${projectId}:${selectedPath}` : null;

	const {
		tree,
		loading: treeLoading,
		error: treeError,
		refetch: refetchTree,
	} = useProjectFileTree(projectId);
	const { setProjectId, onTreeChange, onFileChange } = useWebSocket();

	const [content, setContent] = useState<FileContent | null>(() =>
		contentCacheKey
			? (fileBrowserContentCache.get(contentCacheKey) ?? null)
			: null,
	);
	const [contentLoading, setContentLoading] = useState(
		() =>
			contentCacheKey !== null && !fileBrowserContentCache.has(contentCacheKey),
	);
	const [contentError, setContentError] = useState<string | null>(null);
	const [isRefreshing, setIsRefreshing] = useState(false);
	const [headings, setHeadings] = useState<readonly HeadingEntry[]>([]);
	const [activeHeadingId, setActiveHeadingId] = useState<string | null>(null);
	const [tocCollapsed, setTocCollapsed] = useState<boolean>(() => {
		if (typeof window === "undefined") return true;
		const stored = sessionStorage.getItem(STORAGE_KEY_TOC_COLLAPSED);
		return stored === null ? true : stored === "true";
	});
	const [showFrontmatter, setShowFrontmatter] = useState<boolean>(() => {
		if (typeof window === "undefined") return false;
		return sessionStorage.getItem(STORAGE_KEY_FRONTMATTER_VISIBLE) === "true";
	});
	const [sidebarDrawerOpen, setSidebarDrawerOpen] = useState(false);
	const [tocDrawerOpen, setTocDrawerOpen] = useState(false);
	const [liveAnnouncement, setLiveAnnouncement] = useState<string>("");

	const scrollViewportRef = useRef<HTMLDivElement>(null);
	const headingElementsRef = useRef<Map<string, Element>>(new Map());
	const isNavigatingRef = useRef(false);
	const navigateTimerRef = useRef<ReturnType<typeof setTimeout>>();
	const savedScrollState = useRef<{
		scrollTop: number;
		scrollHeight: number;
	} | null>(null);

	const isMarkdown =
		selectedPath?.endsWith(".md") || content?.mimeType === "text/markdown";

	const { projects } = useProjects();
	const { setProject } = useBreadcrumbContext();

	const project = projectId
		? (projects.find((p) => p.id === projectId) ?? null)
		: null;
	const projectName = project?.name ?? projectId ?? null;
	const projectPath = project?.path ?? null;
	const selectedFileName = selectedPath?.split("/").at(-1) ?? null;

	useEffect(() => {
		if (projectId) {
			setProject(projectId, projectName ?? projectId);
		}
		return () => {
			setProject(null, null);
		};
	}, [projectId, projectName, setProject]);

	useEffect(() => {
		setProjectId(projectId ?? null);
		return () => {
			setProjectId(null);
		};
	}, [projectId, setProjectId]);

	useEffect(() => {
		return onTreeChange(() => {
			refetchTree().catch(() => {});
		});
	}, [onTreeChange, refetchTree]);

	const fetchContent = useCallback(
		async (preserveScroll = false) => {
			if (!selectedPath || !projectId) {
				savedScrollState.current = null;
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

			const cachedContent = contentCacheKey
				? (fileBrowserContentCache.get(contentCacheKey) ?? null)
				: null;

			if (!preserveScroll && cachedContent === null) {
				savedScrollState.current = null;
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
				if (contentCacheKey) {
					fileBrowserContentCache.set(contentCacheKey, data);
				}
				setContent((current) => {
					if (isSameFileContent(current, data)) {
						if (preserveScroll) {
							savedScrollState.current = null;
						}
						return current;
					}

					return data;
				});
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);
				const isTerminalError =
					message.startsWith("File not found:") ||
					message.startsWith("Project unavailable:");

				if (isTerminalError || cachedContent === null) {
					savedScrollState.current = null;
					if (isTerminalError && contentCacheKey) {
						fileBrowserContentCache.delete(contentCacheKey);
					}
					setContentError(message);
					setContent(null);
				}
			} finally {
				setContentLoading(false);
				setIsRefreshing(false);
			}
		},
		[selectedPath, projectId, contentCacheKey],
	);

	useEffect(() => {
		if (!contentCacheKey) {
			setContent(null);
			setContentLoading(false);
			setContentError(null);
			return;
		}

		const cachedContent = fileBrowserContentCache.get(contentCacheKey) ?? null;
		setContent(cachedContent);
		setContentLoading(cachedContent === null);
		setContentError(null);
		void fetchContent(false);
	}, [contentCacheKey, fetchContent]);

	useReconnectRecovery(() => fetchContent(true));

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
			if (typeof window !== "undefined") {
				sessionStorage.setItem(STORAGE_KEY_TOC_COLLAPSED, String(newValue));
			}
			return newValue;
		});
	}, []);

	const handleToggleFrontmatter = useCallback(() => {
		setShowFrontmatter((prev) => {
			const next = !prev;
			if (typeof window !== "undefined") {
				sessionStorage.setItem(STORAGE_KEY_FRONTMATTER_VISIBLE, String(next));
			}
			return next;
		});
	}, []);

	const handleTocNavigate = useCallback((id: string) => {
		const element = document.getElementById(id);
		if (!element) return;

		isNavigatingRef.current = true;
		setActiveHeadingId(id);
		element.scrollIntoView({ behavior: "smooth", block: "start" });

		if (navigateTimerRef.current) clearTimeout(navigateTimerRef.current);
		navigateTimerRef.current = setTimeout(() => {
			isNavigatingRef.current = false;
		}, 500);
	}, []);

	const handleTocNavigateMobile = useCallback(
		(id: string) => {
			const element = document.getElementById(id);
			if (!element) return;

			isNavigatingRef.current = true;
			setActiveHeadingId(id);
			element.scrollIntoView({ behavior: "smooth", block: "start" });

			if (navigateTimerRef.current) clearTimeout(navigateTimerRef.current);
			navigateTimerRef.current = setTimeout(() => {
				isNavigatingRef.current = false;
			}, 500);

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
			if (isNavigatingRef.current) return;

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

	const { workspaceCommands } = useWorkspaceDescriptor({
		title:
			projectName && projectId ? `${projectName} files` : (projectName ?? null),
		subtitle: selectedFileName,
		projectId: projectId ?? null,
		unavailable:
			!treeLoading &&
			typeof treeError === "string" &&
			(treeError.includes("Project unavailable") ||
				treeError.includes("Not Found")),
	});

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
		commands: [
			...workspaceCommands,
			...(selectedPath
				? [
						{
							id: "toggle-file-frontmatter",
							label: showFrontmatter ? "Hide Frontmatter" : "Show Frontmatter",
							description: showFrontmatter
								? "Hide frontmatter in the current file viewer"
								: "Show frontmatter in the current file viewer",
							keywords: ["frontmatter", "metadata", "yaml", "file"],
							action: handleToggleFrontmatter,
						},
					]
				: []),
		],
		enabled: !!projectId,
	});

	const liveRegion = (
		<div aria-live="polite" aria-atomic="true" className="sr-only">
			{liveAnnouncement}
		</div>
	);

	if (isMobile) {
		const mobileContent = (
			<div className="flex h-full flex-col">
				{liveRegion}

				<main className="relative flex h-full flex-1 flex-col">
					<div
						className="flex h-10 items-center justify-between gap-2 px-4"
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
										<PanelLeft
											className="h-4 w-4"
											strokeWidth={1.5}
											aria-hidden="true"
										/>
									</Button>
								</TooltipTrigger>
								<TooltipContent>
									<p>File tree</p>
								</TooltipContent>
							</Tooltip>
						</TooltipProvider>

						<div className="flex items-center gap-2">
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
												<List
													className="h-4 w-4"
													strokeWidth={1.5}
													aria-hidden="true"
												/>
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
						<ContentPanel
							content={content?.content ?? null}
							path={selectedPath ?? null}
							isLoading={contentLoading}
							error={contentError}
							emptyMessage="Select a file from the sidebar to view its contents."
							frontmatter={content?.frontmatter}
							showFrontmatter={showFrontmatter}
							isRefreshing={isRefreshing}
							onHeadingsExtracted={handleHeadingsExtracted}
							scrollViewportRef={scrollViewportRef}
							projectId={projectId}
							filePath={selectedPath ?? undefined}
							enableAnnotations={false}
						/>
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
							projectPath={projectPath}
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
			</div>
		);

		return mobileContent;
	}

	const desktopContent = (
		<div className="flex h-full flex-col">
			{liveRegion}

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
					className="bg-surface-void"
				>
					<aside aria-label="File tree" className="h-full">
						<FileTree
							tree={tree}
							loading={treeLoading}
							error={treeError}
							selectedPath={selectedPath}
							onSelect={handleFileSelect}
							projectPath={projectPath}
						/>
					</aside>
				</ResizablePanel>

				<ResizableHandle aria-label="Resize file tree" />

				<ResizablePanel defaultSize={isMarkdown ? 55 : 67} minSize={40}>
					<main className="relative flex h-full flex-col overflow-hidden">
						<div
							className="flex h-10 items-center justify-end gap-2 px-4"
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
												<List
													className="h-4 w-4"
													strokeWidth={1.5}
													aria-hidden="true"
												/>
											</Button>
										</TooltipTrigger>
										<TooltipContent>
											<p>Table of contents ({headings.length})</p>
										</TooltipContent>
									</Tooltip>
								</TooltipProvider>
							)}
						</div>

						<ScrollArea
							className="flex-1 min-h-0"
							viewportRef={scrollViewportRef}
						>
							<ContentPanel
								content={content?.content ?? null}
								path={selectedPath ?? null}
								isLoading={contentLoading}
								error={contentError}
								emptyMessage="Select a file from the sidebar to view its contents."
								frontmatter={content?.frontmatter}
								showFrontmatter={showFrontmatter}
								isRefreshing={isRefreshing}
								onHeadingsExtracted={handleHeadingsExtracted}
								scrollViewportRef={scrollViewportRef}
								projectId={projectId}
								filePath={selectedPath ?? undefined}
								enableAnnotations={false}
							/>
						</ScrollArea>
					</main>
				</ResizablePanel>

				{isMarkdown && !tocCollapsed && (
					<>
						<ResizableHandle aria-label="Resize table of contents" />

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
			</ResizablePanelGroup>
		</div>
	);

	return desktopContent;
}
