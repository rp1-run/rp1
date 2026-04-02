import { useCallback, useEffect, useRef, useState } from "react";
import { useWebSocket } from "@/providers/WebSocketProvider";
import type { EventNotificationMessage } from "@/types/websocket";

export interface WaitingNotification {
	readonly id: string;
	readonly runId: string;
	readonly projectId: string;
	readonly workflow: string;
	readonly prompt: string;
	readonly timestamp: string;
	readonly dismissing: boolean;
}

const AUTO_DISMISS_MS = 8000;
const FADE_OUT_MS = 250;

export function useWaitingNotifications() {
	const [notifications, setNotifications] = useState<
		readonly WaitingNotification[]
	>([]);
	const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
		new Map(),
	);

	const dismiss = useCallback((id: string) => {
		setNotifications((prev) =>
			prev.map((n) => (n.id === id ? { ...n, dismissing: true } : n)),
		);
		const existing = timersRef.current.get(id);
		if (existing) clearTimeout(existing);
		const fadeTimer = setTimeout(() => {
			setNotifications((prev) => prev.filter((n) => n.id !== id));
			timersRef.current.delete(id);
		}, FADE_OUT_MS);
		timersRef.current.set(`${id}-fade`, fadeTimer);
	}, []);

	const scheduleAutoDismiss = useCallback(
		(id: string) => {
			const timer = setTimeout(() => {
				dismiss(id);
			}, AUTO_DISMISS_MS);
			timersRef.current.set(id, timer);
		},
		[dismiss],
	);

	const { onEventNotification } = useWebSocket();

	useEffect(() => {
		const unsubscribe = onEventNotification((msg: EventNotificationMessage) => {
			if (msg.eventType !== "waiting_for_user") return;

			const data = msg.data as Record<string, unknown> | null;
			const prompt = (data?.prompt as string) ?? "Waiting for input...";
			const workflow = (msg.step as string) ?? "workflow";
			const id = `waiting-${msg.eventId}`;

			const notification: WaitingNotification = {
				id,
				runId: msg.runId,
				projectId: msg.projectId,
				workflow,
				prompt,
				timestamp: msg.createdAt,
				dismissing: false,
			};

			setNotifications((prev) => [...prev, notification]);
			scheduleAutoDismiss(id);
		});

		return unsubscribe;
	}, [onEventNotification, scheduleAutoDismiss]);

	// Cleanup all timers on unmount
	useEffect(() => {
		const timers = timersRef.current;
		return () => {
			for (const timer of timers.values()) {
				clearTimeout(timer);
			}
			timers.clear();
		};
	}, []);

	return { notifications, dismiss } as const;
}
