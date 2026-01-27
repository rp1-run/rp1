import { MessageSquarePlus } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown, {
	type Options as ReactMarkdownOptions,
} from "react-markdown";
import rehypeRaw from "rehype-raw";
import rehypeSlug from "rehype-slug";
import remarkFrontmatter from "remark-frontmatter";
import remarkGfm from "remark-gfm";
import { AnnotationPopover } from "@/components/v2/AnnotationPopover";
import { SelectionPopover } from "@/components/v2/SelectionPopover";
import { useAnnotations } from "@/hooks/useAnnotations";
import {
	extractHeadings,
	type HeadingEntry,
} from "@/hooks/useHeadingExtraction";
import {
	type DetectedHiddenAnchor,
	detectHiddenAnchors,
	type SelectionPosition,
	useTextSelection,
} from "@/hooks/useTextSelection";
import { cn } from "@/lib/utils";
import type { Annotation } from "@/types/annotations";
import { CodeBlock } from "./CodeBlock";
import { MarkdownLink } from "./MarkdownLink";
import { MermaidDiagram } from "./MermaidDiagram";

export interface MarkdownViewerProps {
	content: string;
	path: string;
	frontmatter?: Record<string, unknown>;
	showFrontmatter?: boolean;
	className?: string;
	onHeadingsExtracted?: (headings: HeadingEntry[]) => void;
	headingIdPrefix?: string;
	/** Enable annotation features (requires AnnotationProvider wrapper) */
	enableAnnotations?: boolean;
}

interface AnchorIndicatorProps {
	anchor: DetectedHiddenAnchor;
	hasAnnotations: boolean;
	annotationCount: number;
	onClick: () => void;
}

function AnchorIndicator({
	anchor,
	hasAnnotations,
	annotationCount,
	onClick,
}: AnchorIndicatorProps) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={cn(
				"absolute z-10 flex h-5 w-5 items-center justify-center rounded-full transition-all",
				"hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
				hasAnnotations
					? "bg-terminal-yellow text-black"
					: "bg-muted text-muted-foreground hover:bg-muted-foreground/20",
			)}
			style={{
				top: `${anchor.position.y - 10}px`,
				left: `${Math.max(8, anchor.position.x - 24)}px`,
			}}
			aria-label={
				hasAnnotations
					? `${annotationCount} annotation${annotationCount !== 1 ? "s" : ""} on ${anchor.anchor.anchorId}`
					: `Add annotation to ${anchor.anchor.anchorId}`
			}
			title={
				hasAnnotations
					? `${annotationCount} annotation${annotationCount !== 1 ? "s" : ""}`
					: "Add annotation"
			}
		>
			{hasAnnotations ? (
				<span className="text-xs font-medium">{annotationCount}</span>
			) : (
				<MessageSquarePlus className="h-3 w-3" aria-hidden="true" />
			)}
		</button>
	);
}

interface TextHighlightProps {
	annotation: Annotation;
	containerRef: React.RefObject<HTMLElement | null>;
	onClick: (annotation: Annotation, position: SelectionPosition) => void;
}

interface HighlightPosition {
	top: number;
	left: number;
	width: number;
	height: number;
}

