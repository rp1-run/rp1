/**
 * Daemon lifecycle manager.
 * Handles starting, stopping, and connecting to the background daemon service.
 */

import { spawn } from "node:child_process";
import { readFile, unlink, writeFile } from "node:fs/promises";
import { ensureConfigDir, getPidFilePath } from "./config-dir";
import {
	checkHealth,
	createConnection,
	type DaemonConnection,
	type DaemonStatus,
	getDaemonStatus,
	stopDaemon as stopDaemonIpc,
} from "./ipc";

/**
 * PID file contents.
 */
interface PidFileData {
	readonly port: number;
	readonly pid: number;
}

/**
 * Result of daemon start operation.
 */
export interface DaemonStartResult {
	readonly connection: DaemonConnection;
	readonly wasRunning: boolean;
}

/**
 * Default port for the daemon.
 */
const DEFAULT_PORT = 7710;

/**
 * Maximum time to wait for daemon to become healthy.
 */
const HEALTH_CHECK_TIMEOUT_MS = 5000;

/**
 * Interval between health check polls.
 */
const HEALTH_CHECK_INTERVAL_MS = 100;

/**
 * Read and parse the PID file.
 */
async function readPidFile(): Promise<PidFileData | null> {
	try {
		const content = await readFile(getPidFilePath(), "utf-8");
		const lines = content.trim().split("\n");

		if (lines.length < 2) {
			return null;
		}

		const port = Number.parseInt(lines[0], 10);
		const pid = Number.parseInt(lines[1], 10);

		if (Number.isNaN(port) || Number.isNaN(pid)) {
			return null;
		}

		return { port, pid };
	} catch {
		return null;
	}
}

/**
 * Write the PID file.
 */
async function writePidFile(data: PidFileData): Promise<void> {
	await ensureConfigDir();
	const content = `${data.port}\n${data.pid}\n`;
	await writeFile(getPidFilePath(), content, { mode: 0o600 });
}

/**
 * Remove the PID file.
 */
async function removePidFile(): Promise<void> {
	try {
		await unlink(getPidFilePath());
	} catch {
		// Ignore errors
	}
}

/**
 * Check if a process is running by PID.
 * Uses kill -0 which checks if process exists without sending a signal.
 */
function isProcessRunning(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}

/**
 * Check if a port is available.
 */
async function isPortAvailable(port: number): Promise<boolean> {
	try {
		const server = Bun.serve({
			port,
			hostname: "127.0.0.1",
			fetch() {
				return new Response("test");
			},
		});
		server.stop();
		return true;
	} catch {
		return false;
	}
}

/**
 * Wait for the daemon to become healthy.
 */
async function waitForHealth(
	conn: DaemonConnection,
	timeoutMs: number = HEALTH_CHECK_TIMEOUT_MS,
): Promise<boolean> {
	const startTime = Date.now();

	while (Date.now() - startTime < timeoutMs) {
		const health = await checkHealth(conn);
		if (health) {
			return true;
		}
		await new Promise((resolve) =>
			setTimeout(resolve, HEALTH_CHECK_INTERVAL_MS),
		);
	}

	return false;
}

/**
 * Find the rp1 executable path.
 * Uses process.execPath for compiled binary, falls back to "rp1" in PATH.
 */
function getRp1Executable(): string {
	// If running as compiled binary, use the same executable
	if (process.execPath.endsWith("rp1")) {
		return process.execPath;
	}
	// Otherwise use rp1 from PATH (development mode)
	return "rp1";
}

/**
 * Spawn a new daemon process.
 */
async function spawnDaemon(port: number): Promise<number> {
	const rp1Path = getRp1Executable();

	const proc = spawn(rp1Path, ["_daemon-server", "--port", String(port)], {
		detached: true,
		stdio: "ignore",
		env: {
			...process.env,
			RP1_DAEMON_MODE: "true",
		},
	});

	// Unref to allow parent process to exit independently
	proc.unref();

	const pid = proc.pid;
	if (!pid) {
		throw new Error("Failed to spawn daemon process");
	}

	return pid;
}

/**
 * Ensure daemon is running, starting it if necessary.
 * Returns connection to the daemon.
 */
export async function ensureDaemon(
	port: number = DEFAULT_PORT,
): Promise<DaemonStartResult> {
	const pidData = await readPidFile();

	if (pidData) {
		if (isProcessRunning(pidData.pid)) {
			const conn = createConnection(pidData.port);
			const health = await checkHealth(conn);

			if (health) {
				return { connection: conn, wasRunning: true };
			}

			const healthy = await waitForHealth(conn, 2000);
			if (healthy) {
				return { connection: conn, wasRunning: true };
			}
		}

		await removePidFile();
	}

	const portAvailable = await isPortAvailable(port);
	if (!portAvailable) {
		const conn = createConnection(port);
		const health = await checkHealth(conn);
		if (health) {
			await writePidFile({ port, pid: process.pid }); // We don't know the real PID
			return { connection: conn, wasRunning: true };
		}

		throw new Error(
			`Port ${port} is in use and not responding as a daemon. Try a different port.`,
		);
	}

	const pid = await spawnDaemon(port);
	await writePidFile({ port, pid });

	const conn = createConnection(port);
	const healthy = await waitForHealth(conn);

	if (!healthy) {
		await removePidFile();
		throw new Error(
			"Daemon started but failed to become healthy within timeout",
		);
	}

	return { connection: conn, wasRunning: false };
}

/**
 * Stop the running daemon.
 */
export async function stopDaemon(): Promise<boolean> {
	const pidData = await readPidFile();

	if (!pidData) {
		return false; // No daemon running
	}

	const conn = createConnection(pidData.port);

	const stopped = await stopDaemonIpc(conn);

	if (!stopped && isProcessRunning(pidData.pid)) {
		try {
			process.kill(pidData.pid, "SIGTERM");
		} catch {
			// Ignore kill errors
		}
	}

	await new Promise((resolve) => setTimeout(resolve, 500));
	await removePidFile();

	return true;
}

/**
 * Get status of the daemon.
 */
export async function getStatus(): Promise<DaemonStatus> {
	const pidData = await readPidFile();

	if (!pidData) {
		return { running: false };
	}

	if (!isProcessRunning(pidData.pid)) {
		await removePidFile();
		return { running: false };
	}

	const conn = createConnection(pidData.port);
	return getDaemonStatus(conn);
}

/**
 * Restart the daemon.
 */
export async function restartDaemon(
	port: number = DEFAULT_PORT,
): Promise<DaemonStartResult> {
	await stopDaemon();
	await new Promise((resolve) => setTimeout(resolve, 1000));
	return ensureDaemon(port);
}

/**
 * Connect to existing daemon if running.
 */
export async function connectToDaemon(): Promise<DaemonConnection | null> {
	const pidData = await readPidFile();

	if (!pidData || !isProcessRunning(pidData.pid)) {
		return null;
	}

	const conn = createConnection(pidData.port);
	const health = await checkHealth(conn);

	return health ? conn : null;
}
