import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { access, mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { Command } from "commander";
import { uninstallCommand } from "../../commands/uninstall.js";
import {
	createAntigravityBundleAssetManifestFixture,
	writeAntigravityBundleDistFixture,
} from "../helpers/antigravity-bundle.js";
import {
	cleanupTempDir,
	createTempDir,
	withEnvOverride,
} from "../helpers/index.js";

const cliRoot = join(import.meta.dir, "..", "..", "..");
const ANSI_REGEX = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g");

class ProcessExit extends Error {
	readonly code: number;

	constructor(code: number | string | null | undefined) {
		super(`process.exit(${code ?? 0})`);
		this.code = Number(code ?? 0);
	}
}

const writeFileInHome = async (
	homeDir: string,
	relativePath: string,
	content: string,
): Promise<void> => {
	const targetPath = join(homeDir, relativePath);
	await mkdir(dirname(targetPath), { recursive: true });
	await writeFile(targetPath, content, "utf-8");
};

const writeAntigravityManifestAssets = async (
	homeDir: string,
): Promise<void> => {
	for (const asset of createAntigravityBundleAssetManifestFixture()) {
		await writeFileInHome(homeDir, asset.relativePath, asset.expectedContent);
	}
};

const runUninstallCommandInProcess = async (
	homeDir: string,
	bundleDir: string,
	args: readonly string[],
): Promise<{
	readonly output: string;
	readonly successes: readonly string[];
}> => {
	const logs: string[] = [];
	const successes: string[] = [];
	const originalHome = process.env.HOME;
	const originalLog = console.log;
	const originalExit = process.exit;
	const restoreBundle = withEnvOverride(
		"RP1_ANTIGRAVITY_BUNDLE_DIR",
		bundleDir,
	);

	try {
		process.env.HOME = homeDir;
		console.log = (...values: unknown[]) => {
			logs.push(values.map(String).join(" ").replace(ANSI_REGEX, ""));
		};
		process.exit = ((code?: number | string | null) => {
			throw new ProcessExit(code);
		}) as typeof process.exit;
		const root = new Command("rp1");
		Object.assign(root, {
			_logger: {
				trace: () => {},
				debug: () => {},
				info: () => {},
				warn: () => {},
				error: () => {},
				start: () => {},
				success: (message: string) => successes.push(message),
				fail: () => {},
				box: () => {},
			},
			_isTTY: false,
		});
		root.addCommand(uninstallCommand);
		await root.parseAsync(["node", "rp1", ...args], { from: "node" });
		return { output: logs.join("\n"), successes };
	} finally {
		restoreBundle();
		console.log = originalLog;
		process.exit = originalExit;
		if (originalHome === undefined) {
			delete process.env.HOME;
		} else {
			process.env.HOME = originalHome;
		}
	}
};

describe("Antigravity uninstall command", () => {
	let tempDir: string;
	let bundleDir: string;

	beforeEach(async () => {
		tempDir = await createTempDir("antigravity-uninstall-command");
		bundleDir = await writeAntigravityBundleDistFixture(tempDir);
	});

	afterEach(async () => {
		await cleanupTempDir(tempDir);
	});

	test("registers the Antigravity uninstall subcommand with safe-removal options", async () => {
		const subcommand = uninstallCommand.commands.find(
			(command) => command.name() === "antigravity",
		);

		expect(subcommand).toBeInstanceOf(Command);
		expect(subcommand?.description()).toContain("Antigravity CLI");
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
			["bun", "src/main.ts", "uninstall", "antigravity", "--dry-run"],
			{
				cwd: cliRoot,
				env: {
					...process.env,
					HOME: tempDir,
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
		expect(stdout).toContain("Antigravity CLI package uninstall");
		expect(stdout).toContain("No rp1-owned Antigravity package assets found.");
	});

	test("runs the dry-run action in-process with safe-removal details", async () => {
		await writeAntigravityManifestAssets(tempDir);
		await writeFileInHome(
			tempDir,
			".gemini/antigravity-cli/rp1-base/agents/user-note.md",
			"user-owned note",
		);

		const { output } = await runUninstallCommandInProcess(tempDir, bundleDir, [
			"uninstall",
			"antigravity",
			"--dry-run",
		]);

		expect(output).toContain("Antigravity CLI package uninstall");
		expect(output).toContain(
			"Dry run: would remove rp1-owned Antigravity assets",
		);
		expect(output).toContain("Unexpected leftovers preserved");
		expect(output).toContain("Inspect ~/.gemini/antigravity-cli");
		await expect(
			access(
				join(
					tempDir,
					".gemini/antigravity-cli/rp1-base/commands/rp1-base/guide.toml",
				),
			),
		).resolves.toBeNull();
	});

	test("runs the confirmed uninstall action in-process and removes owned assets", async () => {
		await writeAntigravityManifestAssets(tempDir);

		const { output, successes } = await runUninstallCommandInProcess(
			tempDir,
			bundleDir,
			["uninstall", "antigravity", "--yes"],
		);

		expect(output).toContain("Antigravity CLI package uninstall");
		expect(successes.join("\n")).toContain(
			"Removed rp1-owned Antigravity package assets",
		);
		expect(output).toContain("rp1 verify antigravity");
		await expect(
			access(
				join(
					tempDir,
					".gemini/antigravity-cli/rp1-base/commands/rp1-base/guide.toml",
				),
			),
		).rejects.toThrow();
	});
});
