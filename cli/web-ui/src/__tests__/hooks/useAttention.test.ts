import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useSyncExternalStore } from "react";
import { liveRunIndex } from "@/lib/live-run-index";
import type { Run } from "@/types/runs";

let fetchMock: ReturnType<typeof mock>;
let useAttentionImportVersion = 0;

function buildRun(overrides: Partial<Run> = {}): Run {
	return {
		id: "run-1",
		projectId: "proj-1",
		projectName: "Test Project",
		featureId: "feat-1",
		featureName: "Test Feature",
		name: null,
		command: "/build",
		status: "waiting",
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

async function loadUseAttention() {
	mock.module("../../hooks/useReconnectRecovery.ts", () => ({
		useReconnectRecovery: () => {},
	}));
	mock.module("../../hooks/useLiveRunIndex.ts", () => ({
		useLiveRunIndexBridge: () => {},
		useLiveRunIndexSnapshot: () =>
			useSyncExternalStore(
				liveRunIndex.subscribe,
				liveRunIndex.getSnapshot,
				liveRunIndex.getSnapshot,
			),
	}));

	return import(
		`../../hooks/useAttention.ts?use-attention-test=${++useAttentionImportVersion}`
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
					waiting: [buildRun()],
					failed: [],
					running: [],
				}),
		}),
	);

	globalThis.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
	liveRunIndex.clear();
	mock.restore();
});

describe("useAttention", () => {
	test("derives updated attention group membership from the live run index", async () => {
		const { useAttention } = await loadUseAttention();
		const { result } = renderHook(() => useAttention());

		await waitFor(() => {
			expect(result.current.isLoading).toBe(false);
		});

		expect(result.current.data?.waiting.map((run: Run) => run.id)).toEqual([
			"run-1",
		]);
		expect(result.current.data?.running).toEqual([]);
		expect(fetchMock).toHaveBeenCalledTimes(1);

		act(() => {
			liveRunIndex.upsertRuns([
				buildRun({
					id: "run-1",
					status: "failed",
					lastEventAt: "2026-04-10T00:06:00.000Z",
				}),
				buildRun({
					id: "run-2",
					status: "running",
					lastEventAt: "2026-04-10T00:07:00.000Z",
				}),
			]);
		});

		await waitFor(() => {
			expect(result.current.data?.failed.map((run: Run) => run.id)).toEqual([
				"run-1",
			]);
		});

		expect(result.current.data?.waiting).toEqual([]);
		expect(result.current.data?.running.map((run: Run) => run.id)).toEqual([
			"run-2",
		]);
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});
});
