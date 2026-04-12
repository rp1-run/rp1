import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import type { NotificationMessage } from "@/types/websocket";

type NotificationCallback = (msg: NotificationMessage) => void;

let fetchMock: ReturnType<typeof mock>;
let notificationListener: NotificationCallback | null = null;
let notificationToastImportVersion = 0;

function LocationProbe() {
	const location = useLocation();
	return <span data-testid="location-probe">{location.pathname}</span>;
}

async function loadNotificationContainer() {
	mock.module("@/hooks/usePrefersReducedMotion", () => ({
		usePrefersReducedMotion: () => true,
	}));

	mock.module("@/providers/WebSocketProvider", () => ({
		useWebSocket: () => ({
			onNotification: (callback: NotificationCallback) => {
				notificationListener = callback;
				return () => {
					if (notificationListener === callback) {
						notificationListener = null;
					}
				};
			},
		}),
	}));

	const { NotificationContainer } = await import(
		`../../../components/v2/NotificationToast.tsx?notification-toast-test=${++notificationToastImportVersion}`
	);

	return NotificationContainer;
}

async function renderNotificationContainer() {
	const NotificationContainer = await loadNotificationContainer();

	return render(
		<MemoryRouter initialEntries={["/"]}>
			<Routes>
				<Route
					path="*"
					element={
						<>
							<LocationProbe />
							<NotificationContainer />
						</>
					}
				/>
			</Routes>
		</MemoryRouter>,
	);
}

function emitNotification(message: NotificationMessage) {
	if (!notificationListener) {
		throw new Error("Notification listener not registered");
	}

	notificationListener(message);
}

beforeEach(() => {
	mock.restore();
	document.body.innerHTML = "";
	fetchMock = mock((input: RequestInfo | URL, init?: RequestInit) => {
		const url = String(input);
		if (url.endsWith("/api/v2/notifications/3/dismiss")) {
			return Promise.resolve({
				ok: true,
				status: 200,
				statusText: "OK",
				json: () => Promise.resolve({ dismissed: true }),
			});
		}

		throw new Error(
			`Unexpected fetch request: ${url} ${String(init?.method ?? "")}`,
		);
	});
	globalThis.fetch = fetchMock as unknown as typeof fetch;
	notificationListener = null;
});

afterEach(() => {
	cleanup();
	notificationListener = null;
	mock.restore();
});

describe("NotificationContainer", () => {
	test("renders separate action and dismiss buttons for a toast", async () => {
		await renderNotificationContainer();

		act(() => {
			emitNotification({
				type: "notification:created",
				notification: {
					id: 1,
					message: "Build complete",
					sourceType: "run",
					sourceId: "run-1",
					route: "/runs/run-1",
					projectId: "proj-1",
					createdAt: "2026-04-10T00:00:00Z",
				},
			});
		});

		const actionButton = screen.getByRole("button", {
			name: "Build complete. Click to navigate.",
		});
		const dismissButton = screen.getByRole("button", {
			name: "Dismiss notification",
		});

		expect(actionButton).toBeTruthy();
		expect(dismissButton).toBeTruthy();
		expect(actionButton.contains(dismissButton)).toBe(false);
	});

	test("deduplicates identical notification:created events", async () => {
		await renderNotificationContainer();

		act(() => {
			emitNotification({
				type: "notification:created",
				notification: {
					id: 11,
					message: "Only once",
					sourceType: "run",
					sourceId: "run-11",
					route: "/runs/run-11",
					projectId: "proj-1",
					createdAt: "2026-04-10T00:00:00Z",
				},
			});
			emitNotification({
				type: "notification:created",
				notification: {
					id: 11,
					message: "Only once",
					sourceType: "run",
					sourceId: "run-11",
					route: "/runs/run-11",
					projectId: "proj-1",
					createdAt: "2026-04-10T00:00:00Z",
				},
			});
		});

		expect(
			screen.getAllByRole("button", {
				name: "Only once. Click to navigate.",
			}),
		).toHaveLength(1);
	});

	test("navigates from the action button and dismisses from the close button", async () => {
		await renderNotificationContainer();

		act(() => {
			emitNotification({
				type: "notification:created",
				notification: {
					id: 2,
					message: "Review ready",
					sourceType: "run",
					sourceId: "run-2",
					route: "/runs/run-2",
					projectId: "proj-1",
					createdAt: "2026-04-10T00:00:00Z",
				},
			});
		});

		fireEvent.click(
			screen.getByRole("button", {
				name: "Review ready. Click to navigate.",
			}),
		);

		await waitFor(() => {
			expect(screen.getByTestId("location-probe").textContent).toBe(
				"/runs/run-2",
			);
		});
		expect(screen.queryByText("Review ready")).toBeNull();
		expect(fetchMock).not.toHaveBeenCalled();
	});

	test("persists dismissals through the notifications endpoint", async () => {
		await renderNotificationContainer();

		act(() => {
			emitNotification({
				type: "notification:created",
				notification: {
					id: 3,
					message: "Dismiss only",
					sourceType: "run",
					sourceId: "run-3",
					route: null,
					projectId: "proj-1",
					createdAt: "2026-04-10T00:00:00Z",
				},
			});
		});

		fireEvent.click(
			screen.getByRole("button", {
				name: "Dismiss notification",
			}),
		);

		await waitFor(() => {
			expect(fetchMock).toHaveBeenCalledWith(
				"/api/v2/notifications/3/dismiss",
				{
					method: "POST",
				},
			);
		});
		await waitFor(() => {
			expect(screen.queryByText("Dismiss only")).toBeNull();
		});
		expect(screen.getByTestId("location-probe").textContent).toBe("/");
	});

	test("removes visible toasts when a notification:dismissed event arrives", async () => {
		await renderNotificationContainer();

		act(() => {
			emitNotification({
				type: "notification:created",
				notification: {
					id: 4,
					message: "Dismiss elsewhere",
					sourceType: "run",
					sourceId: "run-4",
					route: "/runs/run-4",
					projectId: "proj-1",
					createdAt: "2026-04-10T00:00:00Z",
				},
			});
		});

		act(() => {
			emitNotification({
				type: "notification:dismissed",
				notificationId: 4,
			});
		});

		expect(screen.queryByText("Dismiss elsewhere")).toBeNull();
	});
});
