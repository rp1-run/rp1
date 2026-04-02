export interface WaitingNotification {
	readonly id: string;
	readonly runId: string;
	readonly projectId: string;
	readonly workflow: string;
	readonly prompt: string;
	readonly timestamp: string;
	readonly dismissing: boolean;
}

export function useWaitingNotifications() {
	return {
		notifications: [] as readonly WaitingNotification[],
		dismiss: (_id: string) => {},
	} as const;
}
