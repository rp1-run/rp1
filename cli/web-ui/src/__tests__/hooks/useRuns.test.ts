import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { useEffect, useSyncExternalStore } from "react";
import { liveRunIndex } from "@/lib/live-run-index";
import type { Run } from "@/types/runs";

let fetchMock: ReturnType<typeof mock>;
let useRunsImportVersion = 0;
let reconnectRecoveryCallbacks: Array<() => void | Promise<void>> = [];
let activityRecoveryLimit = 10;

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

interface Deferred<T> {
	readonly promise: Promise<T>;
	readonly resolve: (value: T) => void;
	readonly reject: (reason?: unknown) => void;
}

function createDeferred<T>(): Deferred<T> {
	let resolve: (value: T) => void = () => {};
	let reject: (reason?: unknown) => void = () => {};
	const promise = new Promise<T>((resolvePromise, rejectPromise) => {
		resolve = resolvePromise;
		reject = rejectPromise;
	});

	return { promise, resolve, reject };
}

async function loadUseRuns() {
	mock.module("../../hooks/useReconnectRecovery.ts", () => ({
		useReconnectRecovery: (recover: () => void | Promise<void>) => {
			useEffect(() => {
				reconnectRecoveryCallbacks.push(recover);
				return () => {
					reconnectRecoveryCallbacks = reconnectRecoveryCallbacks.filter(
						(callback) => callback !== recover,
					);
				};
			}, [recover]);
		},
	}));
	mock.module("../../hooks/useLiveRunIndex.ts", () => ({
		useLiveRunIndexSnapshot: () =>
			useSyncExternalStore(
				liveRunIndex.subscribe,
				liveRunIndex.getSnapshot,
				liveRunIndex.getSnapshot,
			),
	}));
	mock.module("@/providers/RuntimeProvider", () => ({
		useRuntimeContract: () => ({
			reconnectPolicy: {
				activityRecoveryLimit,
			},
		}),
	}));

	return import(
		`../../hooks/useRuns.ts?use-runs-test=${++useRunsImportVersion}`
	);
}

beforeEach(() => {
	mock.restore();
	liveRunIndex.clear();
	reconnectRecoveryCallbacks = [];
	activityRecoveryLimit = 10;

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
	cleanup();
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

	test("reconciles after reconnect with a bounded background request", async () => {
		const initialRun = buildRun({
			id: "run-1",
			lastEventAt: "2026-04-10T00:05:00.000Z",
		});
		const recoveredRun = buildRun({
			id: "run-2",
			lastEventAt: "2026-04-10T00:06:00.000Z",
		});
		const recoveryResponse = createDeferred<{
			readonly ok: boolean;
			readonly json: () => Promise<{
				readonly runs: Run[];
				readonly total: number;
			}>;
		}>();
		let requestCount = 0;

		fetchMock = mock(() => {
			requestCount += 1;
			if (requestCount === 1) {
				return Promise.resolve({
					ok: true,
					json: () =>
						Promise.resolve({
							runs: [initialRun],
							total: 1,
						}),
				});
			}

			return recoveryResponse.promise;
		});
		globalThis.fetch = fetchMock as unknown as typeof fetch;

		const { useRuns } = await loadUseRuns();
		const { result } = renderHook(() =>
			useRuns({ status: "running", limit: 25, offset: 0 }),
		);

		await waitFor(() => {
			expect(result.current.isLoading).toBe(false);
		});

		let recoveryPromise: void | Promise<void>;
		act(() => {
			recoveryPromise = reconnectRecoveryCallbacks[0]?.();
		});

		expect(result.current.isLoading).toBe(false);
		expect(fetchMock).toHaveBeenCalledTimes(2);
		const recoveryUrl = new URL(
			fetchMock.mock.calls[1]?.[0] as string,
			"http://localhost",
		);
		expect(recoveryUrl.searchParams.get("limit")).toBe("35");

		await act(async () => {
			recoveryResponse.resolve({
				ok: true,
				json: () =>
					Promise.resolve({
						runs: [initialRun, recoveredRun],
						total: 2,
					}),
			});
			await recoveryPromise;
			await recoveryResponse.promise;
			await Promise.resolve();
		});

		await waitFor(() => {
			expect(result.current.runs.map((run: Run) => run.id)).toEqual(
				expect.arrayContaining(["run-1", "run-2"]),
			);
		});
		expect(result.current.error).toBeNull();
	});
});
