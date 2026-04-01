import { beforeEach, describe, expect, mock, test } from "bun:test";
import { act, renderHook, waitFor } from "@testing-library/react";

type ReconnectCallback = () => void;

let reconnectListeners: ReconnectCallback[] = [];
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
	}),
}));

function emitReconnect() {
	for (const listener of reconnectListeners) {
		listener();
	}
}

beforeEach(() => {
	reconnectListeners = [];
	fetchCount = 0;

	fetchMock = mock(() => {
		fetchCount += 1;
		if (fetchCount === 1) {
			return Promise.resolve({
				ok: false,
				statusText: "Service Unavailable",
				status: 503,
			});
		}

		return Promise.resolve({
			ok: true,
			json: () =>
				Promise.resolve([
					{
						name: "context",
						path: ".rp1/context",
						type: "directory",
						children: [],
					},
				]),
		});
	});

	globalThis.fetch = fetchMock as unknown as typeof fetch;
});

describe("useProjectFileTree", () => {
	test("recovers automatically after websocket reconnect", async () => {
		const { useProjectFileTree } = await import(
			"../../hooks/useProjectFileTree"
		);
		const { result } = renderHook(() => useProjectFileTree("proj-1"));

		await waitFor(() => {
			expect(result.current.loading).toBe(false);
		});
		expect(result.current.error).toBe(
			"Failed to fetch file tree: Service Unavailable",
		);
		expect(result.current.tree).toEqual([]);

		act(() => {
			emitReconnect();
		});

		await waitFor(() => {
			expect(result.current.error).toBeNull();
			expect(result.current.tree).toHaveLength(1);
		});
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});
});
