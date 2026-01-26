import { describe, expect, test } from "bun:test";
import { renderHook, act } from "@testing-library/react";
import { useScrollPreservation } from "../../hooks/useScrollPreservation";

interface MockScrollElement {
	scrollTop: number;
	scrollHeight: number;
}

describe("useScrollPreservation", () => {
	describe("ref initialization", () => {
		test("returns scrollAreaRef that can be attached to element", () => {
			const { result } = renderHook(() => useScrollPreservation());

			expect(result.current.scrollAreaRef).toBeDefined();
			expect(result.current.scrollAreaRef.current).toBeNull();
		});

		test("returns preserveScrollPosition function", () => {
			const { result } = renderHook(() => useScrollPreservation());

			expect(typeof result.current.preserveScrollPosition).toBe("function");
		});

		test("returns restoreScrollPosition function", () => {
			const { result } = renderHook(() => useScrollPreservation());

			expect(typeof result.current.restoreScrollPosition).toBe("function");
		});
	});

	describe("scroll position preservation", () => {
		function createMockScrollElement(
			initialScrollTop: number,
			initialScrollHeight: number,
		): MockScrollElement {
			return {
				scrollTop: initialScrollTop,
				scrollHeight: initialScrollHeight,
			};
		}

		test("preserves and restores scroll position without content change", () => {
			const { result } = renderHook(() => useScrollPreservation());

			const mockElement = createMockScrollElement(500, 2000);
			(result.current.scrollAreaRef as { current: MockScrollElement | null }).current =
				mockElement;

			act(() => {
				result.current.preserveScrollPosition();
			});

			act(() => {
				result.current.restoreScrollPosition();
			});

			expect(mockElement.scrollTop).toBe(500);
		});

		test("adjusts scroll position when content grows above viewport", () => {
			const { result } = renderHook(() => useScrollPreservation());

			const mockElement = createMockScrollElement(500, 2000);
			(result.current.scrollAreaRef as { current: MockScrollElement | null }).current =
				mockElement;

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
			(result.current.scrollAreaRef as { current: MockScrollElement | null }).current =
				mockElement;

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
			(result.current.scrollAreaRef as { current: MockScrollElement | null }).current =
				mockElement;

			act(() => {
				result.current.preserveScrollPosition();
			});

			mockElement.scrollHeight = 1500;

			act(() => {
				result.current.restoreScrollPosition();
			});

			expect(mockElement.scrollTop).toBe(500);
		});
	});

	describe("edge cases", () => {
		test("handles missing ref gracefully for preserveScrollPosition", () => {
			const { result } = renderHook(() => useScrollPreservation());

			expect(() => {
				act(() => {
					result.current.preserveScrollPosition();
				});
			}).not.toThrow();
		});

		test("handles missing ref gracefully for restoreScrollPosition", () => {
			const { result } = renderHook(() => useScrollPreservation());

			expect(() => {
				act(() => {
					result.current.restoreScrollPosition();
				});
			}).not.toThrow();
		});

		test("handles restore without prior preserve", () => {
			const { result } = renderHook(() => useScrollPreservation());

			const mockElement: MockScrollElement = {
				scrollTop: 500,
				scrollHeight: 2000,
			};
			(result.current.scrollAreaRef as { current: MockScrollElement | null }).current =
				mockElement;

			expect(() => {
				act(() => {
					result.current.restoreScrollPosition();
				});
			}).not.toThrow();

			expect(mockElement.scrollTop).toBe(500);
		});

		test("clears saved state after restore", () => {
			const { result } = renderHook(() => useScrollPreservation());

			const mockElement: MockScrollElement = {
				scrollTop: 500,
				scrollHeight: 2000,
			};
			(result.current.scrollAreaRef as { current: MockScrollElement | null }).current =
				mockElement;

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

	describe("performance", () => {
		test("restoration completes in under 16ms (single frame target)", () => {
			const { result } = renderHook(() => useScrollPreservation());

			const mockElement: MockScrollElement = {
				scrollTop: 500,
				scrollHeight: 2000,
			};
			(result.current.scrollAreaRef as { current: MockScrollElement | null }).current =
				mockElement;

			act(() => {
				result.current.preserveScrollPosition();
			});

			mockElement.scrollHeight = 2500;

			const start = performance.now();
			act(() => {
				result.current.restoreScrollPosition();
			});
			const elapsed = performance.now() - start;

			expect(elapsed).toBeLessThan(16);
		});
	});

	describe("function stability", () => {
		test("preserveScrollPosition function reference is stable", () => {
			const { result, rerender } = renderHook(() => useScrollPreservation());

			const firstRef = result.current.preserveScrollPosition;
			rerender();
			const secondRef = result.current.preserveScrollPosition;

			expect(firstRef).toBe(secondRef);
		});

		test("restoreScrollPosition function reference is stable", () => {
			const { result, rerender } = renderHook(() => useScrollPreservation());

			const firstRef = result.current.restoreScrollPosition;
			rerender();
			const secondRef = result.current.restoreScrollPosition;

			expect(firstRef).toBe(secondRef);
		});
	});
});