function TextHighlight({
	annotation,
	containerRef,
	onClick,
}: TextHighlightProps) {
	const [highlightPos, setHighlightPos] = useState<HighlightPosition | null>(
		null,
	);

	useEffect(() => {
		if (annotation.anchor.type !== "text-selection" || !containerRef.current) {
			return;
		}

		const container = containerRef.current;
		const { selectedText, contextBefore, contextAfter } = annotation.anchor;

		// Find the text in the container using context for precise matching
		const fullText = container.textContent ?? "";
		const searchPattern = contextBefore + selectedText + contextAfter;
		const patternIndex = fullText.indexOf(searchPattern);

		if (patternIndex === -1) {
			// Pattern not found - annotation may be orphaned
			return;
		}

		const startIndex = patternIndex + contextBefore.length;
		const endIndex = startIndex + selectedText.length;

		// Use TreeWalker to find the text nodes containing our selection
		const walker = document.createTreeWalker(
			container,
			NodeFilter.SHOW_TEXT,
			null,
		);

		let currentOffset = 0;
		let startNode: Text | null = null;
		let startOffset = 0;
		let endNode: Text | null = null;
		let endOffset = 0;

		let node = walker.nextNode() as Text | null;
		while (node) {
			const nodeLength = node.textContent?.length ?? 0;
			const nodeEnd = currentOffset + nodeLength;

			if (!startNode && startIndex < nodeEnd) {
				startNode = node;
				startOffset = startIndex - currentOffset;
			}

			if (!endNode && endIndex <= nodeEnd) {
				endNode = node;
				endOffset = endIndex - currentOffset;
				break;
			}

			currentOffset = nodeEnd;
			node = walker.nextNode() as Text | null;
		}

		if (startNode && endNode) {
			try {
				const range = document.createRange();
				range.setStart(startNode, startOffset);
				range.setEnd(endNode, endOffset);
				const rect = range.getBoundingClientRect();
				const containerRect = container.getBoundingClientRect();

				// Calculate position relative to the container
				setHighlightPos({
					top: rect.top - containerRect.top,
					left: rect.left - containerRect.left,
					width: rect.width,
					height: rect.height,
				});
			} catch {
				// Range creation can fail if offsets are invalid
			}
		}
	}, [annotation, containerRef]);

	if (!highlightPos || !containerRef.current) {
		return null;
	}

	const handleClick = () => {
		const containerRect = containerRef.current?.getBoundingClientRect();
		if (!containerRect) return;

		onClick(annotation, {
			x: containerRect.left + highlightPos.left + highlightPos.width / 2,
			y: containerRect.top + highlightPos.top + highlightPos.height,
		});
	};

	const isResolved = annotation.status === "resolved";

	return (
		<button
			type="button"
			onClick={handleClick}
			className={cn(
				"absolute pointer-events-auto cursor-pointer",
				"border-l-2 rounded-sm",
				isResolved
					? "border-terminal-green/60 bg-terminal-green/5"
					: "border-terminal-yellow bg-terminal-yellow/10",
				isResolved
					? "hover:bg-terminal-green/15"
					: "hover:bg-terminal-yellow/20",
				"transition-colors",
			)}
			style={{
				top: highlightPos.top,
				left: highlightPos.left - 2,
				width: highlightPos.width + 4,
				height: highlightPos.height,
				zIndex: 5,
			}}
			aria-label={`Annotation: ${annotation.content.slice(0, 50)}${annotation.content.length > 50 ? "..." : ""}`}
		/>
	);
}

interface AnnotationLayerProps {
	path: string;
	containerRef: React.RefObject<HTMLElement | null>;
	hiddenAnchors: DetectedHiddenAnchor[];
}

