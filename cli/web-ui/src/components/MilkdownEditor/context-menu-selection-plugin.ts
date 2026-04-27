import { Plugin, PluginKey, type Selection } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";
import { $prose } from "@milkdown/kit/utils";

const contextMenuSelectionPluginKey = new PluginKey(
	"contextMenuSelectionPreservation",
);
const PRESERVE_SELECTION_MS = 1000;

export function isContextMenuPointerEvent(event: MouseEvent): boolean {
	return event.button === 2 || (event.button === 0 && event.ctrlKey);
}

export function isPositionInsideSelection(
	selection: Selection,
	position: number,
): boolean {
	return (
		!selection.empty && position >= selection.from && position <= selection.to
	);
}

export function getContextMenuSelectionToPreserve(
	view: EditorView,
	event: MouseEvent,
): Selection | null {
	if (!isContextMenuPointerEvent(event)) return null;

	const selection = view.state.selection;
	if (selection.empty) return null;

	const position = view.posAtCoords({
		left: event.clientX,
		top: event.clientY,
	});

	if (!position || !isPositionInsideSelection(selection, position.pos)) {
		return null;
	}

	return selection;
}

function restoreSelection(view: EditorView, selection: Selection): void {
	if (selection.empty) return;
	const docSize = view.state.doc.content.size;
	if (selection.from < 0 || selection.to > docSize) return;
	if (selection.eq(view.state.selection)) return;

	view.dispatch(
		view.state.tr
			.setSelection(selection)
			.setMeta("addToHistory", false)
			.setMeta(contextMenuSelectionPluginKey, true),
	);
}

export const createContextMenuSelectionPlugin = () =>
	$prose(() => {
		let preservedSelection: Selection | null = null;
		let clearTimer: ReturnType<typeof setTimeout> | null = null;

		const clearPreservedSelection = () => {
			preservedSelection = null;
			if (clearTimer) {
				clearTimeout(clearTimer);
				clearTimer = null;
			}
		};

		const preserveSelection = (selection: Selection) => {
			preservedSelection = selection;
			if (clearTimer) clearTimeout(clearTimer);
			clearTimer = setTimeout(() => {
				preservedSelection = null;
				clearTimer = null;
			}, PRESERVE_SELECTION_MS);
		};

		const restorePreservedSelection = (view: EditorView): boolean => {
			if (!preservedSelection) return false;
			restoreSelection(view, preservedSelection);
			return true;
		};

		return new Plugin({
			key: contextMenuSelectionPluginKey,
			props: {
				handleDOMEvents: {
					mousedown(view: EditorView, event: MouseEvent) {
						const selection = getContextMenuSelectionToPreserve(view, event);
						if (!selection) {
							if (isContextMenuPointerEvent(event)) clearPreservedSelection();
							return false;
						}

						preserveSelection(selection);
						return true;
					},
					mouseup(view: EditorView, event: MouseEvent) {
						if (!isContextMenuPointerEvent(event)) return false;
						return restorePreservedSelection(view);
					},
					contextmenu(view: EditorView) {
						const restored = restorePreservedSelection(view);
						if (restored && clearTimer) {
							clearTimeout(clearTimer);
							clearTimer = setTimeout(() => {
								preservedSelection = null;
								clearTimer = null;
							}, PRESERVE_SELECTION_MS);
						}
						return restored;
					},
				},
			},
		});
	});
