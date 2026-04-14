import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { renderHook, waitFor } from "@testing-library/react";
import { useSyncExternalStore } from "react";
import { liveRunIndex } from "@/lib/live-run-index";
import type { Run } from "@/types/runs";

let fetchMock: ReturnType<typeof mock>;
let useRunsImportVersion = 0;

function buildRun(overrides: Partial<Run> = {}): Run {
	return {
		id: "run-1",
		projectId: "proj-1",
		projectName: "Test Project",
		featureId: "feat-1",
		featureName: "Test Feature",
		name: null,
		command: "/build",
		status: "running",
		harness: "codex",
		currentStep: null,
		steps: [],
		artifacts: [],
		events: [],
		startedAt: "2026-04-10T00:00:00.000Z",
		lastEventAt: "2026-04-10T00:05:00.000Z",
		completedAt: null,
		error: null,
		agentSteps: null,
		...overrides,
	};
}

async function loadUseRuns() {
	mock.module("../../hooks/useReconnectRecovery.ts", () => ({
		useReconnectRecovery: () => {},
	}));
	mock.module("../../hooks/useLiveRunIndex.ts", () => ({
		useLiveRunIndexSnapshot: () =>
			useSyncExternalStore(
				liveRunIndex.subscribe,
				liveRunIndex.getSnapshot,
				liveRunIndex.getSnapshot,
			),
	}));

	return import(
		`../../hooks/useRuns.ts?use-runs-test=${++useRunsImportVersion}`
	);
}

beforeEach(() => {
	mock.restore();
	liveRunIndex.clear();

	fetchMock = mock(() =>
		Promise.resolve({
			ok: true,
			json: () =>
				Promise.resolve({
					runs: [buildRun()],
					total: 1,
				}),
		}),
	);

	globalThis.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
	liveRunIndex.clear();
	mock.restore();
});

describe("useRuns", () => {
	test("updates the loaded collection from live state without refetching", async () => {
		const { useRuns } = await loadUseRuns();
		const { result } = renderHook(() =>
			useRuns({ status: "running", limit: 25, offset: 0 }),
		);

		await waitFor(() => {
			expect(result.current.isLoading).toBe(false);
		});

		expect(result.current.runs.map((run: Run) => run.id)).toEqual(["run-1"]);
		expect(result.current.total).toBe(1);
		expect(fetchMock).toHaveBeenCalledTimes(1);

		liveRunIndex.upsertRuns([
			buildRun({
				id: "run-1",
				status: "completed",
				completedAt: "2026-04-10T00:06:00.000Z",
				lastEventAt: "2026-04-10T00:06:00.000Z",
			}),
			buildRun({
				id: "run-2",
				lastEventAt: "2026-04-10T00:07:00.000Z",
			}),
		]);

		await waitFor(() => {
			expect(result.current.runs.map((run: Run) => run.id)).toEqual(["run-2"]);
		});

		expect(result.current.total).toBe(1);
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});
});
