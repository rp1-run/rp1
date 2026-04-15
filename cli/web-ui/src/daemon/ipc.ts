/**
 * HTTP-based IPC for communicating with the daemon.
 * Provides type-safe request/response handling for daemon operations.
 */

import type { ProjectEntry } from "../server/registry";

/**
 * Response from daemon health check.
 */
export interface HealthResponse {
	readonly status: "ok";
	readonly uptime: number;
	readonly port: number;
	readonly projectCount: number;
	readonly version?: string;
}

/**
 * Response from project registration.
 */
export interface RegisterResponse {
	readonly project: ProjectEntry;
	readonly url: string;
}

/**
 * Error response from daemon.
 */
export interface ErrorResponse {
	readonly error: string;
}

/**
 * Daemon connection info for IPC.
 */
export interface DaemonConnection {
	readonly port: number;
	readonly baseUrl: string;
}

/**
 * Create a daemon connection for the given port.
 */
export function createConnection(port: number): DaemonConnection {
	return {
		port,
		baseUrl: `http://127.0.0.1:${port}`,
	};
}

/**
 * Check if the daemon is healthy.
 */
export async function checkHealth(
	conn: DaemonConnection,
): Promise<HealthResponse | null> {
	try {
		const response = await fetch(`${conn.baseUrl}/api/v2/health`, {
			method: "GET",
			signal: AbortSignal.timeout(2000),
		});

		if (!response.ok) {
			return null;
		}

		return (await response.json()) as HealthResponse;
	} catch {
		return null;
	}
}

/**
 * Register a project with the daemon.
 */
export async function registerProjectWithDaemon(
	conn: DaemonConnection,
	projectPath: string,
): Promise<RegisterResponse> {
	const response = await fetch(`${conn.baseUrl}/api/v2/projects`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ path: projectPath }),
		signal: AbortSignal.timeout(5000),
	});

	if (!response.ok) {
		const error = (await response.json()) as ErrorResponse;
		throw new Error(error.error || "Failed to register project");
	}

	return (await response.json()) as RegisterResponse;
}

/**
 * Stop the daemon.
 */
export async function stopDaemon(conn: DaemonConnection): Promise<boolean> {
	try {
		const response = await fetch(`${conn.baseUrl}/api/v2/shutdown`, {
			method: "POST",
			signal: AbortSignal.timeout(5000),
		});
		return response.ok;
	} catch {
		return false;
	}
}

/**
 * Typed event notification payload for the new event-sourced IPC format.
 * Uses `type: "event"` as discriminator to distinguish from legacy formats.
 */
export interface EventNotificationPayload {
	readonly type: "event";
	readonly eventType: string;
	readonly eventId: number;
	readonly runId: string;
	readonly projectPath: string;
	readonly projectId?: string;
	readonly rp1ProjectRoot?: string;
	readonly featureId: string;
	readonly step: string | null;
	readonly data: Record<string, unknown> | null;
	readonly createdAt: string;
}

/**
 * Notify the daemon of a typed event for immediate WebSocket broadcast.
 * Sends the new event envelope format with `type: "event"` discriminator.
 * Fails silently if daemon is not running - this is expected behavior.
 */
export async function notifyEvent(
	conn: DaemonConnection,
	payload: Omit<EventNotificationPayload, "type">,
): Promise<boolean> {
	try {
		const response = await fetch(`${conn.baseUrl}/api/v2/status/notify`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				type: "event",
				...payload,
			}),
			signal: AbortSignal.timeout(1000),
		});
		return response.ok;
	} catch {
		return false;
	}
}

/**
 * Notification payload for real-time WebSocket broadcast via daemon.
 */
export interface NotificationNotifyPayload {
	readonly type: "notification";
	readonly notification: {
		readonly id: number;
		readonly message: string;
		readonly sourceType: string;
		readonly sourceId: string | null;
		readonly route: string | null;
		readonly projectId: string | null;
		readonly createdAt: string;
	};
}

/**
 * Notify the daemon of a new notification for immediate WebSocket broadcast.
 * Fails silently if daemon is not running - this is expected behavior.
 */
export async function notifyNotification(
	conn: DaemonConnection,
	notification: NotificationNotifyPayload["notification"],
): Promise<boolean> {
	try {
		const response = await fetch(
			`${conn.baseUrl}/api/v2/notifications/notify`,
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					type: "notification",
					notification,
				} satisfies NotificationNotifyPayload),
				signal: AbortSignal.timeout(1000),
			},
		);
		return response.ok;
	} catch {
		return false;
	}
}

/**
 * Get daemon status.
 */
export interface DaemonStatus {
	readonly running: boolean;
	readonly port?: number;
	readonly uptime?: number;
	readonly projectCount?: number;
}

export async function getDaemonStatus(
	conn: DaemonConnection,
): Promise<DaemonStatus> {
	const health = await checkHealth(conn);

	if (!health) {
		return { running: false };
	}

	return {
		running: true,
		port: health.port,
		uptime: health.uptime,
		projectCount: health.projectCount,
	};
}
