import {
	AlertTriangle,
	Check,
	Code,
	Copy,
	Download,
	Maximize2,
	RotateCcw,
	ZoomIn,
	ZoomOut,
} from "lucide-react";
import mermaid from "mermaid";
import {
	useCallback,
	useEffect,
	useId,
	useMemo,
	useRef,
	useState,
} from "react";
import { Button } from "@/components/ui/button";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useDiagramFullscreen } from "@/providers/DiagramFullscreenProvider";
import { useTheme } from "@/providers/ThemeProvider";

/**
 * Warm Stone Mermaid Theme Variables
 * Derived from the design system's CSS custom properties (HSL hue 40 light, hue 30 dark)
 */

// Warm Stone Light theme variables for Mermaid
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

// Warm Stone Dark theme variables for Mermaid
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

mermaid.initialize({
	startOnLoad: false,
	theme: "base",
	securityLevel: "loose",
	fontFamily: "JetBrains Mono, monospace",
	themeVariables: warmStoneDark,
});

interface MermaidDiagramProps {
	code: string;
	className?: string;
	title?: string | null;
}

export function MermaidDiagram({
	code,
	className,
	title,
}: MermaidDiagramProps) {
	const [svg, setSvg] = useState<string>("");
	const [error, setError] = useState<string | null>(null);
	const [showSource, setShowSource] = useState(false);
	const [scale, setScale] = useState(1);
	const [position, setPosition] = useState({ x: 0, y: 0 });
	const [isDragging, setIsDragging] = useState(false);
	const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

	const { theme } = useTheme();
	const { isFullscreen, openFullscreen, updateCode } = useDiagramFullscreen();
	const containerRef = useRef<HTMLDivElement>(null);
	const svgContainerRef = useRef<HTMLDivElement>(null);
	const uniqueId = useId();
	const renderCountRef = useRef(0);
	const codeRef = useRef(code);

	const openedFullscreenRef = useRef(false);

	useEffect(() => {
		codeRef.current = code;
		if (openedFullscreenRef.current && isFullscreen) {
			updateCode(code);
		}
	}, [code, isFullscreen, updateCode]);

	useEffect(() => {
		if (!isFullscreen) {
			openedFullscreenRef.current = false;
		}
	}, [isFullscreen]);

	const previousCodeRef = useRef<string>("");
	const previousThemeRef = useRef<string>(theme);

	useEffect(() => {
		if (
			code === previousCodeRef.current &&
			theme === previousThemeRef.current
		) {
			return;
		}

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
				const diagramId = `mermaid-${uniqueId.replace(/:/g, "")}-${renderCountRef.current}`;

				const { svg: renderedSvg } = await mermaid.render(diagramId, code);

				if (!cancelled) {
					previousCodeRef.current = code;
					previousThemeRef.current = theme;
					setSvg(renderedSvg);
					setError(null);
				}
			} catch (err) {
				if (!cancelled) {
					setError(
						err instanceof Error ? err.message : "Failed to render diagram",
					);
					setSvg("");
				}
			}
		}

		renderDiagram();

		return () => {
			cancelled = true;
		};
	}, [code, uniqueId, theme]);

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

	const handleFullscreen = useCallback(() => {
		openedFullscreenRef.current = true;
		openFullscreen(codeRef.current);
	}, [openFullscreen]);

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

	const [copied, setCopied] = useState(false);
	const [downloaded, setDownloaded] = useState(false);

	const diagramFilename = useMemo(() => {
		// Extract diagram type from first non-empty line of mermaid code
		const firstLine = code.trim().split("\n")[0]?.trim() ?? "";
		const diagramType = firstLine
			.replace(/^%%.*%%\s*/, "") // strip directives
			.split(/[\s{(:]/)[0] // take first word before whitespace/punctuation
			?.toLowerCase();
		const typeSlug = diagramType || "diagram";

		// Use title if available, otherwise fall back to type
		const base = title
			? title
					.replace(/[^a-zA-Z0-9]+/g, "-")
					.replace(/^-|-$/g, "")
					.toLowerCase()
			: `mermaid-${typeSlug}`;

		return `${base}.png`;
	}, [code, title]);

	const svgToPngBlob = useCallback(
		async (scaleFactor = 2): Promise<Blob> => {
			const svgEl = svgContainerRef.current?.querySelector("svg");
			if (!svgEl) throw new Error("No SVG found");

			const svgClone = svgEl.cloneNode(true) as SVGSVGElement;

			// Ensure xmlns is set for standalone SVG serialization
			svgClone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
			svgClone.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");

			// Get intrinsic SVG dimensions from viewBox or attributes (not getBoundingClientRect
			// which returns the on-screen size constrained by the container)
			const viewBox = svgEl.viewBox?.baseVal;
			const attrWidth = Number.parseFloat(svgEl.getAttribute("width") ?? "0");
			const attrHeight = Number.parseFloat(svgEl.getAttribute("height") ?? "0");
			const width =
				viewBox?.width || attrWidth || svgEl.getBoundingClientRect().width;
			const height =
				viewBox?.height || attrHeight || svgEl.getBoundingClientRect().height;
			svgClone.setAttribute("width", String(width));
			svgClone.setAttribute("height", String(height));

			// Inline computed styles into the SVG so they survive serialization
			const styleEl = document.createElementNS(
				"http://www.w3.org/2000/svg",
				"style",
			);
			const styles: string[] = [];
			for (const sheet of document.styleSheets) {
				try {
					for (const rule of sheet.cssRules) {
						styles.push(rule.cssText);
					}
				} catch {
					// skip cross-origin stylesheets
				}
			}
			styleEl.textContent = styles.join("\n");
			svgClone.insertBefore(styleEl, svgClone.firstChild);

			// Replace foreignObject elements with basic SVG text to avoid canvas tainting
			for (const fo of svgClone.querySelectorAll("foreignObject")) {
				const textContent = fo.textContent?.trim() ?? "";
				const svgText = document.createElementNS(
					"http://www.w3.org/2000/svg",
					"text",
				);
				const x = fo.getAttribute("x") ?? "0";
				const y = fo.getAttribute("y") ?? "0";
				const foWidth = Number.parseFloat(fo.getAttribute("width") ?? "100");
				const foHeight = Number.parseFloat(fo.getAttribute("height") ?? "20");
				svgText.setAttribute("x", String(Number.parseFloat(x) + foWidth / 2));
				svgText.setAttribute("y", String(Number.parseFloat(y) + foHeight / 2));
				svgText.setAttribute("text-anchor", "middle");
				svgText.setAttribute("dominant-baseline", "central");
				svgText.setAttribute("font-family", "JetBrains Mono, monospace");
				svgText.setAttribute("font-size", "14");
				svgText.setAttribute("fill", "currentColor");
				svgText.textContent = textContent;
				fo.replaceWith(svgText);
			}

			const serializer = new XMLSerializer();
			const svgString = serializer.serializeToString(svgClone);
			const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgString)}`;

			const img = await new Promise<HTMLImageElement>((resolve, reject) => {
				const image = new Image();
				image.onload = () => resolve(image);
				image.onerror = () => reject(new Error("Failed to load SVG as image"));
				image.src = dataUrl;
			});

			const canvas = document.createElement("canvas");
			canvas.width = width * scaleFactor;
			canvas.height = height * scaleFactor;
			const ctx = canvas.getContext("2d");
			if (!ctx) throw new Error("Canvas context unavailable");
			ctx.scale(scaleFactor, scaleFactor);

			// Fill background based on current theme
			const isDark = theme === "dark";
			ctx.fillStyle = isDark
				? warmStoneDark.background
				: warmStoneLight.background;
			ctx.fillRect(0, 0, width, height);

			ctx.drawImage(img, 0, 0, width, height);

			return new Promise<Blob>((resolve, reject) =>
				canvas.toBlob(
					(b) => (b ? resolve(b) : reject(new Error("toBlob failed"))),
					"image/png",
				),
			);
		},
		[theme],
	);

	const handleCopyPng = useCallback(async () => {
		try {
			const blob = await svgToPngBlob();
			await navigator.clipboard.write([
				new ClipboardItem({ "image/png": blob }),
			]);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		} catch (err) {
			console.error("Copy as PNG failed:", err);
		}
	}, [svgToPngBlob]);

	const handleDownloadPng = useCallback(async () => {
		try {
			const blob = await svgToPngBlob();
			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			a.download = diagramFilename;
			a.click();
			URL.revokeObjectURL(url);
			setDownloaded(true);
			setTimeout(() => setDownloaded(false), 2000);
		} catch (err) {
			console.error("Download as PNG failed:", err);
		}
	}, [svgToPngBlob, diagramFilename]);

	if (error) {
		return (
			<div
				className={cn(
					"my-4 rounded-lg border border-destructive/50 bg-destructive/10 p-4",
					className,
				)}
			>
				<div className="flex items-start gap-3">
					<AlertTriangle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
					<div className="flex-1 min-w-0">
						<div className="text-sm font-medium text-destructive mb-2">
							Failed to render Mermaid diagram
						</div>
						<pre className="text-xs text-muted-foreground whitespace-pre-wrap break-words">
							{error}
						</pre>
						<details className="mt-3">
							<summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
								Show source code
							</summary>
							<pre className="mt-2 p-3 rounded bg-muted text-xs overflow-x-auto">
								{code}
							</pre>
						</details>
					</div>
				</div>
			</div>
		);
	}

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

			<Tooltip>
				<TooltipTrigger asChild>
					<Button
						variant="ghost"
						size="icon"
						className="h-7 w-7"
						onClick={handleCopyPng}
						aria-label="Copy as PNG"
					>
						{copied ? (
							<Check className="h-3.5 w-3.5 text-green-500" />
						) : (
							<Copy className="h-3.5 w-3.5" />
						)}
					</Button>
				</TooltipTrigger>
				<TooltipContent>{copied ? "Copied!" : "Copy as PNG"}</TooltipContent>
			</Tooltip>

			<Tooltip>
				<TooltipTrigger asChild>
					<Button
						variant="ghost"
						size="icon"
						className="h-7 w-7"
						onClick={handleDownloadPng}
						aria-label="Download as PNG"
					>
						{downloaded ? (
							<Check className="h-3.5 w-3.5 text-green-500" />
						) : (
							<Download className="h-3.5 w-3.5" />
						)}
					</Button>
				</TooltipTrigger>
				<TooltipContent>
					{downloaded ? "Downloaded!" : "Download as PNG"}
				</TooltipContent>
			</Tooltip>
		</TooltipProvider>
	);

	const diagramContent = (
		// biome-ignore lint/a11y/noStaticElementInteractions: pan/zoom interactions for diagram viewer
		<div
			ref={containerRef}
			className={cn(
				"relative overflow-hidden flex items-center justify-center min-h-[200px] p-4",
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
					className="mermaid-svg transition-[transform,opacity] duration-200 [&_svg]:max-w-none"
					style={{
						transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
					}}
					// biome-ignore lint/security/noDangerouslySetInnerHtml: trusted Mermaid SVG output
					dangerouslySetInnerHTML={{ __html: svg }}
				/>
			) : (
				<div className="text-sm text-muted-foreground">Loading diagram...</div>
			)}
		</div>
	);

	return (
		<div
			className={cn(
				"group my-4 rounded-lg border bg-muted/30 overflow-hidden",
				className,
			)}
		>
			<div className="flex items-center justify-end border-b bg-muted/80 px-4 py-2">
				{title !== null && (
					<span className="mr-auto text-xs text-muted-foreground">
						{title ?? "Mermaid Diagram"}
					</span>
				)}
				<div className="flex items-center gap-1">
					{toolbar}
					<div className="w-px h-4 bg-border mx-1" />
					<TooltipProvider>
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									variant="ghost"
									size="icon"
									className="h-7 w-7"
									onClick={handleFullscreen}
									aria-label="Fullscreen"
								>
									<Maximize2 className="h-3.5 w-3.5" />
								</Button>
							</TooltipTrigger>
							<TooltipContent>Fullscreen</TooltipContent>
						</Tooltip>
					</TooltipProvider>
				</div>
			</div>

			{showSource ? (
				<pre className="p-4 text-sm overflow-x-auto">
					<code>{code}</code>
				</pre>
			) : (
				diagramContent
			)}

			{!showSource && (
				<div className="border-t bg-muted/50 px-4 py-1.5 text-xs text-muted-foreground">
					{Math.round(scale * 100)}% • Drag to pan • Ctrl+Scroll to zoom
				</div>
			)}
		</div>
	);
}
