import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { useSyncExternalStore } from "react";
import { liveRunIndex } from "@/lib/live-run-index";

type ReconnectCallback = () => void;
type ProjectsChangedCallback = () => void;

let projectsChangedListeners: ProjectsChangedCallback[] = [];
let fetchMock: ReturnType<typeof mock>;
let fetchCount = 0;
let reconnectRecovery: ReconnectCallback | null = null;
let useProjectsImportVersion = 0;

function emitReconnect() {
	reconnectRecovery?.();
}

function emitProjectsChanged() {
	for (const listener of projectsChangedListeners) {
		listener();
	}
}

async function loadUseProjects() {
	mock.module("@/providers/WebSocketProvider", () => ({
		useWebSocket: () => ({
			onProjectsChange: (cb: ProjectsChangedCallback) => {
				projectsChangedListeners.push(cb);
				return () => {
					projectsChangedListeners = projectsChangedListeners.filter(
						(listener) => listener !== cb,
					);
				};
			},
		}),
	}));
	mock.module("../../hooks/useReconnectRecovery.ts", () => ({
		useReconnectRecovery: (recover: () => void | Promise<void>) => {
			reconnectRecovery = () => {
				void recover();
			};
		},
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
		`../../hooks/useProjects.ts?use-projects-test=${++useProjectsImportVersion}`
	);
}

beforeEach(() => {
	mock.restore();
	liveRunIndex.clear();
	projectsChangedListeners = [];
	reconnectRecovery = null;
	fetchCount = 0;

	fetchMock = mock(() => {
		fetchCount += 1;
		if (fetchCount === 1) {
			return Promise.resolve({
				ok: false,
				statusText: "Service Unavailable",
			});
		}

		return Promise.resolve({
			ok: true,
			json: () =>
				Promise.resolve({
					projects: [
						{
							id: "proj-1",
							name: "rp1",
							path: "/Users/prem/Development/rp1",
							runCount: 3,
							lastActivityAt: "2026-04-01T00:00:00Z",
							available: true,
						},
					],
				}),
		});
	});

	globalThis.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
	cleanup();
	liveRunIndex.clear();
	projectsChangedListeners = [];
	reconnectRecovery = null;
	mock.restore();
});

describe("useProjects", () => {
	test("recovers automatically after websocket reconnect", async () => {
		const { useProjects } = await loadUseProjects();
		const { result } = renderHook(() => useProjects());

		await waitFor(() => {
			expect(result.current.isLoading).toBe(false);
		});
		expect(result.current.error?.message).toBe(
			"Failed to fetch projects: Service Unavailable",
		);
		expect(result.current.projects).toEqual([]);

		act(() => {
			expect(reconnectRecovery).not.toBeNull();
			emitReconnect();
		});

		await waitFor(() => {
			expect(result.current.error).toBeNull();
			expect(result.current.projects).toHaveLength(1);
		});
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	test("refetches automatically after a projects:changed websocket event", async () => {
		let localFetchCount = 0;
		fetchMock = mock(() => {
			localFetchCount += 1;
			return Promise.resolve({
				ok: true,
				json: () =>
					Promise.resolve({
						projects:
							localFetchCount === 1
								? [
										{
											id: "proj-1",
											name: "rp1",
											path: "/Users/prem/Development/rp1",
											runCount: 3,
											lastActivityAt: "2026-04-01T00:00:00Z",
											available: true,
										},
									]
								: [
										{
											id: "proj-1",
											name: "rp1",
											path: "/Users/prem/Development/rp1",
											runCount: 3,
											lastActivityAt: "2026-04-01T00:00:00Z",
											available: true,
										},
										{
											id: "proj-2",
											name: "arcade",
											path: "/Users/prem/Development/arcade",
											runCount: 1,
											lastActivityAt: "2026-04-02T00:00:00Z",
											available: true,
										},
									],
					}),
			});
		});
		globalThis.fetch = fetchMock as unknown as typeof fetch;

		const { useProjects } = await loadUseProjects();
		const { result } = renderHook(() => useProjects());

		await waitFor(() => {
			expect(result.current.projects).toHaveLength(1);
		});

		act(() => {
			emitProjectsChanged();
		});

		await waitFor(() => {
			expect(result.current.projects).toHaveLength(2);
		});
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	test("patches project activity metadata from live run updates without refetching", async () => {
		fetchMock = mock(() =>
			Promise.resolve({
				ok: true,
				json: () =>
					Promise.resolve({
						projects: [
							{
								id: "proj-1",
								name: "rp1",
								path: "/Users/prem/Development/rp1",
								runCount: 3,
								lastActivityAt: "2026-04-01T00:00:00Z",
								available: true,
							},
						],
					}),
			}),
		);
		globalThis.fetch = fetchMock as unknown as typeof fetch;

		const { useProjects } = await loadUseProjects();
		const { result } = renderHook(() => useProjects());

		await waitFor(() => {
			expect(result.current.projects).toHaveLength(1);
		});

		act(() => {
			liveRunIndex.upsertRun({
				id: "run-4",
				projectId: "proj-1",
				projectName: "rp1",
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
				startedAt: "2026-04-02T00:00:00Z",
				lastEventAt: "2026-04-02T00:05:00Z",
				completedAt: null,
				error: null,
				agentSteps: null,
			});
		});

		await waitFor(() => {
			expect(result.current.projects[0]?.lastActivityAt).toBe(
				"2026-04-02T00:05:00Z",
			);
		});

		expect(result.current.projects[0]?.runCount).toBe(4);
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	test("counts newly discovered older runs without overwriting project activity", async () => {
		fetchMock = mock(() =>
			Promise.resolve({
				ok: true,
				json: () =>
					Promise.resolve({
						projects: [
							{
								id: "proj-1",
								name: "rp1",
								path: "/Users/prem/Development/rp1",
								runCount: 3,
								lastActivityAt: "2026-04-01T00:00:00Z",
								available: true,
							},
						],
					}),
			}),
		);
		globalThis.fetch = fetchMock as unknown as typeof fetch;

		const { useProjects } = await loadUseProjects();
		const { result } = renderHook(() => useProjects());

		await waitFor(() => {
			expect(result.current.projects).toHaveLength(1);
		});

		act(() => {
			liveRunIndex.upsertRun({
				id: "run-older",
				projectId: "proj-1",
				projectName: "rp1",
				featureId: "feat-1",
				featureName: "Test Feature",
				name: null,
				command: "/build",
				status: "completed",
				harness: "codex",
				currentStep: null,
				steps: [],
				artifacts: [],
				events: [],
				startedAt: "2026-03-31T23:00:00Z",
				lastEventAt: "2026-03-31T23:30:00Z",
				completedAt: "2026-03-31T23:30:00Z",
				error: null,
				agentSteps: null,
			});
		});

		await waitFor(() => {
			expect(result.current.projects[0]?.runCount).toBe(4);
		});

		expect(result.current.projects[0]?.lastActivityAt).toBe(
			"2026-04-01T00:00:00Z",
		);
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});
});
