import { beforeEach, describe, expect, mock, test } from "bun:test";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { Run } from "@/types/runs";
import type {
	EventNotificationMessage,
	NotificationMessage,
} from "@/types/websocket";

type AttentionCallback = () => void;
type EventCallback = (msg: EventNotificationMessage) => void;
type NotificationCallback = (msg: NotificationMessage) => void;
type ReconnectCallback = () => void;

let attentionListeners: AttentionCallback[] = [];
let eventListeners: EventCallback[] = [];
let notificationListeners: NotificationCallback[] = [];
let reconnectListeners: ReconnectCallback[] = [];
let fetchMock: ReturnType<typeof mock>;

mock.module("@/providers/WebSocketProvider", () => ({
	useWebSocket: () => ({
		onEventNotification: (callback: EventCallback) => {
			eventListeners.push(callback);
			return () => {
				eventListeners = eventListeners.filter(
					(listener) => listener !== callback,
				);
			};
		},
		onNotification: (callback: NotificationCallback) => {
			notificationListeners.push(callback);
			return () => {
				notificationListeners = notificationListeners.filter(
					(listener) => listener !== callback,
				);
			};
		},
		subscribeToAttention: (callback: AttentionCallback) => {
			attentionListeners.push(callback);
			return () => {
				attentionListeners = attentionListeners.filter(
					(listener) => listener !== callback,
				);
			};
		},
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

const baseRun: Run = {
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
};

beforeEach(() => {
	attentionListeners = [];
	eventListeners = [];
	notificationListeners = [];
	reconnectListeners = [];

	fetchMock = mock(() =>
		Promise.resolve({
			ok: true,
			json: () =>
				Promise.resolve({
					items: [
						{
							type: "run",
							id: "run-1",
							timestamp: "2026-04-10T00:05:00.000Z",
							run: baseRun,
						},
					],
					total: 1,
				}),
		}),
	);

	globalThis.fetch = fetchMock as unknown as typeof fetch;
});

describe("useFeed", () => {
	test("refetches for attention updates but ignores notification websocket events", async () => {
		const { useFeed } = await import("../../hooks/useFeed");
		const { result } = renderHook(() => useFeed());

		await waitFor(() => {
			expect(result.current.isLoading).toBe(false);
		});

		expect(result.current.items).toHaveLength(1);
		expect(result.current.items[0]?.type).toBe("run");
		expect(fetchMock).toHaveBeenCalledTimes(1);

		act(() => {
			for (const listener of eventListeners) {
				listener({
					type: "event:notification",
					eventId: 1,
					eventType: "status_change",
					runId: "run-1",
					projectId: "proj-1",
					featureId: "feat-1",
					step: "build",
					data: { status: "running" },
					createdAt: "2026-04-10T00:06:00.000Z",
				});
			}
			for (const listener of notificationListeners) {
				listener({
					type: "notification:created",
					notification: {
						id: 7,
						message: "Approval needed",
						sourceType: "agent",
						sourceId: "run-1",
						route: "/runs/run-1",
						projectId: "proj-1",
						createdAt: "2026-04-10T00:06:00.000Z",
					},
				});
			}
		});

		expect(fetchMock).toHaveBeenCalledTimes(1);

		act(() => {
			for (const listener of attentionListeners) {
				listener();
			}
		});

		await waitFor(() => {
			expect(fetchMock).toHaveBeenCalledTimes(2);
		});
	});
});
