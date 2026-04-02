import { useCallback, useEffect, useRef } from "react";
import type { NavigateFunction } from "react-router-dom";
import { isTextInputElement } from "@/lib/keyboard";

export interface UseGlobalShortcutsOptions {
	onOpenCommandPalette: () => void;
	onCloseCommandPalette: () => void;
	onToggleShortcutHelp: () => void;
	onToggleSidebar: () => void;
	onFocusSearch: () => void;
	isOverlayOpen: boolean;
	navigate: NavigateFunction;
}

const CHORD_TIMEOUT_MS = 500;

const CHORD_TARGETS: Record<string, string> = {
	h: "/",
	r: "/",
	p: "/projects",
};

export function useGlobalShortcuts({
	onOpenCommandPalette,
	onCloseCommandPalette,
	onToggleShortcutHelp,
	onToggleSidebar,
	onFocusSearch,
	isOverlayOpen,
	navigate,
}: UseGlobalShortcutsOptions): void {
	const pendingChordRef = useRef<string | null>(null);
	const chordTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const clearChord = useCallback(() => {
		pendingChordRef.current = null;
		delete document.body.dataset.chordPending;
		if (chordTimerRef.current !== null) {
			clearTimeout(chordTimerRef.current);
			chordTimerRef.current = null;
		}
	}, []);

	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			const isMod = e.metaKey || e.ctrlKey;

			if (isMod && e.key === "k") {
				e.preventDefault();
				if (isOverlayOpen) {
					onCloseCommandPalette();
				} else {
					onOpenCommandPalette();
				}
				return;
			}

			if (isOverlayOpen) {
				if (e.key === "Escape") {
					e.preventDefault();
					onCloseCommandPalette();
				}
				return;
			}

			if (isMod && (e.key === "\\" || e.key === "b")) {
				e.preventDefault();
				onToggleSidebar();
				return;
			}

			if (e.key === "Escape") {
				e.preventDefault();
				const active = document.activeElement;
				if (active && active instanceof HTMLElement) {
					active.blur();
				}
				return;
			}

			const inTextInput = isTextInputElement(document.activeElement);
			if (inTextInput) return;

			if (pendingChordRef.current === "g") {
				e.preventDefault();
				const target = CHORD_TARGETS[e.key];
				clearChord();
				if (target) {
					navigate(target);
				}
				return;
			}

			switch (e.key) {
				case "g":
					e.preventDefault();
					pendingChordRef.current = "g";
					document.body.dataset.chordPending = "g";
					chordTimerRef.current = setTimeout(() => {
						pendingChordRef.current = null;
						delete document.body.dataset.chordPending;
						chordTimerRef.current = null;
					}, CHORD_TIMEOUT_MS);
					break;
				case "?":
					e.preventDefault();
					onToggleShortcutHelp();
					break;
				case "/":
					e.preventDefault();
					onFocusSearch();
					break;
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => {
			window.removeEventListener("keydown", handleKeyDown);
			if (chordTimerRef.current !== null) {
				clearTimeout(chordTimerRef.current);
			}
		};
	}, [
		isOverlayOpen,
		onOpenCommandPalette,
		onCloseCommandPalette,
		onToggleShortcutHelp,
		onToggleSidebar,
		onFocusSearch,
		navigate,
		clearChord,
	]);
}
