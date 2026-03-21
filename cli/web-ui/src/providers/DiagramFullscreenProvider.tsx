import { Expand, RotateCcw, X, ZoomIn, ZoomOut } from "lucide-react";
import mermaid from "mermaid";
import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useRef,
	useState,
} from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { warmStoneDark, warmStoneLight } from "@/lib/mermaid-theme";
import { cn } from "@/lib/utils";
import { useTheme } from "@/providers/ThemeProvider";

interface DiagramFullscreenContextValue {
	isFullscreen: boolean;
	openFullscreen: (code: string) => void;
	closeFullscreen: () => void;
	updateCode: (code: string) => void;
}

const DiagramFullscreenContext =
	createContext<DiagramFullscreenContextValue | null>(null);

interface DiagramFullscreenProviderProps {
	children: ReactNode;
}

export function DiagramFullscreenProvider({
	children,
}: DiagramFullscreenProviderProps) {
	const [isFullscreen, setIsFullscreen] = useState(false);
	const [code, setCode] = useState<string>("");
	const [svg, setSvg] = useState<string>("");
	const [scale, setScale] = useState(1);
	const [position, setPosition] = useState({ x: 0, y: 0 });
	const [isDragging, setIsDragging] = useState(false);
	const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

	const { theme } = useTheme();
	const svgContainerRef = useRef<HTMLDivElement>(null);
	const renderCountRef = useRef(0);

	// Render the diagram when code or theme changes
	useEffect(() => {
		if (!isFullscreen || !code) return;

		let cancelled = false;

		async function renderDiagram() {
			try {
				const isDark = theme === "dark";
				mermaid.initialize({
					startOnLoad: false,
					theme: "base",
					securityLevel: "loose",
					fontFamily: "JetBrains Mono, monospace",
					themeVariables: isDark ? warmStoneDark : warmStoneLight,
					suppressErrorRendering: true,
				});

				renderCountRef.current += 1;
				const diagramId = `mermaid-fullscreen-${renderCountRef.current}`;

				const { svg: renderedSvg } = await mermaid.render(diagramId, code);

				if (!cancelled) {
					setSvg(renderedSvg);
				}
			} catch (err) {
				console.error("Failed to render fullscreen diagram:", err);
			}
		}

		renderDiagram();

		return () => {
			cancelled = true;
		};
	}, [code, theme, isFullscreen]);

	const openFullscreen = useCallback((diagramCode: string) => {
		setCode(diagramCode);
		setIsFullscreen(true);
		setPosition({ x: 0, y: 0 });

		// Calculate optimal scale after render
		setTimeout(() => {
			const container = svgContainerRef.current;
			if (!container) {
				setScale(1);
				return;
			}

			const rect = container.getBoundingClientRect();
			const availableWidth = window.innerWidth - 100;
			const availableHeight = window.innerHeight - 160;

			const scaleX = availableWidth / rect.width;
			const scaleY = availableHeight / rect.height;
			const optimalScale = Math.min(scaleX, scaleY);

			setScale(Math.max(0.1, Math.min(10, optimalScale)));
		}, 100);
	}, []);

	const closeFullscreen = useCallback(() => {
		setIsFullscreen(false);
		setCode("");
		setSvg("");
		setScale(1);
		setPosition({ x: 0, y: 0 });
	}, []);

	const updateCode = useCallback(
		(newCode: string) => {
			if (isFullscreen) {
				setCode(newCode);
			}
		},
		[isFullscreen],
	);

	// Listen for fullscreen requests from vanilla DOM (Milkdown mermaid plugin)
	useEffect(() => {
		const handler = (e: Event) => {
			const detail = (e as CustomEvent).detail;
			if (detail?.code) {
				openFullscreen(detail.code);
			}
		};
		document.addEventListener("mermaid-editor-fullscreen", handler);
		return () =>
			document.removeEventListener("mermaid-editor-fullscreen", handler);
	}, [openFullscreen]);

	// Handle escape key
	useEffect(() => {
		if (!isFullscreen) return;

		function handleKeyDown(e: KeyboardEvent) {
			if (e.key === "Escape") {
				e.stopPropagation();
				closeFullscreen();
			}
		}

		// Use capture phase to intercept before other handlers
		document.addEventListener("keydown", handleKeyDown, true);
		document.body.style.overflow = "hidden";

		return () => {
			document.removeEventListener("keydown", handleKeyDown, true);
			document.body.style.overflow = "";
		};
	}, [isFullscreen, closeFullscreen]);

	const handleZoomIn = useCallback(() => {
		setScale((s) => Math.min(s + 0.25, 5));
	}, []);

	const handleZoomOut = useCallback(() => {
		setScale((s) => Math.max(s - 0.25, 0.25));
	}, []);

	const handleReset = useCallback(() => {
		setScale(1);
		setPosition({ x: 0, y: 0 });
	}, []);

	const handleFitToScreen = useCallback(() => {
		setScale(1);
		setPosition({ x: 0, y: 0 });

		setTimeout(() => {
			const container = svgContainerRef.current;
			if (!container) return;

			const rect = container.getBoundingClientRect();
			const availableWidth = window.innerWidth - 100;
			const availableHeight = window.innerHeight - 160;

			const scaleX = availableWidth / rect.width;
			const scaleY = availableHeight / rect.height;
			const optimalScale = Math.min(scaleX, scaleY);

			setScale(Math.max(0.1, Math.min(10, optimalScale)));
		}, 50);
	}, []);

	const handleMouseDown = useCallback(
		(e: React.MouseEvent) => {
			if (e.button !== 0) return;
			setIsDragging(true);
			setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
		},
		[position],
	);

	const handleMouseMove = useCallback(
		(e: React.MouseEvent) => {
			if (!isDragging) return;
			setPosition({
				x: e.clientX - dragStart.x,
				y: e.clientY - dragStart.y,
			});
		},
		[isDragging, dragStart],
	);

	const handleMouseUp = useCallback(() => {
		setIsDragging(false);
	}, []);

	const handleWheel = useCallback((e: React.WheelEvent) => {
		if (e.ctrlKey || e.metaKey) {
			e.preventDefault();
			const delta = e.deltaY > 0 ? -0.1 : 0.1;
			setScale((s) => Math.max(0.25, Math.min(5, s + delta)));
		}
	}, []);

	const toolbar = (
		<TooltipProvider>
			<Tooltip>
				<TooltipTrigger asChild>
					<Button
						variant="ghost"
						size="icon"
						className="h-7 w-7"
						onClick={handleZoomOut}
						aria-label="Zoom out"
					>
						<ZoomOut className="h-3.5 w-3.5" />
					</Button>
				</TooltipTrigger>
				<TooltipContent>Zoom out</TooltipContent>
			</Tooltip>

			<Tooltip>
				<TooltipTrigger asChild>
					<Button
						variant="ghost"
						size="icon"
						className="h-7 w-7"
						onClick={handleZoomIn}
						aria-label="Zoom in"
					>
						<ZoomIn className="h-3.5 w-3.5" />
					</Button>
				</TooltipTrigger>
				<TooltipContent>Zoom in</TooltipContent>
			</Tooltip>

			<Tooltip>
				<TooltipTrigger asChild>
					<Button
						variant="ghost"
						size="icon"
						className="h-7 w-7"
						onClick={handleReset}
						aria-label="Reset view"
					>
						<RotateCcw className="h-3.5 w-3.5" />
					</Button>
				</TooltipTrigger>
				<TooltipContent>Reset view</TooltipContent>
			</Tooltip>

			<Tooltip>
				<TooltipTrigger asChild>
					<Button
						variant="ghost"
						size="icon"
						className="h-7 w-7"
						onClick={handleFitToScreen}
						aria-label="Fit to screen"
					>
						<Expand className="h-3.5 w-3.5" />
					</Button>
				</TooltipTrigger>
				<TooltipContent>Fit to screen</TooltipContent>
			</Tooltip>
		</TooltipProvider>
	);

	const fullscreenModal = isFullscreen
		? createPortal(
				// biome-ignore lint/a11y/noStaticElementInteractions: backdrop click to close modal
				// biome-ignore lint/a11y/useKeyWithClickEvents: Escape key handled separately
				<div
					className="fixed inset-0 z-50 bg-background flex flex-col"
					onClick={(e) => {
						if (e.target === e.currentTarget) closeFullscreen();
					}}
				>
					{/* Header */}
					<div className="flex items-center justify-between border-b bg-muted/80 px-4 py-2">
						<span className="text-sm font-medium">Mermaid Diagram</span>
						<div className="flex items-center gap-1">
							{toolbar}
							<div className="w-px h-5 bg-border mx-1" />
							<TooltipProvider>
								<Tooltip>
									<TooltipTrigger asChild>
										<Button
											variant="ghost"
											size="icon"
											className="h-7 w-7"
											onClick={closeFullscreen}
											aria-label="Close fullscreen"
										>
											<X className="h-4 w-4" />
										</Button>
									</TooltipTrigger>
									<TooltipContent>Close (Esc)</TooltipContent>
								</Tooltip>
							</TooltipProvider>
						</div>
					</div>

					{/* Content */}
					{/* biome-ignore lint/a11y/noStaticElementInteractions: pan/zoom interactions for diagram viewer */}
					<div
						className={cn(
							"flex-1 overflow-hidden relative flex items-center justify-center",
							isDragging ? "cursor-grabbing" : "cursor-grab",
						)}
						onMouseDown={handleMouseDown}
						onMouseMove={handleMouseMove}
						onMouseUp={handleMouseUp}
						onMouseLeave={handleMouseUp}
						onWheel={handleWheel}
					>
						{svg ? (
							<div
								ref={svgContainerRef}
								className="mermaid-svg transition-transform duration-100 [&_svg]:max-w-none"
								style={{
									transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
								}}
								// biome-ignore lint/security/noDangerouslySetInnerHtml: trusted Mermaid SVG output
								dangerouslySetInnerHTML={{ __html: svg }}
							/>
						) : (
							<div className="text-sm text-muted-foreground">
								Loading diagram...
							</div>
						)}
					</div>

					{/* Footer */}
					<div className="border-t bg-muted/50 px-4 py-2 text-xs text-muted-foreground text-center">
						{Math.round(scale * 100)}% • Drag to pan • Ctrl+Scroll to zoom •
						Press Esc to close
					</div>
				</div>,
				document.body,
			)
		: null;

	return (
		<DiagramFullscreenContext.Provider
			value={{ isFullscreen, openFullscreen, closeFullscreen, updateCode }}
		>
			{children}
			{fullscreenModal}
		</DiagramFullscreenContext.Provider>
	);
}

export function useDiagramFullscreen(): DiagramFullscreenContextValue {
	const context = useContext(DiagramFullscreenContext);
	if (!context) {
		throw new Error(
			"useDiagramFullscreen must be used within a DiagramFullscreenProvider",
		);
	}
	return context;
}
