import {
	AlertCircle,
	ArrowLeft,
	ChevronRight,
	List,
	Loader2,
	MessageSquare,
	PanelLeft,
} from "lucide-react";
import {
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
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
import { KeyHints, VIEWER_HINTS } from "@/components/v2/KeyHints";
import { NewUpdatesChip } from "@/components/v2/NewUpdatesChip";
import { TableOfContents } from "@/components/v2/TableOfContents";
import { UnifiedContentRenderer } from "@/components/v2/UnifiedContentRenderer";
import { useAnnotations } from "@/hooks/useAnnotations";
import { useBreadcrumbContext } from "@/hooks/useBreadcrumbContext";
import { useContextualShortcuts } from "@/hooks/useContextualShortcuts";
import { useFollowMode } from "@/hooks/useFollowMode";
import type { HeadingEntry } from "@/hooks/useHeadingExtraction";
import { useIsMobile } from "@/hooks/useMediaQuery";
import { useReconnectRecovery } from "@/hooks/useReconnectRecovery";
import { useRunDetail } from "@/hooks/useRunDetail";
import { useWorkspaceDescriptor } from "@/hooks/useWorkspaceDescriptor";
import {
	getLinkArtifactContext,
	getLinkArtifactLabel,
	getLinkArtifactTarget,
	isLinkArtifact,
	LINK_ARTIFACT_CONFIG,
	openLinkArtifact,
	orderArtifactsWithLinksLast,
} from "@/lib/link-artifacts";
import { resolveRunDisplayName } from "@/lib/run-display";

import { AnnotationProvider } from "@/providers/AnnotationProvider";
import { useWebSocket } from "@/providers/WebSocketProvider";
import type { Artifact } from "@/types/runs";

const STORAGE_KEY_TOC_COLLAPSED = "rp1-toc-collapsed";
const STORAGE_KEY_ANNOTATIONS_COLLAPSED = "rp1-annotations-collapsed";
const STORAGE_KEY_FRONTMATTER_VISIBLE = "rp1-artifact-frontmatter-visible";

interface ArtifactContent {
	path: string;
	content: string;
	docId?: string;
}

function isSameArtifactContent(
	left: ArtifactContent | null,
	right: ArtifactContent | null,
): boolean {
	if (left === right) return true;
	if (!left || !right) return false;
	return (
		left.path === right.path &&
		left.content === right.content &&
		left.docId === right.docId
	);
}

/**
 * Annotation toggle button component (must be inside AnnotationProvider).
 * Only shows when sidebar is closed - provides a way to open it.
 */
function AnnotationToggleButton({
	selectedArtifactPath,
	onOpen,
}: {
	selectedArtifactPath: string;
	onOpen: () => void;
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
	const { setActiveArtifact, setProject, setRunInfo } = useBreadcrumbContext();
	const { onFileChange, setProjectId } = useWebSocket();
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
	const [showFrontmatter, setShowFrontmatter] = useState<boolean>(() => {
		if (typeof window === "undefined") return false;
		return sessionStorage.getItem(STORAGE_KEY_FRONTMATTER_VISIBLE) === "true";
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
	const isNavigatingRef = useRef(false);
	const navigateTimerRef = useRef<ReturnType<typeof setTimeout>>();
	const savedScrollState = useRef<{
		scrollTop: number;
		scrollHeight: number;
	} | null>(null);
	const latestContentRequestIdRef = useRef(0);

	const {
		followMode,
		hasNewUpdates,
		setFollowMode,
		scrollToNew,
		handleScroll,
	} = useFollowMode(scrollViewportRef);

	const selectedArtifactPath = artifactPathParam || "";
	const selectedArtifact = useMemo(() => {
		if (!run || !selectedArtifactPath) {
			return null;
		}

		return (
			run.artifacts.find(
				(artifact) => artifact.path === selectedArtifactPath,
			) ??
			run.artifacts.find((artifact) =>
				artifact.path.endsWith(`/${selectedArtifactPath}`),
			) ??
			null
		);
	}, [run, selectedArtifactPath]);
	const selectedUrlArtifact =
		selectedArtifact && isLinkArtifact(selectedArtifact)
			? selectedArtifact
			: null;
	const selectedFileArtifact = selectedUrlArtifact ? null : selectedArtifact;
	const selectedFileArtifactPath = selectedFileArtifact?.path ?? "";
	const orderedArtifacts = useMemo(
		() => (run ? orderArtifactsWithLinksLast(run.artifacts) : []),
		[run],
	);
	const linkArtifacts = useMemo(
		() => orderedArtifacts.filter(isLinkArtifact),
		[orderedArtifacts],
	);
	const selectedArtifactName = selectedArtifact
		? isLinkArtifact(selectedArtifact)
			? getLinkArtifactLabel(selectedArtifact)
			: (selectedArtifact.path.split("/").at(-1) ?? selectedArtifact.path)
		: null;
	const workspaceSubtitle = useMemo(() => {
		if (!run) return null;
		return selectedArtifactName ?? run.projectName;
	}, [run, selectedArtifactName]);

	useEffect(() => {
		if (run?.projectName && run?.projectId) {
			setProject(run.projectId, run.projectName);
			setProjectId(run.projectId);
		}

		return () => {
			setProject(null, null);
			setProjectId(null);
		};
	}, [run?.projectId, run?.projectName, setProject, setProjectId]);

	useEffect(() => {
		if (run) {
			setRunInfo({
				startedAt: run.startedAt,
				harness: run.harness,
				command: run.command,
				displayName: resolveRunDisplayName(run) || run.command,
				projectName: run.projectName,
				projectId: run.projectId,
			});
		}

		return () => {
			setRunInfo(null);
		};
	}, [run, setRunInfo]);

	useEffect(() => {
		if (selectedArtifact && !isLinkArtifact(selectedArtifact) && runId) {
			setActiveArtifact(runId, selectedArtifact.path);
		} else {
			setActiveArtifact(runId ?? "", null);
		}
	}, [selectedArtifact, runId, setActiveArtifact]);

	useEffect(() => {
		if (!selectedUrlArtifact) return;
		setAnnotationSidebarOpen(false);
		setAnnotationDrawerOpen(false);
		setTocDrawerOpen(false);
		setHeadings([]);
		setActiveHeadingId(null);
	}, [selectedUrlArtifact]);

	useEffect(() => {
		return () => {
			setActiveArtifact(runId ?? "", null);
		};
	}, [runId, setActiveArtifact]);

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

	const handleToggleFrontmatter = useCallback(() => {
		setShowFrontmatter((prev) => {
			const next = !prev;
			if (typeof window !== "undefined") {
				sessionStorage.setItem(STORAGE_KEY_FRONTMATTER_VISIBLE, String(next));
			}
			return next;
		});
	}, []);

	const handleArtifactSelect = useCallback(
		(artifact: Artifact) => {
			if (isLinkArtifact(artifact)) {
				openLinkArtifact(artifact);
				if (isMobile) {
					setSidebarDrawerOpen(false);
				}
				return;
			}

			navigate(`/runs/${runId}/artifacts/${artifact.path}`);
			if (isMobile) {
				setSidebarDrawerOpen(false);
			}
		},
		[navigate, runId, isMobile],
	);

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

	const handleHeadingsExtracted = useCallback((newHeadings: HeadingEntry[]) => {
		setHeadings(newHeadings);
	}, []);

	const fetchArtifactContentWithScrollPreservation = useCallback(
		async (preserveScroll: boolean) => {
			const requestId = latestContentRequestIdRef.current + 1;
			latestContentRequestIdRef.current = requestId;
			const isLatestContentRequest = () =>
				latestContentRequestIdRef.current === requestId;

			if (!run || !selectedArtifactPath) {
				savedScrollState.current = null;
				setContentLoading(false);
				setArtifactContent(null);
				return;
			}
			if (!selectedArtifact) {
				savedScrollState.current = null;
				setContentLoading(false);
				setContentError("Artifact not found");
				setArtifactContent(null);
				return;
			}
			if (isLinkArtifact(selectedArtifact)) {
				savedScrollState.current = null;
				setContentLoading(false);
				setContentError(null);
				setArtifactContent(null);
				setHeadings([]);
				setActiveHeadingId(null);
				return;
			}

			if (preserveScroll && scrollViewportRef.current) {
				savedScrollState.current = {
					scrollTop: scrollViewportRef.current.scrollTop,
					scrollHeight: scrollViewportRef.current.scrollHeight,
				};
			}

			if (!preserveScroll) {
				savedScrollState.current = null;
				setContentLoading(true);
				// Clear headings when loading new artifact (they'll be repopulated by MarkdownViewer if applicable)
				setHeadings([]);
				setActiveHeadingId(null);
			}
			setContentError(null);

			try {
				const response = await fetch(
					`/api/v2/runs/${runId}/artifacts/${encodeURIComponent(selectedArtifact.path)}`,
				);
				if (!isLatestContentRequest()) {
					return;
				}
				if (!response.ok) {
					let errorMessage = `Failed to fetch artifact: ${response.statusText}`;
					try {
						const errorData = (await response.json()) as {
							error?: string;
						};
						if (errorData.error) {
							errorMessage = errorData.error;
						}
					} catch {
						// fall through: use default error message
					}
					throw new Error(errorMessage);
				}
				const data = (await response.json()) as { content: string };
				if (!isLatestContentRequest()) {
					return;
				}
				const nextContent = {
					path: selectedArtifact.path,
					content: data.content,
					docId: selectedArtifact.docId,
				};
				setArtifactContent((current) => {
					if (isSameArtifactContent(current, nextContent)) {
						if (preserveScroll) {
							savedScrollState.current = null;
						}
						return current;
					}

					return nextContent;
				});
			} catch (err) {
				if (!isLatestContentRequest()) {
					return;
				}
				savedScrollState.current = null;
				setContentError(err instanceof Error ? err.message : String(err));
				setArtifactContent(null);
			} finally {
				if (isLatestContentRequest()) {
					setContentLoading(false);
				}
			}
		},
		[run, runId, selectedArtifact, selectedArtifactPath],
	);

	useEffect(() => {
		fetchArtifactContentWithScrollPreservation(false);
	}, [fetchArtifactContentWithScrollPreservation]);

	useReconnectRecovery(() => fetchArtifactContentWithScrollPreservation(true));

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
		if (!selectedArtifact || isLinkArtifact(selectedArtifact)) return;

		const normalizedPath = selectedArtifact.path.replace(/^\.rp1\//, "");

		const unsubscribe = onFileChange((msg) => {
			if (
				msg.changeType === "modify" &&
				(msg.path === selectedArtifact.path || msg.path === normalizedPath)
			) {
				fetchArtifactContentWithScrollPreservation(true);
			}
		});

		return unsubscribe;
	}, [
		selectedArtifact,
		onFileChange,
		fetchArtifactContentWithScrollPreservation,
	]);

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

			if (!isTextInput && (event.key === "h" || event.key === "ArrowLeft")) {
				event.preventDefault();
				navigate(`/runs/${runId}`);
			}
		},
		[navigate, runId],
	);

	useEffect(() => {
		document.addEventListener("keydown", handleKeyDown);
		return () => {
			document.removeEventListener("keydown", handleKeyDown);
		};
	}, [handleKeyDown]);

	const { workspaceCommands } = useWorkspaceDescriptor({
		title: run ? resolveRunDisplayName(run) || run.command : null,
		subtitle: workspaceSubtitle,
		projectId: run?.projectId ?? null,
		unavailable:
			!isLoading &&
			(error?.message === "Run not found" || (!error && run === null)),
	});

	useContextualShortcuts({
		viewId: "artifact-viewer",
		viewLabel: "Artifact Viewer",
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
				description: "Copy artifact content",
				action: () => {
					if (artifactContent?.content) {
						navigator.clipboard.writeText(artifactContent.content);
					}
				},
			},
			{
				key: "[",
				label: "Previous",
				description: "Previous artifact",
				action: () => {
					if (!run) return;
					const currentIndex = run.artifacts.findIndex(
						(a) => a.path === selectedArtifactPath,
					);
					const previousArtifact = run.artifacts[currentIndex - 1];
					if (currentIndex > 0 && previousArtifact) {
						handleArtifactSelect(previousArtifact);
					}
				},
			},
			{
				key: "]",
				label: "Next",
				description: "Next artifact",
				action: () => {
					if (!run) return;
					const currentIndex = run.artifacts.findIndex(
						(a) => a.path === selectedArtifactPath,
					);
					const nextArtifact = run.artifacts[currentIndex + 1];
					if (
						currentIndex >= 0 &&
						currentIndex < run.artifacts.length - 1 &&
						nextArtifact
					) {
						handleArtifactSelect(nextArtifact);
					}
				},
			},
		],
		commands: [
			...workspaceCommands,
			...(selectedFileArtifact
				? [
						{
							id: "toggle-artifact-frontmatter",
							label: showFrontmatter ? "Hide Frontmatter" : "Show Frontmatter",
							description: showFrontmatter
								? "Hide frontmatter in the current artifact viewer"
								: "Show frontmatter in the current artifact viewer",
							keywords: ["frontmatter", "metadata", "yaml", "artifact"],
							action: handleToggleFrontmatter,
						},
					]
				: []),
		],
		enabled: !!run,
	});

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
						onClick={() => navigate("/runs")}
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
					onClick={() => navigate("/runs")}
					className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm hover:bg-muted/50 transition-colors"
				>
					<ArrowLeft className="h-4 w-4" />
					Back to Runs
				</button>
			</div>
		);
	}

	const LinkIcon = LINK_ARTIFACT_CONFIG.icon;
	const externalLinksFooter =
		linkArtifacts.length > 0 && !selectedUrlArtifact ? (
			<section
				className="mt-8 border-t border-border pt-4"
				aria-label="External links"
			>
				<h2 className="mb-2 text-sm font-medium text-muted-foreground">
					External links
				</h2>
				<ul className="space-y-2">
					{linkArtifacts.map((artifact) => (
						<li key={artifact.docId} className="min-w-0">
							<button
								type="button"
								onClick={() => openLinkArtifact(artifact)}
								className="group flex max-w-full items-start gap-2 text-left"
							>
								<LinkIcon
									className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground"
									aria-hidden="true"
								/>
								<span className="min-w-0">
									<span className="block truncate text-sm font-medium text-foreground">
										{getLinkArtifactLabel(artifact)}
									</span>
									<span className="block truncate text-xs text-muted-foreground">
										{getLinkArtifactContext(artifact)}
									</span>
								</span>
							</button>
						</li>
					))}
				</ul>
			</section>
		) : null;

	const contentArea = (
		<>
			{contentLoading ? (
				<div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
					<Loader2 className="h-8 w-8 mb-4 animate-spin" />
					<p className="text-sm">Loading artifact...</p>
				</div>
			) : selectedUrlArtifact ? (
				<div className="flex h-64 flex-col items-center justify-center gap-3 text-center">
					<h2 className="text-base font-medium text-foreground">
						{getLinkArtifactLabel(selectedUrlArtifact)}
					</h2>
					<button
						type="button"
						onClick={() => openLinkArtifact(selectedUrlArtifact)}
						className="max-w-full truncate text-sm text-primary underline-offset-4 hover:underline"
					>
						{getLinkArtifactTarget(selectedUrlArtifact)}
					</button>
					<Button
						variant="outline"
						size="sm"
						onClick={() => openLinkArtifact(selectedUrlArtifact)}
					>
						<LinkIcon className="mr-2 h-4 w-4" aria-hidden="true" />
						Open link
					</Button>
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
				<UnifiedContentRenderer
					content={artifactContent.content}
					path={artifactContent.path}
					showFrontmatter={showFrontmatter}
					onHeadingsExtracted={handleHeadingsExtracted}
					runId={runId}
					docId={artifactContent.docId}
				/>
			) : null}
		</>
	);

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
								to="/projects"
								className="hover:text-foreground transition-colors"
							>
								{run.projectName}
							</Link>
						</li>
						<li aria-hidden="true">
							<ChevronRight className="h-4 w-4" />
						</li>
						{resolveRunDisplayName(run) && (
							<>
								<li>
									<Link
										to={`/runs/${runId}`}
										className="hover:text-foreground transition-colors"
									>
										{resolveRunDisplayName(run)}
									</Link>
								</li>
								<li aria-hidden="true">
									<ChevronRight className="h-4 w-4" />
								</li>
							</>
						)}
						<li aria-current="page">
							<span className="text-foreground truncate max-w-[100px]">
								{selectedArtifactName ?? "Artifacts"}
							</span>
						</li>
					</ol>
				</nav>

				<main className="relative flex h-full flex-1 flex-col">
					<div
						className="flex h-10 items-center justify-between gap-2 border-b px-4"
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
							{selectedFileArtifact && (
								<MobileAnnotationButton
									selectedArtifactPath={selectedFileArtifactPath}
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
								selectedArtifactName
									? `Content of ${selectedArtifactName}`
									: "Artifact content"
							}
						>
							{contentArea}
							{externalLinksFooter}
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
							artifacts={orderedArtifacts}
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
					/>
				</Drawer>

				{selectedFileArtifact && (
					<Drawer
						open={annotationDrawerOpen}
						onClose={() => setAnnotationDrawerOpen(false)}
						side="right"
						title="Annotations"
					>
						<AnnotationSidebar
							artifactPath={selectedFileArtifactPath}
							onClose={() => setAnnotationDrawerOpen(false)}
							className="border-l-0 w-full"
						/>
					</Drawer>
				)}

				<footer className="border-t px-4 py-2">
					<KeyHints hints={VIEWER_HINTS} />
				</footer>
			</div>
		);

		return (
			<AnnotationProvider
				artifactPath={selectedFileArtifactPath}
				docId={selectedFileArtifact?.docId}
				runId={runId}
			>
				{mobileContent}
			</AnnotationProvider>
		);
	}

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
							to="/projects"
							className="hover:text-foreground transition-colors"
						>
							{run.projectName}
						</Link>
					</li>
					<li aria-hidden="true">
						<ChevronRight className="h-4 w-4" />
					</li>
					{resolveRunDisplayName(run) && (
						<>
							<li>
								<Link
									to={`/runs/${runId}`}
									className="hover:text-foreground transition-colors"
								>
									{resolveRunDisplayName(run)}
								</Link>
							</li>
							<li aria-hidden="true">
								<ChevronRight className="h-4 w-4" />
							</li>
						</>
					)}
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
									{selectedArtifactName ??
										selectedArtifactPath.split("/").pop()}
								</span>
							</li>
						</>
					)}
				</ol>
			</nav>

			<ResizablePanelGroup
				direction="horizontal"
				className="flex-1 overflow-hidden"
				autoSaveId="artifact-viewer-panels"
			>
				<ResizablePanel
					defaultSize={15}
					minSize={12}
					maxSize={22}
					collapsible
					className="bg-card"
				>
					<aside aria-label="Artifact list" className="h-full">
						<ScrollArea className="h-full">
							<ArtifactSidebar
								artifacts={orderedArtifacts}
								selectedPath={selectedArtifactPath}
								onSelect={handleArtifactSelect}
							/>
						</ScrollArea>
					</aside>
				</ResizablePanel>

				<ResizableHandle withHandle aria-label="Resize sidebar" />

				<ResizablePanel defaultSize={55} minSize={40}>
					<main className="relative flex h-full flex-col overflow-hidden min-w-0">
						<div
							className="flex h-10 items-center justify-end gap-2 border-b px-4"
							role="toolbar"
							aria-label="Artifact viewer controls"
						>
							<FollowModeToggle
								enabled={followMode}
								onToggle={() => setFollowMode(!followMode)}
							/>
							{tocCollapsed && headings.length > 0 && (
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
							{selectedFileArtifact && !annotationSidebarOpen && (
								<AnnotationToggleButton
									selectedArtifactPath={selectedFileArtifactPath}
									onOpen={() => handleToggleAnnotationSidebar(true)}
								/>
							)}
						</div>

						<ScrollArea
							className="flex-1 min-h-0"
							viewportRef={scrollViewportRef}
						>
							<article
								className="p-6 min-w-0 max-w-full"
								onScroll={handleScroll as unknown as React.UIEventHandler}
								aria-label={
									selectedArtifactName
										? `Content of ${selectedArtifactName}`
										: "Artifact content"
								}
							>
								{contentArea}
								{externalLinksFooter}
							</article>
						</ScrollArea>

						<NewUpdatesChip visible={hasNewUpdates} onClick={scrollToNew} />
					</main>
				</ResizablePanel>

				{!tocCollapsed && (
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

				{selectedFileArtifact && annotationSidebarOpen && (
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
								artifactPath={selectedFileArtifactPath}
								onClose={() => handleToggleAnnotationSidebar(false)}
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

	return (
		<AnnotationProvider
			artifactPath={selectedFileArtifactPath}
			docId={selectedFileArtifact?.docId}
			runId={runId}
		>
			{desktopContent}
		</AnnotationProvider>
	);
}
