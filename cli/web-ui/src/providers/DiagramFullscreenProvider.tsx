import { Code, Expand, RotateCcw, X, ZoomIn, ZoomOut } from "lucide-react";
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
import { cn } from "@/lib/utils";
import { useTheme } from "@/providers/ThemeProvider";

// Warm Stone theme variables (same as MermaidDiagram)
const warmStoneLight = {
	background: "#f0f0ee",
	mainBkg: "#e7e6e3",
	nodeBkg: "#e7e6e3",
	nodeBorder: "#a19f9a",
	nodeTextColor: "#2a2722",
	primaryColor: "#d09138",
	primaryTextColor: "#fafaf9",
	primaryBorderColor: "#a19f9a",
	secondaryColor: "#f2eee8",
	secondaryTextColor: "#2a2722",
	secondaryBorderColor: "#d2d1cf",
	tertiaryColor: "#d2d1cf",
	tertiaryTextColor: "#2a2722",
	tertiaryBorderColor: "#a19f9a",
	textColor: "#2a2722",
	lineColor: "#a19f9a",
	noteBkgColor: "#d09138",
	noteTextColor: "#fafaf9",
	noteBorderColor: "#a19f9a",
	clusterBkg: "#e7e6e3",
	clusterBorder: "#a19f9a",
	edgeLabelBackground: "#d2d1cf",
	actorBkg: "#e7e6e3",
	actorBorder: "#d09138",
	actorTextColor: "#2a2722",
	actorLineColor: "#a19f9a",
	signalColor: "#2a2722",
	signalTextColor: "#2a2722",
	labelBoxBkgColor: "#d2d1cf",
	labelBoxBorderColor: "#a19f9a",
	labelTextColor: "#2a2722",
	loopTextColor: "#2a2722",
	activationBorderColor: "#d09138",
	activationBkgColor: "#d2d1cf",
	sequenceNumberColor: "#fafaf9",
	labelBackgroundColor: "#d2d1cf",
	compositeBackground: "#e7e6e3",
	compositeBorder: "#a19f9a",
	compositeTitleBackground: "#d2d1cf",
	innerEndBackground: "#a19f9a",
	specialStateColor: "#d09138",
	classText: "#2a2722",
	attributeBackgroundColorOdd: "#e7e6e3",
	attributeBackgroundColorEven: "#d2d1cf",
	sectionBkgColor: "#e7e6e3",
	sectionBkgColor2: "#d2d1cf",
	altSectionBkgColor: "#f0f0ee",
	gridColor: "#a19f9a",
	todayLineColor: "#bd3737",
	taskBorderColor: "#d09138",
	taskBkgColor: "#d2d1cf",
	taskTextColor: "#2a2722",
	taskTextLightColor: "#79756b",
	taskTextOutsideColor: "#2a2722",
	activeTaskBorderColor: "#d09138",
	activeTaskBkgColor: "#f2eee8",
	doneTaskBorderColor: "#79756b",
	doneTaskBkgColor: "#e7e6e3",
	critBorderColor: "#bd3737",
	critBkgColor: "#bd3737",
	excludeBkgColor: "#f0f0ee",
	pie1: "#d09138",
	pie2: "#79756b",
	pie3: "#a19f9a",
	pie4: "#bd3737",
	pie5: "#2a2722",
	pie6: "#d2d1cf",
	pie7: "#e7e6e3",
	pie8: "#f2eee8",
	pie9: "#79756b",
	pie10: "#d09138",
	pie11: "#a19f9a",
	pie12: "#bd3737",
	pieStrokeColor: "#a19f9a",
	pieTitleTextColor: "#2a2722",
	pieSectionTextColor: "#fafaf9",
	pieLegendTextColor: "#2a2722",
	git0: "#d09138",
	git1: "#79756b",
	git2: "#a19f9a",
	git3: "#bd3737",
	git4: "#2a2722",
	git5: "#d2d1cf",
	git6: "#e7e6e3",
	git7: "#f2eee8",
	gitBranchLabel0: "#fafaf9",
	gitBranchLabel1: "#fafaf9",
	gitBranchLabel2: "#fafaf9",
	gitBranchLabel3: "#fafaf9",
	gitBranchLabel4: "#fafaf9",
	gitBranchLabel5: "#2a2722",
	gitBranchLabel6: "#2a2722",
	gitBranchLabel7: "#2a2722",
	commitLabelColor: "#2a2722",
	commitLabelBackground: "#d2d1cf",
	tagLabelColor: "#2a2722",
	tagLabelBackground: "#e7e6e3",
	tagLabelBorder: "#a19f9a",
	pieStrokeWidth: "2px",
	pieOuterStrokeWidth: "2px",
	pieOpacity: "0.7",
};

