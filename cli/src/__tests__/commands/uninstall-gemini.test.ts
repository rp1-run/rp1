import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { Command } from "commander";
import { cleanupTempDir, createTempDir } from "../helpers/index.js";

const cliRoot = join(import.meta.dir, "..", "..", "..");

describe("Gemini uninstall command", () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await createTempDir("gemini-uninstall-command");
	});

	afterEach(async () => {
		await cleanupTempDir(tempDir);
	});

	test("registers the Gemini uninstall subcommand with safe-removal options", async () => {
		const { uninstallCommand } = await import("../../commands/uninstall.js");

		const subcommand = uninstallCommand.commands.find(
			(command) => command.name() === "gemini",
		);

		expect(subcommand).toBeInstanceOf(Command);
		expect(subcommand?.description()).toContain("Gemini CLI");
		expect(
			subcommand?.options.some((option) => option.long === "--dry-run"),
		).toBe(true);
		expect(
			subcommand?.options.some(
				(option) => option.short === "-y" || option.long === "--yes",
			),
		).toBe(true);
	});

	test("executes the dry-run CLI path with root logger context", async () => {
		const proc = Bun.spawn(
			["bun", "src/main.ts", "uninstall", "gemini", "--dry-run"],
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
		expect(stdout).toContain("Gemini CLI experimental extension uninstall");
		expect(stdout).toContain("No rp1-owned Gemini extension assets found.");
	});
});
