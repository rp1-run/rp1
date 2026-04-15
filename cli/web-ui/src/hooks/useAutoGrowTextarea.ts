import { type RefObject, useEffect } from "react";

/**
 * Auto-grows a textarea vertically as the user types, shrinking back when content is cleared.
 * Respects min-height (from the initial single-row size) and a configurable max-height.
 */
export function useAutoGrowTextarea(
	ref: RefObject<HTMLTextAreaElement | null>,
	value: string,
	maxHeight = 160,
) {
	// biome-ignore lint/correctness/useExhaustiveDependencies: value is a parameter that changes on re-render when textarea content updates
	useEffect(() => {
		const el = ref.current;
		if (!el) return;

		// Reset to auto so scrollHeight reflects actual content height
		el.style.height = "auto";
		const next = Math.min(el.scrollHeight, maxHeight);
		el.style.height = `${next}px`;

		// Show scrollbar only when content exceeds max
		el.style.overflowY = el.scrollHeight > maxHeight ? "auto" : "hidden";
	}, [ref, value, maxHeight]);
}
