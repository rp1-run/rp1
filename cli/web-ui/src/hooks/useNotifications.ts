import { useCallback, useEffect, useRef, useState } from "react";
import { useWebSocket } from "@/providers/WebSocketProvider";
import { useReconnectRecovery } from "./useReconnectRecovery";

export type NotificationAttentionLevel =
	| "action_required"
	| "attention"
	| "info";

export interface NotificationListItem {
	readonly id: number;
	readonly message: string;
	readonly sourceType: "run" | "agent" | "system";
	readonly sourceId: string | null;
	readonly route: string | null;
	readonly projectId: string | null;
	readonly createdAt: string;
	readonly harness: string | null;
	readonly runCommand: string | null;
	readonly runName: string | null;
	readonly projectName: string | null;
	readonly attentionLevel: NotificationAttentionLevel;
}

export interface NotificationsSummary {
	readonly totalCount: number;
	readonly actionRequiredCount: number;
	readonly attentionCount: number;
	readonly informationalCount: number;
}

interface NotificationsListResponse {
	notifications: NotificationListItem[];
	total: number;
	summary: NotificationsSummary;
}

const NOTIFICATIONS_PAGE_SIZE = 50;

export interface UseNotificationsResult {
	notifications: NotificationListItem[];
	summary: NotificationsSummary;
	isLoading: boolean;
	error: Error | null;
	refetch: () => void;
	dismissNotification: (id: number) => Promise<void>;
}

export const EMPTY_NOTIFICATIONS_SUMMARY: NotificationsSummary = {
	totalCount: 0,
	actionRequiredCount: 0,
	attentionCount: 0,
	informationalCount: 0,
};

function getResponseErrorMessage(response: Response, prefix: string): string {
	return `${prefix}: ${response.statusText || `HTTP ${response.status}`}`;
}

function buildNotificationsUrl(
	offset: number,
	projectId: string | null,
): string {
	const params = new URLSearchParams({
		limit: String(NOTIFICATIONS_PAGE_SIZE),
		offset: String(offset),
	});
	if (projectId) {
		params.set("projectId", projectId);
	}

	return `/api/v2/notifications?${params.toString()}`;
}

export function useNotifications(): UseNotificationsResult {
	const [notifications, setNotifications] = useState<NotificationListItem[]>(
		[],
	);
	const [summary, setSummary] = useState<NotificationsSummary>(
		EMPTY_NOTIFICATIONS_SUMMARY,
	);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<Error | null>(null);
	const latestRequestIdRef = useRef(0);
	const { onNotification, projectId } = useWebSocket();

	const fetchNotifications = useCallback(
		async ({ showLoading = false }: { showLoading?: boolean } = {}) => {
			const requestId = ++latestRequestIdRef.current;
			const currentProjectId = projectId;

			if (showLoading) {
				setIsLoading(true);
			}

			try {
				const allNotifications: NotificationListItem[] = [];
				let total = 0;
				let offset = 0;
				let nextSummary = EMPTY_NOTIFICATIONS_SUMMARY;

				do {
					const response = await fetch(
						buildNotificationsUrl(offset, currentProjectId),
					);
					if (!response.ok) {
						throw new Error(
							getResponseErrorMessage(
								response,
								"Failed to fetch notifications",
							),
						);
					}

					const data = (await response.json()) as NotificationsListResponse;
					if (offset === 0) {
						total = data.total;
						nextSummary = data.summary;
						if (requestId !== latestRequestIdRef.current) {
							return;
						}
						setSummary(data.summary);
					}

					allNotifications.push(...data.notifications);
					offset += data.notifications.length;

					if (data.notifications.length === 0) {
						break;
					}
				} while (allNotifications.length < total);

				if (allNotifications.length < total) {
					throw new Error(
						"Failed to fetch notifications: incomplete paginated response",
					);
				}

				if (requestId !== latestRequestIdRef.current) {
					return;
				}
				setNotifications(allNotifications);
				setSummary(nextSummary);
				setError(null);
			} catch (fetchError) {
				if (requestId !== latestRequestIdRef.current) {
					return;
				}
				setError(
					fetchError instanceof Error
						? fetchError
						: new Error(String(fetchError)),
				);
			} finally {
				if (showLoading && requestId === latestRequestIdRef.current) {
					setIsLoading(false);
				}
			}
		},
		[projectId],
	);

	useEffect(() => {
		void fetchNotifications({ showLoading: true });
	}, [fetchNotifications]);

	useEffect(() => {
		return onNotification((message) => {
			if (
				message.type === "notification:created" ||
				message.type === "notification:dismissed"
			) {
				void fetchNotifications();
			}
		});
	}, [fetchNotifications, onNotification]);

	useReconnectRecovery(fetchNotifications);

	const refetch = useCallback(() => {
		void fetchNotifications({ showLoading: true });
	}, [fetchNotifications]);

	const dismissNotification = useCallback(
		async (id: number) => {
			try {
				const response = await fetch(`/api/v2/notifications/${id}/dismiss`, {
					method: "POST",
				});

				if (!response.ok) {
					throw new Error(
						getResponseErrorMessage(response, "Failed to dismiss notification"),
					);
				}

				setError(null);
				await fetchNotifications();
			} catch (dismissError) {
				const nextError =
					dismissError instanceof Error
						? dismissError
						: new Error(String(dismissError));
				setError(nextError);
				throw nextError;
			}
		},
		[fetchNotifications],
	);

	return {
		notifications,
		summary,
		isLoading,
		error,
		refetch,
		dismissNotification,
	};
}
