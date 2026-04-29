import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Command } from "commander";
import {
	arcadeCommand,
	createArcadeCommand,
	formatArcadeHookPayload,
	formatLifecycleAction,
} from "../../commands/arcade.js";

class ProcessExit extends Error {
	readonly code: number;

	constructor(code: number | string | null | undefined) {
		super(`process.exit(${code ?? 0})`);
		this.code = Number(code ?? 0);
	}
}

describe("arcade command", () => {
	test("command name is 'arcade'", () => {
		expect(arcadeCommand.name()).toBe("arcade");
	});

	test("includes hidden daemon-only mode for internal flows", () => {
		expect(
			arcadeCommand.options.some((option) => option.long === "--daemon-only"),
		).toBe(true);
	});

	test("keeps browser opening enabled by default with a no-open fallback", () => {
		const noOpenOption = arcadeCommand.options.find(
			(option) => option.long === "--no-open",
		);

		expect(noOpenOption).toBeDefined();
		expect(
			arcadeCommand.options.some((option) => option.long === "--open"),
		).toBe(false);
	});

	test("keeps hook JSON as an explicit hidden output format", () => {
		const formatOption = arcadeCommand.options.find(
			(option) => option.long === "--format",
		);

		expect(formatOption?.argChoices).toEqual(["text", "hook-json"]);
		expect(formatOption?.defaultValue).toBe("text");
		expect(formatOption?.hidden).toBe(true);
	});

	test("formats hook payload with the resolved arcade url", () => {
		expect(
			formatArcadeHookPayload("http://127.0.0.1:7710/projects/test-id"),
		).toBe(
			JSON.stringify({
				systemMessage:
					"🕹️ rp1 Arcade is live at http://127.0.0.1:7710/projects/test-id",
			}),
		);
	});
});

describe("arcade command action coverage", () => {
	const originalExit = process.exit;
	const originalLog = console.log;
	const originalError = console.error;
	let tempDir: string;
	let logs: string[];
	let errors: string[];
	let infos: string[];
	let debugs: string[];
	let stoppedAction: "stopped" | "not_running";
	let status:
		| { running: false }
		| {
				running: true;
				port: number;
				uptime?: number;
				projectCount?: number;
		  };
	let daemonCalls: Array<{ port: number; kind: string; root?: string }>;

	beforeEach(async () => {
		tempDir = await mkdtemp(join(tmpdir(), "rp1-arcade-static-"));
		logs = [];
		errors = [];
		infos = [];
		debugs = [];
		stoppedAction = "stopped";
		status = { running: true, port: 7710, uptime: 61, projectCount: 2 };
		daemonCalls = [];

		process.exit = ((code?: number | string | null) => {
			throw new ProcessExit(code);
		}) as typeof process.exit;
		console.log = (...args: unknown[]) => {
			logs.push(args.map(String).join(" "));
		};
		console.error = (...args: unknown[]) => {
			errors.push(args.map(String).join(" "));
		};
	});

	afterEach(async () => {
		process.exit = originalExit;
		console.log = originalLog;
		console.error = originalError;
		await rm(tempDir, { recursive: true, force: true });
	});

	const createProject = async (): Promise<string> => {
		await mkdir(join(tempDir, ".rp1", "context"), { recursive: true });
		await writeFile(join(tempDir, ".rp1", "project_id"), "project-1\n");
		return tempDir;
	};

	const runArcade = async (args: readonly string[]) => {
		const command = createArcadeCommand({
			ensureDaemon: async (port: number) => {
				daemonCalls.push({ kind: "ensure", port });
				return {
					connection: { port, baseUrl: `http://127.0.0.1:${port}` },
					action: "reused" as const,
					reason: "missing_pid" as const,
					wasRunning: true,
				};
			},
			getStatus: async () => status,
			launchArcadeForProject: async ({ projectPath, port }) => {
				const daemonPort = port ?? 7710;
				daemonCalls.push({ kind: "ensure", port: daemonPort });
				daemonCalls.push({
					kind: "register",
					port: daemonPort,
					root: projectPath,
				});
				return {
					kind: "project" as const,
					projectId: "project-1",
					projectName: "Fixture Project",
					url: `http://127.0.0.1:${daemonPort}/projects/project-1`,
					action: "reused" as const,
					reason: "missing_pid" as const,
					wasRunning: true,
					daemonPort,
				};
			},
			restartDaemon: async (port: number) => {
				daemonCalls.push({ kind: "restart", port });
				return {
					connection: { port, baseUrl: `http://127.0.0.1:${port}` },
					action: "replaced" as const,
					reason: "version_mismatch" as const,
					wasRunning: true,
				};
			},
			stopDaemon: async () => ({ action: stoppedAction }),
		});
		const parent = new Command("rp1");
		parent.version("0.7.5");
		Object.assign(parent, {
			_logger: {
				debug: (message: string) => debugs.push(message),
				info: (message: string) => infos.push(message),
				warn: (message: string) => logs.push(`WARN ${message}`),
				error: (message: string) => errors.push(message),
			},
		});
		parent.addCommand(command);
		parent.exitOverride();
		return parent.parseAsync(["node", "rp1", "arcade", ...args]);
	};

	test("runs project, hook, daemon-only, restart, stop, and status branches", async () => {
		const projectRoot = await createProject();

		await runArcade([projectRoot, "--port", "8123", "--no-open"]);
		await runArcade([projectRoot, "--format", "hook-json", "--no-open"]);
		await runArcade(["--daemon-only", "--port", "8124"]);
		await runArcade([projectRoot, "--restart", "--port", "8125"]);
		await runArcade(["--stop"]);
		stoppedAction = "not_running";
		await runArcade(["--stop"]);
		await runArcade(["--status"]);
		status = { running: false };
		await runArcade(["--status"]);

		expect(daemonCalls.map((call) => call.kind)).toEqual([
			"ensure",
			"register",
			"ensure",
			"register",
			"ensure",
			"restart",
		]);
		expect(infos).toContain("Reused daemon on port 8123 (missing pid)");
		expect(infos).toContain("Project registered: Fixture Project (project-1)");
		expect(infos).toContain(
			"Server running at http://127.0.0.1:8123/projects/project-1",
		);
		expect(infos).toContain("Reused daemon on port 8124 (missing pid)");
		expect(infos).toContain("Replaced daemon on port 8125 (version mismatch)");
		expect(infos).toContain("Daemon stopped successfully");
		expect(infos).toContain("No daemon running");
		expect(debugs.join("\n")).toContain(`Registering project: ${projectRoot}`);
		expect(
			JSON.parse(logs.find((line) => line.startsWith("{")) ?? "{}"),
		).toEqual({
			systemMessage:
				"🕹️ rp1 Arcade is live at http://127.0.0.1:7710/projects/project-1",
		});
		expect(logs.join("\n")).toContain("Daemon Status: Running");
		expect(logs.join("\n")).toContain("Uptime: 1m 1s");
		expect(logs.join("\n")).toContain("Projects: 2");
		expect(logs.join("\n")).toContain("Daemon Status: Stopped");
		expect(errors).toEqual([]);
	});

	test("maps daemon port conflicts to CLI exit code", async () => {
		const projectRoot = await createProject();
		const conflict = new Error("port busy") as Error & { port: number };
		conflict.name = "DaemonPortConflictError";
		conflict.port = 8126;

		const command = createArcadeCommand({
			launchArcadeForProject: async () => {
				throw conflict;
			},
		});
		const parent = new Command("rp1");
		parent.version("0.7.5");
		Object.assign(parent, {
			_logger: {
				debug: () => {},
				info: () => {},
				warn: () => {},
				error: () => {},
			},
		});
		parent.addCommand(command);
		parent.exitOverride();

		await expect(
			parent.parseAsync([
				"node",
				"rp1",
				"arcade",
				projectRoot,
				"--port",
				"8126",
				"--no-open",
			]),
		).rejects.toMatchObject({ code: 3 });
		expect(errors.join("\n")).toContain("Port 8126 is already in use");
	});
});

