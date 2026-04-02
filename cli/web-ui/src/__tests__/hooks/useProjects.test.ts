import { beforeEach, describe, expect, mock, test } from "bun:test";
import { act, renderHook, waitFor } from "@testing-library/react";

type ReconnectCallback = () => void;
type ProjectsChangedCallback = () => void;

let reconnectListeners: ReconnectCallback[] = [];
let projectsChangedListeners: ProjectsChangedCallback[] = [];
let fetchMock: ReturnType<typeof mock>;
let fetchCount = 0;

mock.module("@/providers/WebSocketProvider", () => ({
	useWebSocket: () => ({
		subscribeToReconnect: (cb: ReconnectCallback) => {
			reconnectListeners.push(cb);
			return () => {
				reconnectListeners = reconnectListeners.filter(
					(listener) => listener !== cb,
				);
			};
		},
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

function emitReconnect() {
	for (const listener of reconnectListeners) {
		listener();
	}
}

function emitProjectsChanged() {
	for (const listener of projectsChangedListeners) {
		listener();
	}
}

beforeEach(() => {
	reconnectListeners = [];
	projectsChangedListeners = [];
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

describe("useProjects", () => {
	test("recovers automatically after websocket reconnect", async () => {
		const { useProjects } = await import("../../hooks/useProjects");
		const { result } = renderHook(() => useProjects());

		await waitFor(() => {
			expect(result.current.isLoading).toBe(false);
		});
		expect(result.current.error?.message).toBe(
			"Failed to fetch projects: Service Unavailable",
		);
		expect(result.current.projects).toEqual([]);

		act(() => {
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

		const { useProjects } = await import("../../hooks/useProjects");
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
