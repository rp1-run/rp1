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

	test("followMode defaults to false when sessionStorage empty", () => {
		const ref = createMockRef();
		const { result } = renderHook(() => useFollowMode(ref));

		expect(result.current.followMode).toBe(false);
	});

	test("loads followMode from sessionStorage", () => {
		sessionStorage.setItem(STORAGE_KEY, "true");

		const ref = createMockRef();
		const { result } = renderHook(() => useFollowMode(ref));

		expect(result.current.followMode).toBe(true);
	});

	test("setFollowMode persists to sessionStorage", () => {
		const ref = createMockRef();
		const { result } = renderHook(() => useFollowMode(ref));

		act(() => {
			result.current.setFollowMode(true);
		});

		expect(result.current.followMode).toBe(true);
		expect(sessionStorage.getItem(STORAGE_KEY)).toBe("true");
	});

	test("scrollToNew scrolls to bottom with smooth behavior", () => {
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

	test("scrollToNew handles null ref gracefully", () => {
		const ref = createMockRef(null);
		const { result } = renderHook(() => useFollowMode(ref));

		expect(() => {
			act(() => {
				result.current.scrollToNew();
			});
		}).not.toThrow();
	});

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
});
