/**
 * Daemon lifecycle manager.
 * Handles starting, stopping, and connecting to the background daemon service.
 * All lifecycle mutations execute under the config-dir lifecycle lock.
 */

import { execSync, spawn } from "node:child_process";
import { readFile, unlink, writeFile } from "node:fs/promises";
import { ensureConfigDir, getPidFilePath } from "./config-dir";
import { logDaemonEvent } from "./diagnostics";
import { resolveDaemonExecutablePath } from "./executable";
import {
	checkHealth,
	createConnection,
	type DaemonConnection,
	type DaemonStatus,
	getDaemonStatus,
	type HealthResponse,
	stopDaemon as stopDaemonIpc,
} from "./ipc";
import { withLifecycleLock } from "./lifecycle-lock";

/**
 * Check if a running daemon needs restart based on version.
 * Dev versions (containing "-dev") always restart to pick up source changes.
 * Production versions restart only on mismatch.
 */
function shouldRestartForVersion(
	health: HealthResponse,
	cliVersion: string,
): boolean {
	if (!health.version) return false;
	if (cliVersion.includes("-dev")) return true;
	return health.version !== cliVersion;
}

/**
 * PID file contents.
 */
interface PidFileData {
	readonly port: number;
	readonly pid: number;
}

/**
 * Explicit lifecycle action for daemon start operations.
 */
export type DaemonStartAction = "reused" | "started" | "replaced";

/**
 * Explicit lifecycle action for daemon stop operations.
 */
export type DaemonStopAction = "stopped" | "not_running";

/**
 * Reason tag explaining why a lifecycle action was taken.
 */
export type DaemonLifecycleReason =
	| "stale_pid"
	| "missing_pid"
	| "version_mismatch"
	| "unhealthy_daemon";

/**
 * Result of daemon start operation with explicit lifecycle action.
 */
export interface DaemonStartResult {
	readonly connection: DaemonConnection;
	readonly action: DaemonStartAction;
	readonly reason?: DaemonLifecycleReason;
	/** Derived from action for backward compatibility: true when action is "reused" or "replaced". */
	readonly wasRunning: boolean;
}

export interface DaemonEnsureOptions {
	readonly cliVersion?: string;
	readonly executablePath?: string;
}

/**
 * Result of daemon stop operation with explicit lifecycle action.
 */
export interface DaemonStopResult {
	readonly action: DaemonStopAction;
}

/**
 * Error thrown when the requested port is occupied by a non-rp1 process.
 * Arcade command converts this to a PortInUseError CLIError for user-facing output.
 */
export class DaemonPortConflictError extends Error {
	readonly port: number;

