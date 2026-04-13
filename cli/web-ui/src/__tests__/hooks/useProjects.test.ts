import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";

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

	return import(
		`../../hooks/useProjects.ts?use-projects-test=${++useProjectsImportVersion}`
	);
}

beforeEach(() => {
	mock.restore();
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
});
