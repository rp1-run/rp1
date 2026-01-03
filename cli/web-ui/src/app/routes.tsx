import { AlertCircle, FileText, Loader2, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
	createBrowserRouter,
	Navigate,
	useNavigate,
	useParams,
} from "react-router-dom";
import { MarkdownViewer } from "@/components/MarkdownViewer";
import { useWebSocket } from "@/providers/WebSocketProvider";
import { Layout } from "./Layout";

interface FileContent {
	path: string;
	content: string;
	mimeType: string;
	frontmatter?: Record<string, unknown>;
}

export const router = createBrowserRouter([
	{
		path: "/",
		element: <RootRedirect />,
	},
	{
		path: "/project/:projectId",
		element: <Layout />,
		children: [
			{
				index: true,
				element: <Navigate to="view/context/index.md" replace />,
			},
			{
				path: "view/*",
				element: <ContentView />,
			},
		],
	},
	{
		path: "/view/*",
		element: <LegacyRedirect />,
	},
]);

/**
 * Root redirect - navigate to last invoked project or first available.
 */
function RootRedirect() {
	const navigate = useNavigate();
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		async function redirectToProject() {
			try {
				const response = await fetch("/api/projects");
				if (!response.ok) {
					setError(`Failed to fetch projects: ${response.statusText}`);
					return;
				}

				const data = (await response.json()) as {
					projects: Array<{ id: string; available: boolean }>;
					lastInvoked: string | null;
				};

				if (data.projects.length === 0) {
					setError(
						"No projects registered. Run `rp1 view` in a project directory to register it.",
					);
					return;
				}

				let targetId = data.lastInvoked;
				if (!targetId || !data.projects.find((p) => p.id === targetId)) {
					const available = data.projects.find((p) => p.available);
					targetId = available?.id ?? data.projects[0].id;
				}

				navigate(`/project/${targetId}`, { replace: true });
			} catch (err) {
				setError(err instanceof Error ? err.message : String(err));
			}
		}

		redirectToProject();
	}, [navigate]);

	if (error) {
		return (
			<div className="flex flex-col items-center justify-center h-screen text-muted-foreground">
				<AlertCircle className="h-12 w-12 mb-4 text-destructive opacity-70" />
				<p className="text-lg mb-2">No projects available</p>
				<p className="text-sm">{error}</p>
			</div>
		);
	}

	return (
		<div className="flex flex-col items-center justify-center h-screen text-muted-foreground">
			<Loader2 className="h-8 w-8 mb-4 animate-spin" />
			<p className="text-sm">Loading projects...</p>
		</div>
	);
}

/**
 * Legacy redirect - /view/* -> /project/:lastInvoked/view/*
 * For backward compatibility with old URL structure.
 */
function LegacyRedirect() {
	const params = useParams();
	const navigate = useNavigate();
	const path = params["*"] || "context/index.md";
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		async function redirectWithProject() {
			try {
				const response = await fetch("/api/projects");
				if (!response.ok) {
					setError(`Failed to fetch projects: ${response.statusText}`);
					return;
				}

				const data = (await response.json()) as {
					projects: Array<{ id: string; available: boolean }>;
					lastInvoked: string | null;
				};

				if (data.projects.length === 0) {
					setError("No projects registered");
					return;
				}

				let targetId = data.lastInvoked;
				if (!targetId || !data.projects.find((p) => p.id === targetId)) {
					const available = data.projects.find((p) => p.available);
					targetId = available?.id ?? data.projects[0].id;
				}

				navigate(`/project/${targetId}/view/${path}`, { replace: true });
			} catch (err) {
				setError(err instanceof Error ? err.message : String(err));
			}
		}

		redirectWithProject();
	}, [navigate, path]);

	if (error) {
		return (
			<div className="flex flex-col items-center justify-center h-screen text-muted-foreground">
				<AlertCircle className="h-12 w-12 mb-4 text-destructive opacity-70" />
				<p className="text-lg">{error}</p>
			</div>
		);
	}

	return (
		<div className="flex flex-col items-center justify-center h-screen text-muted-foreground">
			<Loader2 className="h-8 w-8 mb-4 animate-spin" />
			<p className="text-sm">Redirecting...</p>
		</div>
	);
}

function ContentView() {
	const params = useParams();
	const projectId = params.projectId;
	const path = params["*"] || null;
	const { onFileChange } = useWebSocket();
	const [content, setContent] = useState<FileContent | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [isRefreshing, setIsRefreshing] = useState(false);
	const scrollPositionRef = useRef(0);

	const fetchContent = useCallback(async () => {
		if (!path || !projectId) {
			setContent(null);
			setLoading(false);
			setError(null);
			return;
		}

		setLoading(true);
		setError(null);

		try {
			const response = await fetch(
				`/api/projects/${encodeURIComponent(projectId)}/content/${encodeURIComponent(path)}`,
			);
			if (!response.ok) {
				if (response.status === 404) {
					throw new Error(`File not found: ${path}`);
				}
				if (response.status === 410) {
					throw new Error(`Project unavailable: ${projectId}`);
				}
				throw new Error(`Failed to fetch content: ${response.statusText}`);
			}
			const data = (await response.json()) as FileContent;
			setContent(data);
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
			setContent(null);
		} finally {
			setLoading(false);
		}
	}, [path, projectId]);

	useEffect(() => {
		fetchContent();
	}, [fetchContent]);

	const handleRefresh = useCallback(async () => {
		const scrollContainer = document.querySelector(
			"[data-radix-scroll-area-viewport]",
		);
		if (scrollContainer) {
			scrollPositionRef.current = scrollContainer.scrollTop;
		}

		setIsRefreshing(true);
		await fetchContent();
		setIsRefreshing(false);

		requestAnimationFrame(() => {
			const scrollContainer = document.querySelector(
				"[data-radix-scroll-area-viewport]",
			);
			if (scrollContainer) {
				scrollContainer.scrollTop = scrollPositionRef.current;
			}
		});
	}, [fetchContent]);

	const navigate = useNavigate();

	useEffect(() => {
		if (!path || !projectId) return;

		return onFileChange((msg) => {
			if (msg.path === path) {
				handleRefresh().catch((err) => {
					// File may no longer exist after branch switch
					if (err instanceof Error && err.message.includes("not found")) {
						navigate(`/project/${projectId}/view/context/index.md`, {
							replace: true,
						});
					}
					// Other errors already set error state via fetchContent
				});
			}
		});
	}, [path, projectId, onFileChange, handleRefresh, navigate]);

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

	if (loading && !isRefreshing) {
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
