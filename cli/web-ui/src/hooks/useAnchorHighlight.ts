import { useEffect } from "react";
import {
	findTextRange,
	getEditableText,
	getEditableTextNodes,
} from "@/lib/editable-text-nodes";
import type { TextSelectionAnchor } from "@/types/annotations";

/**
 * Resolve a text-selection anchor to a DOM Range against the container's
 * current content. Prefers the full context pattern; falls back to the
 * selected text alone (context may straddle content that re-rendered).
 */
function resolveAnchorRange(
	container: HTMLElement,
	anchor: TextSelectionAnchor,
): Range | null {
	const nodes = getEditableTextNodes(container);
	const fullText = getEditableText(container);

	const pattern =
		anchor.contextBefore + anchor.selectedText + anchor.contextAfter;
	const patternIndex = fullText.indexOf(pattern);
	let start: number;
	if (patternIndex !== -1) {
		start = patternIndex + anchor.contextBefore.length;
	} else {
		const idx = fullText.indexOf(anchor.selectedText);
		if (idx === -1) return null;
		start = idx;
	}

	const found = findTextRange(nodes, start, start + anchor.selectedText.length);
	if (!found) return null;

	try {
		const range = new Range();
		range.setStart(found.startNode, found.startOffset);
		range.setEnd(found.endNode, found.endOffset);
		return range;
	} catch {
		return null;
	}
}

/**
 * Paint a CSS Custom Highlight derived from an anchor rather than from the
 * native browser selection. The native selection dies on any DOM
 * replacement (external refresh, editor re-render); an anchor-derived
 * highlight simply re-resolves against the new DOM, so in-progress
 * annotations keep their visual marker across re-renders.
 */
export function useAnchorHighlight(
	name: string,
	anchor: TextSelectionAnchor | null,
	containerRef: React.RefObject<HTMLElement | null>,
): void {
	useEffect(() => {
		if (!("highlights" in CSS)) return;

		const container = containerRef.current;
		if (!anchor || !container) {
			CSS.highlights.delete(name);
			return;
		}

		let frame: number | null = null;
		const apply = () => {
			const range = resolveAnchorRange(container, anchor);
			if (range) {
				CSS.highlights.set(name, new Highlight(range));
			} else {
				CSS.highlights.delete(name);
			}
		};

		apply();

		const observer = new MutationObserver(() => {
			if (frame !== null) return;
			frame = requestAnimationFrame(() => {
				frame = null;
				apply();
			});
		});
		observer.observe(container, {
			childList: true,
			subtree: true,
			characterData: true,
		});

		return () => {
			observer.disconnect();
			if (frame !== null) cancelAnimationFrame(frame);
			CSS.highlights.delete(name);
		};
	}, [name, anchor, containerRef]);
}
