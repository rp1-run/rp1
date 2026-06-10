import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { access } from "node:fs/promises";
import { join } from "node:path";
import { Command } from "commander";
import { installParentCommand } from "../../commands/install/index.js";
import { writeGooseBundleDistFixture } from "../helpers/goose-bundle.js";
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
	const restoreBundle = withEnvOverride("RP1_GOOSE_BUNDLE_DIR", bundleDir);

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

describe("Goose install command", () => {
	let tempDir: string;
	let bundleDir: string;

	beforeEach(async () => {
		tempDir = await createTempDir("goose-install-command");
		bundleDir = await writeGooseBundleDistFixture(tempDir);
	});

	afterEach(async () => {
		await cleanupTempDir(tempDir);
	});

	test("registers the Goose install subcommand", () => {
		const subcommand = installParentCommand.commands.find(
			(command) => command.name() === "goose",
		);

		expect(subcommand).toBeInstanceOf(Command);
		expect(subcommand?.description()).toContain("Goose");
		expect(subcommand?.description()).toContain("recipes");
	});

	test("dry-run output reports Goose asset scope", async () => {
		const proc = Bun.spawn(
			["bun", "src/main.ts", "install", "goose", "--dry-run"],
			{
				cwd: cliRoot,
				env: {
					...process.env,
					HOME: tempDir,
					NO_COLOR: "1",
					RP1_GOOSE_BUNDLE_DIR: bundleDir,
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
		expect(stdout).toContain("Goose asset setup");
		expect(stdout).toContain("Goose assets");
		expect(stdout).toContain("Installed Goose scope:");
		expect(stdout).toContain("Recipe entrypoints");
		expect(stdout).toContain("Experimental core harness only");
		expect(stdout).toContain("Not ACP, protocol integration, eval expansion");
		expect(stdout).toContain("rp1 verify goose");
	});

	test("runs the Goose install action in-process and writes manifest assets", async () => {
		const output = (
			await runInstallCommandInProcess(tempDir, bundleDir, ["install", "goose"])
		).join("\n");

		expect(output).toContain("Installed");
		expect(output).toContain("Goose assets");
		await expect(
			access(join(tempDir, ".agents/skills/rp1-guide/SKILL.md")),
		).resolves.toBeNull();
		await expect(
			access(join(tempDir, ".agents/agents/rp1-dev-task-builder.md")),
		).resolves.toBeNull();
		await expect(
			access(join(tempDir, ".agents/recipes/rp1-base-guide.yaml")),
		).resolves.toBeNull();
	});
});
