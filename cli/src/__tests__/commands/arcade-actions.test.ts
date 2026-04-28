import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Command } from "commander";
import type { ArcadeLaunchOptions } from "../../arcade/launch.js";

type ProjectLaunchOptions = ArcadeLaunchOptions & {
	readonly projectPath: string;
};

class ProcessExit extends Error {
	readonly code: number;

	constructor(code: number | string | null | undefined) {
		super(`process.exit(${code ?? 0})`);
		this.code = Number(code ?? 0);
	}
}

describe("arcade command actions", () => {
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
		tempDir = await mkdtemp(join(tmpdir(), "rp1-arcade-actions-"));
		logs = [];
		errors = [];
		infos = [];
		debugs = [];
		stoppedAction = "stopped";
		status = { running: true, port: 7710, uptime: 3661, projectCount: 2 };
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
		const { createArcadeCommand } = await import(
			`../../commands/arcade.js?arcade-actions=${Date.now()}-${Math.random()}`
		);
		const arcadeCommand = createArcadeCommand({
			ensureDaemon: async (port: number) => {
				daemonCalls.push({ kind: "ensure", port });
				return {
					connection: { port, baseUrl: `http://127.0.0.1:${port}` },
					action: "reused" as const,
					reason: "missing_pid",
					wasRunning: true,
				};
			},
			getStatus: async () => status,
			launchArcadeForProject: async ({
				projectPath,
				port,
			}: ProjectLaunchOptions) => {
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
					reason: "version_mismatch",
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
		parent.addCommand(arcadeCommand);
		parent.exitOverride();
		return parent.parseAsync(["node", "rp1", "arcade", ...args]);
	};

	test("starts arcade for a valid project without opening the browser", async () => {
		const projectRoot = await createProject();

		await runArcade([projectRoot, "--port", "8123", "--no-open"]);

		expect(daemonCalls).toEqual([
			{ kind: "ensure", port: 8123 },
			{ kind: "register", port: 8123, root: projectRoot },
		]);
		expect(infos).toContain("Reused daemon on port 8123 (missing pid)");
		expect(infos).toContain("Project registered: Fixture Project (project-1)");
		expect(infos).toContain(
			"Server running at http://127.0.0.1:8123/projects/project-1",
		);
		expect(debugs.join("\n")).toContain(`Registering project: ${projectRoot}`);
	});

	test("prints hook-json after registering the project", async () => {
		const projectRoot = await createProject();

		await runArcade([projectRoot, "--format", "hook-json", "--no-open"]);

		expect(JSON.parse(logs.at(-1) ?? "{}")).toEqual({
			systemMessage:
				"🕹️ rp1 Arcade is live at http://127.0.0.1:7710/projects/project-1",
		});
		expect(daemonCalls.map((call) => call.kind)).toEqual([
			"ensure",
			"register",
		]);
	});

	test("supports daemon-only mode without project registration", async () => {
		await runArcade(["--daemon-only", "--port", "8124"]);

		expect(daemonCalls).toEqual([{ kind: "ensure", port: 8124 }]);
		expect(infos).toContain("Reused daemon on port 8124 (missing pid)");
	});

	test("restarts the daemon using the resolved project config", async () => {
		const projectRoot = await createProject();

		await runArcade([projectRoot, "--restart", "--port", "8125"]);

		expect(daemonCalls).toEqual([{ kind: "restart", port: 8125 }]);
		expect(infos).toContain("Replaced daemon on port 8125 (version mismatch)");
	});

	test("stops the daemon and reports stopped or absent states", async () => {
		await runArcade(["--stop"]);
		expect(infos).toContain("Daemon stopped successfully");

		stoppedAction = "not_running";
		await runArcade(["--stop"]);
		expect(infos).toContain("No daemon running");
	});

	test("renders running and stopped status output", async () => {
		await runArcade(["--status"]);
		expect(logs.join("\n")).toContain("Daemon Status: Running");
		expect(logs.join("\n")).toContain("Port: 7710");
		expect(logs.join("\n")).toContain("Uptime: 1h 1m 1s");
		expect(logs.join("\n")).toContain("Projects: 2");

		status = { running: false };
		await runArcade(["--status"]);
		expect(logs.join("\n")).toContain("Daemon Status: Stopped");
	});

	test("fails before daemon startup when the project is missing .rp1", async () => {
		await expect(runArcade([tempDir, "--no-open"])).rejects.toMatchObject({
			code: 4,
		});

		expect(errors.join("\n")).toContain(".rp1/project_id");
		expect(daemonCalls).toEqual([]);
	});
});