const warmStoneDark = {
	background: "#211e1c",
	mainBkg: "#2c2825",
	nodeBkg: "#2c2825",
	nodeBorder: "#716d64",
	nodeTextColor: "#e3e1dd",
	primaryColor: "#ce9749",
	primaryTextColor: "#161412",
	primaryBorderColor: "#716d64",
	secondaryColor: "#3b3834",
	secondaryTextColor: "#e3e1dd",
	secondaryBorderColor: "#716d64",
	tertiaryColor: "#3b3834",
	tertiaryTextColor: "#e3e1dd",
	tertiaryBorderColor: "#716d64",
	textColor: "#e3e1dd",
	lineColor: "#716d64",
	noteBkgColor: "#ce9749",
	noteTextColor: "#161412",
	noteBorderColor: "#716d64",
	clusterBkg: "#2c2825",
	clusterBorder: "#716d64",
	edgeLabelBackground: "#3b3834",
	actorBkg: "#2c2825",
	actorBorder: "#ce9749",
	actorTextColor: "#e3e1dd",
	actorLineColor: "#716d64",
	signalColor: "#e3e1dd",
	signalTextColor: "#e3e1dd",
	labelBoxBkgColor: "#3b3834",
	labelBoxBorderColor: "#716d64",
	labelTextColor: "#e3e1dd",
	loopTextColor: "#e3e1dd",
	activationBorderColor: "#ce9749",
	activationBkgColor: "#3b3834",
	sequenceNumberColor: "#161412",
	labelBackgroundColor: "#3b3834",
	compositeBackground: "#2c2825",
	compositeBorder: "#716d64",
	compositeTitleBackground: "#3b3834",
	innerEndBackground: "#716d64",
	specialStateColor: "#ce9749",
	classText: "#e3e1dd",
	attributeBackgroundColorOdd: "#2c2825",
	attributeBackgroundColorEven: "#3b3834",
	sectionBkgColor: "#2c2825",
	sectionBkgColor2: "#3b3834",
	altSectionBkgColor: "#161412",
	gridColor: "#716d64",
	todayLineColor: "#c95e5e",
	taskBorderColor: "#ce9749",
	taskBkgColor: "#3b3834",
	taskTextColor: "#e3e1dd",
	taskTextLightColor: "#9c968b",
	taskTextOutsideColor: "#e3e1dd",
	activeTaskBorderColor: "#ce9749",
	activeTaskBkgColor: "#2e2922",
	doneTaskBorderColor: "#9c968b",
	doneTaskBkgColor: "#2c2825",
	critBorderColor: "#c95e5e",
	critBkgColor: "#c95e5e",
	excludeBkgColor: "#161412",
	pie1: "#ce9749",
	pie2: "#9c968b",
	pie3: "#716d64",
	pie4: "#c95e5e",
	pie5: "#e3e1dd",
	pie6: "#3b3834",
	pie7: "#2c2825",
	pie8: "#2e2922",
	pie9: "#9c968b",
	pie10: "#ce9749",
	pie11: "#716d64",
	pie12: "#c95e5e",
	pieStrokeColor: "#716d64",
	pieTitleTextColor: "#e3e1dd",
	pieSectionTextColor: "#161412",
	pieLegendTextColor: "#e3e1dd",
	git0: "#ce9749",
	git1: "#9c968b",
	git2: "#716d64",
	git3: "#c95e5e",
	git4: "#e3e1dd",
	git5: "#3b3834",
	git6: "#2c2825",
	git7: "#2e2922",
	gitBranchLabel0: "#161412",
	gitBranchLabel1: "#161412",
	gitBranchLabel2: "#161412",
	gitBranchLabel3: "#161412",
	gitBranchLabel4: "#161412",
	gitBranchLabel5: "#161412",
	gitBranchLabel6: "#161412",
	gitBranchLabel7: "#161412",
	commitLabelColor: "#e3e1dd",
	commitLabelBackground: "#3b3834",
	tagLabelColor: "#e3e1dd",
	tagLabelBackground: "#2c2825",
	tagLabelBorder: "#716d64",
	pieStrokeWidth: "2px",
	pieOuterStrokeWidth: "2px",
	pieOpacity: "0.7",
};

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
	const [showSource, setShowSource] = useState(false);
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
		setShowSource(false);

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

			<Tooltip>
				<TooltipTrigger asChild>
					<Button
						variant="ghost"
						size="icon"
						className={cn("h-7 w-7", showSource && "bg-accent")}
						onClick={() => setShowSource(!showSource)}
						aria-label={showSource ? "Hide source" : "Show source"}
					>
						<Code className="h-3.5 w-3.5" />
					</Button>
				</TooltipTrigger>
				<TooltipContent>
					{showSource ? "Hide source" : "Show source"}
				</TooltipContent>
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
					<div className="flex-1 overflow-hidden">
						{showSource ? (
							<pre className="h-full p-6 text-sm overflow-auto">
								<code>{code}</code>
							</pre>
						) : (
							// biome-ignore lint/a11y/noStaticElementInteractions: pan/zoom interactions for diagram viewer
							<div
								className={cn(
									"h-full relative overflow-hidden flex items-center justify-center",
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
						)}
					</div>

					{/* Footer */}
					{!showSource && (
						<div className="border-t bg-muted/50 px-4 py-2 text-xs text-muted-foreground text-center">
							{Math.round(scale * 100)}% • Drag to pan • Ctrl+Scroll to zoom •
							Press Esc to close
						</div>
					)}
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
