import { PanelLeft, PanelLeftClose } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ImperativePanelHandle } from "react-resizable-panels";
import { Outlet, useNavigate, useParams } from "react-router-dom";
import { FileTree } from "@/components/FileTree";
import { ProjectSwitcher } from "@/components/ProjectSwitcher";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import {
	ResizableHandle,
	ResizablePanel,
	ResizablePanelGroup,
} from "@/components/ui/resizable";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useWebSocket } from "@/providers/WebSocketProvider";
import type { FileNode } from "../server/routes/api";

const SIDEBAR_COLLAPSED_KEY = "rp1-ui-sidebar-collapsed";
const SIDEBAR_SIZE_KEY = "rp1-ui-sidebar-size";

function loadSidebarCollapsed(): boolean {
	try {
		return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "true";
	} catch {
		return false;
	}
}

function saveSidebarCollapsed(collapsed: boolean): void {
	try {
		localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(collapsed));
	} catch {
		// ignore
	}
}

function loadSidebarSize(): number {
	try {
		const stored = localStorage.getItem(SIDEBAR_SIZE_KEY);
		if (stored) {
			const size = parseFloat(stored);
			if (!Number.isNaN(size) && size >= 15 && size <= 40) {
				return size;
			}
		}
	} catch {
		// ignore
	}
	return 20;
}

function saveSidebarSize(size: number): void {
	try {
		localStorage.setItem(SIDEBAR_SIZE_KEY, String(size));
	} catch {
		// ignore
	}
}

interface UseProjectFileTreeResult {
	tree: FileNode[];
	loading: boolean;
	error: string | null;
	refetch: () => Promise<void>;
}

