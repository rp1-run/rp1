import { useCallback, useEffect, useRef, useState } from "react";

const STORAGE_KEY = "rp1-follow-mode";
const AT_BOTTOM_THRESHOLD = 50;

export interface UseFollowModeResult {
	readonly followMode: boolean;
	readonly hasNewUpdates: boolean;
	readonly setFollowMode: (enabled: boolean) => void;
	readonly scrollToNew: () => void;
	readonly handleScroll: (event: React.UIEvent) => void;
}

/**
 * Manage auto-scroll follow mode and new updates indicator.
 *
 * Behavior:
 * 1. When followMode enabled: auto-scroll to bottom on new content
 * 2. When user scrolls up manually: disable followMode
 * 3. When not at bottom and content updates: set hasNewUpdates = true
 * 4. scrollToNew(): smooth scroll to bottom, clear hasNewUpdates
 *
 * "At bottom" defined as: scrollTop + clientHeight >= scrollHeight - 50px threshold
 */
export function useFollowMode(
	scrollAreaRef: React.RefObject<HTMLDivElement>,
): UseFollowModeResult {
	const [followMode, setFollowModeState] = useState<boolean>(() => {
		if (typeof window === "undefined") return false;
		const stored = sessionStorage.getItem(STORAGE_KEY);
		return stored === "true";
	});
	const [hasNewUpdates, setHasNewUpdates] = useState(false);

	const lastScrollTop = useRef<number>(0);
	const isAutoScrolling = useRef(false);

	const isAtBottom = useCallback((): boolean => {
		const element = scrollAreaRef.current;
		if (!element) return true;

		const { scrollTop, scrollHeight, clientHeight } = element;
		return scrollTop + clientHeight >= scrollHeight - AT_BOTTOM_THRESHOLD;
	}, [scrollAreaRef]);

	const setFollowMode = useCallback((enabled: boolean) => {
		setFollowModeState(enabled);
		if (typeof window !== "undefined") {
			sessionStorage.setItem(STORAGE_KEY, String(enabled));
		}
		if (enabled) {
			setHasNewUpdates(false);
		}
	}, []);

	const scrollToNew = useCallback(() => {
		const element = scrollAreaRef.current;
		if (!element) return;

		isAutoScrolling.current = true;
		element.scrollTo({
			top: element.scrollHeight,
			behavior: "smooth",
		});

		setTimeout(() => {
			isAutoScrolling.current = false;
		}, 500);

		setHasNewUpdates(false);
	}, [scrollAreaRef]);

	const handleScroll = useCallback(
		(event: React.UIEvent) => {
			if (isAutoScrolling.current) return;

			const element = event.currentTarget as HTMLDivElement;
			const currentScrollTop = element.scrollTop;
			const scrolledUp = currentScrollTop < lastScrollTop.current;

			lastScrollTop.current = currentScrollTop;

			if (scrolledUp && followMode) {
				setFollowMode(false);
			}
		},
		[followMode, setFollowMode],
	);

	const scrollToBottom = useCallback(() => {
		const element = scrollAreaRef.current;
		if (!element) return;

		isAutoScrolling.current = true;
		element.scrollTop = element.scrollHeight;

		requestAnimationFrame(() => {
			isAutoScrolling.current = false;
		});
	}, [scrollAreaRef]);

	useEffect(() => {
		if (!scrollAreaRef.current) return;

		const observer = new MutationObserver(() => {
			if (followMode) {
				scrollToBottom();
			} else if (!isAtBottom()) {
				setHasNewUpdates(true);
			}
		});

		observer.observe(scrollAreaRef.current, {
			childList: true,
			subtree: true,
			characterData: true,
		});

		return () => observer.disconnect();
	}, [followMode, isAtBottom, scrollToBottom, scrollAreaRef]);

	return {
		followMode,
		hasNewUpdates,
		setFollowMode,
		scrollToNew,
		handleScroll,
	};
}
