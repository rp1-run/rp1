import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { access } from "node:fs/promises";
import { join } from "node:path";
import { Command } from "commander";
import { createInstallAntigravitySubcommand } from "../../commands/install/antigravity.js";
import { installParentCommand } from "../../commands/install/index.js";
import { writeAntigravityBundleDistFixture } from "../helpers/antigravity-bundle.js";
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
	const restoreBundle = withEnvOverride(
		"RP1_ANTIGRAVITY_BUNDLE_DIR",
		bundleDir,
	);

	try {
		console.log = (...values: unknown[]) => {
			logs.push(values.map(String).join(" ").replace(ANSI_REGEX, ""));
		};
		const root = new Command("rp1");
		const install = new Command("install");
		Object.assign(root, { _logger: logger, _isTTY: false });
		root.addCommand(install);
		install.addCommand(createInstallAntigravitySubcommand({ homeDir }));
		await root.parseAsync(["node", "rp1", ...args], { from: "node" });
		return logs;
	} finally {
		console.log = originalLog;
		restoreBundle();
	}
};

describe("Antigravity install command", () => {
	let tempDir: string;
	let bundleDir: string;

	beforeEach(async () => {
		tempDir = await createTempDir("antigravity-install-command");
		bundleDir = await writeAntigravityBundleDistFixture(tempDir);
	});

	afterEach(async () => {
		await cleanupTempDir(tempDir);
	});

	test("registers the Antigravity install subcommand", () => {
		const subcommand = installParentCommand.commands.find(
			(command) => command.name() === "antigravity",
		);

		expect(subcommand).toBeInstanceOf(Command);
		expect(subcommand?.description()).toContain("Antigravity CLI");
		expect(subcommand?.description()).toContain("package assets");
	});

	test("dry-run output reports Antigravity package scope", async () => {
		const proc = Bun.spawn(
			["bun", "src/main.ts", "install", "antigravity", "--dry-run"],
			{
				cwd: cliRoot,
				env: {
					...process.env,
					NO_COLOR: "1",
					RP1_ANTIGRAVITY_BUNDLE_DIR: bundleDir,
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
		expect(stdout).toContain("Antigravity CLI package setup");
		expect(stdout).toContain("Antigravity package assets");
		expect(stdout).toContain("Installed Antigravity scope:");
		expect(stdout).toContain("Antigravity commands");
		expect(stdout).toContain("rp1 verify antigravity");
	});

	test("runs the Antigravity dry-run action in-process with bundle guidance", async () => {
		const output = (
			await runInstallCommandInProcess(tempDir, bundleDir, [
				"install",
				"antigravity",
				"--dry-run",
			])
		).join("\n");

		expect(output).toContain("Antigravity CLI package setup");
		expect(output).toContain("Dry run: would write");
		expect(output).toContain("rp1-base");
		expect(output).toContain("Antigravity hooks and MCP configuration");
	});

	test("runs the Antigravity install action in-process and writes manifest assets", async () => {
		const output = (
			await runInstallCommandInProcess(tempDir, bundleDir, [
				"install",
				"antigravity",
			])
		).join("\n");

		expect(output).toContain("Installed");
		expect(output).toContain("Antigravity package assets");
		await expect(
			access(
				join(
					tempDir,
					".gemini/antigravity-cli/rp1-base/commands/rp1-base/guide.toml",
				),
			),
		).resolves.toBeNull();
	});

	test("post-install verification reports manifest lifecycle and P3 readiness", async () => {
		const proc = Bun.spawn(
			["bun", "src/main.ts", "install", "--platform", "antigravity", "-y"],
			{
				cwd: cliRoot,
				env: {
					...process.env,
					NO_COLOR: "1",
					RP1_ANTIGRAVITY_BUNDLE_DIR: bundleDir,
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

		try {
			expect(exitCode).toBe(0);
			expect(stderr).not.toContain("Logger not initialized");
			expect(stdout).toContain("Antigravity manifest lifecycle");
			expect(stdout).toContain("current");
			expect(stdout).toContain("Antigravity CLI package validation");
			expect(stdout).toContain("rp1 verify antigravity");
		} finally {
			// The confirmed install writes real assets into the shared test
			// home; remove them so later tests observe a clean home.
			const cleanupProc = Bun.spawn(
				["bun", "src/main.ts", "uninstall", "antigravity", "--yes"],
				{
					cwd: cliRoot,
					env: {
						...process.env,
						NO_COLOR: "1",
						RP1_ANTIGRAVITY_BUNDLE_DIR: bundleDir,
					},
					stdout: "pipe",
					stderr: "pipe",
				},
			);
			await cleanupProc.exited;
		}
	});
});
