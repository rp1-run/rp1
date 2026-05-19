import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Command } from "commander";
import { pluginsSubcommand } from "../../commands/update/plugins.js";
import { writeGeminiBundleDistFixture } from "../helpers/gemini-bundle.js";
import {
	cleanupTempDir,
	createTempDir,
	withEnvOverride,
} from "../helpers/index.js";

class ProcessExit extends Error {
	readonly code: number;

	constructor(code: number | string | null | undefined) {
		super(`process.exit(${code ?? 0})`);
		this.code = Number(code ?? 0);
	}
}

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

const ANSI_REGEX = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g");

const runRootCommand = async (
	command: Command,
	args: readonly string[],
): Promise<{
	readonly exitCode: number;
	readonly output: string;
	readonly errors: string;
}> => {
	const root = new Command("rp1");
	Object.assign(root, { _logger: logger, _isTTY: false });
	root.addCommand(command);

	const logs: string[] = [];
	const errors: string[] = [];
	const originalLog = console.log;
	const originalError = console.error;
	const originalExit = process.exit;

	try {
		console.log = (...values: unknown[]) => {
			logs.push(values.map(String).join(" ").replace(ANSI_REGEX, ""));
		};
		console.error = (...values: unknown[]) => {
			errors.push(values.map(String).join(" ").replace(ANSI_REGEX, ""));
		};
		process.exit = ((code?: number | string | null) => {
			throw new ProcessExit(code);
		}) as typeof process.exit;

		try {
			await root.parseAsync(["node", "rp1", ...args], { from: "node" });
			return {
				exitCode: 0,
				output: logs.join("\n"),
				errors: errors.join("\n"),
			};
		} catch (error) {
			if (error instanceof ProcessExit) {
				return {
					exitCode: error.code,
					output: logs.join("\n"),
					errors: errors.join("\n"),
				};
			}
			throw error;
		}
	} finally {
		console.log = originalLog;
		console.error = originalError;
		process.exit = originalExit;
	}
};

const freshInstallParentCommand = async (): Promise<Command> => {
	const module = await import(
		`../../commands/install/index.js?gemini-p3-routes=${Date.now()}-${Math.random()}`
	);
	return module.installParentCommand;
};

const runUpdatePlugins = async (
	args: readonly string[],
): ReturnType<typeof runRootCommand> => {
	const update = new Command("update")
		.option("--dry-run", "Show what would be done without executing", false)
		.option("-y, --yes", "Skip confirmation prompts", false);
	update.addCommand(pluginsSubcommand);
	return runRootCommand(update, ["update", ...args]);
};

describe("Gemini P3 command routes", () => {
	let tempDir: string;
	let restoreHome: () => void;
	let restoreBundle: () => void;

	beforeEach(async () => {
		tempDir = await createTempDir("gemini-p3-command-routes");
		restoreHome = withEnvOverride("HOME", tempDir);
		restoreBundle = withEnvOverride(
			"RP1_GEMINI_BUNDLE_DIR",
			await writeGeminiBundleDistFixture(tempDir),
		);
	});

	afterEach(async () => {
		restoreBundle();
		restoreHome();
		await cleanupTempDir(tempDir);
	});

	test("update plugins rejects invalid Gemini-adjacent tool names before lifecycle work", async () => {
		const result = await runUpdatePlugins(["plugins", "gemini-beta"]);

		expect(result.exitCode).toBe(1);
		expect(result.errors).toContain("Invalid tool: gemini-beta");
		expect(result.output).not.toContain("Lifecycle stage:");
	});

	test("install parent dry-runs targeted Gemini routing without post-install verification", async () => {
		const result = await runRootCommand(await freshInstallParentCommand(), [
			"install",
			"--platform",
			"gemini",
			"--dry-run",
		]);

		expect(result.exitCode).toBe(0);
		expect(result.output).toContain("Installing rp1 plugins");
		expect(result.output).toContain("[OK] Gemini CLI");
		expect(result.output).toContain("rp1-base");
		expect(result.output).toContain("rp1-dev");
		expect(result.output).not.toContain("Verifying installation");
	});
});
