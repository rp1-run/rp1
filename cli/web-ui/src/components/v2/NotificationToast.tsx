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

			setToasts((prev) =>
				prev.map((t) => (t.id === id ? { ...t, exiting: true } : t)),
			);

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
			if (msg.type !== "notification:created") return;

			const notification = msg.notification;
			const toast: Toast = {
				id: notification.id,
				message: notification.message,
				route: notification.route,
				exiting: false,
			};

			setToasts((prev) => [...prev, toast]);
			scheduleAutoDismiss(notification.id);
		});

		return unsubscribe;
	}, [onNotification, scheduleAutoDismiss]);

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
		(e: React.MouseEvent, id: number) => {
			e.stopPropagation();
			removeToast(id);
		},
		[removeToast],
	);

	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent, toast: Toast) => {
			if (e.key === "Enter" || e.key === " ") {
				e.preventDefault();
				handleClick(toast);
			}
		},
		[handleClick],
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
					onClick={() => handleClick(toast)}
					onKeyDown={(e) => handleKeyDown(e, toast)}
					role="button"
					tabIndex={0}
					aria-label={
						toast.route ? `${toast.message}. Click to navigate.` : toast.message
					}
				>
					<div className="rp1-notification-accent" />
					<div className="rp1-notification-body">
						<div className="rp1-notification-header">
							<span className="rp1-notification-title">{toast.message}</span>
							<button
								type="button"
								className="rp1-notification-close"
								onClick={(e) => handleDismiss(e, toast.id)}
								aria-label="Dismiss notification"
							>
								&times;
							</button>
						</div>
					</div>
				</div>
			))}
		</output>
	);
}