function useProjectFileTree(
	projectId: string | undefined,
): UseProjectFileTreeResult {
	const [tree, setTree] = useState<FileNode[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const fetchTree = useCallback(async () => {
		if (!projectId) {
			setTree([]);
			setLoading(false);
			return;
		}

		setLoading(true);
		setError(null);

		try {
			const response = await fetch(
				`/api/projects/${encodeURIComponent(projectId)}/files`,
			);
			if (!response.ok) {
				if (response.status === 410) {
					throw new Error(`Project unavailable: ${projectId}`);
				}
				throw new Error(`Failed to fetch file tree: ${response.statusText}`);
			}
			const data = await response.json();
			setTree(data);
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		} finally {
			setLoading(false);
		}
	}, [projectId]);

	useEffect(() => {
		fetchTree();
	}, [fetchTree]);

	return {
		tree,
		loading,
		error,
		refetch: fetchTree,
	};
}

export function Layout() {
	const [sidebarCollapsed, setSidebarCollapsed] =
		useState(loadSidebarCollapsed);
	const [sidebarSize, setSidebarSize] = useState(loadSidebarSize);
	const sidebarRef = useRef<ImperativePanelHandle>(null);
	const navigate = useNavigate();
	const params = useParams();
	const projectId = params.projectId;
	const { tree, loading, error, refetch } = useProjectFileTree(projectId);
	const { status: wsStatus, onTreeChange } = useWebSocket();

	const selectedPath = params["*"] || null;

	useEffect(() => {
		return onTreeChange(() => {
			refetch().catch((err) => {
				console.warn("Tree refetch failed, likely branch switch:", err);
				// Non-fatal: tree will be stale but will auto-recover on next successful poll
			});
		});
	}, [onTreeChange, refetch]);

	const handleFileSelect = useCallback(
		(path: string) => {
			if (projectId) {
				navigate(`/project/${projectId}/view/${path}`);
			}
		},
		[navigate, projectId],
	);

	const toggleSidebar = useCallback(() => {
		const newCollapsed = !sidebarCollapsed;
		setSidebarCollapsed(newCollapsed);
		saveSidebarCollapsed(newCollapsed);

		if (sidebarRef.current) {
			if (newCollapsed) {
				sidebarRef.current.collapse();
			} else {
				sidebarRef.current.expand();
			}
		}
	}, [sidebarCollapsed]);

	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if ((e.metaKey || e.ctrlKey) && e.key === "b") {
				e.preventDefault();
				toggleSidebar();
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [toggleSidebar]);

	const handleSidebarResize = useCallback((size: number) => {
		if (size > 0) {
			setSidebarSize(size);
			saveSidebarSize(size);
		}
	}, []);

	return (
		<div className="flex h-screen flex-col">
			<Header
				onToggleSidebar={toggleSidebar}
				sidebarCollapsed={sidebarCollapsed}
				wsStatus={wsStatus}
			/>
			<ResizablePanelGroup
				direction="horizontal"
				className="flex-1"
				onLayout={(sizes) => {
					if (sizes[0] !== undefined && sizes[0] > 0) {
						handleSidebarResize(sizes[0]);
					}
				}}
			>
				<ResizablePanel
					ref={sidebarRef}
					defaultSize={sidebarCollapsed ? 0 : sidebarSize}
					minSize={0}
					maxSize={40}
					collapsible
					collapsedSize={0}
					onCollapse={() => {
						setSidebarCollapsed(true);
						saveSidebarCollapsed(true);
					}}
					onExpand={() => {
						setSidebarCollapsed(false);
						saveSidebarCollapsed(false);
					}}
					className="border-r"
				>
					<div className="h-full">
						<FileTree
							tree={tree}
							loading={loading}
							error={error}
							selectedPath={selectedPath}
							onSelect={handleFileSelect}
						/>
					</div>
				</ResizablePanel>
				<ResizableHandle withHandle />
				<ResizablePanel
					defaultSize={sidebarCollapsed ? 100 : 100 - sidebarSize}
				>
					<main id="main-content" className="h-full" tabIndex={-1}>
						<ScrollArea className="h-full">
							<div className="mx-auto max-w-4xl p-6">
								<Outlet context={{ refetchTree: refetch }} />
							</div>
						</ScrollArea>
					</main>
				</ResizablePanel>
			</ResizablePanelGroup>
		</div>
	);
}

interface HeaderProps {
	onToggleSidebar: () => void;
	sidebarCollapsed: boolean;
	wsStatus: "connecting" | "connected" | "disconnected";
}

function Header({ onToggleSidebar, sidebarCollapsed, wsStatus }: HeaderProps) {
	return (
		<header className="flex h-12 items-center justify-between border-b px-4">
			<div className="flex items-center gap-2">
				<Button
					variant="ghost"
					size="icon"
					onClick={onToggleSidebar}
					className="h-8 w-8"
					title={
						sidebarCollapsed
							? "Show sidebar (Cmd/Ctrl+B)"
							: "Hide sidebar (Cmd/Ctrl+B)"
					}
					aria-label={sidebarCollapsed ? "Show sidebar" : "Hide sidebar"}
				>
					{sidebarCollapsed ? (
						<PanelLeft className="h-4 w-4" />
					) : (
						<PanelLeftClose className="h-4 w-4" />
					)}
				</Button>
				{/* biome-ignore lint/a11y/useAriaPropsSupportedByRole: aria-label for screen readers */}
				<span
					title={
						wsStatus === "connected" ? "Live updates active" : "Reconnecting..."
					}
					aria-label={`Connection status: ${wsStatus}`}
				>
					<span className="text-terminal-mauve">&gt; </span>
					<span className="text-lg font-medium">rp1</span>
					<span
						className={`animate-blink ${wsStatus === "connected" ? "text-terminal-green" : "text-terminal-red"}`}
					>
						_
					</span>
				</span>
				<span className="text-muted-foreground">/</span>
				<ProjectSwitcher />
			</div>
			<div className="flex items-center gap-2">
				<ThemeToggle />
			</div>
		</header>
	);
}
