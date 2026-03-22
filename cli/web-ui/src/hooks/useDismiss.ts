import { useEffect } from "react";

export interface UseDismissOptions {
	readonly ref: React.RefObject<HTMLElement | null>;
	readonly onDismiss: () => void;
	readonly enabled?: boolean;
	readonly dismissOnScroll?: boolean;
	readonly activationDelay?: number;
}

const DEFAULT_ACTIVATION_DELAY = 100;

export function useDismiss({
	ref,
	onDismiss,
	enabled = true,
	dismissOnScroll = false,
	activationDelay = DEFAULT_ACTIVATION_DELAY,
}: UseDismissOptions): void {
	useEffect(() => {
		if (!enabled) return;

		const handleClickOutside = (e: MouseEvent) => {
			if (ref.current && !ref.current.contains(e.target as Node)) {
				onDismiss();
			}
		};

		const handleEscape = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				e.stopImmediatePropagation();
				onDismiss();
			}
		};

		const handleScroll = (e: Event) => {
			if (ref.current?.contains(e.target as Node)) return;
			onDismiss();
		};

		const timeoutId = setTimeout(() => {
			document.addEventListener("mousedown", handleClickOutside);
			document.addEventListener("keydown", handleEscape, true);
			if (dismissOnScroll) {
				window.addEventListener("scroll", handleScroll, true);
			}
		}, activationDelay);

		return () => {
			clearTimeout(timeoutId);
			document.removeEventListener("mousedown", handleClickOutside);
			document.removeEventListener("keydown", handleEscape, true);
			if (dismissOnScroll) {
				window.removeEventListener("scroll", handleScroll, true);
			}
		};
	}, [ref, onDismiss, enabled, dismissOnScroll, activationDelay]);
}
