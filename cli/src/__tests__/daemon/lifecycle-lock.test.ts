/**
 * Lifecycle lock tests.
 * Verifies lock acquisition, waiting, stale-lock recovery, and concurrent serialization.
 */

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import {
	existsSync,
	mkdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { cleanupTempDir, createTempDir } from "../helpers/index.js";

let testConfigDir: string;
let lockPath: string;

mock.module("../../../web-ui/src/daemon/config-dir.js", () => ({
	getConfigDir: () => testConfigDir,
	getLifecycleLockPath: () => lockPath,
	getRestartMarkerPath: () =>
		join(testConfigDir, "restart-arcade-after-install"),
	ensureConfigDir: async () => {
		mkdirSync(testConfigDir, { recursive: true, mode: 0o700 });
		return testConfigDir;
	},
	getPidFilePath: () => join(testConfigDir, "daemon.pid"),
	getDaemonStatePath: () => join(testConfigDir, "daemon-state.json"),
	readDaemonState: () => null,
	writeDaemonState: () => {},
}));

mock.module("../../../web-ui/src/daemon/diagnostics.js", () => ({
	logDaemonEvent: () => {},
	logDaemonError: () => {},
}));

const { acquireLifecycleLock, withLifecycleLock } = await import(
	"../../../web-ui/src/daemon/lifecycle-lock.js"
);

describe("lifecycle lock", () => {
	beforeEach(async () => {
		testConfigDir = await createTempDir("lifecycle-lock");
		lockPath = join(testConfigDir, "daemon.lifecycle.lock");
	});

	afterEach(async () => {
		// Clean up any leftover lock dirs before removing temp dir.
		if (existsSync(lockPath)) {
			rmSync(lockPath, { recursive: true, force: true });
		}
		await cleanupTempDir(testConfigDir);
	});

	describe("acquireLifecycleLock", () => {
		test("creates lock directory and writes owner metadata", async () => {
			const release = await acquireLifecycleLock({
				operation: "ensureDaemon",
				port: 7710,
				cliVersion: "1.0.0",
				waitTimeoutMs: 1000,
			});

			expect(existsSync(lockPath)).toBe(true);

			const metadataPath = join(lockPath, "owner.json");
			expect(existsSync(metadataPath)).toBe(true);

			const metadata = JSON.parse(readFileSync(metadataPath, "utf-8"));
			expect(metadata.ownerPid).toBe(process.pid);
			expect(metadata.operation).toBe("ensureDaemon");
			expect(metadata.port).toBe(7710);
			expect(metadata.cliVersion).toBe("1.0.0");
			expect(typeof metadata.acquiredAt).toBe("string");

			release();
		});

		test("release function removes lock directory", async () => {
			const release = await acquireLifecycleLock({
				operation: "stopDaemon",
				port: 7710,
				cliVersion: "1.0.0",
				waitTimeoutMs: 1000,
			});

			expect(existsSync(lockPath)).toBe(true);
			release();
			expect(existsSync(lockPath)).toBe(false);
		});

		test("release is idempotent", async () => {
			const release = await acquireLifecycleLock({
				operation: "ensureDaemon",
				port: 7710,
				cliVersion: "1.0.0",
				waitTimeoutMs: 1000,
			});

			release();
			expect(() => release()).not.toThrow();
			expect(existsSync(lockPath)).toBe(false);
		});

		test("recovers stale lock left by dead process", async () => {
			// Simulate a lock left by a dead process (PID 99999999 should not exist).
			mkdirSync(lockPath, { recursive: false, mode: 0o700 });
			writeFileSync(
				join(lockPath, "owner.json"),
				JSON.stringify({
					ownerPid: 99999999,
					operation: "ensureDaemon",
					port: 7710,
					cliVersion: "0.9.0",
					acquiredAt: new Date().toISOString(),
				}),
			);

			// Should recover the stale lock and acquire.
			const release = await acquireLifecycleLock({
				operation: "ensureDaemon",
				port: 7710,
				cliVersion: "1.0.0",
				waitTimeoutMs: 2000,
			});

			const metadata = JSON.parse(
				readFileSync(join(lockPath, "owner.json"), "utf-8"),
			);
			expect(metadata.ownerPid).toBe(process.pid);
			expect(metadata.cliVersion).toBe("1.0.0");

			release();
		});

		test("recovers corrupted lock with missing metadata", async () => {
			// Simulate a lock directory that exists but has no owner.json.
			mkdirSync(lockPath, { recursive: false, mode: 0o700 });

			const release = await acquireLifecycleLock({
				operation: "restartDaemon",
				port: 7710,
				cliVersion: "1.0.0",
				waitTimeoutMs: 2000,
			});

			const metadata = JSON.parse(
				readFileSync(join(lockPath, "owner.json"), "utf-8"),
			);
			expect(metadata.ownerPid).toBe(process.pid);
			expect(metadata.operation).toBe("restartDaemon");

			release();
		});

		test("recovers aged-out lock even when owner PID is alive", async () => {
			// Simulate a lock held by the current process but acquired far in the past.
			mkdirSync(lockPath, { recursive: false, mode: 0o700 });
			writeFileSync(
				join(lockPath, "owner.json"),
				JSON.stringify({
					ownerPid: process.pid,
					operation: "ensureDaemon",
					port: 7710,
					cliVersion: "1.0.0",
					acquiredAt: new Date(Date.now() - 120_000).toISOString(),
				}),
			);

			// staleLockTimeoutMs is set to 100ms so the 120s-old lock is stale.
			const release = await acquireLifecycleLock({
				operation: "stopDaemon",
				port: 7710,
				cliVersion: "1.0.0",
				waitTimeoutMs: 2000,
				staleLockTimeoutMs: 100,
			});

			const metadata = JSON.parse(
				readFileSync(join(lockPath, "owner.json"), "utf-8"),
			);
			expect(metadata.operation).toBe("stopDaemon");

			release();
		});

		test("times out when lock is held by live process within stale threshold", async () => {
			// Hold the lock with the current PID and a recent timestamp.
			mkdirSync(lockPath, { recursive: false, mode: 0o700 });
			writeFileSync(
				join(lockPath, "owner.json"),
				JSON.stringify({
					ownerPid: process.pid,
					operation: "ensureDaemon",
					port: 7710,
					cliVersion: "1.0.0",
					acquiredAt: new Date().toISOString(),
				}),
			);

			await expect(
				acquireLifecycleLock({
					operation: "stopDaemon",
					port: 7710,
					cliVersion: "1.0.0",
					waitTimeoutMs: 400,
					pollIntervalMs: 50,
					staleLockTimeoutMs: 60_000,
				}),
			).rejects.toThrow(/Timed out waiting for daemon lifecycle lock/);
		});

		test("creates parent config directory if it does not exist", async () => {
			// Remove the config dir so it must be recreated.
			rmSync(testConfigDir, { recursive: true, force: true });
			expect(existsSync(testConfigDir)).toBe(false);

			const release = await acquireLifecycleLock({
				operation: "ensureDaemon",
				port: 7710,
				cliVersion: "1.0.0",
				waitTimeoutMs: 1000,
			});

			expect(existsSync(lockPath)).toBe(true);
			release();
		});
	});

	describe("withLifecycleLock", () => {
		test("releases lock after successful execution", async () => {
			const result = await withLifecycleLock(
				{
					operation: "ensureDaemon",
					port: 7710,
					cliVersion: "1.0.0",
					waitTimeoutMs: 1000,
				},
				async () => {
					expect(existsSync(lockPath)).toBe(true);
					return "success";
				},
			);

			expect(result).toBe("success");
			expect(existsSync(lockPath)).toBe(false);
		});

		test("releases lock when function throws", async () => {
			const error = new Error("operation failed");

			await expect(
				withLifecycleLock(
					{
						operation: "ensureDaemon",
						port: 7710,
						cliVersion: "1.0.0",
						waitTimeoutMs: 1000,
					},
					async () => {
						throw error;
					},
				),
			).rejects.toThrow("operation failed");

			expect(existsSync(lockPath)).toBe(false);
		});
	});

	describe("concurrent serialization", () => {
		test("second caller waits until first releases", async () => {
			const events: string[] = [];

			const first = withLifecycleLock(
				{
					operation: "first",
					port: 7710,
					cliVersion: "1.0.0",
					waitTimeoutMs: 5000,
					pollIntervalMs: 50,
				},
				async () => {
					events.push("first:start");
					await new Promise((resolve) => setTimeout(resolve, 200));
					events.push("first:end");
				},
			);

			// Give the first lock a moment to acquire.
			await new Promise((resolve) => setTimeout(resolve, 50));

			const second = withLifecycleLock(
				{
					operation: "second",
					port: 7710,
					cliVersion: "1.0.0",
					waitTimeoutMs: 5000,
					pollIntervalMs: 50,
				},
				async () => {
					events.push("second:start");
				},
			);

			await Promise.all([first, second]);

			// The second operation must start after the first ends.
			expect(events.indexOf("first:end")).toBeLessThan(
				events.indexOf("second:start"),
			);
		});
	});
});
