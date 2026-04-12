import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import { useWebSocket } from "@/providers/WebSocketProvider";
import type { NotificationMessage } from "@/types/websocket";

interface Toast {
	readonly id: number;
	readonly message: string;
	readonly route: string | null;
	readonly exiting: boolean;
}

const AUTO_DISMISS_MS = 6000;
const EXIT_ANIMATION_MS = 200;

function getDismissErrorMessage(response: Response): string {
	return `Failed to dismiss notification: ${response.statusText || `HTTP ${response.status}`}`;
}

export function NotificationContainer() {
	const [toasts, setToasts] = useState<readonly Toast[]>([]);
	const timersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(
		new Map(),
	);
	const navigate = useNavigate();
	const reducedMotion = usePrefersReducedMotion();
	const { onNotification } = useWebSocket();

	const removeToast = useCallback(
		(id: number) => {
			const timer = timersRef.current.get(id);
			if (timer) {
				clearTimeout(timer);
				timersRef.current.delete(id);
			}

			if (reducedMotion) {
				setToasts((prev) => prev.filter((t) => t.id !== id));
				return;
			}

			let shouldAnimateExit = false;
			setToasts((prev) => {
				const toast = prev.find((candidate) => candidate.id === id);
				if (!toast || toast.exiting) {
					return prev;
				}

				shouldAnimateExit = true;
				return prev.map((t) => (t.id === id ? { ...t, exiting: true } : t));
			});

			if (!shouldAnimateExit) {
				return;
			}

			setTimeout(() => {
				setToasts((prev) => prev.filter((t) => t.id !== id));
			}, EXIT_ANIMATION_MS);
		},
		[reducedMotion],
	);

	const scheduleAutoDismiss = useCallback(
		(id: number) => {
			const timer = setTimeout(() => {
				timersRef.current.delete(id);
				removeToast(id);
			}, AUTO_DISMISS_MS);
			timersRef.current.set(id, timer);
		},
		[removeToast],
	);

	useEffect(() => {
		const unsubscribe = onNotification((msg: NotificationMessage) => {
			if (msg.type === "notification:created") {
				const notification = msg.notification;
				const toast: Toast = {
					id: notification.id,
					message: notification.message,
					route: notification.route,
					exiting: false,
				};

				let shouldScheduleAutoDismiss = false;
				setToasts((prev) => {
					if (prev.some((candidate) => candidate.id === notification.id)) {
						return prev;
					}

					shouldScheduleAutoDismiss = true;
					return [...prev, toast];
				});

				if (shouldScheduleAutoDismiss) {
					scheduleAutoDismiss(notification.id);
				}
				return;
			}

			if (msg.type === "notification:dismissed") {
				removeToast(msg.notificationId);
			}
		});

		return unsubscribe;
	}, [onNotification, removeToast, scheduleAutoDismiss]);

	useEffect(() => {
		const currentTimers = timersRef.current;
		return () => {
			for (const timer of currentTimers.values()) {
				clearTimeout(timer);
			}
			currentTimers.clear();
		};
	}, []);

	const handleClick = useCallback(
		(toast: Toast) => {
			if (toast.route) {
				navigate(toast.route);
			}
			removeToast(toast.id);
		},
		[navigate, removeToast],
	);

	const handleDismiss = useCallback(
		async (id: number) => {
			try {
				const response = await fetch(`/api/v2/notifications/${id}/dismiss`, {
					method: "POST",
				});

				if (!response.ok) {
					throw new Error(getDismissErrorMessage(response));
				}

				removeToast(id);
			} catch (error) {
				console.warn(String(error));
			}
		},
		[removeToast],
	);

	if (toasts.length === 0) return null;

	return (
		<output className="rp1-notification-container" aria-live="polite">
			{toasts.map((toast) => (
				<div
					key={toast.id}
					className="rp1-notification-toast"
					style={{
						animation: toast.exiting
							? `rp1-toast-out ${EXIT_ANIMATION_MS}ms ease-in forwards`
							: "rp1-toast-in 200ms ease-out",
					}}
				>
					<div className="rp1-notification-accent" />
					{toast.route ? (
						<button
							type="button"
							className="rp1-notification-action"
							onClick={() => handleClick(toast)}
							aria-label={`${toast.message}. Click to navigate.`}
						>
							<div className="rp1-notification-body">
								<div className="rp1-notification-header">
									<span className="rp1-notification-title">
										{toast.message}
									</span>
								</div>
							</div>
						</button>
					) : (
						<div className="rp1-notification-action">
							<div className="rp1-notification-body">
								<div className="rp1-notification-header">
									<span className="rp1-notification-title">
										{toast.message}
									</span>
								</div>
							</div>
						</div>
					)}
					<button
						type="button"
						className="rp1-notification-close"
						onClick={() => {
							void handleDismiss(toast.id);
						}}
						aria-label="Dismiss notification"
					>
						&times;
					</button>
				</div>
			))}
		</output>
	);
}
