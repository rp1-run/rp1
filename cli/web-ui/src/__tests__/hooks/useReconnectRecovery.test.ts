import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { act, cleanup, renderHook } from "@testing-library/react";

type ReconnectCallback = () => void;
type ConnectionStatus = "connecting" | "connected" | "disconnected";

let reconnectListeners: ReconnectCallback[] = [];
let socketStatus: ConnectionStatus = "connected";
let intervalCallback: (() => void) | null = null;
let intervalDelay: number | undefined;
let intervalId = 0;
let clearedIntervalIds: ReturnType<typeof setInterval>[] = [];
let useReconnectRecoveryImportVersion = 0;
const originalSetInterval = globalThis.setInterval;
const originalClearInterval = globalThis.clearInterval;

async function loadUseReconnectRecovery() {
	mock.module("@/providers/WebSocketProvider", () => ({
		useWebSocket: () => ({
			status: socketStatus,
			subscribeToReconnect: (callback: ReconnectCallback) => {
				reconnectListeners.push(callback);
				return () => {
					reconnectListeners = reconnectListeners.filter(
						(listener) => listener !== callback,
					);
				};
			},
		}),
	}));
	mock.module("@/providers/RuntimeProvider", () => ({
		useRuntimeContract: () => ({
			reconnectPolicy: {
				disconnectedRecoveryIntervalMs: 1234,
			},
		}),
	}));

	return import(
		`../../hooks/useReconnectRecovery.ts?use-reconnect-recovery-test=${++useReconnectRecoveryImportVersion}`
	);
}

beforeEach(() => {
	mock.restore();
	reconnectListeners = [];
	socketStatus = "connected";
	intervalCallback = null;
	intervalDelay = undefined;
	intervalId = 0;
	clearedIntervalIds = [];
	globalThis.setInterval = ((callback: TimerHandler, delay?: number) => {
		intervalCallback = callback as () => void;
		intervalDelay = delay;
		intervalId += 1;
		return intervalId as unknown as ReturnType<typeof setInterval>;
	}) as unknown as typeof setInterval;
	globalThis.clearInterval = ((id: ReturnType<typeof setInterval>) => {
		clearedIntervalIds.push(id);
		intervalCallback = null;
	}) as unknown as typeof clearInterval;
});

afterEach(() => {
	cleanup();
	reconnectListeners = [];
	socketStatus = "connected";
	intervalCallback = null;
	intervalDelay = undefined;
	clearedIntervalIds = [];
	globalThis.setInterval = originalSetInterval;
	globalThis.clearInterval = originalClearInterval;
	mock.restore();
});

describe("useReconnectRecovery", () => {
	test("polls only while disconnected, refetches on reconnect, and unsubscribes on unmount", async () => {
		const { useReconnectRecovery } = await loadUseReconnectRecovery();
		const recover = mock(() => {});
		const { rerender, unmount } = renderHook(() =>
			useReconnectRecovery(recover),
		);

		expect(reconnectListeners).toHaveLength(1);
		expect(intervalCallback).toBeNull();

		socketStatus = "disconnected";
		rerender();

		expect(intervalCallback).not.toBeNull();
		expect(intervalDelay).toBe(1234);

		act(() => {
			intervalCallback?.();
		});

		expect(recover).toHaveBeenCalledTimes(1);

		socketStatus = "connected";
		rerender();

		expect(intervalCallback).toBeNull();
		expect(clearedIntervalIds).toHaveLength(1);

		act(() => {
			reconnectListeners[0]?.();
		});

		expect(recover).toHaveBeenCalledTimes(2);

		unmount();

		expect(reconnectListeners).toHaveLength(0);
	});
});
