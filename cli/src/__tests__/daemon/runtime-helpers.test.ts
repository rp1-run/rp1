import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { cleanupTempDir, createTempDir } from "../helpers/index.js";

const originalFetch = globalThis.fetch;

let tempDir: string;

async function loadConfigDirModule() {
	return await import(
		`../../../web-ui/src/daemon/config-dir.ts?runtime-helpers=${Date.now()}-${Math.random()}`
	);
}

async function loadIpcModule() {
	return await import(
		`../../../web-ui/src/daemon/ipc.ts?runtime-helpers=${Date.now()}-${Math.random()}`
	);
}

async function loadDiagnosticsModule() {
	return await import(
		`../../../web-ui/src/daemon/diagnostics.ts?runtime-helpers=${Date.now()}-${Math.random()}`
	);
}

function mockConfigDir(configDir: string): void {
	const module = {
		ensureConfigDir: async () => {
			await mkdir(configDir, { recursive: true, mode: 0o700 });
			return configDir;
		},
		getDaemonStatePath: () => join(configDir, "daemon-state.json"),
		getConfigDir: () => configDir,
		getLifecycleLockPath: () => join(configDir, "daemon.lifecycle.lock"),
		getPidFilePath: () => join(configDir, "daemon.pid"),
		getRestartMarkerPath: () => join(configDir, "restart-arcade-after-install"),
		readDaemonState: () => null,
		writeDaemonState: () => {},
	};
	mock.module("../../../web-ui/src/daemon/config-dir", () => module);
	mock.module("../../../web-ui/src/daemon/config-dir.js", () => module);
}

