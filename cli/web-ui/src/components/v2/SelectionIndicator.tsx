import { MessageSquare } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
	findTextRange,
	getEditableText,
	getEditableTextNodes,
} from "@/lib/editable-text-nodes";
import type { TextSelectionAnchor } from "@/types/annotations";

export interface SelectionIndicatorProps {
	selection: TextSelectionAnchor;
	containerRef: React.RefObject<HTMLElement | null>;
	gutterRef: React.RefObject<HTMLElement | null>;
	onClick: () => void;
}

/**
 * Shows a chat bubble icon in the gutter adjacent to selected text.
 * Clicking the icon opens the annotation creation popover.
 *
 * Renders via createPortal into the gutter element so it scrolls
 * naturally with content -- no scroll listener needed.
 */
export function SelectionIndicator({
	selection,
	containerRef,
	gutterRef,
	onClick,
}: SelectionIndicatorProps) {
	const [relativeTop, setRelativeTop] = useState<number | null>(null);

	useEffect(() => {
		if (!containerRef.current || !gutterRef.current) return;

		const container = containerRef.current;
		const { selectedText, contextBefore, contextAfter } = selection;

		const nodes = getEditableTextNodes(container);
		const fullText = getEditableText(container);
		const searchPattern = contextBefore + selectedText + contextAfter;
		const patternIndex = fullText.indexOf(searchPattern);

		if (patternIndex === -1) return;

		const startIndex = patternIndex + contextBefore.length;
		const endIndex = startIndex + selectedText.length;
		const found = findTextRange(nodes, startIndex, endIndex);

		if (found) {
			const { startNode, startOffset, endNode, endOffset } = found;
			try {
				const range = document.createRange();
				range.setStart(startNode, startOffset);
				range.setEnd(endNode, endOffset);
				const rect = range.getBoundingClientRect();
				const gutterRect = gutterRef.current!.getBoundingClientRect();

				setRelativeTop(rect.top - gutterRect.top);
			} catch {
				// Range creation can fail if offsets are invalid
			}
		}
	}, [selection, containerRef, gutterRef]);

	if (relativeTop === null || !gutterRef.current) return null;

	const handleClick = (e: React.MouseEvent) => {
		e.stopPropagation();
		onClick();
	};

	const handleMouseDown = (e: React.MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();
	};

	return createPortal(
		<button
			type="button"
			onClick={handleClick}
			onMouseDown={handleMouseDown}
			className="absolute right-0.5 flex items-center justify-center rounded px-1 py-0.5 cursor-pointer animate-in fade-in duration-150 bg-accent-amber/20 text-accent-amber hover:bg-accent-amber/30 hover:scale-110 transition-all"
			style={{
				top: relativeTop,
			}}
			aria-label="Add annotation to selected text"
			title="Add comment"
		>
			<MessageSquare className="h-3 w-3" fill="currentColor" />
		</button>,
		gutterRef.current,
	);
}
