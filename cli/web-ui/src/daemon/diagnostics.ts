import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { getConfigDir } from "./config-dir";

/**
 * T6: Diagnostic Event Types for daemon health checks and asset availability.
 * Supported event types:
 * - asset_check_attempt: Asset availability check attempt with timing and result
 * - asset_check_complete: Asset check final result after all retries
 * - database_init_complete: Database initialization completion with timing
 * - health_check_complete: Health endpoint handler completion with all timings
 * - health_check_poll: Individual health check polling attempt
 * - health_check_succeeded: Successful health check during polling
 * - health_check_timeout: Health check polling timeout reached
 */
export type DiagnosticEventType =
	| "asset_check_attempt"
	| "asset_check_complete"
	| "database_init_complete"
	| "health_check_complete"
	| "health_check_poll"
	| "health_check_succeeded"
	| "health_check_timeout"
	| string;

/**
 * Structured diagnostic event data for daemon health checks.
 */
export interface DiagnosticEventData extends Record<string, unknown> {
	event_type?: DiagnosticEventType;
	timestamp?: string;
	attempt_count?: number;
	timing_ms?: number;
	correlation_id?: string;
	[key: string]: unknown;
}

function getDaemonLogPath(): string {
	return join(getConfigDir(), "daemon.log");
}

function normalizeError(error: unknown): Record<string, string> {
	if (error instanceof Error) {
		return {
			name: error.name,
			message: error.message,
			stack: error.stack ?? "",
		};
	}

	return {
		name: typeof error,
		message: String(error),
		stack: "",
	};
}

export function logDaemonEvent(
	event: DiagnosticEventType,
	data: DiagnosticEventData = {},
): void {
	try {
		mkdirSync(getConfigDir(), { recursive: true });
		appendFileSync(
			getDaemonLogPath(),
			`${JSON.stringify({
				ts: new Date().toISOString(),
				pid: process.pid,
				event,
				...data,
			})}\n`,
			"utf-8",
		);
	} catch {
		// Logging must never interfere with daemon operation.
	}
}

export function logDaemonError(event: string, error: unknown): void {
	logDaemonEvent(event, normalizeError(error));
}
