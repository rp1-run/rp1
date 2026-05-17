import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { access } from "node:fs/promises";
import { join } from "node:path";
import { Command } from "commander";
import { installParentCommand } from "../../commands/install/index.js";
import {
	cleanupTempDir,
	createTempDir,
	withEnvOverride,
} from "../helpers/index.js";

const cliRoot = join(import.meta.dir, "..", "..", "..");
const ANSI_REGEX = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g");

const logger = {
	trace: () => {},
	debug: () => {},
	info: () => {},
	warn: () => {},
	error: () => {},
	start: () => {},
	success: () => {},
	fail: () => {},
	box: () => {},
};

const runInstallCommandInProcess = async (
	homeDir: string,
	args: readonly string[],
): Promise<readonly string[]> => {
	const logs: string[] = [];
	const originalLog = console.log;
	const restoreHome = withEnvOverride("HOME", homeDir);

	try {
		console.log = (...values: unknown[]) => {
			logs.push(values.map(String).join(" ").replace(ANSI_REGEX, ""));
		};
		const root = new Command("rp1");
		Object.assign(root, { _logger: logger, _isTTY: false });
		root.addCommand(installParentCommand);
		await root.parseAsync(["node", "rp1", ...args], { from: "node" });
		return logs;
	} finally {
		console.log = originalLog;
		restoreHome();
	}
};

const runStaticInstallCommandInProcess = async (
	homeDir: string,
	args: readonly string[],
): Promise<readonly string[]> => {
	const logs: string[] = [];
	const originalLog = console.log;
	const restoreHome = withEnvOverride("HOME", homeDir);

	try {
		console.log = (...values: unknown[]) => {
			logs.push(values.map(String).join(" ").replace(ANSI_REGEX, ""));
		};
		const root = new Command("rp1");
		Object.assign(root, { _logger: logger, _isTTY: false });
		root.addCommand(installParentCommand);
		await root.parseAsync(["node", "rp1", ...args], { from: "node" });
		return logs;
	} finally {
		console.log = originalLog;
		restoreHome();
	}
};

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

	test("runs the Gemini dry-run action in-process with P3 lifecycle guidance", async () => {
		const output = (
			await runInstallCommandInProcess(tempDir, [
				"install",
				"gemini",
				"--dry-run",
			])
		).join("\n");

		expect(output).toContain("Gemini CLI experimental extension setup");
		expect(output).toContain("Dry run: would write extension assets");
		expect(output).toContain("P3 boundary command:");
		expect(output).toContain("P3 lifecycle, trust, headless");
		expect(output).toContain("/rp1:boundaries");
	});

	test("runs the Gemini install action in-process and writes manifest assets", async () => {
		const output = (
			await runInstallCommandInProcess(tempDir, ["install", "gemini"])
		).join("\n");

		expect(output).toContain("Installed extension assets");
		expect(output).toContain("P2 delegation command:");
		expect(output).toContain("P3 boundary command:");
		await expect(
			access(
				join(
					tempDir,
					".gemini/extensions/rp1-phase2-validation/commands/rp1/boundaries.toml",
				),
			),
		).resolves.toBeNull();
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

	test("runs the parent --platform gemini route in-process", async () => {
		const output = (
			await runStaticInstallCommandInProcess(tempDir, [
				"install",
				"--platform",
				"gemini",
				"-y",
			])
		).join("\n");

		expect(output).toContain("Installing rp1 plugins to all detected tools");
		expect(output).toContain("[OK] Gemini CLI");
		expect(output).toContain("Verifying installation");
		expect(output).toContain("Gemini manifest lifecycle");
		expect(output).toContain("Gemini P3 boundary evidence");
		expect(output).toContain("Restart your agentic tools");
	});
});
