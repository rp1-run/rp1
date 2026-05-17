import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { Command } from "commander";
import { installParentCommand } from "../../commands/install/index.js";
import { cleanupTempDir, createTempDir } from "../helpers/index.js";

const cliRoot = join(import.meta.dir, "..", "..", "..");

describe("Gemini install command", () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await createTempDir("gemini-install-command");
	});

	afterEach(async () => {
		await cleanupTempDir(tempDir);
	});

	test("registers the Gemini install subcommand with P3 validation scope", () => {
		const subcommand = installParentCommand.commands.find(
			(command) => command.name() === "gemini",
		);

		expect(subcommand).toBeInstanceOf(Command);
		expect(subcommand?.description()).toContain("Gemini CLI");
		expect(subcommand?.description()).toContain(
			"smoke, P2, and P3 validation assets",
		);
	});

	test("dry-run output reports the exact Gemini validation scope", async () => {
		const proc = Bun.spawn(
			["bun", "src/main.ts", "install", "gemini", "--dry-run"],
			{
				cwd: cliRoot,
				env: {
					...process.env,
					HOME: tempDir,
					NO_COLOR: "1",
				},
				stdout: "pipe",
				stderr: "pipe",
			},
		);
		const [exitCode, stdout, stderr] = await Promise.all([
			proc.exited,
			new Response(proc.stdout).text(),
			new Response(proc.stderr).text(),
		]);

		expect(exitCode).toBe(0);
		expect(stderr).not.toContain("Logger not initialized");
		expect(stdout).toContain("Gemini CLI experimental extension setup");
		expect(stdout).toContain("Smoke command:");
		expect(stdout).toContain("P2 delegation command:");
		expect(stdout).toContain("P3 boundary command:");
		expect(stdout).toContain("Installed validation scope:");
		expect(stdout).toContain("/rp1:smoke");
		expect(stdout).toContain("/rp1:subagents");
		expect(stdout).toContain("/rp1:boundaries");
	});

	test("post-install verification reports manifest lifecycle and P3 readiness", async () => {
		const proc = Bun.spawn(
			["bun", "src/main.ts", "install", "--platform", "gemini", "-y"],
			{
				cwd: cliRoot,
				env: {
					...process.env,
					HOME: tempDir,
					NO_COLOR: "1",
				},
				stdout: "pipe",
				stderr: "pipe",
			},
		);
		const [exitCode, stdout, stderr] = await Promise.all([
			proc.exited,
			new Response(proc.stdout).text(),
			new Response(proc.stderr).text(),
		]);

		expect(exitCode).toBe(0);
		expect(stderr).not.toContain("Logger not initialized");
		expect(stdout).toContain("Gemini manifest lifecycle");
		expect(stdout).toContain("current");
		expect(stdout).toContain("Gemini P2 delegation evidence");
		expect(stdout).toContain("Gemini P3 boundary evidence");
		expect(stdout).toContain("/rp1:boundaries");
	});
});
