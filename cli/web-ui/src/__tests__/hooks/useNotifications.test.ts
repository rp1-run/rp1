import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type {
	NotificationListItem,
	NotificationsSummary,
} from "@/hooks/useNotifications";
import type { NotificationMessage } from "@/types/websocket";

type NotificationCallback = (msg: NotificationMessage) => void;
type ReconnectCallback = () => void;

let notificationListeners: NotificationCallback[] = [];
let reconnectListeners: ReconnectCallback[] = [];
let notifications: NotificationListItem[] = [];
let fetchMock: ReturnType<typeof mock>;
let useNotificationsImportVersion = 0;

function createNotification(
	id: number,
	overrides: Partial<NotificationListItem> = {},
): NotificationListItem {
	return {
		id,
		message: `Notification ${id}`,
		sourceType: "run",
		sourceId: `run-${id}`,
		route: `/runs/run-${id}`,
		projectId: "proj-1",
		createdAt: `2026-04-11T00:${String(id).padStart(2, "0")}:00.000Z`,
		harness: "codex",
		runCommand: "/build",
		runName: `Run ${id}`,
		projectName: "Alpha Project",
		attentionLevel: "info",
		...overrides,
	};
}

function summarizeNotifications(
	items: NotificationListItem[],
): NotificationsSummary {
	let totalCount = 0;
	let actionRequiredCount = 0;
	let attentionCount = 0;
	let informationalCount = 0;

	for (const item of items) {
		totalCount += 1;

		if (item.attentionLevel === "action_required") {
			actionRequiredCount += 1;
			continue;
		}

		if (item.attentionLevel === "attention") {
			attentionCount += 1;
			continue;
		}

		informationalCount += 1;
	}

	return {
		totalCount,
		actionRequiredCount,
		attentionCount,
		informationalCount,
	};
}

function createNotificationsPageResponse(page: NotificationListItem[]) {
	return {
		ok: true,
		status: 200,
		statusText: "OK",
		json: () =>
			Promise.resolve({
				notifications: page,
				total: notifications.length,
				summary: summarizeNotifications(notifications),
			}),
	};
}

