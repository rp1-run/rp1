import { useContext, useEffect, useRef } from "react";
import { ShortcutRegistryApiContext } from "@/providers/ShortcutRegistryProvider";

export interface ShortcutDefinition {
	key: string;
	label: string;
	description: string;
	action: () => void;
}

export interface UseContextualShortcutsOptions {
	viewId: string;
	viewLabel: string;
	shortcuts: ShortcutDefinition[];
	enabled?: boolean;
}

export function isTextInputElement(element: Element | null): boolean {
	if (!element) return false;

	const tagName = element.tagName.toLowerCase();
	if (tagName === "input") {
		const inputType = (element as HTMLInputElement).type?.toLowerCase();
		const textInputTypes = [
			"text",
			"password",
			"email",
			"search",
			"tel",
			"url",
			"number",
		];
		return textInputTypes.includes(inputType);
	}

	if (tagName === "textarea") return true;
	if ((element as HTMLElement).isContentEditable) return true;

	return false;
}

export function useContextualShortcuts({
	viewId,
	viewLabel,
	shortcuts,
	enabled = true,
}: UseContextualShortcutsOptions): void {
	const api = useContext(ShortcutRegistryApiContext);
	const shortcutsRef = useRef(shortcuts);
	shortcutsRef.current = shortcuts;

	useEffect(() => {
		if (!api || !enabled) return;

		api.registerContextual(viewId, viewLabel, shortcutsRef.current);

		return () => {
			api.unregisterContextual(viewId);
		};
	}, [api, viewId, viewLabel, enabled]);

	useEffect(() => {
		if (!enabled) return;

		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.metaKey || e.ctrlKey || e.altKey) return;
			if (isTextInputElement(document.activeElement)) return;

			const match = shortcutsRef.current.find((s) => s.key === e.key);
			if (match) {
				e.preventDefault();
				match.action();
			}
		};

		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, [enabled]);
}
