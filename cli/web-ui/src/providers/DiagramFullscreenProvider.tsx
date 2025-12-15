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

// Catppuccin theme variables (same as MermaidDiagram)
const catppuccinLatte = {
	background: "#eff1f5",
	mainBkg: "#ccd0da",
	nodeBkg: "#ccd0da",
	nodeBorder: "#9ca0b0",
	nodeTextColor: "#4c4f69",
	primaryColor: "#1e66f5",
	primaryTextColor: "#eff1f5",
	primaryBorderColor: "#209fb5",
	secondaryColor: "#7287fd",
	secondaryTextColor: "#eff1f5",
	secondaryBorderColor: "#8839ef",
	tertiaryColor: "#bcc0cc",
	tertiaryTextColor: "#4c4f69",
	tertiaryBorderColor: "#9ca0b0",
	textColor: "#4c4f69",
	lineColor: "#8c8fa1",
	noteBkgColor: "#df8e1d",
	noteTextColor: "#eff1f5",
	noteBorderColor: "#fe640b",
	clusterBkg: "#ccd0da",
	clusterBorder: "#9ca0b0",
	edgeLabelBackground: "#bcc0cc",
	actorBkg: "#ccd0da",
	actorBorder: "#1e66f5",
	actorTextColor: "#4c4f69",
	actorLineColor: "#8c8fa1",
	signalColor: "#4c4f69",
	signalTextColor: "#4c4f69",
	labelBoxBkgColor: "#bcc0cc",
	labelBoxBorderColor: "#9ca0b0",
	labelTextColor: "#4c4f69",
	loopTextColor: "#4c4f69",
	activationBorderColor: "#1e66f5",
	activationBkgColor: "#bcc0cc",
	sequenceNumberColor: "#eff1f5",
	labelBackgroundColor: "#bcc0cc",
	compositeBackground: "#ccd0da",
	compositeBorder: "#9ca0b0",
	compositeTitleBackground: "#bcc0cc",
	innerEndBackground: "#9ca0b0",
	specialStateColor: "#8839ef",
	classText: "#4c4f69",
	attributeBackgroundColorOdd: "#ccd0da",
	attributeBackgroundColorEven: "#bcc0cc",
	sectionBkgColor: "#ccd0da",
	sectionBkgColor2: "#bcc0cc",
	altSectionBkgColor: "#e6e9ef",
	gridColor: "#9ca0b0",
	todayLineColor: "#d20f39",
	taskBorderColor: "#1e66f5",
	taskBkgColor: "#bcc0cc",
	taskTextColor: "#4c4f69",
	taskTextLightColor: "#6c6f85",
	taskTextOutsideColor: "#4c4f69",
	activeTaskBorderColor: "#209fb5",
	activeTaskBkgColor: "#1e66f5",
	doneTaskBorderColor: "#40a02b",
	doneTaskBkgColor: "#ccd0da",
	critBorderColor: "#d20f39",
	critBkgColor: "#e64553",
	excludeBkgColor: "#dce0e8",
	pie1: "#1e66f5",
	pie2: "#7287fd",
	pie3: "#209fb5",
	pie4: "#04a5e5",
	pie5: "#179299",
	pie6: "#40a02b",
	pie7: "#df8e1d",
	pie8: "#fe640b",
	pie9: "#e64553",
	pie10: "#d20f39",
	pie11: "#ea76cb",
	pie12: "#8839ef",
	pieStrokeColor: "#9ca0b0",
	pieTitleTextColor: "#4c4f69",
	pieSectionTextColor: "#eff1f5",
	pieLegendTextColor: "#4c4f69",
	git0: "#1e66f5",
	git1: "#40a02b",
	git2: "#8839ef",
	git3: "#fe640b",
	git4: "#179299",
	git5: "#ea76cb",
	git6: "#df8e1d",
	git7: "#7287fd",
	gitBranchLabel0: "#eff1f5",
	gitBranchLabel1: "#eff1f5",
	gitBranchLabel2: "#eff1f5",
	gitBranchLabel3: "#eff1f5",
	gitBranchLabel4: "#eff1f5",
	gitBranchLabel5: "#eff1f5",
	gitBranchLabel6: "#eff1f5",
	gitBranchLabel7: "#eff1f5",
	commitLabelColor: "#4c4f69",
	commitLabelBackground: "#bcc0cc",
	tagLabelColor: "#4c4f69",
	tagLabelBackground: "#ccd0da",
	tagLabelBorder: "#9ca0b0",
	pieStrokeWidth: "2px",
	pieOuterStrokeWidth: "2px",
	pieOpacity: "0.7",
};

