import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { act, renderHook } from "@testing-library/react";
import { usePinnedProjects } from "../../hooks/usePinnedProjects";

const STORAGE_KEY = "rp1-pinned-projects";

beforeEach(() => {
	localStorage.removeItem(STORAGE_KEY);
});

afterEach(() => {
	localStorage.removeItem(STORAGE_KEY);
});

describe("usePinnedProjects", () => {
	test("returns empty array when no data in localStorage", () => {
		const { result } = renderHook(() => usePinnedProjects());
		expect(result.current.pinnedProjects).toEqual([]);
	});

	test("togglePin adds a project and persists to localStorage", () => {
		const { result } = renderHook(() => usePinnedProjects());

		act(() => {
			result.current.togglePin("project-1");
		});

		expect(result.current.pinnedProjects).toEqual(["project-1"]);

		const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
		expect(stored).toEqual(["project-1"]);
	});

	test("togglePin removes an already-pinned project", () => {
		const { result } = renderHook(() => usePinnedProjects());

		act(() => {
			result.current.togglePin("project-1");
		});
		expect(result.current.pinnedProjects).toEqual(["project-1"]);

		act(() => {
			result.current.togglePin("project-1");
		});
		expect(result.current.pinnedProjects).toEqual([]);
	});

	test("togglePin supports multiple pins", () => {
		const { result } = renderHook(() => usePinnedProjects());

		act(() => {
			result.current.togglePin("project-1");
		});
		act(() => {
			result.current.togglePin("project-2");
		});
		act(() => {
			result.current.togglePin("project-3");
		});

		expect(result.current.pinnedProjects).toEqual([
			"project-1",
			"project-2",
			"project-3",
		]);
	});

	test("isPinned returns true for pinned project", () => {
		const { result } = renderHook(() => usePinnedProjects());

		act(() => {
			result.current.togglePin("project-1");
		});

		expect(result.current.isPinned("project-1")).toBe(true);
		expect(result.current.isPinned("project-2")).toBe(false);
	});

	test("isPinned updates after toggle", () => {
		const { result } = renderHook(() => usePinnedProjects());

		act(() => {
			result.current.togglePin("project-1");
		});
		expect(result.current.isPinned("project-1")).toBe(true);

		act(() => {
			result.current.togglePin("project-1");
		});
		expect(result.current.isPinned("project-1")).toBe(false);
	});

	test("persists across hook re-renders", () => {
		const { result: first } = renderHook(() => usePinnedProjects());

		act(() => {
			first.current.togglePin("project-1");
		});

		const { result: second } = renderHook(() => usePinnedProjects());
		expect(second.current.pinnedProjects).toEqual(["project-1"]);
		expect(second.current.isPinned("project-1")).toBe(true);
	});

	test("clearPins removes all data", () => {
		const { result } = renderHook(() => usePinnedProjects());

		act(() => {
			result.current.togglePin("project-1");
		});
		act(() => {
			result.current.togglePin("project-2");
		});
		expect(result.current.pinnedProjects).toHaveLength(2);

		act(() => {
			result.current.clearPins();
		});

		expect(result.current.pinnedProjects).toEqual([]);
		expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
	});

	test("handles corrupted localStorage gracefully", () => {
		localStorage.setItem(STORAGE_KEY, "invalid-json!!!");
		const { result } = renderHook(() => usePinnedProjects());
		expect(result.current.pinnedProjects).toEqual([]);
	});
});
