import { useCallback, useEffect, useRef, useState } from "react";
import { getEditableText } from "@/lib/editable-text-nodes";
import type { TextSelectionAnchor } from "@/types/annotations";

/** Anchor rectangle for popover positioning */
export interface AnchorRect {
	readonly left: number;
	readonly right: number;
	readonly top: number;
	readonly bottom: number;
}

/** Position coordinates for popover placement */
export interface SelectionPosition {
	readonly x: number;
	readonly y: number;
	readonly anchorRect: AnchorRect;
}

/** Result returned by useTextSelection hook */
export interface UseTextSelectionResult {
	/** Current text selection anchor data, null if no selection */
	readonly selection: TextSelectionAnchor | null;
	/** Position for popover placement, null if no selection */
	readonly selectionPosition: SelectionPosition | null;
	/** Clear the current selection */
	readonly clearSelection: () => void;
	/** Lock the current selection so it persists until explicitly cleared */
	readonly lockSelection: () => void;
	/** Whether the selection is currently locked */
	readonly isLocked: boolean;
}

/** Options for useTextSelection hook */
export interface UseTextSelectionOptions {
	/** Container element ref to restrict selection detection */
	readonly containerRef?: React.RefObject<HTMLElement>;
	/** Whether selection tracking is enabled */
	readonly enabled?: boolean;
	/** Amount of context characters to capture before/after selection */
	readonly contextLength?: number;
	/** Delay in ms before showing selection (to avoid flicker on quick selections) */
	readonly showDelay?: number;
}

/** Characters of context to capture before/after selection */
const DEFAULT_CONTEXT_LENGTH = 50;

/** Default delay before showing selection popover (ms) */
const DEFAULT_SHOW_DELAY = 250;

/**
 * Extract text content from a container element.
 */
function isAnnotatableElement(node: Node): boolean {
	if (!(node instanceof HTMLElement)) return true;
	return !node.hasAttribute("data-annotation-exclude");
}

function getContainerText(container: Node): string {
	if (container instanceof HTMLElement) {
		return getEditableText(container);
	}
	return container.textContent ?? "";
}

/**
 * Calculate the offset of a range's boundary within a container's text content.
 * Traverses DOM nodes in document order, skipping non-editable UI chrome.
 */
function calculateTextOffset(
	container: Node,
	targetNode: Node,
	targetOffset: number,
): number {
	let offset = 0;

	function traverse(node: Node): boolean {
		// Skip excluded UI chrome (mermaid tabs, action buttons, line numbers)
		if (node instanceof HTMLElement && !isAnnotatableElement(node)) {
			return node.contains(targetNode);
		}

		if (node === targetNode) {
			if (node.nodeType === Node.TEXT_NODE) {
				offset += targetOffset;
			}
			return true;
		}

		if (node.nodeType === Node.TEXT_NODE) {
			offset += node.textContent?.length ?? 0;
		}

		for (const child of node.childNodes) {
			if (traverse(child)) {
				return true;
			}
		}

		return false;
	}

	traverse(container);
	return offset;
}

/**
 * Extract context before and after a selection within text content.
 */
function extractContext(
	fullText: string,
	startOffset: number,
	endOffset: number,
	contextLength: number,
): { contextBefore: string; contextAfter: string } {
	const contextStart = Math.max(0, startOffset - contextLength);
	const contextEnd = Math.min(fullText.length, endOffset + contextLength);

	return {
		contextBefore: fullText.slice(contextStart, startOffset),
		contextAfter: fullText.slice(endOffset, contextEnd),
	};
}

/**
 * Create a TextSelectionAnchor from the current browser selection.
 */
function createTextSelectionAnchor(
	selection: Selection,
	container: Node,
	contextLength: number,
): TextSelectionAnchor | null {
	const range = selection.getRangeAt(0);
	if (range.collapsed) {
		return null;
	}

	const selectedText = range.toString();
	if (!selectedText.trim()) {
		return null;
	}

	const fullText = getContainerText(container);
	const startOffset = calculateTextOffset(
		container,
		range.startContainer,
		range.startOffset,
	);
	const endOffset = calculateTextOffset(
		container,
		range.endContainer,
		range.endOffset,
	);

	const { contextBefore, contextAfter } = extractContext(
		fullText,
		startOffset,
		endOffset,
		contextLength,
	);

	return {
		type: "text-selection",
		startOffset,
		endOffset,
		selectedText,
		contextBefore,
		contextAfter,
	};
}

/**
 * Calculate position for popover placement based on selection.
 */
