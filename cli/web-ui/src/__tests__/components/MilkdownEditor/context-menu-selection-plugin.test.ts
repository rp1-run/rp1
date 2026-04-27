import { describe, expect, mock, test } from "bun:test";
import type { Selection } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";
import {
	getContextMenuSelectionToPreserve,
	isContextMenuPointerEvent,
	isPositionInsideSelection,
} from "../../../components/MilkdownEditor/context-menu-selection-plugin";

function selection(from: number, to: number, empty = false): Selection {
	return { empty, from, to } as Selection;
}

function pointerEvent({
	button,
	ctrlKey = false,
}: {
	readonly button: number;
	readonly ctrlKey?: boolean;
}): MouseEvent {
	return {
		button,
		clientX: 24,
		clientY: 48,
		ctrlKey,
	} as MouseEvent;
}

function editorView(
	currentSelection: Selection,
	position: number | null,
): EditorView {
	return {
		state: {
			selection: currentSelection,
		},
		posAtCoords: mock(() =>
			position === null ? null : { pos: position, inside: -1 },
		),
	} as unknown as EditorView;
}

describe("context menu selection preservation", () => {
	test("detects right click and macOS control click", () => {
		expect(isContextMenuPointerEvent(pointerEvent({ button: 2 }))).toBe(true);
		expect(
			isContextMenuPointerEvent(pointerEvent({ button: 0, ctrlKey: true })),
		).toBe(true);
		expect(isContextMenuPointerEvent(pointerEvent({ button: 0 }))).toBe(false);
	});

	test("treats selection boundaries as inside the selected range", () => {
		const currentSelection = selection(4, 16);

		expect(isPositionInsideSelection(currentSelection, 4)).toBe(true);
		expect(isPositionInsideSelection(currentSelection, 10)).toBe(true);
		expect(isPositionInsideSelection(currentSelection, 16)).toBe(true);
		expect(isPositionInsideSelection(currentSelection, 17)).toBe(false);
	});

	test("does not preserve collapsed selections", () => {
		expect(isPositionInsideSelection(selection(8, 8, true), 8)).toBe(false);
	});

	test("returns the current selection for a context click inside it", () => {
		const currentSelection = selection(4, 16);

		expect(
			getContextMenuSelectionToPreserve(
				editorView(currentSelection, 10),
				pointerEvent({ button: 2 }),
			),
		).toBe(currentSelection);
	});

	test("ignores context clicks outside the current selection", () => {
		expect(
			getContextMenuSelectionToPreserve(
				editorView(selection(4, 16), 20),
				pointerEvent({ button: 2 }),
			),
		).toBeNull();
	});

	test("ignores unresolved pointer positions", () => {
		expect(
			getContextMenuSelectionToPreserve(
				editorView(selection(4, 16), null),
				pointerEvent({ button: 2 }),
			),
		).toBeNull();
	});
});