	constructor(port: number) {
		super(
			`Port ${port} is in use by a non-rp1 process. ` +
				`Use a different port or stop the process occupying port ${port}.`,
		);
		this.name = "DaemonPortConflictError";
		this.port = port;
	}
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
 * Time to wait for graceful exit after SIGTERM before escalating to SIGKILL.
 */
const STOP_GRACEFUL_TIMEOUT_MS = 3000;

/**
 * Time to wait for process exit after SIGKILL.
 */
const STOP_KILL_TIMEOUT_MS = 2000;

/**
 * Interval between process exit polls.
 */
const PROCESS_EXIT_POLL_INTERVAL_MS = 100;

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
export function isProcessRunning(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}

/**
 * Wait for a process to exit by actively polling.
 * Returns true if the process exited within the timeout, false otherwise.
 */
export async function waitForProcessExit(
	pid: number,
	timeoutMs: number,
): Promise<boolean> {
	const start = Date.now();
	while (Date.now() - start < timeoutMs) {
		if (!isProcessRunning(pid)) return true;
		await new Promise((resolve) =>
			setTimeout(resolve, PROCESS_EXIT_POLL_INTERVAL_MS),
		);
	}
	return !isProcessRunning(pid);
}

/**
 * Force-kill a process. Uses SIGKILL on Unix, taskkill /F on Windows.
 */
export function forceKillProcess(pid: number): void {
	try {
		if (process.platform === "win32") {
			execSync(`taskkill /F /PID ${pid}`, { stdio: "ignore" });
		} else {
			process.kill(pid, "SIGKILL");
		}
	} catch {
		// Process may have already exited
	}
}

/**
 * Resolve the PID of the process owning a port via lsof.
 * Returns null if the PID cannot be determined.
 */
function resolvePortOwnerPid(port: number): number | null {
	if (process.platform === "win32") return null;
	try {
		const output = execSync(`lsof -ti:${port} -sTCP:LISTEN`, {
			encoding: "utf-8",
			timeout: 3000,
		}).trim();
		const pid = Number.parseInt(output.split("\n")[0], 10);
		return Number.isNaN(pid) ? null : pid;
	} catch {
		return null;
	}
}

/**
 * Check if a port is available.
 */
async function isPortAvailable(port: number): Promise<boolean> {
	try {
		const server = Bun.serve({
			port,
			hostname: process.env.RP1_ARCADE_HOST ?? "127.0.0.1",
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
 * Wait for a port to become free by polling isPortAvailable.
 * Returns true if the port became available within the timeout.
 */
async function waitForPortFree(
	port: number,
	timeoutMs: number,
): Promise<boolean> {
	const start = Date.now();
	while (Date.now() - start < timeoutMs) {
		if (await isPortAvailable(port)) return true;
		await new Promise((resolve) =>
			setTimeout(resolve, PROCESS_EXIT_POLL_INTERVAL_MS),
		);
	}
	return isPortAvailable(port);
}

/**
 * Stop an untracked daemon via IPC and wait for the port to free.
 * Used when resolvePortOwnerPid returns null (Windows, no lsof).
 * Returns true if the port became free within the grace period.
 */
async function stopUntrackedDaemon(
	conn: DaemonConnection,
	port: number,
): Promise<boolean> {
	await stopDaemonIpc(conn);
	return waitForPortFree(port, STOP_GRACEFUL_TIMEOUT_MS);
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
 * Spawn a new daemon process.
 */
async function spawnDaemon(
	port: number,
	options: DaemonEnsureOptions,
): Promise<number> {
	const rp1Path = resolveDaemonExecutablePath({
		explicitPath: options.executablePath,
	});
	logDaemonEvent("spawn_requested", { port, rp1Path });

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

	logDaemonEvent("spawned", { port, daemonPid: pid });

	return pid;
}

/**
 * Stop a daemon process using IPC shutdown then signal escalation.
 * Used internally for replacement and stop flows.
 */
async function stopDaemonProcess(pidData: PidFileData): Promise<void> {
	const conn = createConnection(pidData.port);
	await stopDaemonIpc(conn);

	if (isProcessRunning(pidData.pid)) {
		try {
			process.kill(pidData.pid, "SIGTERM");
		} catch {
			// Process may have already exited
		}

		const exited = await waitForProcessExit(
			pidData.pid,
			STOP_GRACEFUL_TIMEOUT_MS,
		);

		if (!exited) {
			forceKillProcess(pidData.pid);
			await waitForProcessExit(pidData.pid, STOP_KILL_TIMEOUT_MS);
		}
	}

	await removePidFile();
}

/**
 * Build a DaemonStartResult with derived wasRunning field.
 */
function makeStartResult(
	connection: DaemonConnection,
	action: DaemonStartAction,
	reason?: DaemonLifecycleReason,
): DaemonStartResult {
	return {
		connection,
		action,
		reason,
		wasRunning: action !== "started",
	};
}

/**
 * Resolve the default CLI version for lock metadata when not provided.
 */
function resolveLockVersion(cliVersion?: string): string {
	return cliVersion ?? "unknown";
}

function normalizeEnsureOptions(
	options?: DaemonEnsureOptions | string,
): DaemonEnsureOptions {
	return typeof options === "string"
		? { cliVersion: options }
		: (options ?? {});
}

/**
 * Ensure daemon is running, starting it if necessary.
 * Executes under the lifecycle lock so all state reads happen after acquisition.
 * Restarts the daemon if the version has changed or if running a dev build.
 * Returns connection to the daemon with explicit lifecycle action.
 */
export async function ensureDaemon(
	port: number = DEFAULT_PORT,
	options?: DaemonEnsureOptions | string,
): Promise<DaemonStartResult> {
	const ensureOptions = normalizeEnsureOptions(options);
	return withLifecycleLock(
		{
			operation: "ensureDaemon",
			port,
			cliVersion: resolveLockVersion(ensureOptions.cliVersion),
		},
		async () => {
			// Step 1: Read PID file under lock and probe health.
			const pidData = await readPidFile();
			let reason: DaemonLifecycleReason | undefined;
			let replacing = false;

			if (pidData) {
				if (isProcessRunning(pidData.pid)) {
					const conn = createConnection(pidData.port);
					const health = await checkHealth(conn);

					if (health) {
						// Step 2: Healthy and tracked daemon found.
						if (
							ensureOptions.cliVersion &&
							shouldRestartForVersion(health, ensureOptions.cliVersion)
						) {
							logDaemonEvent("restart_for_version", {
								requestedPort: port,
								daemonPort: pidData.port,
								daemonPid: pidData.pid,
								daemonVersion: health.version,
								cliVersion: ensureOptions.cliVersion,
							});
							console.error(
								`[rp1] Daemon version ${health.version} differs from CLI ${ensureOptions.cliVersion}. Replacing...`,
							);
							await stopDaemonProcess(pidData);
							reason = "version_mismatch";
							replacing = true;
						} else {
							// Compatible and healthy → reuse.
							if (pidData.port !== port) {
								console.error(
									`[rp1] Daemon already running on port ${pidData.port} (requested ${port}). Using existing daemon.`,
								);
							}
							logDaemonEvent("daemon_reused", {
								port: pidData.port,
								pid: pidData.pid,
							});
							return makeStartResult(conn, "reused");
						}
					} else {
						// Process running but health check failed — wait briefly.
						const healthy = await waitForHealth(conn, 2000);
						if (healthy) {
							if (pidData.port !== port) {
								console.error(
									`[rp1] Daemon already running on port ${pidData.port} (requested ${port}). Using existing daemon.`,
								);
							}
							logDaemonEvent("daemon_reused", {
								port: pidData.port,
								pid: pidData.pid,
								afterWait: true,
							});
							return makeStartResult(conn, "reused");
						}
						// Still unhealthy → stop and replace.
						logDaemonEvent("replacing_unhealthy_daemon", {
							port: pidData.port,
							pid: pidData.pid,
						});
						await stopDaemonProcess(pidData);
						reason = "unhealthy_daemon";
						replacing = true;
					}
				} else {
					// PID file exists but process is gone → stale PID.
					logDaemonEvent("stale_pid_cleanup", {
						port: pidData.port,
						pid: pidData.pid,
					});
					await removePidFile();
					reason = "stale_pid";
				}
			}

			// Step 3: If not replacing, check whether the port is available.
			if (!replacing) {
				const portFree = await isPortAvailable(port);
				if (!portFree) {
					// Port is occupied — check if a healthy rp1 daemon is on it.
					const conn = createConnection(port);
					const health = await checkHealth(conn);

					if (health) {
						// Step 3a: Healthy rp1 daemon on port without PID tracking → repair ownership.
						const repairReason = reason ?? "missing_pid";

						if (
							ensureOptions.cliVersion &&
							shouldRestartForVersion(health, ensureOptions.cliVersion)
						) {
							// Incompatible version — stop the untracked daemon and replace.
							const realPid = resolvePortOwnerPid(port);
							if (realPid) {
								await stopDaemonProcess({ port, pid: realPid });
							} else {
								// No PID available — IPC shutdown + wait for port to free.
								const freed = await stopUntrackedDaemon(conn, port);
								if (!freed) {
									throw new Error(
										`Failed to stop untracked daemon on port ${port} for version replacement`,
									);
								}
							}
							reason = "version_mismatch";
							replacing = true;
						} else {
							// Compatible — repair PID file and reuse.
							const realPid = resolvePortOwnerPid(port);
							if (realPid) {
								await writePidFile({ port, pid: realPid });
								logDaemonEvent("pid_repaired", {
									port,
									pid: realPid,
									reason: repairReason,
								});
							}
							logDaemonEvent("daemon_reused", {
								port,
								reason: repairReason,
								repaired: true,
							});
							return makeStartResult(conn, "reused", repairReason);
						}
					} else {
						// Step 5: Port occupied by a non-rp1 process → raise PortInUseError.
						logDaemonEvent("foreign_port_conflict", { port });
						throw new DaemonPortConflictError(port);
					}
				}
			}

			// Step 6: Spawn a new daemon, wait for health, and write the PID file.
			const pid = await spawnDaemon(port, ensureOptions);
			await writePidFile({ port, pid });

			const conn = createConnection(port);
			const healthy = await waitForHealth(conn);

			if (!healthy) {
				await removePidFile();
				throw new Error(
					"Daemon started but failed to become healthy within timeout",
				);
			}

			const action: DaemonStartAction = replacing ? "replaced" : "started";
			logDaemonEvent(replacing ? "daemon_replaced" : "daemon_started", {
				port,
				pid,
				reason,
			});
			return makeStartResult(conn, action, reason);
		},
	);
}

/**
 * Stop the running daemon with SIGTERM -> SIGKILL escalation.
 * Executes under the lifecycle lock. Recovers from stale or missing PID state
 * by probing the default port for a live rp1 daemon.
 */
export async function stopDaemon(
	port: number = DEFAULT_PORT,
): Promise<DaemonStopResult> {
	return withLifecycleLock(
		{
			operation: "stopDaemon",
			port,
			cliVersion: "unknown",
		},
		async () => {
			const pidData = await readPidFile();

			if (pidData) {
				logDaemonEvent("stop_requested", {
					port: pidData.port,
					daemonPid: pidData.pid,
				});
				await stopDaemonProcess(pidData);
				return { action: "stopped" as const };
			}

			// No PID file — attempt recovery by probing the port for a live rp1 daemon.
			const conn = createConnection(port);
			const health = await checkHealth(conn);

			if (health) {
				const realPid = resolvePortOwnerPid(port);
				if (realPid) {
					logDaemonEvent("stop_requested", {
						port,
						daemonPid: realPid,
						recoveredFromMissingPid: true,
					});
					await stopDaemonProcess({ port, pid: realPid });
					return { action: "stopped" as const };
				}
				// Could not resolve PID — IPC shutdown + wait for port to free.
				const freed = await stopUntrackedDaemon(conn, port);
				if (!freed) {
					logDaemonEvent("stop_port_still_occupied", { port });
				}
				return { action: "stopped" as const };
			}

			return { action: "not_running" as const };
		},
	);
}

/**
 * Get status of the daemon.
 * Recovers from stale or missing PID state by probing the port for a live daemon.
 */
export async function getStatus(
	port: number = DEFAULT_PORT,
): Promise<DaemonStatus> {
	const pidData = await readPidFile();

	if (pidData) {
		if (!isProcessRunning(pidData.pid)) {
			await removePidFile();
			// Fall through to port-based recovery below.
		} else {
			const conn = createConnection(pidData.port);
			return getDaemonStatus(conn);
		}
	}

	// Recovery fallback: probe the port for a live rp1 daemon.
	const conn = createConnection(port);
	const health = await checkHealth(conn);

	if (health) {
		// Repair PID file so subsequent calls have accurate tracking.
		const realPid = resolvePortOwnerPid(port);
		if (realPid) {
			await writePidFile({ port, pid: realPid });
			logDaemonEvent("pid_repaired", {
				port,
				pid: realPid,
				reason: "status_recovery",
			});
		}
		return getDaemonStatus(conn);
	}

	return { running: false };
}

/**
 * Restart the daemon. Ensures old process is fully terminated before starting new one.
 * Executes under the lifecycle lock.
 */
export async function restartDaemon(
	port: number = DEFAULT_PORT,
	options?: DaemonEnsureOptions | string,
): Promise<DaemonStartResult> {
	const ensureOptions = normalizeEnsureOptions(options);
	return withLifecycleLock(
		{
			operation: "restartDaemon",
			port,
			cliVersion: resolveLockVersion(ensureOptions.cliVersion),
		},
		async () => {
			const pidData = await readPidFile();

			if (pidData) {
				logDaemonEvent("stop_requested", {
					port: pidData.port,
					daemonPid: pidData.pid,
					reason: "restart",
				});
				await stopDaemonProcess(pidData);

				if (isProcessRunning(pidData.pid)) {
					await waitForProcessExit(pidData.pid, STOP_KILL_TIMEOUT_MS);
				}
			} else {
				// Recovery: probe the port for an untracked daemon.
				const conn = createConnection(port);
				const health = await checkHealth(conn);

				if (health) {
					const realPid = resolvePortOwnerPid(port);
					if (realPid) {
						await stopDaemonProcess({ port, pid: realPid });
					} else {
						const freed = await stopUntrackedDaemon(conn, port);
						if (!freed) {
							throw new Error(
								`Failed to stop untracked daemon on port ${port} for restart`,
							);
						}
					}
				}
			}

			// Spawn new daemon directly (no nested lock via ensureDaemon).
			const portFree = await isPortAvailable(port);
			if (!portFree) {
				const conn = createConnection(port);
				const health = await checkHealth(conn);
				if (!health) {
					throw new DaemonPortConflictError(port);
				}
				// If somehow still a healthy rp1 daemon, treat as replacement.
			}

			const pid = await spawnDaemon(port, ensureOptions);
			await writePidFile({ port, pid });

			const conn = createConnection(port);
			const healthy = await waitForHealth(conn);

			if (!healthy) {
				await removePidFile();
				throw new Error(
					"Daemon started but failed to become healthy within timeout",
				);
			}

			logDaemonEvent("daemon_replaced", {
				port,
				pid,
				reason: "restart",
			});
			return makeStartResult(conn, "replaced");
		},
	);
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
