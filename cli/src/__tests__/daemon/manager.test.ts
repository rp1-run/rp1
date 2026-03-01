/**
 * Unit tests for daemon manager hardening.
 * Tests process lifecycle utilities: waitForProcessExit, isProcessRunning,
 * forceKillProcess, and the SIGTERM -> SIGKILL escalation in stopDaemon.
 */

import { afterEach, describe, expect, test } from "bun:test";
import type { ChildProcess } from "node:child_process";
import { spawn } from "node:child_process";
import {
	forceKillProcess,
	isProcessRunning,
	waitForProcessExit,
} from "../../../web-ui/src/daemon/manager.js";

/**
 * Spawn a short-lived process that exits after the given delay in seconds.
 * Keeps a reference to allow proper reaping by the runtime.
 */
function spawnSleepProcess(durationSec: number): {
	pid: number;
	child: ChildProcess;
} {
	const child = spawn("sleep", [String(durationSec)], {
		stdio: "ignore",
	});

	const pid = child.pid;
	if (!pid) {
		throw new Error("Failed to spawn sleep process");
	}
	return { pid, child };
}

/**
 * Spawn a process that traps SIGTERM and ignores it, only exiting on SIGKILL.
 */
function spawnSigtermResistantProcess(): {
	pid: number;
	child: ChildProcess;
} {
	const child = spawn(
		"bash",
		["-c", "trap '' TERM; while true; do sleep 0.1; done"],
		{
			stdio: "ignore",
		},
	);

	const pid = child.pid;
	if (!pid) {
		throw new Error("Failed to spawn SIGTERM-resistant process");
	}
	return { pid, child };
}

describe("daemon manager", () => {
	const childrenToCleanup: ChildProcess[] = [];

	afterEach(() => {
		for (const child of childrenToCleanup) {
			try {
				child.kill("SIGKILL");
			} catch {
				// Already exited
			}
		}
		childrenToCleanup.length = 0;
	});

	describe("isProcessRunning", () => {
		test("returns true for the current process", () => {
			expect(isProcessRunning(process.pid)).toBe(true);
		});

		test("returns false for a non-existent PID", () => {
			expect(isProcessRunning(99999999)).toBe(false);
		});

		test("returns true for a spawned process", () => {
			const { pid, child } = spawnSleepProcess(10);
			childrenToCleanup.push(child);

			expect(isProcessRunning(pid)).toBe(true);
		});

		test("returns false after process exits naturally", async () => {
			const { pid, child } = spawnSleepProcess(0.1);
			childrenToCleanup.push(child);

			// Wait for the child to actually exit and be reaped
			await new Promise<void>((resolve) => {
				child.on("exit", () => resolve());
			});

			expect(isProcessRunning(pid)).toBe(false);
		});
	});

	describe("waitForProcessExit", () => {
		test("returns true when process exits within timeout", async () => {
			const { pid, child } = spawnSleepProcess(0.2);
			childrenToCleanup.push(child);

			const result = await waitForProcessExit(pid, 5000);

			expect(result).toBe(true);
		});

		test("returns false when timeout expires before process exits", async () => {
			const { pid, child } = spawnSleepProcess(30);
			childrenToCleanup.push(child);

			const result = await waitForProcessExit(pid, 200);

			expect(result).toBe(false);
			expect(isProcessRunning(pid)).toBe(true);
		});

		test("returns true immediately for a non-existent PID", async () => {
			const result = await waitForProcessExit(99999999, 1000);

			expect(result).toBe(true);
		});

		test("returns true when process is killed during wait", async () => {
			const { pid, child } = spawnSleepProcess(30);
			childrenToCleanup.push(child);

			setTimeout(() => {
				child.kill("SIGKILL");
			}, 100);

			const result = await waitForProcessExit(pid, 5000);

			expect(result).toBe(true);
		});
	});

	describe("forceKillProcess", () => {
		test("kills a running process", async () => {
			const { pid, child } = spawnSleepProcess(30);
			childrenToCleanup.push(child);

			expect(isProcessRunning(pid)).toBe(true);

			forceKillProcess(pid);

			// Wait for the child to be reaped
			await new Promise<void>((resolve) => {
				child.on("exit", () => resolve());
			});

			expect(isProcessRunning(pid)).toBe(false);
		});

		test("does not throw for non-existent PID", () => {
			expect(() => forceKillProcess(99999999)).not.toThrow();
		});
	});

	describe("SIGTERM to SIGKILL escalation", () => {
		test("process that ignores SIGTERM is killed by forceKillProcess", async () => {
			const { pid, child } = spawnSigtermResistantProcess();
			childrenToCleanup.push(child);

			// Give the trap handler time to initialize
			await new Promise((r) => setTimeout(r, 200));
			expect(isProcessRunning(pid)).toBe(true);

			// Send SIGTERM (process ignores it)
			try {
				process.kill(pid, "SIGTERM");
			} catch {
				// Process may already be dead
			}

			// Wait briefly - process should still be running
			await new Promise((r) => setTimeout(r, 300));
			expect(isProcessRunning(pid)).toBe(true);

			// Escalate to force kill (SIGKILL)
			forceKillProcess(pid);
			const exited = await waitForProcessExit(pid, 2000);

			expect(exited).toBe(true);
		});

		test("stopDaemon pattern: SIGTERM then waitForProcessExit then forceKillProcess", async () => {
			const { pid, child } = spawnSigtermResistantProcess();
			childrenToCleanup.push(child);

			await new Promise((r) => setTimeout(r, 200));
			expect(isProcessRunning(pid)).toBe(true);

			// SIGTERM (process ignores)
			try {
				process.kill(pid, "SIGTERM");
			} catch {
				// Already dead
			}

			// Wait with short timeout (simulates STOP_GRACEFUL_TIMEOUT_MS)
			const exitedGracefully = await waitForProcessExit(pid, 500);
			expect(exitedGracefully).toBe(false);

			// Escalate to SIGKILL
			forceKillProcess(pid);
			const exitedAfterKill = await waitForProcessExit(pid, 2000);
			expect(exitedAfterKill).toBe(true);
			expect(isProcessRunning(pid)).toBe(false);
		});
	});
});