describe("formatLifecycleAction", () => {
	test("reports reused daemon on the given port", () => {
		expect(formatLifecycleAction("reused", 7710)).toBe(
			"Reused daemon on port 7710",
		);
	});

	test("reports started daemon on the given port", () => {
		expect(formatLifecycleAction("started", 8080)).toBe(
			"Started daemon on port 8080",
		);
	});

	test("reports replaced daemon with no reason", () => {
		expect(formatLifecycleAction("replaced", 7710)).toBe(
			"Replaced daemon on port 7710",
		);
	});

	test("reports replaced daemon with version_mismatch reason", () => {
		expect(formatLifecycleAction("replaced", 7710, "version_mismatch")).toBe(
			"Replaced daemon on port 7710 (version mismatch)",
		);
	});

	test("reports replaced daemon with unhealthy_daemon reason", () => {
		expect(formatLifecycleAction("replaced", 9090, "unhealthy_daemon")).toBe(
			"Replaced daemon on port 9090 (unhealthy daemon)",
		);
	});

	test("reports replaced daemon with stale_pid reason", () => {
		expect(formatLifecycleAction("replaced", 7710, "stale_pid")).toBe(
			"Replaced daemon on port 7710 (stale pid)",
		);
	});

	test("reason underscores are replaced with spaces for readability", () => {
		const msg = formatLifecycleAction("replaced", 7710, "missing_pid");
		expect(msg).toContain("missing pid");
		expect(msg).not.toContain("missing_pid");
	});

	test("reused action includes reason when present", () => {
		expect(formatLifecycleAction("reused", 7710, "missing_pid")).toBe(
			"Reused daemon on port 7710 (missing pid)",
		);
		expect(formatLifecycleAction("reused", 7710, "stale_pid")).toBe(
			"Reused daemon on port 7710 (stale pid)",
		);
	});

	test("started action never includes reason", () => {
		expect(formatLifecycleAction("started", 7710, "missing_pid")).toBe(
			"Started daemon on port 7710",
		);
	});
});