function calculateSelectionPosition(
	selection: Selection,
): SelectionPosition | null {
	const range = selection.getRangeAt(0);
	const rect = range.getBoundingClientRect();

	if (rect.width === 0 && rect.height === 0) {
		return null;
	}

	return {
		x: rect.left + rect.width / 2,
		y: rect.top,
		anchorRect: {
			left: rect.left,
			right: rect.right,
			top: rect.top,
			bottom: rect.bottom,
		},
	};
}

/**
 * Hook for capturing text selection events and generating anchor data.
 *
 * Uses the Web Selection API to track text selections within a container.
 * Generates TextSelectionAnchor objects with context for stable re-anchoring.
 */
export function useTextSelection(
	options: UseTextSelectionOptions = {},
): UseTextSelectionResult {
	const {
		containerRef,
		enabled = true,
		contextLength = DEFAULT_CONTEXT_LENGTH,
		showDelay = DEFAULT_SHOW_DELAY,
	} = options;

	const [selection, setSelection] = useState<TextSelectionAnchor | null>(null);
	const [selectionPosition, setSelectionPosition] =
		useState<SelectionPosition | null>(null);
	const [isLocked, setIsLocked] = useState(false);

	const isProcessingRef = useRef(false);
	const showDelayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const pendingSelectionRef = useRef<{
		anchor: TextSelectionAnchor | null;
		position: SelectionPosition | null;
	} | null>(null);

	const clearSelection = useCallback(() => {
		if (showDelayTimerRef.current) {
			clearTimeout(showDelayTimerRef.current);
			showDelayTimerRef.current = null;
		}
		pendingSelectionRef.current = null;
		setSelection(null);
		setSelectionPosition(null);
		setIsLocked(false);
		window.getSelection()?.removeAllRanges();
	}, []);

	const lockSelection = useCallback(() => {
		setIsLocked(true);
	}, []);

	const handleSelectionChange = useCallback(() => {
		if (!enabled || isProcessingRef.current || isLocked) {
			return;
		}

		const browserSelection = window.getSelection();
		if (!browserSelection || browserSelection.isCollapsed) {
			// Only clear if not locked
			if (!isLocked) {
				if (showDelayTimerRef.current) {
					clearTimeout(showDelayTimerRef.current);
					showDelayTimerRef.current = null;
				}
				pendingSelectionRef.current = null;
				setSelection(null);
				setSelectionPosition(null);
			}
			return;
		}

		const container = containerRef?.current ?? document.body;
		const anchorNode = browserSelection.anchorNode;
		const focusNode = browserSelection.focusNode;

		if (!anchorNode || !focusNode) {
			return;
		}

		if (!container.contains(anchorNode) || !container.contains(focusNode)) {
			return;
		}

		isProcessingRef.current = true;

		try {
			const anchor = createTextSelectionAnchor(
				browserSelection,
				container,
				contextLength,
			);
			const position = calculateSelectionPosition(browserSelection);

			// Store pending selection and apply after delay
			pendingSelectionRef.current = { anchor, position };

			if (showDelayTimerRef.current) {
				clearTimeout(showDelayTimerRef.current);
			}

			showDelayTimerRef.current = setTimeout(() => {
				if (pendingSelectionRef.current) {
					setSelection(pendingSelectionRef.current.anchor);
					setSelectionPosition(pendingSelectionRef.current.position);
					pendingSelectionRef.current = null;
				}
				showDelayTimerRef.current = null;
			}, showDelay);
		} finally {
			isProcessingRef.current = false;
		}
	}, [enabled, containerRef, contextLength, isLocked, showDelay]);

	useEffect(() => {
		if (!enabled) {
			return;
		}

		const handleMouseUp = () => {
			// Don't process if locked
			if (isLocked) return;
			setTimeout(handleSelectionChange, 0);
		};

		const handleKeyUp = (event: KeyboardEvent) => {
			// Don't process if locked
			if (isLocked) return;
			if (event.shiftKey) {
				setTimeout(handleSelectionChange, 0);
			}
		};

		document.addEventListener("mouseup", handleMouseUp);
		document.addEventListener("keyup", handleKeyUp);

		return () => {
			document.removeEventListener("mouseup", handleMouseUp);
			document.removeEventListener("keyup", handleKeyUp);
		};
	}, [enabled, handleSelectionChange, isLocked]);

	// Cleanup timer on unmount
	useEffect(() => {
		return () => {
			if (showDelayTimerRef.current) {
				clearTimeout(showDelayTimerRef.current);
			}
		};
	}, []);

	return {
		selection,
		selectionPosition,
		clearSelection,
		lockSelection,
		isLocked,
	};
}
