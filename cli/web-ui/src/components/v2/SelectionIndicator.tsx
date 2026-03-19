import { MessageSquare } from "lucide-react";
import { useEffect, useState } from "react";
import type { TextSelectionAnchor } from "@/types/annotations";

export interface SelectionIndicatorProps {
	selection: TextSelectionAnchor;
	containerRef: React.RefObject<HTMLElement | null>;
	gutterRef: React.RefObject<HTMLElement | null>;
	onClick: () => void;
}

interface IndicatorPosition {
	x: number;
	y: number;
}

/**
 * Shows a chat bubble icon near the end of selected text.
 * Clicking the icon opens the annotation creation popover.
 */
export function SelectionIndicator({
	selection,
	containerRef,
	onClick,
}: SelectionIndicatorProps) {
	const [pos, setPos] = useState<IndicatorPosition | null>(null);

	useEffect(() => {
		if (!containerRef.current) return;

		const container = containerRef.current;
		const { selectedText, contextBefore, contextAfter } = selection;

		const fullText = container.textContent ?? "";
		const searchPattern = contextBefore + selectedText + contextAfter;
		const patternIndex = fullText.indexOf(searchPattern);

		if (patternIndex === -1) return;

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

		if (startNode && endNode) {
			try {
				const range = document.createRange();
				range.setStart(startNode, startOffset);
				range.setEnd(endNode, endOffset);
				const rect = range.getBoundingClientRect();

				setPos({
					x: rect.left - 24,
					y: rect.top - 2,
				});
			} catch {
				// Range creation can fail if offsets are invalid
			}
		}
	}, [selection, containerRef]);

	if (!pos) return null;

	const handleClick = (e: React.MouseEvent) => {
		e.stopPropagation();
		onClick();
	};

	const handleMouseDown = (e: React.MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();
	};

	return (
		<button
			type="button"
			onClick={handleClick}
			onMouseDown={handleMouseDown}
			className="fixed z-40 flex items-center justify-center rounded px-1 py-0.5 cursor-pointer animate-in fade-in duration-150 bg-accent-amber/20 text-accent-amber hover:bg-accent-amber/30 hover:scale-110 transition-all"
			style={{
				left: `${pos.x}px`,
				top: `${pos.y}px`,
			}}
			aria-label="Add annotation to selected text"
			title="Add comment"
		>
			<MessageSquare className="h-3 w-3" fill="currentColor" />
		</button>
	);
}
