import { beforeEach, describe, expect, mock, test } from "bun:test";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import type { NotificationMessage } from "@/types/websocket";

type NotificationCallback = (msg: NotificationMessage) => void;

let navigateMock: ReturnType<typeof mock>;
let notificationListener: NotificationCallback | null = null;

mock.module("react-router-dom", () => ({
	useNavigate: () => navigateMock,
}));

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

import { NotificationContainer } from "../../../components/v2/NotificationToast";

function emitNotification(message: NotificationMessage) {
	if (!notificationListener) {
		throw new Error("Notification listener not registered");
	}

	notificationListener(message);
}

beforeEach(() => {
	document.body.innerHTML = "";
	navigateMock = mock(() => {});
	notificationListener = null;
});

describe("NotificationContainer", () => {
	test("renders separate action and dismiss buttons for a toast", () => {
		render(createElement(NotificationContainer));

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

	test("navigates from the action button and dismisses from the close button", () => {
		render(createElement(NotificationContainer));

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

		expect(navigateMock).toHaveBeenCalledWith("/runs/run-2");
		expect(screen.queryByText("Review ready")).toBeNull();

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

		expect(navigateMock).toHaveBeenCalledTimes(1);
		expect(screen.queryByText("Dismiss only")).toBeNull();
	});
});
