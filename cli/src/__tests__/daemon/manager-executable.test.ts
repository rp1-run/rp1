import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { chmod, mkdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import {
	cleanupTempDir,
	createTempDir,
	writeFixture,
} from "../helpers/index.js";

let testConfigDir: string;
let lockPath: string;
let manager: typeof import("../../../web-ui/src/daemon/manager.js");

const loadManager = async () =>
	(await import(
		`../../../web-ui/src/daemon/manager.js?manager-executable=${Date.now()}-${Math.random()}`
	)) as typeof import("../../../web-ui/src/daemon/manager.js");

const reservePort = (): number => {
	const server = Bun.serve({
		port: 0,
		hostname: "127.0.0.1",
		fetch() {
			return new Response("reserved");
		},
	});
	const port = server.port;
	if (port === undefined) throw new Error("Expected Bun to assign a port");
	server.stop(true);
	return port;
};

describe("daemon manager executable propagation", () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await createTempDir("daemon-manager-executable");
		testConfigDir = join(tempDir, "config");
		lockPath = join(testConfigDir, "daemon.lifecycle.lock");

		mock.module("../../../web-ui/src/daemon/config-dir.js", () => ({
			getConfigDir: () => testConfigDir,
			getLifecycleLockPath: () => lockPath,
			getRestartMarkerPath: () =>
				join(testConfigDir, "restart-arcade-after-install"),
			ensureConfigDir: async () => {
				await mkdir(testConfigDir, { recursive: true, mode: 0o700 });
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

		manager = await loadManager();
	});

	afterEach(async () => {
		try {
			await manager.stopDaemon();
		} catch {
			await rm(lockPath, { recursive: true, force: true });
		}
		await cleanupTempDir(tempDir);
	});

	const createFakeDaemonExecutable = async (
		markerPath: string,
	): Promise<string> => {
		const executablePath = await writeFixture(
			tempDir,
			"fake-rp1",
			`#!/usr/bin/env bun
import { writeFileSync } from "node:fs";

const args = process.argv.slice(2);
const portIndex = args.indexOf("--port");
const port = Number(args[portIndex + 1]);
writeFileSync(
	"${markerPath}",
	JSON.stringify({ args, port, daemonMode: process.env.RP1_DAEMON_MODE }),
);

const server = Bun.serve({
	port,
	hostname: "127.0.0.1",
	fetch(request) {
		const url = new URL(request.url);
		if (url.pathname === "/api/v2/health") {
			return Response.json({
				status: "ok",
				uptime: 0,
				port,
				projectCount: 0,
				version: "0.7.5-test",
			});
		}
		if (url.pathname === "/api/v2/shutdown") {
			setTimeout(() => process.exit(0), 0);
			return Response.json({ ok: true });
		}
		return new Response("not found", { status: 404 });
	},
});

process.on("SIGTERM", () => {
	server.stop(true);
	process.exit(0);
});
`,
		);
		await chmod(executablePath, 0o755);
		return executablePath;
	};

	test("passes an explicit executable path through daemon startup", async () => {
		const markerPath = join(tempDir, "spawn-marker.json");
		const executablePath = await createFakeDaemonExecutable(markerPath);
		const port = reservePort();

		const result = await manager.ensureDaemon(port, {
			cliVersion: "0.7.5-test",
			executablePath,
		});

		const marker = JSON.parse(await readFile(markerPath, "utf-8")) as {
			readonly args: readonly string[];
			readonly port: number;
			readonly daemonMode?: string;
		};

		expect(result.action).toBe("started");
		expect(result.connection.port).toBe(port);
		expect(marker).toEqual({
			args: ["_daemon-server", "--port", String(port)],
			port,
			daemonMode: "true",
		});
	});
});
