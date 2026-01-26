import { useCallback, useLayoutEffect, useRef } from "react";

export interface UseScrollPreservationResult {
	readonly scrollAreaRef: React.RefObject<HTMLDivElement>;
	readonly preserveScrollPosition: () => void;
	readonly restoreScrollPosition: () => void;
}

interface ScrollState {
	scrollTop: number;
	scrollHeight: number;
}

/**
 * Preserve scroll position during content updates.
 * Uses useLayoutEffect to restore position after DOM update, before paint.
 *
 * Usage pattern:
 * 1. Call preserveScrollPosition() before content update
 * 2. restoreScrollPosition() is called automatically via useLayoutEffect
 *    after DOM updates, or can be called manually if needed
 *
 * Handles content insertion above viewport by adjusting scroll offset:
 * newScrollTop = oldScrollTop + (newContentHeight - oldContentHeight)
 * Only applied when scroll position > 0 and content grew.
 */
export function useScrollPreservation(): UseScrollPreservationResult {
	const scrollAreaRef = useRef<HTMLDivElement>(null);
	const savedState = useRef<ScrollState | null>(null);
	const shouldRestore = useRef(false);

	const preserveScrollPosition = useCallback(() => {
		const element = scrollAreaRef.current;
		if (!element) return;

		savedState.current = {
			scrollTop: element.scrollTop,
			scrollHeight: element.scrollHeight,
		};
		shouldRestore.current = true;
	}, []);

	const restoreScrollPosition = useCallback(() => {
		const element = scrollAreaRef.current;
		const state = savedState.current;

		if (!element || !state) return;

		const newScrollHeight = element.scrollHeight;
		const heightDelta = newScrollHeight - state.scrollHeight;

		if (state.scrollTop > 0 && heightDelta > 0) {
			element.scrollTop = state.scrollTop + heightDelta;
		} else {
			element.scrollTop = state.scrollTop;
		}

		savedState.current = null;
		shouldRestore.current = false;
	}, []);

	useLayoutEffect(() => {
		if (shouldRestore.current) {
			restoreScrollPosition();
		}
	});

	return {
		scrollAreaRef,
		preserveScrollPosition,
		restoreScrollPosition,
	};
}
