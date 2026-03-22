import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { act, renderHook } from "@testing-library/react";
import { useTextSelection } from "../../hooks/useTextSelection";

describe("useTextSelection", () => {
	let container: HTMLDivElement;
	let containerRef: React.RefObject<HTMLDivElement>;

	beforeEach(() => {
		container = document.createElement("div");
		container.innerHTML = "Hello world, this is some sample text for testing.";
		document.body.appendChild(container);
		containerRef = { current: container };
	});

	afterEach(() => {
		container.remove();
		window.getSelection()?.removeAllRanges();
	});

	test("returns null selection when no text is selected", () => {
		const { result } = renderHook(() =>
			useTextSelection({ containerRef, enabled: true }),
		);

		expect(result.current.selection).toBeNull();
		expect(result.current.selectionPosition).toBeNull();
	});

	test("clearSelection clears selection state and removes ranges", () => {
		const { result } = renderHook(() =>
			useTextSelection({ containerRef, enabled: true }),
		);

		const removeAllRanges = mock(() => {});
		const originalGetSelection = window.getSelection;
		window.getSelection = mock(() => ({
			removeAllRanges,
			isCollapsed: true,
			anchorNode: null,
			focusNode: null,
			getRangeAt: () => ({ collapsed: true }),
		})) as unknown as typeof window.getSelection;

		act(() => {
			result.current.clearSelection();
		});

		expect(result.current.selection).toBeNull();
		expect(result.current.selectionPosition).toBeNull();
		expect(removeAllRanges).toHaveBeenCalled();

		window.getSelection = originalGetSelection;
	});

	test("does not track selection when disabled", () => {
		const { result } = renderHook(() =>
			useTextSelection({ containerRef, enabled: false }),
		);

		expect(result.current.selection).toBeNull();
		expect(result.current.selectionPosition).toBeNull();
	});

	test("uses document.body as default container when containerRef not provided", () => {
		const { result } = renderHook(() => useTextSelection({ enabled: true }));

		expect(result.current.selection).toBeNull();
	});
});