describe("daemon runtime helpers", () => {
	beforeEach(async () => {
		tempDir = await createTempDir("daemon-runtime-helpers");
	});

	afterEach(async () => {
		globalThis.fetch = originalFetch;
		await cleanupTempDir(tempDir);
	});

	describe("daemon config paths", () => {
		test("uses platform config directories for Arcade daemon state", async () => {
			const { getConfigDir } = await loadConfigDirModule();

			expect(getConfigDir({ platform: "darwin", homeDir: homedir() })).toBe(
				join(homedir(), "Library", "Application Support", "rp1"),
			);

			const appData = join(tempDir, "AppData", "Roaming");
			expect(
				getConfigDir({
					platform: "win32",
					homeDir: homedir(),
					environment: { APPDATA: appData },
				}),
			).toBe(join(appData, "rp1"));

			expect(
				getConfigDir({
					platform: "win32",
					homeDir: homedir(),
					environment: {},
				}),
			).toBe(join(homedir(), "AppData", "Roaming", "rp1"));

			const xdgConfigHome = join(tempDir, "xdg");
			expect(
				getConfigDir({
					platform: "linux",
					homeDir: homedir(),
					environment: { XDG_CONFIG_HOME: xdgConfigHome },
				}),
			).toBe(join(xdgConfigHome, "rp1"));

			expect(
				getConfigDir({
					platform: "linux",
					homeDir: homedir(),
					environment: {},
				}),
			).toBe(join(homedir(), ".config", "rp1"));
		});

		test("derives daemon sidecar paths from the active config directory", async () => {
			const {
				getDaemonStatePath,
				getLifecycleLockPath,
				getPidFilePath,
				getRestartMarkerPath,
			} = await loadConfigDirModule();

			const configDir = join(tempDir, "xdg", "rp1");
			const options = {
				platform: "linux" as const,
				homeDir: homedir(),
				environment: { XDG_CONFIG_HOME: join(tempDir, "xdg") },
			};

			expect(getPidFilePath(options)).toBe(join(configDir, "daemon.pid"));
			expect(getLifecycleLockPath(options)).toBe(
				join(configDir, "daemon.lifecycle.lock"),
			);
			expect(getRestartMarkerPath(options)).toBe(
				join(configDir, "restart-arcade-after-install"),
			);
			expect(getDaemonStatePath(options)).toBe(
				join(homedir(), ".rp1", "daemon-state.json"),
			);
		});

		test("creates the config directory with daemon-only permissions", async () => {
			const { ensureConfigDir } = await loadConfigDirModule();

			const configDir = join(tempDir, "xdg", "rp1");
			expect(
				await ensureConfigDir({
					platform: "linux",
					homeDir: homedir(),
					environment: { XDG_CONFIG_HOME: join(tempDir, "xdg") },
				}),
			).toBe(configDir);
			const configStat = await stat(configDir);
			expect(configStat.isDirectory()).toBe(true);
		});
	});

	describe("daemon diagnostics", () => {
		test("writes structured daemon events and errors to the config log", async () => {
			const configDir = join(tempDir, "config");
			mockConfigDir(configDir);
			try {
				const { logDaemonError, logDaemonEvent } =
					await loadDiagnosticsModule();

				logDaemonEvent("daemon-started", { port: 7710 });
				logDaemonError("daemon-crashed", new TypeError("boom"));
				logDaemonError("daemon-signal", "SIGTERM");

				const entries = (await readFile(join(configDir, "daemon.log"), "utf-8"))
					.trim()
					.split("\n")
					.map((line) => JSON.parse(line) as Record<string, unknown>);

				expect(entries[0]).toMatchObject({
					event: "daemon-started",
					pid: process.pid,
					port: 7710,
				});
				expect(entries[1]).toMatchObject({
					event: "daemon-crashed",
					name: "TypeError",
					message: "boom",
				});
				expect(entries[2]).toMatchObject({
					event: "daemon-signal",
					name: "string",
					message: "SIGTERM",
					stack: "",
				});
			} finally {
				mock.restore();
			}
		});

		test("ignores diagnostics write failures", async () => {
			const configDir = join(tempDir, "blocked", "config");
			await writeFile(join(tempDir, "blocked"), "not a directory");
			mockConfigDir(configDir);

			try {
				const { logDaemonEvent } = await loadDiagnosticsModule();

				expect(() => logDaemonEvent("daemon-started")).not.toThrow();
			} finally {
				mock.restore();
			}
		});
	});

	describe("daemon IPC", () => {
		test("checks health and reports daemon status from the v2 health route", async () => {
			const { checkHealth, createConnection, getDaemonStatus } =
				await loadIpcModule();
			const requests: Array<{ url: string; init?: RequestInit }> = [];
			globalThis.fetch = mock(
				async (input: RequestInfo | URL, init?: RequestInit) => {
					requests.push({ url: String(input), init });
					return Response.json({
						status: "ok",
						uptime: 42,
						port: 7710,
						projectCount: 3,
						isDev: true,
						version: "0.7.6-test",
					});
				},
			) as unknown as typeof fetch;

			const conn = createConnection(7710);
			const health = await checkHealth(conn);
			const status = await getDaemonStatus(conn);

			expect(conn).toEqual({
				port: 7710,
				baseUrl: "http://127.0.0.1:7710",
			});
			expect(health).toMatchObject({
				status: "ok",
				uptime: 42,
				port: 7710,
				projectCount: 3,
			});
			expect(status).toEqual({
				running: true,
				port: 7710,
				uptime: 42,
				projectCount: 3,
			});
			expect(requests.map((request) => request.url)).toEqual([
				"http://127.0.0.1:7710/api/v2/health",
				"http://127.0.0.1:7710/api/v2/health",
			]);
			expect(requests[0].init?.method).toBe("GET");
		});

		test("returns disconnected status when health checks fail", async () => {
			const { checkHealth, createConnection, getDaemonStatus } =
				await loadIpcModule();
			globalThis.fetch = mock(
				async () => new Response("nope", { status: 503 }),
			) as unknown as typeof fetch;

			expect(await checkHealth(createConnection(7711))).toBeNull();
			expect(await getDaemonStatus(createConnection(7711))).toEqual({
				running: false,
			});

			globalThis.fetch = mock(async () => {
				throw new Error("connection refused");
			}) as unknown as typeof fetch;

			expect(await checkHealth(createConnection(7712))).toBeNull();
		});

		test("registers projects and propagates daemon error responses", async () => {
			const { createConnection, registerProjectWithDaemon } =
				await loadIpcModule();
			const requests: Array<{ url: string; body: string | undefined }> = [];
			globalThis.fetch = mock(
				async (input: RequestInfo | URL, init?: RequestInit) => {
					requests.push({
						url: String(input),
						body: typeof init?.body === "string" ? init.body : undefined,
					});
					return Response.json({
						project: {
							id: "project-1",
							path: "/repo",
							name: "repo",
							registeredAt: "2026-05-04T00:00:00.000Z",
							lastAccessedAt: "2026-05-04T00:00:00.000Z",
						},
						url: "http://127.0.0.1:7710/projects/project-1",
					});
				},
			) as unknown as typeof fetch;

			const registered = await registerProjectWithDaemon(
				createConnection(7710),
				"/repo",
			);

			expect(registered.url).toBe("http://127.0.0.1:7710/projects/project-1");
			expect(requests[0]).toEqual({
				url: "http://127.0.0.1:7710/api/v2/projects",
				body: JSON.stringify({ path: "/repo" }),
			});

			globalThis.fetch = mock(async () =>
				Response.json({ error: "Project path is required" }, { status: 400 }),
			) as unknown as typeof fetch;

			await expect(
				registerProjectWithDaemon(createConnection(7710), ""),
			).rejects.toThrow("Project path is required");
		});

		test("posts event and notification envelopes to daemon notify routes", async () => {
			const { createConnection, notifyEvent, notifyNotification } =
				await loadIpcModule();
			const requests: Array<{ url: string; body: unknown }> = [];
			globalThis.fetch = mock(
				async (input: RequestInfo | URL, init?: RequestInit) => {
					requests.push({
						url: String(input),
						body: JSON.parse(String(init?.body)),
					});
					return Response.json({ ok: true });
				},
			) as unknown as typeof fetch;

			const eventPayload = {
				eventType: "status_change",
				eventId: 7,
				runId: "run-1",
				projectPath: "/repo",
				projectId: "project-1",
				rp1ProjectRoot: "/repo",
				featureId: "fix-all-ui",
				runStatus: "completed" as const,
				step: "task-builder:completed",
				unit: "T8",
				data: { status: "completed" },
				createdAt: "2026-05-04T00:00:00.000Z",
			};
			const notification = {
				id: 9,
				message: "Runtime recovered",
				sourceType: "workflow",
				sourceId: "run-1",
				route: "/runs/run-1",
				projectId: "project-1",
				createdAt: "2026-05-04T00:00:01.000Z",
			};

			expect(await notifyEvent(createConnection(7710), eventPayload)).toBe(
				true,
			);
			expect(
				await notifyNotification(createConnection(7710), notification),
			).toBe(true);

			expect(requests).toEqual([
				{
					url: "http://127.0.0.1:7710/api/v2/status/notify",
					body: {
						type: "event",
						...eventPayload,
					},
				},
				{
					url: "http://127.0.0.1:7710/api/v2/notifications/notify",
					body: {
						type: "notification",
						notification,
					},
				},
			]);
		});

		test("returns false for failed shutdown and notify attempts", async () => {
			const { createConnection, notifyEvent, notifyNotification, stopDaemon } =
				await loadIpcModule();
			globalThis.fetch = mock(
				async () => new Response("nope", { status: 500 }),
			) as unknown as typeof fetch;

			expect(await stopDaemon(createConnection(7710))).toBe(false);
			expect(
				await notifyEvent(createConnection(7710), {
					eventType: "status_change",
					eventId: 1,
					runId: "run-1",
					projectPath: "/repo",
					featureId: "fix-all-ui",
					step: null,
					data: null,
					createdAt: "2026-05-04T00:00:00.000Z",
				}),
			).toBe(false);

			globalThis.fetch = mock(async () => {
				throw new Error("daemon offline");
			}) as unknown as typeof fetch;

			expect(await stopDaemon(createConnection(7710))).toBe(false);
			expect(
				await notifyNotification(createConnection(7710), {
					id: 1,
					message: "offline",
					sourceType: "workflow",
					sourceId: null,
					route: null,
					projectId: null,
					createdAt: "2026-05-04T00:00:00.000Z",
				}),
			).toBe(false);
		});
	});
});