const catppuccinMocha = {
	background: "#1e1e2e",
	mainBkg: "#313244",
	nodeBkg: "#313244",
	nodeBorder: "#6c7086",
	nodeTextColor: "#cdd6f4",
	primaryColor: "#89b4fa",
	primaryTextColor: "#11111b",
	primaryBorderColor: "#74c7ec",
	secondaryColor: "#b4befe",
	secondaryTextColor: "#11111b",
	secondaryBorderColor: "#cba6f7",
	tertiaryColor: "#45475a",
	tertiaryTextColor: "#cdd6f4",
	tertiaryBorderColor: "#6c7086",
	textColor: "#cdd6f4",
	lineColor: "#7f849c",
	noteBkgColor: "#f9e2af",
	noteTextColor: "#11111b",
	noteBorderColor: "#fab387",
	clusterBkg: "#313244",
	clusterBorder: "#6c7086",
	edgeLabelBackground: "#45475a",
	actorBkg: "#313244",
	actorBorder: "#89b4fa",
	actorTextColor: "#cdd6f4",
	actorLineColor: "#7f849c",
	signalColor: "#cdd6f4",
	signalTextColor: "#cdd6f4",
	labelBoxBkgColor: "#45475a",
	labelBoxBorderColor: "#6c7086",
	labelTextColor: "#cdd6f4",
	loopTextColor: "#cdd6f4",
	activationBorderColor: "#89b4fa",
	activationBkgColor: "#45475a",
	sequenceNumberColor: "#11111b",
	labelBackgroundColor: "#45475a",
	compositeBackground: "#313244",
	compositeBorder: "#6c7086",
	compositeTitleBackground: "#45475a",
	innerEndBackground: "#6c7086",
	specialStateColor: "#cba6f7",
	classText: "#cdd6f4",
	attributeBackgroundColorOdd: "#313244",
	attributeBackgroundColorEven: "#45475a",
	sectionBkgColor: "#313244",
	sectionBkgColor2: "#45475a",
	altSectionBkgColor: "#181825",
	gridColor: "#6c7086",
	todayLineColor: "#f38ba8",
	taskBorderColor: "#89b4fa",
	taskBkgColor: "#45475a",
	taskTextColor: "#cdd6f4",
	taskTextLightColor: "#a6adc8",
	taskTextOutsideColor: "#cdd6f4",
	activeTaskBorderColor: "#74c7ec",
	activeTaskBkgColor: "#89b4fa",
	doneTaskBorderColor: "#a6e3a1",
	doneTaskBkgColor: "#313244",
	critBorderColor: "#f38ba8",
	critBkgColor: "#eba0ac",
	excludeBkgColor: "#11111b",
	pie1: "#89b4fa",
	pie2: "#b4befe",
	pie3: "#74c7ec",
	pie4: "#89dceb",
	pie5: "#94e2d5",
	pie6: "#a6e3a1",
	pie7: "#f9e2af",
	pie8: "#fab387",
	pie9: "#eba0ac",
	pie10: "#f38ba8",
	pie11: "#f5c2e7",
	pie12: "#cba6f7",
	pieStrokeColor: "#6c7086",
	pieTitleTextColor: "#cdd6f4",
	pieSectionTextColor: "#11111b",
	pieLegendTextColor: "#cdd6f4",
	git0: "#89b4fa",
	git1: "#a6e3a1",
	git2: "#cba6f7",
	git3: "#fab387",
	git4: "#94e2d5",
	git5: "#f5c2e7",
	git6: "#f9e2af",
	git7: "#b4befe",
	gitBranchLabel0: "#11111b",
	gitBranchLabel1: "#11111b",
	gitBranchLabel2: "#11111b",
	gitBranchLabel3: "#11111b",
	gitBranchLabel4: "#11111b",
	gitBranchLabel5: "#11111b",
	gitBranchLabel6: "#11111b",
	gitBranchLabel7: "#11111b",
	commitLabelColor: "#cdd6f4",
	commitLabelBackground: "#45475a",
	tagLabelColor: "#cdd6f4",
	tagLabelBackground: "#313244",
	tagLabelBorder: "#6c7086",
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
					themeVariables: isDark ? catppuccinMocha : catppuccinLatte,
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
				closeFullscreen();
			}
		}

		document.addEventListener("keydown", handleKeyDown);
		document.body.style.overflow = "hidden";

		return () => {
			document.removeEventListener("keydown", handleKeyDown);
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
