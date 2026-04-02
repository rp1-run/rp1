import { X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { WaitingNotification } from "@/hooks/useWaitingNotifications";
import { useWaitingNotifications } from "@/hooks/useWaitingNotifications";

function Toast({
	notification,
	onDismiss,
}: {
	readonly notification: WaitingNotification;
	readonly onDismiss: (id: string) => void;
}) {
	const navigate = useNavigate();

	return (
		<div
			role="alert"
			aria-label={`${notification.workflow}: ${notification.prompt}`}
			onClick={() => navigate(`/runs/${notification.runId}`)}
			className="rp1-notification-toast"
			style={{
				animation: notification.dismissing
					? "rp1-toast-out 250ms cubic-bezier(0.25, 0.1, 0.25, 1.0) forwards"
					: "rp1-toast-in 250ms cubic-bezier(0.25, 0.1, 0.25, 1.0) forwards",
			}}
		>
			<div className="rp1-notification-accent" />
			<div className="rp1-notification-body">
				<div className="rp1-notification-header">
					<span className="rp1-notification-title">
						{notification.workflow}
					</span>
					<button
						type="button"
						aria-label="Dismiss notification"
						onClick={(e) => {
							e.stopPropagation();
							onDismiss(notification.id);
						}}
						className="rp1-notification-close"
					>
						<X size={14} strokeWidth={1.5} />
					</button>
				</div>
				<p className="rp1-notification-message">{notification.prompt}</p>
			</div>
		</div>
	);
}

export function NotificationContainer() {
	const { notifications, dismiss } = useWaitingNotifications();

	if (notifications.length === 0) return null;

	return (
		<div className="rp1-notification-container">
			{notifications.map((n) => (
				<Toast key={n.id} notification={n} onDismiss={dismiss} />
			))}
		</div>
	);
}
