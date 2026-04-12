import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { getConfigDir } from "./config-dir";

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
	event: string,
	data: Record<string, unknown> = {},
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