function AnnotationLayer({
	path,
	containerRef,
	hiddenAnchors,
}: AnnotationLayerProps) {
	const [activeAnchor, setActiveAnchor] = useState<DetectedHiddenAnchor | null>(
		null,
	);
	const [activeAnnotation, setActiveAnnotation] = useState<Annotation | null>(
		null,
	);
	const [annotationPosition, setAnnotationPosition] =
		useState<SelectionPosition | null>(null);
	const [showSelectionPopover, setShowSelectionPopover] = useState(false);
	const popoverRef = useRef<HTMLDivElement>(null);

	// Text selection handling with delay to avoid flicker
	const {
		selection,
		selectionPosition,
		clearSelection,
		lockSelection,
		isLocked,
	} = useTextSelection({
		containerRef: containerRef as React.RefObject<HTMLElement>,
		enabled: true,
		showDelay: 250,
	});

	// Get annotations for this artifact
	const { annotations } = useAnnotations({ artifactPath: path });

	// Show selection popover when text is selected and lock it
	useEffect(() => {
		if (selection && selectionPosition && !isLocked) {
			setShowSelectionPopover(true);
			// Lock the selection so it persists
			lockSelection();
		}
	}, [selection, selectionPosition, lockSelection, isLocked]);

	// Handle click outside to close popover
	useEffect(() => {
		if (!showSelectionPopover) return;

		const handleClickOutside = (e: MouseEvent) => {
			const target = e.target as Node;
			// Check if click is outside the popover
			if (popoverRef.current && !popoverRef.current.contains(target)) {
				// Also check if clicking on the selection highlight itself
				const isClickOnSelection =
					target instanceof Element &&
					target.closest("[data-selection-highlight]");
				if (!isClickOnSelection) {
					setShowSelectionPopover(false);
					clearSelection();
				}
			}
		};

		const handleEscape = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				setShowSelectionPopover(false);
				clearSelection();
			}
		};

		// Add slight delay to avoid immediate close from the same click
		const timeoutId = setTimeout(() => {
			document.addEventListener("mousedown", handleClickOutside);
			document.addEventListener("keydown", handleEscape);
		}, 100);

		return () => {
			clearTimeout(timeoutId);
			document.removeEventListener("mousedown", handleClickOutside);
			document.removeEventListener("keydown", handleEscape);
		};
	}, [showSelectionPopover, clearSelection]);

	// Get annotations for hidden anchors (memoized for performance)
	const anchorAnnotationsMap = useMemo(() => {
		const map = new Map<string, readonly Annotation[]>();

		for (const annotation of annotations) {
			if (annotation.anchor.type === "hidden-anchor" && !annotation.orphaned) {
				const anchorId = annotation.anchor.anchorId;
				const existing = map.get(anchorId) ?? [];
				map.set(anchorId, [...existing, annotation]);
			}
		}

		return map;
	}, [annotations]);

	// Get text selection annotations (non-orphaned)
	const textSelectionAnnotations = useMemo(() => {
		return annotations.filter(
			(a) => a.anchor.type === "text-selection" && !a.orphaned,
		);
	}, [annotations]);

	const handleAnchorClick = useCallback(
		(anchor: DetectedHiddenAnchor) => {
			const anchorAnnotations = anchorAnnotationsMap.get(
				anchor.anchor.anchorId,
			);

			if (anchorAnnotations && anchorAnnotations.length > 0) {
				// Show first annotation popover
				setActiveAnnotation(anchorAnnotations[0]);
				setAnnotationPosition(anchor.position);
				setActiveAnchor(null);
			} else {
				// Show anchor for creating new annotation
				setActiveAnchor(anchor);
				setActiveAnnotation(null);
			}
		},
		[anchorAnnotationsMap],
	);

	const handleTextAnnotationClick = useCallback(
		(annotation: Annotation, position: SelectionPosition) => {
			setActiveAnnotation(annotation);
			setAnnotationPosition(position);
			setActiveAnchor(null);
		},
		[],
	);

	const handleCloseAnnotationPopover = useCallback(() => {
		setActiveAnnotation(null);
		setAnnotationPosition(null);
	}, []);

	const handleCloseSelectionPopover = useCallback(() => {
		setShowSelectionPopover(false);
		clearSelection();
		setActiveAnchor(null);
	}, [clearSelection]);

	const handleAnnotationCreated = useCallback(() => {
		clearSelection();
		setActiveAnchor(null);
	}, [clearSelection]);

	return (
		<>
			{/* Hidden anchor indicators */}
			{hiddenAnchors.map((anchor) => {
				const anchorAnnotations =
					anchorAnnotationsMap.get(anchor.anchor.anchorId) ?? [];
				return (
					<AnchorIndicator
						key={anchor.anchor.anchorId}
						anchor={anchor}
						hasAnnotations={anchorAnnotations.length > 0}
						annotationCount={anchorAnnotations.length}
						onClick={() => handleAnchorClick(anchor)}
					/>
				);
			})}

			{/* Text selection highlights */}
			{textSelectionAnnotations.map((annotation) => (
				<TextHighlight
					key={annotation.id}
					annotation={annotation}
					containerRef={containerRef}
					onClick={handleTextAnnotationClick}
				/>
			))}

			{/* Selection popover for creating annotations from text selection */}
			{showSelectionPopover && selection && selectionPosition && (
				<div ref={popoverRef}>
					<SelectionPopover
						anchor={selection}
						artifactPath={path}
						position={selectionPosition}
						onClose={handleCloseSelectionPopover}
						onAnnotationCreated={handleAnnotationCreated}
					/>
				</div>
			)}

			{/* Hidden anchor popover for creating annotations */}
			{activeAnchor && !activeAnnotation && (
				<SelectionPopover
					anchor={{
						type: "text-selection",
						startOffset: 0,
						endOffset: 0,
						selectedText: activeAnchor.anchor.anchorText,
						contextBefore: "",
						contextAfter: "",
					}}
					artifactPath={path}
					position={activeAnchor.position}
					onClose={() => setActiveAnchor(null)}
					onAnnotationCreated={handleAnnotationCreated}
				/>
			)}

			{/* Annotation popover for viewing/editing existing annotations */}
			{activeAnnotation && annotationPosition && (
				<AnnotationPopover
					annotation={activeAnnotation}
					position={annotationPosition}
					onClose={handleCloseAnnotationPopover}
				/>
			)}
		</>
	);
}

