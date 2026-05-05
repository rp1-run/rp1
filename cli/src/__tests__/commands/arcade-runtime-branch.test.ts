import { afterEach, describe, expect, mock, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Command } from "commander";

class ProcessExit extends Error {
	readonly code: number;

	constructor(code: number | string | null | undefined) {
		super(`process.exit(${code ?? 0})`);
		this.code = Number(code ?? 0);
	}
}

const originalExit = process.exit;
const originalError = console.error;

async function importArcadeCommand() {
	return await import(
		`../../commands/arcade.ts?runtime-branch=${Date.now()}-${Math.random()}`
	);
}

describe("arcade command runtime branches", () => {
	afterEach(() => {
		process.exit = originalExit;
		console.error = originalError;
		mock.restore();
		mock.module("../../../shared/runtime.js", () => ({
			detectRuntime: () => ({ runtime: "bun" as const, version: Bun.version }),
			isBun: () => true,
		}));
	});

	test("prints Bun runtime guidance before daemon work in Node-like runtimes", async () => {
		const errors: string[] = [];
		process.exit = ((code?: number | string | null) => {
			throw new ProcessExit(code);
		}) as typeof process.exit;
		console.error = (...args: unknown[]) => {
			errors.push(args.map(String).join(" "));
		};

		mock.module("../../../shared/runtime.js", () => ({
			isBun: () => false,
		}));

		const { createArcadeCommand } = await importArcadeCommand();
		const command = createArcadeCommand({
			getStatus: async () => ({ running: false }),
		});
		command.exitOverride();

		await expect(
			command.parseAsync(["node", "arcade", "--status"]),
		).rejects.toMatchObject({ code: 1 });

		expect(errors.join("\n")).toContain(
			"Error: The 'arcade' command requires Bun runtime.",
		);
		expect(errors.join("\n")).toContain("bun rp1 arcade");
	});

	test("uses node child_process spawning when browser opening runs outside Bun", async () => {
		const tempDir = await mkdtemp(join(tmpdir(), "rp1-arcade-runtime-"));
		const infos: string[] = [];
		const debugs: string[] = [];
		const warnings: string[] = [];
		const spawned: Array<{ command: string; args: string[] }> = [];
		let runtimeChecks = 0;

		try {
			await mkdir(join(tempDir, ".rp1", "context"), { recursive: true });
			await writeFile(join(tempDir, ".rp1", "project_id"), "project-1\n");

			mock.module("../../../shared/runtime.js", () => ({
				isBun: () => {
					runtimeChecks += 1;
					return runtimeChecks === 1;
				},
			}));
			mock.module("node:child_process", () => ({
				spawn: (command: string, args: string[]) => {
					spawned.push({ command, args });
					return { unref: () => undefined };
				},
			}));

			const { createArcadeCommand } = await importArcadeCommand();
			const command = createArcadeCommand({
				launchArcadeForProject: async ({ port }: { port?: number }) => {
					const daemonPort = port ?? 7710;
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
			});
			const parent = new Command("rp1");
			parent.version("0.7.5");
			Object.assign(parent, {
				_logger: {
					debug: (message: string) => debugs.push(message),
					info: (message: string) => infos.push(message),
					warn: (message: string) => warnings.push(message),
					error: () => undefined,
				},
			});
			parent.addCommand(command);
			parent.exitOverride();

			await parent.parseAsync([
				"node",
				"rp1",
				"arcade",
				tempDir,
				"--port",
				"8131",
			]);

			const url = "http://127.0.0.1:8131/projects/project-1";
			const expectedSpawn =
				process.platform === "darwin"
					? { command: "open", args: [url] }
					: process.platform === "win32"
						? { command: "cmd", args: ["/c", "start", "", url] }
						: { command: "xdg-open", args: [url] };

			expect(spawned).toEqual([expectedSpawn]);
			expect(infos).toContain(`Opened ${url}`);
			expect(debugs.join("\n")).toContain("Opening browser");
			expect(warnings).toEqual([]);
		} finally {
			await rm(tempDir, { recursive: true, force: true });
		}
	});
});