async function loadUseNotifications() {
	mock.module("@/providers/WebSocketProvider", () => ({
		useWebSocket: () => ({
			onNotification: (callback: NotificationCallback) => {
				notificationListeners.push(callback);
				return () => {
					notificationListeners = notificationListeners.filter(
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

	return import(
		`../../hooks/useNotifications.ts?use-notifications-test=${++useNotificationsImportVersion}`
	);
}

beforeEach(() => {
	mock.restore();
	notificationListeners = [];
	reconnectListeners = [];
	notifications = [
		createNotification(7, {
			message: "Approval needed",
			sourceType: "agent",
			sourceId: "run-1",
			route: "/runs/run-1",
			createdAt: "2026-04-11T00:00:00.000Z",
			runName: "Sidebar Build",
			attentionLevel: "action_required",
		}),
	];

	fetchMock = mock((input: RequestInfo | URL, init?: RequestInit) => {
		const url = new URL(String(input), "http://localhost");
		if (url.pathname === "/api/v2/notifications/7/dismiss") {
			return Promise.resolve({
				ok: true,
				status: 200,
				statusText: "OK",
				json: () => Promise.resolve({ dismissed: true }),
			});
		}

		if (
			url.pathname === "/api/v2/notifications" &&
			init?.method === undefined
		) {
			const limit = Number.parseInt(url.searchParams.get("limit") ?? "50", 10);
			const offset = Number.parseInt(url.searchParams.get("offset") ?? "0", 10);
			const page = notifications.slice(offset, offset + limit);

			return Promise.resolve(createNotificationsPageResponse(page));
		}

		throw new Error(`Unexpected fetch request: ${String(input)}`);
	});

	globalThis.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
	cleanup();
	notificationListeners = [];
	reconnectListeners = [];
	mock.restore();
});

describe("useNotifications", () => {
	test("loads the notifications contract and refetches for websocket and reconnect recovery events", async () => {
		const { useNotifications } = await loadUseNotifications();
		const { result } = renderHook(() => useNotifications());

		await waitFor(() => {
			expect(result.current.isLoading).toBe(false);
		});

		expect(result.current.notifications).toHaveLength(1);
		expect(result.current.summary).toEqual({
			totalCount: 1,
			actionRequiredCount: 1,
			attentionCount: 0,
			informationalCount: 0,
		});
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(fetchMock).toHaveBeenNthCalledWith(
			1,
			"/api/v2/notifications?limit=50&offset=0",
		);

		act(() => {
			for (const listener of notificationListeners) {
				listener({
					type: "notification:created",
					notification: {
						id: 8,
						message: "Another notification",
						sourceType: "run",
						sourceId: "run-2",
						route: "/runs/run-2",
						projectId: "proj-1",
						createdAt: "2026-04-11T00:01:00.000Z",
					},
				});
			}
		});

		await waitFor(() => {
			expect(fetchMock).toHaveBeenCalledTimes(2);
		});

		act(() => {
			for (const listener of notificationListeners) {
				listener({
					type: "notification:dismissed",
					notificationId: 7,
				});
			}
		});

		await waitFor(() => {
			expect(fetchMock).toHaveBeenCalledTimes(3);
		});

		act(() => {
			for (const listener of reconnectListeners) {
				listener();
			}
		});

		await waitFor(() => {
			expect(fetchMock).toHaveBeenCalledTimes(4);
		});
	});

	test("publishes the first-page summary before later pagination requests finish", async () => {
		notifications = Array.from({ length: 55 }, (_, index) =>
			createNotification(index + 1, {
				attentionLevel: index === 0 ? "action_required" : "info",
			}),
		);
		let resolveSecondPage!: (
			value: ReturnType<typeof createNotificationsPageResponse>,
		) => void;
		const secondPageResponse = new Promise<
			ReturnType<typeof createNotificationsPageResponse>
		>((resolve) => {
			resolveSecondPage = resolve;
		});
		fetchMock = mock((input: RequestInfo | URL, init?: RequestInit) => {
			const url = new URL(String(input), "http://localhost");
			if (
				url.pathname === "/api/v2/notifications" &&
				init?.method === undefined
			) {
				const limit = Number.parseInt(
					url.searchParams.get("limit") ?? "50",
					10,
				);
				const offset = Number.parseInt(
					url.searchParams.get("offset") ?? "0",
					10,
				);
				const page = notifications.slice(offset, offset + limit);

				if (offset === 50) {
					return secondPageResponse;
				}

				return Promise.resolve(createNotificationsPageResponse(page));
			}

			throw new Error(`Unexpected fetch request: ${String(input)}`);
		});
		globalThis.fetch = fetchMock as unknown as typeof fetch;

		const { useNotifications } = await loadUseNotifications();
		const { result } = renderHook(() => useNotifications());

		await waitFor(() => {
			expect(fetchMock).toHaveBeenNthCalledWith(
				2,
				"/api/v2/notifications?limit=50&offset=50",
			);
		});

		await waitFor(() => {
			expect(result.current.summary).toEqual({
				totalCount: 55,
				actionRequiredCount: 1,
				attentionCount: 0,
				informationalCount: 54,
			});
		});
		expect(result.current.isLoading).toBe(true);

		await act(async () => {
			resolveSecondPage(
				createNotificationsPageResponse(notifications.slice(50)),
			);
		});

		await waitFor(() => {
			expect(result.current.isLoading).toBe(false);
		});

		expect(result.current.notifications).toHaveLength(55);
		expect(result.current.notifications.at(0)?.id).toBe(1);
		expect(result.current.notifications.at(-1)?.id).toBe(55);
		expect(result.current.summary).toEqual({
			totalCount: 55,
			actionRequiredCount: 1,
			attentionCount: 0,
			informationalCount: 54,
		});
		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(fetchMock).toHaveBeenNthCalledWith(
			1,
			"/api/v2/notifications?limit=50&offset=0",
		);
		expect(fetchMock).toHaveBeenNthCalledWith(
			2,
			"/api/v2/notifications?limit=50&offset=50",
		);
	});

	test("dismisses through the notifications endpoint and refreshes the list", async () => {
		const { useNotifications } = await loadUseNotifications();
		const { result } = renderHook(() => useNotifications());

		await waitFor(() => {
			expect(result.current.isLoading).toBe(false);
		});

		await act(async () => {
			await result.current.dismissNotification(7);
		});

		expect(fetchMock).toHaveBeenNthCalledWith(
			2,
			"/api/v2/notifications/7/dismiss",
			{ method: "POST" },
		);
		expect(fetchMock).toHaveBeenCalledTimes(3);
	});
});
