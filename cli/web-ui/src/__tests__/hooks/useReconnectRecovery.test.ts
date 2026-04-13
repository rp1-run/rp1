import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { act, cleanup, renderHook } from "@testing-library/react";

type ReconnectCallback = () => void;

let reconnectListeners: ReconnectCallback[] = [];
let useReconnectRecoveryImportVersion = 0;

async function loadUseReconnectRecovery() {
	mock.module("@/providers/WebSocketProvider", () => ({
		useWebSocket: () => ({
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

	return import(
		`../../hooks/useReconnectRecovery.ts?use-reconnect-recovery-test=${++useReconnectRecoveryImportVersion}`
	);
}

beforeEach(() => {
	mock.restore();
	reconnectListeners = [];
});

afterEach(() => {
	cleanup();
	reconnectListeners = [];
	mock.restore();
});

describe("useReconnectRecovery", () => {
	test("invokes recovery callbacks on reconnect and unsubscribes on unmount", async () => {
		const { useReconnectRecovery } = await loadUseReconnectRecovery();
		const recover = mock(() => {});
		const { unmount } = renderHook(() => useReconnectRecovery(recover));

		expect(reconnectListeners).toHaveLength(1);

		act(() => {
			reconnectListeners[0]?.();
		});

		expect(recover).toHaveBeenCalledTimes(1);

		unmount();

		expect(reconnectListeners).toHaveLength(0);
	});
});
