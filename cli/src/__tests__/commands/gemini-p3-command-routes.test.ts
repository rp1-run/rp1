import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { Command } from "commander";
import { uninstallCommand } from "../../commands/uninstall.js";
import { pluginsSubcommand } from "../../commands/update/plugins.js";
import { verifyGeminiSubcommand } from "../../commands/verify/gemini.js";
import {
	GEMINI_ASSET_MANIFEST,
	GEMINI_EXTENSION_RELATIVE_DIR,
} from "../../install/gemini/index.js";
import {
	cleanupTempDir,
	createTempDir,
	withEnvOverride,
	writeFixture,
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

const runVerifyGemini = async (
	args: readonly string[],
): ReturnType<typeof runRootCommand> => {
	const verify = new Command("verify");
	verify.addCommand(verifyGeminiSubcommand);
	return runRootCommand(verify, ["verify", "gemini", ...args]);
};

describe("Gemini P3 command routes", () => {
	let tempDir: string;
	let restoreHome: () => void;

	beforeEach(async () => {
		tempDir = await createTempDir("gemini-p3-command-routes");
		restoreHome = withEnvOverride("HOME", tempDir);
	});

	afterEach(async () => {
		restoreHome();
		await cleanupTempDir(tempDir);
	});

	test("explicit Gemini update refreshes manifest assets and prints restart guidance", async () => {
		const result = await runUpdatePlugins(["plugins", "gemini", "--yes"]);

		expect(result.exitCode).toBe(0);
		expect(result.output).toContain("Updating plugins for gemini");
		expect(result.output).toContain("Gemini CLI: Plugins updated successfully");
		expect(result.output).toContain("Lifecycle result: refreshed");
		expect(result.output).toContain("Please restart Gemini CLI");
	});

	test("explicit Gemini update exits nonzero when manifest assets are blocked", async () => {
		const blockedAsset = GEMINI_ASSET_MANIFEST[0];
		if (!blockedAsset) throw new Error("Gemini manifest is empty");
		await mkdir(join(tempDir, blockedAsset.relativePath), { recursive: true });

		const result = await runUpdatePlugins(["plugins", "gemini", "--yes"]);

		expect(result.exitCode).toBe(1);
		expect(result.output).toContain("Gemini CLI: Plugin update failed");
		expect(result.output).toContain("Lifecycle state: blocked");
		expect(result.output).toContain("Check file permissions");
	});

	test("update plugins rejects invalid Gemini-adjacent tool names before lifecycle work", async () => {
		const result = await runUpdatePlugins(["plugins", "gemini-beta"]);

		expect(result.exitCode).toBe(1);
		expect(result.errors).toContain("Invalid tool: gemini-beta");
		expect(result.output).not.toContain("Lifecycle stage:");
	});

	test("install parent dry-runs explicit Gemini routing without post-install verification", async () => {
		const result = await runRootCommand(await freshInstallParentCommand(), [
			"install",
			"--platform",
			"gemini",
			"--dry-run",
		]);

		expect(result.exitCode).toBe(0);
		expect(result.output).toContain("Installing rp1 plugins");
		expect(result.output).toContain("[OK] Gemini CLI");
		expect(result.output).toContain("/rp1:boundaries");
		expect(result.output).not.toContain("Verifying installation");
	});

	test("install parent verifies explicit Gemini installs through P3 readiness output", async () => {
		const result = await runRootCommand(await freshInstallParentCommand(), [
			"install",
			"--platform",
			"gemini",
			"--yes",
		]);

		expect(result.exitCode).toBe(0);
		expect(result.output).toContain("[OK] Gemini CLI");
		expect(result.output).toContain("Verifying installation");
		expect(result.output).toContain("Gemini manifest lifecycle");
		expect(result.output).toContain("Gemini P3 boundary evidence");
		expect(result.output).toContain("/rp1:boundaries");
	});

	test("install parent documents experimental Gemini as an explicit manual install path", async () => {
		const command = await freshInstallParentCommand();
		const help = command.helpInformation();

		expect(help).toContain("gemini");
		expect(help).toContain("Install experimental Gemini CLI smoke, P2, and P3");
		expect(help).toContain("Target a specific platform");
	});

	test("install parent reports invalid Gemini platform routing errors", async () => {
		const result = await runRootCommand(await freshInstallParentCommand(), [
			"install",
			"--platform",
			"missing-gemini",
			"--dry-run",
		]);

		expect(result.exitCode).toBe(1);
		expect(result.errors).toContain("Unknown tool: missing-gemini");
	});

	test("Gemini uninstall command cancels interactive removal in non-TTY routes", async () => {
		await writeFixture(
			tempDir,
			`${GEMINI_EXTENSION_RELATIVE_DIR}/agents/user-note.md`,
			"keep me",
		);

		const result = await runRootCommand(uninstallCommand, [
			"uninstall",
			"gemini",
		]);

		expect(result.exitCode).toBe(0);
		expect(result.output).toContain("Cancelled.");
	});

	test("Gemini uninstall dry-run reports inactive manifest state", async () => {
		const result = await runRootCommand(uninstallCommand, [
			"uninstall",
			"gemini",
			"--dry-run",
		]);

		expect(result.exitCode).toBe(0);
		expect(result.output).toContain(
			"Gemini CLI experimental extension uninstall",
		);
		expect(result.output).toContain(
			"No rp1-owned Gemini extension assets found",
		);
		expect(result.output).toContain("rp1 verify gemini");
	});

	test("verify Gemini subcommand exits through the P3 lifecycle readiness gate", async () => {
		const result = await runVerifyGemini([]);

		expect(result.exitCode).toBe(1);
		expect(result.output).toContain("Verifying Gemini CLI Smoke Command");
		expect(result.output).toContain("Manifest lifecycle:");
		expect(result.output).toContain("Gemini lifecycle path is degraded");
	});
});
