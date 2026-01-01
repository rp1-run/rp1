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
		const response = await fetch(`${conn.baseUrl}/api/health`, {
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
	const response = await fetch(`${conn.baseUrl}/api/projects/register`, {
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
		const response = await fetch(`${conn.baseUrl}/api/shutdown`, {
			method: "POST",
			signal: AbortSignal.timeout(5000),
		});
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
