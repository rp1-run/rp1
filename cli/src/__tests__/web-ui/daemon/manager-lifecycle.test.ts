import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DaemonStatus } from "../../../../web-ui/src/daemon/ipc";

type Health = {
	readonly status: "ok";
	readonly uptime: number;
	readonly port: number;
	readonly projectCount: number;
	readonly version?: string;
};

const healthy = (port: number, version = "0.7.5"): Health => ({
	status: "ok",
	uptime: 1,
	port,
	projectCount: 0,
	version,
});

describe("daemon manager lifecycle recovery", () => {
	let tempDir: string;
	let pidFilePath: string;
	let healthResponses: Array<Health | null>;
	let statusResponse: DaemonStatus;
	let stoppedPorts: number[];
	let spawned: Array<{ command: string; args: string[] }>;
	let portOwnerPid: number | null;

	beforeEach(async () => {
		tempDir = await mkdtemp(join(tmpdir(), "rp1-daemon-manager-test-"));
		pidFilePath = join(tempDir, "daemon.pid");
		healthResponses = [];
		statusResponse = { running: true, port: 7710 };
		stoppedPorts = [];
		spawned = [];
		portOwnerPid = null;

		mock.module("../../../../web-ui/src/daemon/config-dir", () => ({
			ensureConfigDir: async () => {
				await Bun.write(join(tempDir, ".keep"), "");
				return tempDir;
			},
			getPidFilePath: () => pidFilePath,
		}));
		mock.module("../../../../web-ui/src/daemon/diagnostics", () => ({
			logDaemonEvent: () => {},
		}));
		mock.module("../../../../web-ui/src/daemon/lifecycle-lock", () => ({
			withLifecycleLock: async (_metadata: unknown, run: () => unknown) =>
				run(),
		}));
		mock.module("../../../../web-ui/src/daemon/ipc", () => ({
			createConnection: (port: number) => ({
				port,
				baseUrl: `http://127.0.0.1:${port}`,
			}),
			checkHealth: async (conn: { port: number }) =>
				healthResponses.length > 0
					? healthResponses.shift()
					: healthy(conn.port),
			getDaemonStatus: async () => statusResponse,
			stopDaemon: async (conn: { port: number }) => {
				stoppedPorts.push(conn.port);
				return true;
			},
		}));
		mock.module("node:child_process", () => ({
			execSync: () => {
				if (portOwnerPid === null) {
					throw new Error("no owner");
				}
				return `${portOwnerPid}\n`;
			},
			spawn: (command: string, args: string[]) => {
				spawned.push({ command, args });
				return {
					pid: 4242,
					unref: () => {},
				};
			},
		}));
	});

	afterEach(async () => {
		mock.restore();
		await rm(tempDir, { recursive: true, force: true });
	});

	const loadManager = async () =>
		(await import(
			`../../../../web-ui/src/daemon/manager.ts?manager-lifecycle=${Date.now()}-${Math.random()}`
		)) as typeof import("../../../../web-ui/src/daemon/manager.js");

	test("getStatus removes stale pid files before reporting not running", async () => {
		await writeFile(pidFilePath, "7710\n999999999\n", "utf-8");
		healthResponses = [null];

		const manager = await loadManager();
		const status = await manager.getStatus(7710);

		expect(status).toEqual({ running: false });
		await expect(Bun.file(pidFilePath).exists()).resolves.toBe(false);
	});

	test("getStatus returns tracked daemon status when the recorded process is alive", async () => {
		await writeFile(pidFilePath, `7711\n${process.pid}\n`, "utf-8");
		statusResponse = {
			running: true,
			port: 7711,
			projectCount: 2,
		};

		const manager = await loadManager();
		const status = await manager.getStatus(7710);

		expect(status).toEqual(statusResponse);
	});

	test("ensureDaemon reuses a healthy tracked daemon without spawning a replacement", async () => {
		await writeFile(pidFilePath, `7712\n${process.pid}\n`, "utf-8");
		healthResponses = [healthy(7712, "0.7.5")];

		const manager = await loadManager();
		const result = await manager.ensureDaemon(7710, "0.7.5");

		expect(result.action).toBe("reused");
		expect(result.wasRunning).toBe(true);
		expect(result.connection.port).toBe(7712);
		expect(spawned).toHaveLength(0);
	});

	test("ensureDaemon starts and records a daemon when no tracked process exists", async () => {
		healthResponses = [healthy(0, "0.7.5")];

		const manager = await loadManager();
		const result = await manager.ensureDaemon(0, {
			cliVersion: "0.7.5",
			executablePath: process.execPath,
		});

		expect(result.action).toBe("started");
		expect(result.wasRunning).toBe(false);
		expect(spawned).toEqual([
			{ command: process.execPath, args: ["_daemon-server", "--port", "0"] },
		]);
		await expect(readFile(pidFilePath, "utf-8")).resolves.toBe("0\n4242\n");
	});

	test("ensureDaemon repairs a missing pid file for a healthy untracked daemon", async () => {
		const server = Bun.serve({
			port: 0,
			hostname: "127.0.0.1",
			fetch: () => new Response("occupied"),
		});
		const port = server.port;
		if (port === undefined) {
			throw new Error("Expected test server to bind a port");
		}
		portOwnerPid = process.pid;
		healthResponses = [healthy(port, "0.7.5")];

		try {
			const manager = await loadManager();
			const result = await manager.ensureDaemon(port, "0.7.5");

			expect(result.action).toBe("reused");
			expect(result.reason).toBe("missing_pid");
			expect(result.connection.port).toBe(port);
			await expect(readFile(pidFilePath, "utf-8")).resolves.toBe(
				`${port}\n${process.pid}\n`,
			);
		} finally {
			server.stop(true);
		}
	});

	test("stopDaemon removes tracked pid state and reports a stop action", async () => {
		await writeFile(pidFilePath, "7713\n999999999\n", "utf-8");

		const manager = await loadManager();
		const result = await manager.stopDaemon(7713);

		expect(result).toEqual({ action: "stopped" });
		expect(stoppedPorts).toEqual([7713]);
		await expect(Bun.file(pidFilePath).exists()).resolves.toBe(false);
	});

	test("restartDaemon stops stale tracked state and starts a fresh daemon", async () => {
		await writeFile(pidFilePath, "7714\n999999999\n", "utf-8");
		healthResponses = [healthy(0, "0.7.5")];

		const manager = await loadManager();
		const result = await manager.restartDaemon(0, {
			cliVersion: "0.7.5",
			executablePath: process.execPath,
		});

		expect(result.action).toBe("replaced");
		expect(stoppedPorts).toEqual([7714]);
		expect(spawned).toHaveLength(1);
	});

	test("connectToDaemon returns null when no tracked daemon exists", async () => {
		const manager = await loadManager();

		await expect(manager.connectToDaemon()).resolves.toBeNull();
	});
});
