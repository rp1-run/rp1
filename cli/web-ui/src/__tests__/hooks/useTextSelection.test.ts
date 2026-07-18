import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useTextSelection } from "../../hooks/useTextSelection";

describe("useTextSelection", () => {
	let container: HTMLDivElement;
	let containerRef: React.RefObject<HTMLDivElement>;
	let originalGetBoundingClientRect: typeof Range.prototype.getBoundingClientRect;

	beforeEach(() => {
		container = document.createElement("div");
		container.innerHTML =
			"Before selected after <span data-annotation-exclude>chrome</span>";
		document.body.appendChild(container);
		containerRef = { current: container };
		originalGetBoundingClientRect = Range.prototype.getBoundingClientRect;
		Range.prototype.getBoundingClientRect = mock(
			() =>
				({
					left: 10,
					right: 70,
					top: 20,
					bottom: 40,
					width: 60,
					height: 20,
					x: 10,
					y: 20,
					toJSON: () => ({}),
				}) as DOMRect,
		) as typeof Range.prototype.getBoundingClientRect;
	});

	afterEach(() => {
		container.remove();
		window.getSelection()?.removeAllRanges();
		Range.prototype.getBoundingClientRect = originalGetBoundingClientRect;
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

	test("captures selected text, editable offsets, context, and popover position", async () => {
		const { result } = renderHook(() =>
			useTextSelection({
				containerRef,
				enabled: true,
				contextLength: 7,
				showDelay: 0,
			}),
		);

		selectText(container.firstChild as Text, 7, 15);
		document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));

		await waitFor(() => {
			expect(result.current.selection?.selectedText).toBe("selected");
		});
		expect(result.current.selection).toMatchObject({
			type: "text-selection",
			startOffset: 7,
			endOffset: 15,
			contextBefore: "Before ",
			contextAfter: " after ",
		});
		expect(result.current.selectionPosition).toEqual({
			x: 40,
			y: 20,
			anchorRect: { left: 10, right: 70, top: 20, bottom: 40 },
		});
	});

	test("excludes chrome text from selectedText when the range spans excluded nodes", async () => {
		container.innerHTML =
			'<pre><code><span class="line-number" contenteditable="false">1</span><span>alpha</span>\n<span class="line-number" contenteditable="false">2</span><span>beta</span></code></pre>';
		const { result } = renderHook(() =>
			useTextSelection({ containerRef, enabled: true, showDelay: 0 }),
		);

		const spans = container.querySelectorAll("span:not(.line-number)");
		const range = document.createRange();
		range.setStart(spans[0].firstChild as Text, 0);
		range.setEnd(spans[1].firstChild as Text, 4);
		const selection = window.getSelection();
		selection?.removeAllRanges();
		selection?.addRange(range);
		document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));

		await waitFor(() => {
			expect(result.current.selection).not.toBeNull();
		});
		expect(result.current.selection?.selectedText).toBe("alpha\nbeta");
	});

	test("ignores selections that are outside the configured container", async () => {
		const outside = document.createElement("p");
		outside.textContent = "outside text";
		document.body.appendChild(outside);
		const { result } = renderHook(() =>
			useTextSelection({ containerRef, enabled: true, showDelay: 0 }),
		);

		selectText(outside.firstChild as Text, 0, 7);
		document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
		await delay(5);

		expect(result.current.selection).toBeNull();
		outside.remove();
	});

	test("keeps a locked selection stable until explicitly cleared", async () => {
		const { result } = renderHook(() =>
			useTextSelection({ containerRef, enabled: true, showDelay: 0 }),
		);

		selectText(container.firstChild as Text, 7, 15);
		document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
		await waitFor(() => {
			expect(result.current.selection?.selectedText).toBe("selected");
		});

		act(() => {
			result.current.lockSelection();
		});
		selectText(container.firstChild as Text, 0, 6);
		document.dispatchEvent(
			new KeyboardEvent("keyup", { key: "ArrowRight", shiftKey: true }),
		);
		await delay(5);

		expect(result.current.isLocked).toBe(true);
		expect(result.current.selection?.selectedText).toBe("selected");

		act(() => {
			result.current.clearSelection();
		});
		expect(result.current.isLocked).toBe(false);
		expect(result.current.selection).toBeNull();
	});
});

function selectText(node: Text, start: number, end: number): void {
	const selection = window.getSelection();
	if (!selection) {
		throw new Error("Selection API unavailable");
	}
	const range = document.createRange();
	range.setStart(node, start);
	range.setEnd(node, end);
	selection.removeAllRanges();
	selection.addRange(range);
}

async function delay(ms: number): Promise<void> {
	await new Promise((resolve) => setTimeout(resolve, ms));
}