export function MarkdownViewer({
	content,
	path,
	frontmatter,
	showFrontmatter = false,
	className,
	onHeadingsExtracted,
	headingIdPrefix,
	enableAnnotations = false,
}: MarkdownViewerProps) {
	const containerRef = useRef<HTMLElement>(null);
	const [hiddenAnchors, setHiddenAnchors] = useState<DetectedHiddenAnchor[]>(
		[],
	);

	const basePath = useMemo(() => {
		const parts = path.split("/");
		parts.pop();
		return parts.join("/");
	}, [path]);

	// Extract headings and notify parent via callback
	const headings = useMemo(() => extractHeadings(content), [content]);

	useEffect(() => {
		if (onHeadingsExtracted) {
			// Apply prefix to heading IDs if provided
			const processedHeadings = headingIdPrefix
				? headings.map((h) => ({
						...h,
						id: `${headingIdPrefix}${h.id}`,
					}))
				: [...headings];
			onHeadingsExtracted(processedHeadings);
		}
	}, [headings, onHeadingsExtracted, headingIdPrefix]);

	// Configure rehype-slug with prefix if provided
	const rehypePlugins: ReactMarkdownOptions["rehypePlugins"] = useMemo(() => {
		if (headingIdPrefix) {
			return [rehypeRaw, [rehypeSlug, { prefix: headingIdPrefix }]];
		}
		return [rehypeRaw, rehypeSlug];
	}, [headingIdPrefix]);

	// Detect hidden anchors after render (only when annotations enabled)
	// biome-ignore lint/correctness/useExhaustiveDependencies: content changes trigger DOM updates that require re-detection
	useEffect(() => {
		if (!enableAnnotations || !containerRef.current) {
			setHiddenAnchors([]);
			return;
		}

		// Use requestAnimationFrame to ensure DOM is fully rendered
		const rafId = requestAnimationFrame(() => {
			if (containerRef.current) {
				const detected = detectHiddenAnchors(containerRef.current);
				setHiddenAnchors(detected);
			}
		});

		return () => cancelAnimationFrame(rafId);
	}, [content, enableAnnotations]);

	// Update anchor positions on scroll/resize
	useEffect(() => {
		if (!enableAnnotations || !containerRef.current) {
			return;
		}

		const updatePositions = () => {
			if (containerRef.current) {
				const updated = detectHiddenAnchors(containerRef.current);
				setHiddenAnchors(updated);
			}
		};

		window.addEventListener("scroll", updatePositions, { passive: true });
		window.addEventListener("resize", updatePositions, { passive: true });

		return () => {
			window.removeEventListener("scroll", updatePositions);
			window.removeEventListener("resize", updatePositions);
		};
	}, [enableAnnotations]);

	return (
		<div className="relative">
			<article ref={containerRef} className={cn("markdown-content", className)}>
				{showFrontmatter &&
					frontmatter &&
					Object.keys(frontmatter).length > 0 && (
						<FrontmatterDisplay frontmatter={frontmatter} />
					)}
				<ReactMarkdown
					remarkPlugins={[remarkGfm, remarkFrontmatter]}
					rehypePlugins={rehypePlugins}
					components={{
						a: ({ href, children, ...props }) => (
							<MarkdownLink href={href} basePath={basePath} {...props}>
								{children}
							</MarkdownLink>
						),
						li: ({ children, className: liClassName, ...props }) => {
							return (
								<li className={liClassName} {...props}>
									{children}
								</li>
							);
						},
						input: ({ type, checked, ...props }) => {
							if (type === "checkbox") {
								return (
									<input
										type="checkbox"
										checked={checked}
										disabled
										className="mt-1 h-4 w-4 rounded border-border"
										{...props}
									/>
								);
							}
							return <input type={type} {...props} />;
						},
						table: ({ children, ...props }) => (
							<div className="table-wrapper my-4 max-w-full overflow-x-auto">
								<table
									className="min-w-full border-collapse text-sm"
									{...props}
								>
									{children}
								</table>
							</div>
						),
						code: ({ className: codeClassName, children, node, ...props }) => {
							const match = /language-(\w+)/.exec(codeClassName || "");
							const language = match ? match[1] : undefined;
							const codeContent = String(children).replace(/\n$/, "");

							// Check if this is inline code by looking at the parent element
							// If the code contains newlines, it's definitely a block
							const hasNewlines = codeContent.includes("\n");
							const isInline = !hasNewlines && !codeClassName;

							if (isInline) {
								return (
									<code
										className="relative rounded bg-muted px-[0.3rem] py-[0.2rem] font-mono text-sm"
										{...props}
									>
										{children}
									</code>
								);
							}

							if (language === "mermaid") {
								return <MermaidDiagram code={codeContent} />;
							}

							return <CodeBlock language={language} code={codeContent} />;
						},
						pre: ({ children }) => {
							return <>{children}</>;
						},
					}}
				>
					{content}
				</ReactMarkdown>
			</article>

			{/* Annotation layer - only rendered when enabled (requires AnnotationProvider) */}
			{enableAnnotations && (
				<AnnotationLayer
					path={path}
					containerRef={containerRef}
					hiddenAnchors={hiddenAnchors}
				/>
			)}
		</div>
	);
}

interface FrontmatterDisplayProps {
	frontmatter: Record<string, unknown>;
}

function FrontmatterDisplay({ frontmatter }: FrontmatterDisplayProps) {
	return (
		<div className="mb-6 rounded-md border bg-muted/30 p-4">
			<div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
				Document Metadata
			</div>
			<dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
				{Object.entries(frontmatter).map(([key, value]) => (
					<div key={key} className="contents">
						<dt className="font-medium text-muted-foreground">{key}:</dt>
						<dd>{String(value)}</dd>
					</div>
				))}
			</dl>
		</div>
	);
}
