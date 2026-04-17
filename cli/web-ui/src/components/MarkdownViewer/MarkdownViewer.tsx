import { useCallback, useEffect, useMemo, useRef } from "react";
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
import { useAnnotationFlow } from "@/hooks/useAnnotationFlow";
import { useAnnotations } from "@/hooks/useAnnotations";
import {
	extractHeadings,
	type HeadingEntry,
} from "@/hooks/useHeadingExtraction";
import type { SelectionPosition } from "@/hooks/useTextSelection";
import {
	findTextRange,
	getEditableText,
	getEditableTextNodes,
} from "@/lib/editable-text-nodes";
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
	enableAnnotations?: boolean;
}

export interface AnnotationLayerProps {
	path: string;
	containerRef: React.RefObject<HTMLElement | null>;
	gutterRef: React.RefObject<HTMLElement | null>;
}

export function AnnotationLayer({
	path,
	containerRef,
	gutterRef,
}: AnnotationLayerProps) {
	const { flowState, dispatch } = useAnnotationFlow({ containerRef });

	const { annotations } = useAnnotations({ artifactPath: path });
	const { selectedAnnotationId, selectAnnotation } = useAnnotationContextSafe();

	const textSelectionAnnotations = useMemo(() => {
		return annotations.filter(
			(a) => a.anchor.type === "text-selection" && !a.orphaned,
		);
	}, [annotations]);

	const activeAnnotationId =
		flowState.state === "viewing_annotation" ? flowState.annotationId : null;

	const activeAnnotation = activeAnnotationId
		? (annotations.find((a) => a.id === activeAnnotationId) ?? null)
		: null;

	const handleAnnotationClick = useCallback(
		(annotation: Annotation, position: SelectionPosition) => {
			dispatch({
				type: "ANNOTATION_CLICKED",
				annotationId: annotation.id,
				position,
			});
		},
		[dispatch],
	);

	const handleIndicatorClick = useCallback(() => {
		dispatch({ type: "INDICATOR_CLICKED" });
	}, [dispatch]);

	const handleCloseSelectionPopover = useCallback(() => {
		dispatch({ type: "FORM_CANCELLED" });
	}, [dispatch]);

	const handleAnnotationCreated = useCallback(() => {
		dispatch({ type: "FORM_SUBMITTED" });
	}, [dispatch]);

	const handleCloseAnnotationPopover = useCallback(() => {
		dispatch({ type: "POPOVER_CLOSED" });
	}, [dispatch]);

	useEffect(() => {
		if (!selectedAnnotationId) return;

		const annotation = annotations.find((a) => a.id === selectedAnnotationId);
		if (!annotation) return;

		if (annotation.anchor.type !== "text-selection") return;

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
			dispatch({
				type: "ANNOTATION_CLICKED",
				annotationId: annotation.id,
				position,
			});
		} else if (containerRef.current) {
			const { selectedText, contextBefore, contextAfter } = annotation.anchor;
			const container = containerRef.current;
			const nodes = getEditableTextNodes(container);
			const fullText = getEditableText(container);
			const searchPattern = contextBefore + selectedText + contextAfter;
			const patternIndex = fullText.indexOf(searchPattern);

			if (patternIndex !== -1) {
				const startIndex = patternIndex + contextBefore.length;
				const endIndex = startIndex + selectedText.length;
				const found = findTextRange(nodes, startIndex, endIndex);

				if (found) {
					const { startNode, startOffset, endNode, endOffset } = found;
					try {
						const range = new Range();
						range.setStart(startNode, startOffset);
						range.setEnd(endNode, endOffset);
						const el = startNode.parentElement;
						el?.scrollIntoView({ behavior: "smooth", block: "center" });

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
							dispatch({
								type: "ANNOTATION_CLICKED",
								annotationId: annotation.id,
								position,
							});
						});
					} catch {
						// Range construction failed
					}
				}
			}
		}

		selectAnnotation(null);
	}, [
		selectedAnnotationId,
		annotations,
		selectAnnotation,
		containerRef,
		dispatch,
	]);

	// CSS Custom Highlight API for active annotation highlighting
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
		const nodes = getEditableTextNodes(container);
		const fullText = getEditableText(container);
		const searchPattern = contextBefore + selectedText + contextAfter;
		const patternIndex = fullText.indexOf(searchPattern);

		if (patternIndex === -1) {
			CSS.highlights.delete("active-annotation");
			return;
		}

		const startIndex = patternIndex + contextBefore.length;
		const endIndex = startIndex + selectedText.length;
		const found = findTextRange(nodes, startIndex, endIndex);

		if (found) {
			const { startNode, startOffset, endNode, endOffset } = found;
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

	// Dismiss handler for indicator_visible state.
	// SelectionPopover and AnnotationPopover handle their own dismiss via useDismiss,
	// but the SelectionIndicator (gutter button) has no built-in dismiss. Without this,
	// clicking away from the indicator leaves it stuck and blocks new selections.
	useEffect(() => {
		if (flowState.state !== "indicator_visible") return;

		const handleMouseDown = (e: MouseEvent) => {
			if (gutterRef.current?.contains(e.target as Node)) return;
			dispatch({ type: "CLICK_OUTSIDE" });
		};

		const handleEscape = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				dispatch({ type: "ESCAPE" });
			}
		};

		// Delay activation so the mouseup that completed the text selection
		// doesn't immediately dismiss the indicator.
		const timeoutId = setTimeout(() => {
			document.addEventListener("mousedown", handleMouseDown);
			document.addEventListener("keydown", handleEscape, true);
		}, 150);

		return () => {
			clearTimeout(timeoutId);
			document.removeEventListener("mousedown", handleMouseDown);
			document.removeEventListener("keydown", handleEscape, true);
		};
	}, [flowState.state, dispatch, gutterRef]);

	return (
		<>
			<GroupedAnnotationIndicators
				annotations={textSelectionAnnotations}
				containerRef={containerRef}
				gutterRef={gutterRef}
				onAnnotationClick={handleAnnotationClick}
			/>

			{flowState.state === "indicator_visible" && (
				<SelectionIndicator
					selection={flowState.selection}
					containerRef={containerRef}
					gutterRef={gutterRef}
					onClick={handleIndicatorClick}
				/>
			)}

			{flowState.state === "form_open" && (
				<SelectionPopover
					anchor={flowState.selection}
					artifactPath={path}
					position={flowState.position}
					onClose={handleCloseSelectionPopover}
					onAnnotationCreated={handleAnnotationCreated}
				/>
			)}

			{flowState.state === "viewing_annotation" && activeAnnotation && (
				<AnnotationPopover
					annotation={activeAnnotation}
					position={flowState.position}
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
	enableAnnotations = true,
}: MarkdownViewerProps) {
	const containerRef = useRef<HTMLElement>(null);
	const gutterRef = useRef<HTMLDivElement>(null);

	const basePath = useMemo(() => {
		const parts = path.split("/");
		parts.pop();
		return parts.join("/");
	}, [path]);

	const headings = useMemo(() => extractHeadings(content), [content]);

	useEffect(() => {
		if (onHeadingsExtracted) {
			const processedHeadings = headingIdPrefix
				? headings.map((h) => ({
						...h,
						id: `${headingIdPrefix}${h.id}`,
					}))
				: [...headings];
			onHeadingsExtracted(processedHeadings);
		}
	}, [headings, onHeadingsExtracted, headingIdPrefix]);

	const rehypePlugins: ReactMarkdownOptions["rehypePlugins"] = useMemo(() => {
		if (headingIdPrefix) {
			return [rehypeRaw, [rehypeSlug, { prefix: headingIdPrefix }]];
		}
		return [rehypeRaw, rehypeSlug];
	}, [headingIdPrefix]);

	return (
		<div className="relative flex gap-3 min-w-0 max-w-full">
			{/* Annotation gutter - visual column for indicators */}
			<div
				ref={gutterRef}
				className="w-5 flex-shrink-0 relative"
				aria-hidden="true"
			/>

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
									<MermaidDiagram code={codeContent} artifactPath={path} />
								);
							}

							return (
								<CodeBlock
									language={language}
									code={codeContent}
									artifactPath={path}
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

			{enableAnnotations && (
				<AnnotationLayer
					path={path}
					containerRef={containerRef}
					gutterRef={gutterRef}
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
