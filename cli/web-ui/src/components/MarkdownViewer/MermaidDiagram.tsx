import {
	AlertTriangle,
	Check,
	Code,
	Copy,
	Download,
	Maximize2,
	MessageSquare,
	RotateCcw,
	Send,
	X,
	ZoomIn,
	ZoomOut,
} from "lucide-react";
import {
	type KeyboardEvent,
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
import { AnnotationPopover } from "@/components/v2/AnnotationPopover";
import { useAnnotations } from "@/hooks/useAnnotations";
import type { SelectionPosition } from "@/hooks/useTextSelection";
import {
	renderMermaidSvg,
	svgToPngBlob as sharedSvgToPngBlob,
} from "@/lib/mermaid-utils";
import { cn } from "@/lib/utils";
import { useAnnotationContextSafe } from "@/providers/AnnotationProvider";
import { useDiagramFullscreen } from "@/providers/DiagramFullscreenProvider";
import { useTheme } from "@/providers/ThemeProvider";
import type { Annotation, TextSelectionAnchor } from "@/types/annotations";

interface DiagramAnnotationPopoverProps {
	diagramLabel: string;
	code: string;
	artifactPath: string;
	buttonRef: React.RefObject<HTMLButtonElement | null>;
	onClose: () => void;
}

function DiagramAnnotationPopover({
	diagramLabel,
	code,
	artifactPath,
	buttonRef,
	onClose,
}: DiagramAnnotationPopoverProps) {
	const [content, setContent] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const popoverRef = useRef<HTMLDivElement>(null);
	const { createAnnotation, docId } = useAnnotationContextSafe();

	useEffect(() => {
		textareaRef.current?.focus();
	}, []);

	useEffect(() => {
		const handleClickOutside = (e: MouseEvent) => {
			if (
				popoverRef.current &&
				!popoverRef.current.contains(e.target as Node)
			) {
				onClose();
			}
		};
		const handleEscape = (e: globalThis.KeyboardEvent) => {
			if (e.key === "Escape") {
				e.stopImmediatePropagation();
				onClose();
			}
		};
		const timeoutId = setTimeout(() => {
			document.addEventListener("mousedown", handleClickOutside);
			document.addEventListener("keydown", handleEscape, true);
		}, 100);
		return () => {
			clearTimeout(timeoutId);
			document.removeEventListener("mousedown", handleClickOutside);
			document.removeEventListener("keydown", handleEscape, true);
		};
	}, [onClose]);

	const handleSubmit = useCallback(async () => {
		const trimmedContent = content.trim();
		if (!trimmedContent || isSubmitting) return;

		setIsSubmitting(true);
		try {
			const firstLine = code.split("\n")[0] ?? code.slice(0, 50);
			const anchor: TextSelectionAnchor = {
				type: "text-selection",
				startOffset: 0,
				endOffset: firstLine.length,
				selectedText: firstLine,
				contextBefore: "",
				contextAfter: code.slice(firstLine.length, firstLine.length + 50),
			};

			await createAnnotation({
				docId: docId ?? "",
				artifactPath,
				anchor,
				content: trimmedContent,
			});

			onClose();
		} catch (error) {
			console.error("Failed to create diagram annotation:", error);
		} finally {
			setIsSubmitting(false);
		}
	}, [
		artifactPath,
		code,
		content,
		createAnnotation,
		docId,
		isSubmitting,
		onClose,
	]);

	const handleKeyDown = useCallback(
		(e: KeyboardEvent<HTMLTextAreaElement>) => {
			if (e.key === "Enter" && !e.shiftKey) {
				e.preventDefault();
				handleSubmit();
			}
		},
		[handleSubmit],
	);

	const canSubmit = content.trim().length > 0 && !isSubmitting;

	const buttonRect = buttonRef.current?.getBoundingClientRect();
	const left = buttonRect ? buttonRect.right - 280 : 0;
	const top = buttonRect ? buttonRect.bottom + 4 : 0;

	return (
		<div
			ref={popoverRef}
			className="fixed z-50 w-[280px] rounded border border-border bg-surface animate-in fade-in-0 duration-150"
			style={{ left: `${left}px`, top: `${top}px` }}
			role="dialog"
			aria-label="Add diagram annotation"
		>
			<div className="px-3 pt-3 pb-2">
				<div className="flex items-start justify-between gap-2 mb-2">
					<p className="type-secondary text-fg-ghost italic line-clamp-2">
						&ldquo;{diagramLabel}&rdquo;
					</p>
					<button
						type="button"
						onClick={onClose}
						className="shrink-0 text-fg-ghost transition-colors duration-150 hover:text-fg"
						aria-label="Cancel"
					>
						<X className="h-3.5 w-3.5" strokeWidth={1.5} />
					</button>
				</div>

				<div className="flex gap-2">
					<textarea
						ref={textareaRef}
						value={content}
						onChange={(e) => setContent(e.target.value)}
						onKeyDown={handleKeyDown}
						placeholder="Add comment..."
						rows={1}
						className={cn(
							"flex-1 resize-none rounded bg-surface-void px-3 py-1.5 type-body text-fg",
							"placeholder:text-fg-ghost",
							"focus-visible:outline-none",
							"disabled:cursor-not-allowed disabled:opacity-50",
						)}
						disabled={isSubmitting}
					/>
					<button
						type="button"
						onClick={handleSubmit}
						disabled={!canSubmit}
						className={cn(
							"shrink-0 rounded p-1.5 transition-colors duration-150",
							canSubmit
								? "text-fg-muted hover:text-fg"
								: "text-fg-ghost opacity-50",
						)}
						aria-label="Add comment"
						title="Cmd/Ctrl+Enter"
					>
						<Send className="h-3.5 w-3.5" strokeWidth={1.5} />
					</button>
				</div>

				<p className="mt-1 type-secondary text-fg-ghost">
					Enter to send · Shift+Enter for new line
				</p>
			</div>
		</div>
	);
}

interface MermaidDiagramProps {
	code: string;
	className?: string;
	title?: string | null;
	artifactPath?: string;
}

export function MermaidDiagram({
	code,
	className,
	title,
	artifactPath,
}: MermaidDiagramProps) {
	const [svg, setSvg] = useState<string>("");
	const [error, setError] = useState<string | null>(null);
	const [showSource, setShowSource] = useState(false);
	const [annotationPopoverState, setAnnotationPopoverState] = useState<
		| { mode: "create" }
		| { mode: "view"; annotation: Annotation; position: SelectionPosition }
		| null
	>(null);
	const [scale, setScale] = useState(1);
	const [position, setPosition] = useState({ x: 0, y: 0 });
	const [isDragging, setIsDragging] = useState(false);
	const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
	const annotateButtonRef = useRef<HTMLButtonElement>(null);

	const { annotations } = useAnnotations({ artifactPath: artifactPath ?? "" });

	const diagramFirstLine = useMemo(() => code.split("\n")[0] ?? "", [code]);
	const diagramAnnotation = useMemo(() => {
		if (!artifactPath) return null;
		return (
			annotations.find(
				(a) =>
					a.anchor.type === "text-selection" &&
					a.anchor.selectedText === diagramFirstLine,
			) ?? null
		);
	}, [annotations, artifactPath, diagramFirstLine]);

	const handleAnnotateButtonClick = useCallback(() => {
		if (diagramAnnotation) {
			const btnRect = annotateButtonRef.current?.getBoundingClientRect();
			if (btnRect) {
				setAnnotationPopoverState({
					mode: "view",
					annotation: diagramAnnotation,
					position: {
						x: btnRect.right + 8,
						y: btnRect.top + btnRect.height / 2,
						anchorRect: {
							left: btnRect.left,
							right: btnRect.right,
							top: btnRect.top,
							bottom: btnRect.bottom,
						},
					},
				});
			}
		} else {
			setAnnotationPopoverState({ mode: "create" });
		}
	}, [diagramAnnotation]);

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

		async function render() {
			try {
				renderCountRef.current += 1;
				const diagramId = `mermaid-${uniqueId.replace(/:/g, "")}-${renderCountRef.current}`;
				const isDark = theme === "dark";

				const renderedSvg = await renderMermaidSvg(code, diagramId, isDark);

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

		render();

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
		const firstLine = code.trim().split("\n")[0]?.trim() ?? "";
		const diagramType = firstLine
			.replace(/^%%.*%%\s*/, "")
			.split(/[\s{(:]/)[0]
			?.toLowerCase();
		const typeSlug = diagramType || "diagram";

		const base = title
			? title
					.replace(/[^a-zA-Z0-9]+/g, "-")
					.replace(/^-|-$/g, "")
					.toLowerCase()
			: `mermaid-${typeSlug}`;

		return `${base}.png`;
	}, [code, title]);

	const handleCopyPng = useCallback(async () => {
		const svgEl = svgContainerRef.current?.querySelector("svg");
		if (!svgEl) return;
		try {
			const blob = await sharedSvgToPngBlob(svgEl, theme === "dark");
			await navigator.clipboard.write([
				new ClipboardItem({ "image/png": blob }),
			]);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		} catch (err) {
			console.error("Copy as PNG failed:", err);
		}
	}, [theme]);

	const handleDownloadPng = useCallback(async () => {
		const svgEl = svgContainerRef.current?.querySelector("svg");
		if (!svgEl) return;
		try {
			const blob = await sharedSvgToPngBlob(svgEl, theme === "dark");
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
	}, [theme, diagramFilename]);

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
				"group my-4 rounded-lg border bg-surface overflow-hidden",
				className,
			)}
		>
			<div className="flex items-center justify-end border-b bg-surface px-4 py-2">
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
						{artifactPath && (
							<Tooltip>
								<TooltipTrigger asChild>
									<Button
										ref={annotateButtonRef}
										variant="ghost"
										size="icon"
										className={cn(
											"h-7 w-7",
											diagramAnnotation && "text-accent-amber",
										)}
										onClick={handleAnnotateButtonClick}
										data-annotation-id={diagramAnnotation?.id}
										aria-label={
											diagramAnnotation
												? "View diagram comment"
												: "Add comment on diagram"
										}
									>
										<MessageSquare
											className="h-3.5 w-3.5"
											fill={diagramAnnotation ? "currentColor" : "none"}
										/>
									</Button>
								</TooltipTrigger>
								<TooltipContent>
									{diagramAnnotation ? "View comment" : "Comment on diagram"}
								</TooltipContent>
							</Tooltip>
						)}
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
				<div className="border-t bg-surface px-4 py-1.5 text-xs text-muted-foreground">
					{Math.round(scale * 100)}% • Drag to pan • Ctrl+Scroll to zoom
				</div>
			)}

			{annotationPopoverState?.mode === "create" && artifactPath && (
				<DiagramAnnotationPopover
					diagramLabel={title ?? "Mermaid Diagram"}
					code={code}
					artifactPath={artifactPath}
					buttonRef={annotateButtonRef}
					onClose={() => setAnnotationPopoverState(null)}
				/>
			)}

			{annotationPopoverState?.mode === "view" && (
				<AnnotationPopover
					annotation={annotationPopoverState.annotation}
					position={annotationPopoverState.position}
					onClose={() => setAnnotationPopoverState(null)}
				/>
			)}
		</div>
	);
}
