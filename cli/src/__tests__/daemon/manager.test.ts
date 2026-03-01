import { afterEach, describe, expect, test } from "bun:test";
import type { ChildProcess } from "node:child_process";
import { spawn } from "node:child_process";
import {
	forceKillProcess,
	isProcessRunning,
	waitForProcessExit,
} from "../../../web-ui/src/daemon/manager.js";

function spawnSleepProcess(durationSec: number): {
	pid: number;
	child: ChildProcess;
} {
	const child = spawn("sleep", [String(durationSec)], { stdio: "ignore" });
	const pid = child.pid;
	if (!pid) throw new Error("Failed to spawn sleep process");
	return { pid, child };
}

function spawnSigtermResistantProcess(): {
	pid: number;
	child: ChildProcess;
} {
	const child = spawn(
		"bash",
		["-c", "trap '' TERM; while true; do sleep 0.1; done"],
		{ stdio: "ignore" },
	);
	const pid = child.pid;
	if (!pid) throw new Error("Failed to spawn SIGTERM-resistant process");
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

		test("returns false after process exits naturally", async () => {
			const { pid, child } = spawnSleepProcess(0.1);
			childrenToCleanup.push(child);
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

		test("returns true when process is killed during wait", async () => {
			const { pid, child } = spawnSleepProcess(30);
			childrenToCleanup.push(child);
			setTimeout(() => child.kill("SIGKILL"), 100);
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
			await new Promise((r) => setTimeout(r, 200));
			expect(isProcessRunning(pid)).toBe(true);

			try {
				process.kill(pid, "SIGTERM");
			} catch {
				// Process may already be dead
			}
			await new Promise((r) => setTimeout(r, 300));
			expect(isProcessRunning(pid)).toBe(true);

			forceKillProcess(pid);
			const exited = await waitForProcessExit(pid, 2000);
			expect(exited).toBe(true);
		});
	});
});
