import { MessageSquare } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import type { SelectionPosition } from "@/hooks/useTextSelection";
import { cn } from "@/lib/utils";
import type { Annotation } from "@/types/annotations";

export interface AnnotationIndicatorProps {
	annotation: Annotation;
	containerRef: React.RefObject<HTMLElement | null>;
	gutterRef: React.RefObject<HTMLElement | null>;
	onClick: (annotation: Annotation, position: SelectionPosition) => void;
}

interface IndicatorPosition {
	top: number;
	height: number;
}

export function AnnotationIndicator({
	annotation,
	containerRef,
	gutterRef,
	onClick,
}: AnnotationIndicatorProps) {
	const [indicatorPos, setIndicatorPos] = useState<IndicatorPosition | null>(
		null,
	);

	useEffect(() => {
		if (annotation.anchor.type !== "text-selection" || !containerRef.current) {
			return;
		}

		const container = containerRef.current;
		const { selectedText, contextBefore, contextAfter } = annotation.anchor;

		const fullText = container.textContent ?? "";
		const searchPattern = contextBefore + selectedText + contextAfter;
		const patternIndex = fullText.indexOf(searchPattern);

		if (patternIndex === -1) {
			return;
		}

		const startIndex = patternIndex + contextBefore.length;
		const endIndex = startIndex + selectedText.length;

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

		if (startNode && endNode && gutterRef.current) {
			try {
				const range = document.createRange();
				range.setStart(startNode, startOffset);
				range.setEnd(endNode, endOffset);
				const rect = range.getBoundingClientRect();
				const gutterRect = gutterRef.current.getBoundingClientRect();

				setIndicatorPos({
					top: rect.top - gutterRect.top,
					height: rect.height,
				});
			} catch {
				// Range creation can fail if offsets are invalid
			}
		}
	}, [annotation, containerRef, gutterRef]);

	if (!indicatorPos || !gutterRef.current) {
		return null;
	}

	const handleClick = () => {
		const gutterRect = gutterRef.current?.getBoundingClientRect();
		if (!gutterRect) return;

		// Position popover to the right of the gutter
		onClick(annotation, {
			x: gutterRect.right + 8,
			y: gutterRect.top + indicatorPos.top,
			anchorRect: {
				left: gutterRect.left,
				right: gutterRect.right,
				top: gutterRect.top + indicatorPos.top,
				bottom: gutterRect.top + indicatorPos.top + indicatorPos.height,
			},
		});
	};

	const isResolved = annotation.status === "resolved";

	const replyCount = annotation.replies.length;
	const tooltipText = isResolved
		? `View resolved comment${replyCount > 0 ? ` (${replyCount} ${replyCount === 1 ? "reply" : "replies"})` : ""}`
		: `View comment${replyCount > 0 ? ` (${replyCount} ${replyCount === 1 ? "reply" : "replies"})` : ""}`;

	// Use portal to render inside the gutter element
	return createPortal(
		<TooltipProvider>
			<Tooltip>
				<TooltipTrigger asChild>
					<button
						type="button"
						onClick={handleClick}
						data-annotation-id={annotation.id}
						className="absolute left-0 right-0 cursor-pointer group focus:outline-none"
						style={{
							top: indicatorPos.top,
							height: indicatorPos.height,
							minHeight: 24, // Minimum clickable height
						}}
						aria-label={`Annotation: ${annotation.content.slice(0, 50)}${annotation.content.length > 50 ? "..." : ""}`}
					>
						{/* Ultrathin vertical line indicator - detached from icon */}
						<div
							className={cn(
								"absolute right-2 top-5 bottom-0 w-0.5 rounded-full transition-all",
								isResolved
									? "bg-terminal-green group-hover:bg-terminal-green/80"
									: "bg-amber-500 group-hover:bg-amber-600",
							)}
						/>
						{/* Chat bubble icon - same style as CodeBlock */}
						<div
							className={cn(
								"absolute right-0.5 top-0 flex items-center justify-center rounded px-1 py-0.5 transition-colors",
								isResolved
									? "bg-terminal-green/20 text-terminal-green/70 group-hover:text-terminal-green"
									: "bg-amber-500/20 text-amber-600 dark:text-amber-400 group-hover:text-amber-700 dark:group-hover:text-amber-300",
							)}
						>
							<MessageSquare
								className="h-3 w-3"
								fill="currentColor"
								aria-hidden="true"
							/>
						</div>
					</button>
				</TooltipTrigger>
				<TooltipContent side="left">{tooltipText}</TooltipContent>
			</Tooltip>
		</TooltipProvider>,
		gutterRef.current,
	);
}
