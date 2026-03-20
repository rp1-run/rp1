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
import { GroupedAnnotationIndicators } from "@/components/v2/GroupedAnnotationIndicators";
import { SelectionIndicator } from "@/components/v2/SelectionIndicator";
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
import { useAnnotationContextSafe } from "@/providers/AnnotationProvider";
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

export interface AnnotationLayerProps {
	path: string;
	containerRef: React.RefObject<HTMLElement | null>;
	gutterRef: React.RefObject<HTMLElement | null>;
	hiddenAnchors: DetectedHiddenAnchor[];
	onEditDiffNavigate?: (
		entry: import("@/lib/diff-engine").LineDiffEntry,
		rect: DOMRect,
	) => void;
}

export function AnnotationLayer({
	path,
	containerRef,
	gutterRef,
	hiddenAnchors,
	onEditDiffNavigate,
}: AnnotationLayerProps) {
	const [activeAnchor, setActiveAnchor] = useState<DetectedHiddenAnchor | null>(
		null,
	);
	const [activeAnnotationId, setActiveAnnotationId] = useState<string | null>(
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
	const { selectedAnnotationId, selectAnnotation } = useAnnotationContextSafe();

	// Derive active annotation from ID to ensure it updates when context changes
	const activeAnnotation = activeAnnotationId
		? (annotations.find((a) => a.id === activeAnnotationId) ?? null)
		: null;

	// Lock selection when text is selected (but don't show popover yet - Google Docs style)
	useEffect(() => {
		if (selection && selectionPosition && !isLocked) {
			// Lock the selection so it persists - icon will appear in gutter
			lockSelection();
		}
	}, [selection, selectionPosition, lockSelection, isLocked]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: refs are stable
	useEffect(() => {
		if (!isLocked || showSelectionPopover) return;

		const handleClickOutside = (e: MouseEvent) => {
			const target = e.target as Node;
			if (containerRef.current && !containerRef.current.contains(target)) {
				const isGutterClick = gutterRef.current?.contains(target);
				if (!isGutterClick) {
					clearSelection();
				}
			}
		};

		const handleSelectionChange = () => {
			const sel = window.getSelection();
			if (!sel || sel.isCollapsed) {
				// Don't clear if cursor moved within the container (e.g., editor click)
				if (sel?.anchorNode && containerRef.current?.contains(sel.anchorNode)) {
					return;
				}
				clearSelection();
			}
		};

		document.addEventListener("mousedown", handleClickOutside);
		document.addEventListener("selectionchange", handleSelectionChange);

		return () => {
			document.removeEventListener("mousedown", handleClickOutside);
			document.removeEventListener("selectionchange", handleSelectionChange);
		};
	}, [isLocked, showSelectionPopover, clearSelection]);

	// Handle clicking the selection indicator to show the popover
	const handleSelectionIndicatorClick = useCallback(() => {
		setShowSelectionPopover(true);
	}, []);

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

	// Listen for sidebar navigation - open popover when annotation is selected
	useEffect(() => {
		if (!selectedAnnotationId) return;

		// Find the annotation in our list
		const annotation = annotations.find((a) => a.id === selectedAnnotationId);
		if (!annotation) return;

		// Handle edit-diff annotations: scroll to the affected line and show popover
		if (annotation.anchor.type === "edit-diff" && containerRef.current) {
			const editAnchor =
				annotation.anchor as import("@/types/annotations").EditDiffAnchor;
			const firstDiff = editAnchor.diffs.find((d) => d.type !== "unchanged");
			if (firstDiff) {
				const container = containerRef.current;
				const textBlocks = container.querySelectorAll(".ProseMirror > *");
				const targetIdx = firstDiff.line - 1;
				if (targetIdx >= 0 && targetIdx < textBlocks.length) {
					const targetEl = textBlocks[targetIdx] as HTMLElement;
					if (onEditDiffNavigate) {
						const showPopover = () => {
							onEditDiffNavigate(firstDiff, targetEl.getBoundingClientRect());
						};
						// Check if element is already in viewport
						const rect = targetEl.getBoundingClientRect();
						const inView = rect.top >= 0 && rect.bottom <= window.innerHeight;
						if (inView) {
							showPopover();
						} else {
							targetEl.scrollIntoView({ behavior: "smooth", block: "center" });
							// Wait for scroll to settle, then show
							let lastY = targetEl.getBoundingClientRect().top;
							const poll = setInterval(() => {
								const currentY = targetEl.getBoundingClientRect().top;
								if (currentY === lastY) {
									clearInterval(poll);
									showPopover();
								}
								lastY = currentY;
							}, 50);
							// Safety cap
							setTimeout(() => clearInterval(poll), 2000);
						}
					} else {
						targetEl.scrollIntoView({ behavior: "smooth", block: "center" });
					}
				}
			}
			selectAnnotation(null);
			return;
		}

		// Only handle text-selection and hidden-anchor types here
		// Line annotations are handled by CodeBlock
		if (
			annotation.anchor.type !== "text-selection" &&
			annotation.anchor.type !== "hidden-anchor"
		) {
			return;
		}

		// Find the highlight element in the DOM
		const highlightElement = document.querySelector(
			`[data-annotation-id="${selectedAnnotationId}"]`,
		);
		if (highlightElement) {
			highlightElement.scrollIntoView({ behavior: "smooth", block: "center" });
			const rect = highlightElement.getBoundingClientRect();
			const position: SelectionPosition = {
				x: rect.left + rect.width / 2,
				y: rect.bottom,
				anchorRect: {
					left: rect.left,
					right: rect.right,
					top: rect.top,
					bottom: rect.bottom,
				},
			};
			setActiveAnnotationId(annotation.id);
			setAnnotationPosition(position);
		} else if (
			annotation.anchor.type === "text-selection" &&
			containerRef.current
		) {
			// Fallback: find text by context matching (e.g., in contenteditable editor)
			const { selectedText, contextBefore, contextAfter } = annotation.anchor;
			const fullText = containerRef.current.textContent ?? "";
			const searchPattern = contextBefore + selectedText + contextAfter;
			const patternIndex = fullText.indexOf(searchPattern);

			if (patternIndex !== -1) {
				const startIndex = patternIndex + contextBefore.length;
				const endIndex = startIndex + selectedText.length;

				const walker = document.createTreeWalker(
					containerRef.current,
					NodeFilter.SHOW_TEXT,
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
						const range = new Range();
						range.setStart(startNode, startOffset);
						range.setEnd(endNode, endOffset);
						// Scroll the matched text into view
						const el = startNode.parentElement;
						el?.scrollIntoView({ behavior: "smooth", block: "center" });

						// Use requestAnimationFrame to get position after scroll
						requestAnimationFrame(() => {
							const updatedRect = range.getBoundingClientRect();
							const position: SelectionPosition = {
								x: updatedRect.left + updatedRect.width / 2,
								y: updatedRect.bottom,
								anchorRect: {
									left: updatedRect.left,
									right: updatedRect.right,
									top: updatedRect.top,
									bottom: updatedRect.bottom,
								},
							};
							setActiveAnnotationId(annotation.id);
							setAnnotationPosition(position);
						});
					} catch {
						// Range construction failed
					}
				}
			}
		}

		// Clear selection after handling
		selectAnnotation(null);
	}, [
		selectedAnnotationId,
		annotations,
		selectAnnotation,
		containerRef,
		onEditDiffNavigate,
	]);

	const handleAnchorClick = useCallback(
		(anchor: DetectedHiddenAnchor) => {
			const anchorAnnotations = anchorAnnotationsMap.get(
				anchor.anchor.anchorId,
			);

			if (anchorAnnotations && anchorAnnotations.length > 0) {
				// Show first annotation popover
				setActiveAnnotationId(anchorAnnotations[0].id);
				setAnnotationPosition(anchor.position);
				setActiveAnchor(null);
			} else {
				// Show anchor for creating new annotation
				setActiveAnchor(anchor);
				setActiveAnnotationId(null);
			}
		},
		[anchorAnnotationsMap],
	);

	const handleTextAnnotationClick = useCallback(
		(annotation: Annotation, position: SelectionPosition) => {
			setActiveAnnotationId(annotation.id);
			setAnnotationPosition(position);
			setActiveAnchor(null);
		},
		[],
	);

	const handleCloseAnnotationPopover = useCallback(() => {
		setActiveAnnotationId(null);
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

	// Highlight the active annotation's text using CSS Custom Highlight API
	useEffect(() => {
		if (!("highlights" in CSS) || !containerRef.current) return;

		if (!activeAnnotationId) {
			CSS.highlights.delete("active-annotation");
			return;
		}

		const annotation = annotations.find((a) => a.id === activeAnnotationId);
		if (!annotation || annotation.anchor.type !== "text-selection") {
			CSS.highlights.delete("active-annotation");
			return;
		}

		const container = containerRef.current;
		const { selectedText, contextBefore, contextAfter } = annotation.anchor;
		const fullText = container.textContent ?? "";
		const searchPattern = contextBefore + selectedText + contextAfter;
		const patternIndex = fullText.indexOf(searchPattern);

		if (patternIndex === -1) {
			CSS.highlights.delete("active-annotation");
			return;
		}

		const startIndex = patternIndex + contextBefore.length;
		const endIndex = startIndex + selectedText.length;

		const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
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
				const range = new Range();
				range.setStart(startNode, startOffset);
				range.setEnd(endNode, endOffset);
				const highlight = new Highlight(range);
				CSS.highlights.set("active-annotation", highlight);
			} catch {
				CSS.highlights.delete("active-annotation");
			}
		}

		return () => {
			CSS.highlights.delete("active-annotation");
		};
	}, [activeAnnotationId, annotations, containerRef]);

	return (
		<>
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

			<GroupedAnnotationIndicators
				annotations={textSelectionAnnotations}
				containerRef={containerRef}
				gutterRef={gutterRef}
				onAnnotationClick={handleTextAnnotationClick}
			/>

			{/* Show selection indicator in gutter when text is selected (Google Docs style) */}
			{selection && isLocked && !showSelectionPopover && (
				<SelectionIndicator
					selection={selection}
					containerRef={containerRef}
					gutterRef={gutterRef}
					onClick={handleSelectionIndicatorClick}
				/>
			)}

			{/* Show popover when user clicks the selection indicator */}
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
	const gutterRef = useRef<HTMLDivElement>(null);
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
		<div className="relative flex gap-3">
			{/* Annotation gutter - visual column for indicators */}
			{enableAnnotations && (
				<div
					ref={gutterRef}
					className="w-5 flex-shrink-0 relative"
					aria-hidden="true"
				/>
			)}

			<article
				ref={containerRef}
				className={cn("markdown-content flex-1 min-w-0", className)}
			>
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
										className="h-4 w-4 rounded border-border"
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
								return (
									<MermaidDiagram
										code={codeContent}
										artifactPath={path}
										enableAnnotations={enableAnnotations}
									/>
								);
							}

							return (
								<CodeBlock
									language={language}
									code={codeContent}
									artifactPath={path}
									enableAnnotations={enableAnnotations}
								/>
							);
						},
						pre: ({ children }) => {
							return <>{children}</>;
						},
					}}
				>
					{content}
				</ReactMarkdown>
			</article>

			{/* Annotation layer renders indicators in the gutter and popovers as overlays */}
			{enableAnnotations && (
				<AnnotationLayer
					path={path}
					containerRef={containerRef}
					gutterRef={gutterRef}
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
