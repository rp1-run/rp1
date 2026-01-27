import { MessageSquare } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { TextSelectionAnchor } from "@/types/annotations";

export interface SelectionIndicatorProps {
	selection: TextSelectionAnchor;
	containerRef: React.RefObject<HTMLElement | null>;
	gutterRef: React.RefObject<HTMLElement | null>;
	onClick: () => void;
}

interface IndicatorPosition {
	top: number;
	height: number;
}

/**
 * Shows a chat bubble icon in the gutter when text is selected.
 * Clicking the icon opens the annotation creation popover.
 * Styled to match the CodeBlock annotation indicators.
 */
export function SelectionIndicator({
	selection,
	containerRef,
	gutterRef,
	onClick,
}: SelectionIndicatorProps) {
	const [indicatorPos, setIndicatorPos] = useState<IndicatorPosition | null>(
		null,
	);

	useEffect(() => {
		if (!containerRef.current || !gutterRef.current) {
			return;
		}

		const container = containerRef.current;
		const { selectedText, contextBefore, contextAfter } = selection;

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
	}, [selection, containerRef, gutterRef]);

	if (!indicatorPos || !gutterRef.current) {
		return null;
	}

	const handleClick = (e: React.MouseEvent) => {
		e.stopPropagation();
		onClick();
	};

	// Use portal to render inside the gutter element
	return createPortal(
		<button
			type="button"
			onClick={handleClick}
			className="absolute left-0 right-0 cursor-pointer group animate-in fade-in duration-200"
			style={{
				top: indicatorPos.top,
				height: Math.max(indicatorPos.height, 20),
			}}
			aria-label="Add annotation to selected text"
		>
			{/* Chat bubble icon - same style as CodeBlock */}
			<div className="absolute right-0.5 top-0 flex items-center justify-center rounded px-1 py-0.5 transition-all bg-amber-500/20 text-amber-600 dark:text-amber-400 hover:bg-amber-500/30 hover:scale-110">
				<MessageSquare
					className="h-3 w-3"
					fill="currentColor"
					aria-hidden="true"
				/>
			</div>
		</button>,
		gutterRef.current,
	);
}
