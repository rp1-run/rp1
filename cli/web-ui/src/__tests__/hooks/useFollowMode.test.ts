import { beforeEach, describe, expect, mock, test } from "bun:test";
import { act, renderHook } from "@testing-library/react";
import { useFollowMode } from "../../hooks/useFollowMode";

const STORAGE_KEY = "rp1-follow-mode";

interface MockScrollElement {
	scrollTop: number;
	scrollHeight: number;
	clientHeight: number;
	scrollTo: (options: { top: number; behavior?: string }) => void;
}

function createMockScrollElement(
	scrollTop = 0,
	scrollHeight = 2000,
	clientHeight = 500,
): MockScrollElement {
	const element: MockScrollElement = {
		scrollTop,
		scrollHeight,
		clientHeight,
		scrollTo: mock(({ top }: { top: number }) => {
			element.scrollTop = top;
		}),
	};
	return element;
}

function createMockRef(
	element: MockScrollElement | null = null,
): React.RefObject<HTMLDivElement> {
	return { current: element as unknown as HTMLDivElement };
}

describe("useFollowMode", () => {
	beforeEach(() => {
		sessionStorage.clear();
	});

	describe("initialization", () => {
		test("returns all expected properties", () => {
			const ref = createMockRef();
			const { result } = renderHook(() => useFollowMode(ref));

			expect(result.current).toHaveProperty("followMode");
			expect(result.current).toHaveProperty("hasNewUpdates");
			expect(typeof result.current.setFollowMode).toBe("function");
			expect(typeof result.current.scrollToNew).toBe("function");
			expect(typeof result.current.handleScroll).toBe("function");
		});

		test("followMode defaults to false per BR2", () => {
			const ref = createMockRef();
			const { result } = renderHook(() => useFollowMode(ref));

			expect(result.current.followMode).toBe(false);
		});

		test("hasNewUpdates defaults to false", () => {
			const ref = createMockRef();
			const { result } = renderHook(() => useFollowMode(ref));

			expect(result.current.hasNewUpdates).toBe(false);
		});

		test("loads followMode from sessionStorage", () => {
			sessionStorage.setItem(STORAGE_KEY, "true");

			const ref = createMockRef();
			const { result } = renderHook(() => useFollowMode(ref));

			expect(result.current.followMode).toBe(true);
		});

		test("handles sessionStorage value 'false'", () => {
			sessionStorage.setItem(STORAGE_KEY, "false");

			const ref = createMockRef();
			const { result } = renderHook(() => useFollowMode(ref));

			expect(result.current.followMode).toBe(false);
		});
	});

	describe("setFollowMode", () => {
		test("updates followMode state", () => {
			const ref = createMockRef();
			const { result } = renderHook(() => useFollowMode(ref));

			act(() => {
				result.current.setFollowMode(true);
			});

			expect(result.current.followMode).toBe(true);
		});

		test("persists to sessionStorage when enabled", () => {
			const ref = createMockRef();
			const { result } = renderHook(() => useFollowMode(ref));

			act(() => {
				result.current.setFollowMode(true);
			});

			expect(sessionStorage.getItem(STORAGE_KEY)).toBe("true");
		});

		test("persists to sessionStorage when disabled", () => {
			const ref = createMockRef();
			const { result } = renderHook(() => useFollowMode(ref));

			act(() => {
				result.current.setFollowMode(true);
			});

			act(() => {
				result.current.setFollowMode(false);
			});

			expect(sessionStorage.getItem(STORAGE_KEY)).toBe("false");
		});

		test("clears hasNewUpdates when enabling followMode", () => {
			const ref = createMockRef();
			const { result } = renderHook(() => useFollowMode(ref));

			act(() => {
				result.current.setFollowMode(true);
			});

			expect(result.current.hasNewUpdates).toBe(false);
		});
	});

	describe("scrollToNew", () => {
		test("scrolls to bottom with smooth behavior", () => {
			const mockElement = createMockScrollElement(500, 2000, 500);
			const ref = createMockRef(mockElement);
			const { result } = renderHook(() => useFollowMode(ref));

			act(() => {
				result.current.scrollToNew();
			});

			expect(mockElement.scrollTo).toHaveBeenCalledWith({
				top: 2000,
				behavior: "smooth",
			});
		});

		test("clears hasNewUpdates", () => {
			const mockElement = createMockScrollElement(500, 2000, 500);
			const ref = createMockRef(mockElement);
			const { result } = renderHook(() => useFollowMode(ref));

			act(() => {
				result.current.scrollToNew();
			});

			expect(result.current.hasNewUpdates).toBe(false);
		});

		test("handles null ref gracefully", () => {
			const ref = createMockRef(null);
			const { result } = renderHook(() => useFollowMode(ref));

			expect(() => {
				act(() => {
					result.current.scrollToNew();
				});
			}).not.toThrow();
		});
	});

	describe("handleScroll - scroll direction detection", () => {
		test("disables followMode when user scrolls up", () => {
			const mockElement = createMockScrollElement(1000, 2000, 500);
			const ref = createMockRef(mockElement);
			const { result } = renderHook(() => useFollowMode(ref));

			act(() => {
				result.current.setFollowMode(true);
			});

			const scrollEvent = {
				currentTarget: { ...mockElement, scrollTop: 1000 },
			} as unknown as React.UIEvent;
			act(() => {
				result.current.handleScroll(scrollEvent);
			});

			const scrollUpEvent = {
				currentTarget: { ...mockElement, scrollTop: 800 },
			} as unknown as React.UIEvent;
			act(() => {
				result.current.handleScroll(scrollUpEvent);
			});

			expect(result.current.followMode).toBe(false);
		});

		test("does not disable followMode when scrolling down", () => {
			const mockElement = createMockScrollElement(500, 2000, 500);
			const ref = createMockRef(mockElement);
			const { result } = renderHook(() => useFollowMode(ref));

			act(() => {
				result.current.setFollowMode(true);
			});

			const scrollEvent = {
				currentTarget: { ...mockElement, scrollTop: 500 },
			} as unknown as React.UIEvent;
			act(() => {
				result.current.handleScroll(scrollEvent);
			});

			const scrollDownEvent = {
				currentTarget: { ...mockElement, scrollTop: 700 },
			} as unknown as React.UIEvent;
			act(() => {
				result.current.handleScroll(scrollDownEvent);
			});

			expect(result.current.followMode).toBe(true);
		});

		test("does not affect followMode when already disabled", () => {
			const mockElement = createMockScrollElement(1000, 2000, 500);
			const ref = createMockRef(mockElement);
			const { result } = renderHook(() => useFollowMode(ref));

			expect(result.current.followMode).toBe(false);

			const scrollEvent = {
				currentTarget: { ...mockElement, scrollTop: 1000 },
			} as unknown as React.UIEvent;
			act(() => {
				result.current.handleScroll(scrollEvent);
			});

			const scrollUpEvent = {
				currentTarget: { ...mockElement, scrollTop: 800 },
			} as unknown as React.UIEvent;
			act(() => {
				result.current.handleScroll(scrollUpEvent);
			});

			expect(result.current.followMode).toBe(false);
		});
	});

	describe("at bottom detection", () => {
		test("considers within 50px of bottom as 'at bottom'", () => {
			const mockElement = createMockScrollElement(1450, 2000, 500);
			const ref = createMockRef(mockElement);
			const { result } = renderHook(() => useFollowMode(ref));

			act(() => {
				result.current.setFollowMode(true);
			});

			const scrollEvent = {
				currentTarget: mockElement,
			} as unknown as React.UIEvent;
			act(() => {
				result.current.handleScroll(scrollEvent);
			});

			expect(result.current.followMode).toBe(true);
		});

		test("50px threshold tolerance for float precision", () => {
			const mockElement = createMockScrollElement(1449, 2000, 500);

			const isAtBottom = mockElement.scrollTop + mockElement.clientHeight;
			const threshold = mockElement.scrollHeight - 50;

			expect(isAtBottom).toBe(1949);
			expect(threshold).toBe(1950);
		});
	});

	describe("function stability", () => {
		test("setFollowMode reference is stable", () => {
			const ref = createMockRef();
			const { result, rerender } = renderHook(() => useFollowMode(ref));

			const firstRef = result.current.setFollowMode;
			rerender();
			const secondRef = result.current.setFollowMode;

			expect(firstRef).toBe(secondRef);
		});

		test("scrollToNew reference is stable", () => {
			const ref = createMockRef();
			const { result, rerender } = renderHook(() => useFollowMode(ref));

			const firstRef = result.current.scrollToNew;
			rerender();
			const secondRef = result.current.scrollToNew;

			expect(firstRef).toBe(secondRef);
		});
	});

	describe("edge cases", () => {
		test("handles undefined sessionStorage value", () => {
			const ref = createMockRef();
			const { result } = renderHook(() => useFollowMode(ref));

			expect(result.current.followMode).toBe(false);
		});

		test("multiple rapid setFollowMode calls work correctly", () => {
			const ref = createMockRef();
			const { result } = renderHook(() => useFollowMode(ref));

			act(() => {
				result.current.setFollowMode(true);
				result.current.setFollowMode(false);
				result.current.setFollowMode(true);
			});

			expect(result.current.followMode).toBe(true);
			expect(sessionStorage.getItem(STORAGE_KEY)).toBe("true");
		});
	});
});
