import { describe, expect, test } from "bun:test";
import { act, renderHook } from "@testing-library/react";
import { useScrollPreservation } from "../../hooks/useScrollPreservation";

interface MockScrollElement {
	scrollTop: number;
	scrollHeight: number;
}

function createMockScrollElement(
	initialScrollTop: number,
	initialScrollHeight: number,
): MockScrollElement {
	return {
		scrollTop: initialScrollTop,
		scrollHeight: initialScrollHeight,
	};
}

describe("useScrollPreservation", () => {
	test("adjusts scroll position when content grows above viewport", () => {
		const { result } = renderHook(() => useScrollPreservation());

		const mockElement = createMockScrollElement(500, 2000);
		(
			result.current.scrollAreaRef as { current: MockScrollElement | null }
		).current = mockElement;

		act(() => {
			result.current.preserveScrollPosition();
		});

		mockElement.scrollHeight = 2500;

		act(() => {
			result.current.restoreScrollPosition();
		});

		expect(mockElement.scrollTop).toBe(1000);
	});

	test("does not adjust scroll position when at top (scrollTop = 0)", () => {
		const { result } = renderHook(() => useScrollPreservation());

		const mockElement = createMockScrollElement(0, 2000);
		(
			result.current.scrollAreaRef as { current: MockScrollElement | null }
		).current = mockElement;

		act(() => {
			result.current.preserveScrollPosition();
		});

		mockElement.scrollHeight = 2500;

		act(() => {
			result.current.restoreScrollPosition();
		});

		expect(mockElement.scrollTop).toBe(0);
	});

	test("does not adjust when content shrinks", () => {
		const { result } = renderHook(() => useScrollPreservation());

		const mockElement = createMockScrollElement(500, 2000);
		(
			result.current.scrollAreaRef as { current: MockScrollElement | null }
		).current = mockElement;

		act(() => {
			result.current.preserveScrollPosition();
		});

		mockElement.scrollHeight = 1500;

		act(() => {
			result.current.restoreScrollPosition();
		});

		expect(mockElement.scrollTop).toBe(500);
	});

	test("handles missing ref gracefully", () => {
		const { result } = renderHook(() => useScrollPreservation());

		expect(() => {
			act(() => {
				result.current.preserveScrollPosition();
				result.current.restoreScrollPosition();
			});
		}).not.toThrow();
	});

	test("clears saved state after restore", () => {
		const { result } = renderHook(() => useScrollPreservation());

		const mockElement: MockScrollElement = {
			scrollTop: 500,
			scrollHeight: 2000,
		};
		(
			result.current.scrollAreaRef as { current: MockScrollElement | null }
		).current = mockElement;

		act(() => {
			result.current.preserveScrollPosition();
		});

		act(() => {
			result.current.restoreScrollPosition();
		});

		mockElement.scrollTop = 800;
		mockElement.scrollHeight = 3000;

		act(() => {
			result.current.restoreScrollPosition();
		});

		expect(mockElement.scrollTop).toBe(800);
	});
});
