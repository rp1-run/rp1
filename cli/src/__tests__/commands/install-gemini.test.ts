import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { access } from "node:fs/promises";
import { join } from "node:path";
import { Command } from "commander";
import { installParentCommand } from "../../commands/install/index.js";
import { writeGeminiBundleDistFixture } from "../helpers/gemini-bundle.js";
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
	bundleDir: string,
	args: readonly string[],
): Promise<readonly string[]> => {
	const logs: string[] = [];
	const originalLog = console.log;
	const restoreHome = withEnvOverride("HOME", homeDir);
	const restoreBundle = withEnvOverride("RP1_GEMINI_BUNDLE_DIR", bundleDir);

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
		restoreBundle();
		restoreHome();
	}
};

describe("Gemini install command", () => {
	let tempDir: string;
	let bundleDir: string;

	beforeEach(async () => {
		tempDir = await createTempDir("gemini-install-command");
		bundleDir = await writeGeminiBundleDistFixture(tempDir);
	});

	afterEach(async () => {
		await cleanupTempDir(tempDir);
	});

	test("registers the Gemini install subcommand with bundle scope", () => {
		const subcommand = installParentCommand.commands.find(
			(command) => command.name() === "gemini",
		);

		expect(subcommand).toBeInstanceOf(Command);
		expect(subcommand?.description()).toContain("Gemini CLI");
		expect(subcommand?.description()).toContain("extension bundle assets");
	});

	test("dry-run output reports generated Gemini bundle scope", async () => {
		const proc = Bun.spawn(
			["bun", "src/main.ts", "install", "gemini", "--dry-run"],
			{
				cwd: cliRoot,
				env: {
					...process.env,
					HOME: tempDir,
					NO_COLOR: "1",
					RP1_GEMINI_BUNDLE_DIR: bundleDir,
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
		expect(stdout).toContain("Gemini CLI extension bundle setup");
		expect(stdout).toContain("generated bundle assets");
		expect(stdout).toContain("Installed bundle scope:");
		expect(stdout).toContain("Generated Gemini commands");
		expect(stdout).toContain("rp1 verify gemini");
	});

	test("runs the Gemini dry-run action in-process with bundle guidance", async () => {
		const output = (
			await runInstallCommandInProcess(tempDir, bundleDir, [
				"install",
				"gemini",
				"--dry-run",
			])
		).join("\n");

		expect(output).toContain("Gemini CLI extension bundle setup");
		expect(output).toContain("Dry run: would write");
		expect(output).toContain("rp1-base");
		expect(output).toContain("Gemini context, extension metadata");
	});

	test("runs the Gemini install action in-process and writes manifest assets", async () => {
		const output = (
			await runInstallCommandInProcess(tempDir, bundleDir, [
				"install",
				"gemini",
			])
		).join("\n");

		expect(output).toContain("Installed");
		expect(output).toContain("generated bundle assets");
		await expect(
			access(
				join(
					tempDir,
					".gemini/extensions/rp1-base/commands/rp1-base/guide.toml",
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
					RP1_GEMINI_BUNDLE_DIR: bundleDir,
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
		expect(stdout).toContain("Generated bundle assets");
		expect(stdout).toContain("rp1 verify gemini");
	});
});
