import {
	AlertCircle,
	ChevronRight,
	FileText,
	Loader2,
	RefreshCw,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { FileTree } from "@/components/FileTree";
import { MarkdownViewer } from "@/components/MarkdownViewer";
import { CodeBlock } from "@/components/MarkdownViewer/CodeBlock";
import {
	ResizableHandle,
	ResizablePanel,
	ResizablePanelGroup,
} from "@/components/ui/resizable";
import { ScrollArea } from "@/components/ui/scroll-area";
import { KeyHints, VIEWER_HINTS } from "@/components/v2/KeyHints";
import { useProjectFileTree } from "@/hooks/useProjectFileTree";
import { getCodeLanguageFromPath } from "@/lib/code-language";
import { useWebSocket } from "@/providers/WebSocketProvider";
import type { V2Project } from "@/types/projects";
import type { FileContent } from "../../server/routes/api";

export function FileBrowserPage() {
	const { projectId, "*": filePath } = useParams<{
		projectId: string;
		"*": string;
	}>();
	const navigate = useNavigate();
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
	const scrollPositionRef = useRef(0);

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

	const fetchContent = useCallback(async () => {
		if (!selectedPath || !projectId) {
			setContent(null);
			setContentLoading(false);
			setContentError(null);
			return;
		}

		setContentLoading(true);
		setContentError(null);

		try {
			const response = await fetch(
				`/api/projects/${encodeURIComponent(projectId)}/content/${encodeURIComponent(selectedPath)}`,
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
			setContentLoading(false);
		}
	}, [selectedPath, projectId]);

	useEffect(() => {
		fetchContent();
	}, [fetchContent]);

	const handleRefresh = useCallback(async () => {
		const scrollContainer = document.querySelector(
			"#file-browser-content [data-radix-scroll-area-viewport]",
		);
		if (scrollContainer) {
			scrollPositionRef.current = scrollContainer.scrollTop;
		}

		setIsRefreshing(true);
		await fetchContent();
		setIsRefreshing(false);

		requestAnimationFrame(() => {
			const scrollContainer = document.querySelector(
				"#file-browser-content [data-radix-scroll-area-viewport]",
			);
			if (scrollContainer) {
				scrollContainer.scrollTop = scrollPositionRef.current;
			}
		});
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
		},
		[navigate, projectId],
	);

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

	const pathSegments = selectedPath
		? selectedPath.split("/").filter(Boolean)
		: [];

	return (
		<div className="flex h-full flex-col">
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

				<ResizablePanel defaultSize={82} minSize={50}>
					<div id="file-browser-content" className="h-full">
						<ScrollArea className="h-full">
							<div className="mx-auto max-w-4xl p-6">
								<ContentViewer
									path={selectedPath}
									content={content}
									loading={contentLoading && !isRefreshing}
									error={contentError}
									isRefreshing={isRefreshing}
								/>
							</div>
						</ScrollArea>
					</div>
				</ResizablePanel>
			</ResizablePanelGroup>

			<footer className="border-t px-4 py-2">
				<KeyHints hints={VIEWER_HINTS} />
			</footer>
		</div>
	);
}

function ContentViewer({
	path,
	content,
	loading,
	error,
	isRefreshing,
}: {
	path: string | null;
	content: FileContent | null;
	loading: boolean;
	error: string | null;
	isRefreshing: boolean;
}) {
	if (!path) {
		return (
			<div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
				<FileText className="h-12 w-12 mb-4 opacity-50" />
				<p className="text-lg">
					Select a file from the sidebar to view its contents.
				</p>
			</div>
		);
	}

	if (loading) {
		return (
			<div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
				<Loader2 className="h-8 w-8 mb-4 animate-spin" />
				<p className="text-sm">Loading content...</p>
			</div>
		);
	}

	if (error) {
		return (
			<div className="flex flex-col items-center justify-center h-64 text-destructive">
				<AlertCircle className="h-12 w-12 mb-4 opacity-70" />
				<p className="text-lg mb-2">Failed to load content</p>
				<p className="text-sm text-muted-foreground">{error}</p>
			</div>
		);
	}

	if (!content) {
		return (
			<div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
				<FileText className="h-12 w-12 mb-4 opacity-50" />
				<p className="text-lg">No content available.</p>
			</div>
		);
	}

	if (content.mimeType === "text/markdown" || path.endsWith(".md")) {
		return (
			<div className="relative">
				{isRefreshing && (
					<div className="absolute top-0 right-0 flex items-center gap-1.5 px-2 py-1 text-xs text-muted-foreground bg-background/80 backdrop-blur-sm rounded-bl border-l border-b z-10">
						<RefreshCw className="h-3 w-3 animate-spin" />
						<span>Refreshing...</span>
					</div>
				)}
				<MarkdownViewer
					content={content.content}
					path={content.path}
					frontmatter={content.frontmatter}
					showFrontmatter={false}
				/>
			</div>
		);
	}

	const codeLanguage = getCodeLanguageFromPath(path);
	if (codeLanguage) {
		return (
			<div className="relative">
				{isRefreshing && (
					<div className="absolute top-0 right-0 flex items-center gap-1.5 px-2 py-1 text-xs text-muted-foreground bg-background/80 backdrop-blur-sm rounded-bl border-l border-b z-10">
						<RefreshCw className="h-3 w-3 animate-spin" />
						<span>Refreshing...</span>
					</div>
				)}
				<CodeBlock code={content.content} language={codeLanguage} />
			</div>
		);
	}

	return (
		<div className="rounded-lg border bg-muted/50 p-4">
			<div className="flex items-center gap-2 text-xs text-muted-foreground mb-3 pb-2 border-b">
				<FileText className="h-3.5 w-3.5" />
				<span>{path}</span>
				<span className="ml-auto">{content.mimeType}</span>
			</div>
			<pre className="text-sm overflow-x-auto whitespace-pre-wrap">
				<code>{content.content}</code>
			</pre>
		</div>
	);
}
