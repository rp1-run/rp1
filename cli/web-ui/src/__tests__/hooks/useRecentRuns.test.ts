import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { act, renderHook } from "@testing-library/react";
import { useRecentRuns } from "../../hooks/useRecentRuns";

const STORAGE_KEY = "rp1-recent-runs";

beforeEach(() => {
	localStorage.removeItem(STORAGE_KEY);
});

afterEach(() => {
	localStorage.removeItem(STORAGE_KEY);
});

describe("useRecentRuns", () => {
	test("returns empty array when no data in localStorage", () => {
		const { result } = renderHook(() => useRecentRuns());
		expect(result.current.recentRuns).toEqual([]);
	});

	test("trackVisit adds a run and stores it in localStorage", () => {
		const { result } = renderHook(() => useRecentRuns());

		act(() => {
			result.current.trackVisit({
				id: "run-1",
				projectName: "proj-a",
				featureName: "feat-x",
			});
		});

		expect(result.current.recentRuns).toHaveLength(1);
		expect(result.current.recentRuns[0].id).toBe("run-1");
		expect(result.current.recentRuns[0].projectName).toBe("proj-a");
		expect(result.current.recentRuns[0].featureName).toBe("feat-x");
		expect(typeof result.current.recentRuns[0].timestamp).toBe("number");

		const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
		expect(stored).toHaveLength(1);
		expect(stored[0].id).toBe("run-1");
	});

	test("deduplicates by run ID and moves to front", () => {
		const { result } = renderHook(() => useRecentRuns());

		act(() => {
			result.current.trackVisit({
				id: "run-1",
				projectName: "proj-a",
				featureName: "feat-x",
			});
		});
		act(() => {
			result.current.trackVisit({
				id: "run-2",
				projectName: "proj-a",
				featureName: "feat-y",
			});
		});
		act(() => {
			result.current.trackVisit({
				id: "run-1",
				projectName: "proj-a",
				featureName: "feat-x-updated",
			});
		});

		expect(result.current.recentRuns).toHaveLength(2);
		expect(result.current.recentRuns[0].id).toBe("run-1");
		expect(result.current.recentRuns[0].featureName).toBe("feat-x-updated");
		expect(result.current.recentRuns[1].id).toBe("run-2");
	});

	test("enforces max 5 items", () => {
		const { result } = renderHook(() => useRecentRuns());

		act(() => {
			for (let i = 1; i <= 7; i++) {
				result.current.trackVisit({
					id: `run-${i}`,
					projectName: `proj-${i}`,
					featureName: `feat-${i}`,
				});
			}
		});

		expect(result.current.recentRuns).toHaveLength(5);
		expect(result.current.recentRuns[0].id).toBe("run-7");
		expect(result.current.recentRuns[4].id).toBe("run-3");
	});

	test("sorts by most recent first", () => {
		const { result } = renderHook(() => useRecentRuns());

		act(() => {
			result.current.trackVisit({
				id: "run-a",
				projectName: "proj",
				featureName: "feat",
			});
		});
		act(() => {
			result.current.trackVisit({
				id: "run-b",
				projectName: "proj",
				featureName: "feat",
			});
		});
		act(() => {
			result.current.trackVisit({
				id: "run-c",
				projectName: "proj",
				featureName: "feat",
			});
		});

		expect(result.current.recentRuns[0].id).toBe("run-c");
		expect(result.current.recentRuns[1].id).toBe("run-b");
		expect(result.current.recentRuns[2].id).toBe("run-a");
	});

	test("persists across hook re-renders", () => {
		const { result: first } = renderHook(() => useRecentRuns());

		act(() => {
			first.current.trackVisit({
				id: "run-1",
				projectName: "proj",
				featureName: "feat",
			});
		});

		const { result: second } = renderHook(() => useRecentRuns());
		expect(second.current.recentRuns).toHaveLength(1);
		expect(second.current.recentRuns[0].id).toBe("run-1");
	});

	test("clearRecents removes all data", () => {
		const { result } = renderHook(() => useRecentRuns());

		act(() => {
			result.current.trackVisit({
				id: "run-1",
				projectName: "proj",
				featureName: "feat",
			});
		});
		expect(result.current.recentRuns).toHaveLength(1);

		act(() => {
			result.current.clearRecents();
		});

		expect(result.current.recentRuns).toEqual([]);
		expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
	});

	test("handles corrupted localStorage gracefully", () => {
		localStorage.setItem(STORAGE_KEY, "not-json{{{");
		const { result } = renderHook(() => useRecentRuns());
		expect(result.current.recentRuns).toEqual([]);
	});
});
