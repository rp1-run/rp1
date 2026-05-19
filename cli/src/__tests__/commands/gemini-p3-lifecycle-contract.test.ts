import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { writeGeminiBundleDistFixture } from "../helpers/gemini-bundle.js";
import { cleanupTempDir, createTempDir } from "../helpers/index.js";

const ANSI_REGEX = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g");
const cliRoot = join(import.meta.dir, "..", "..", "..");

const runCli = async (
	homeDir: string,
	bundleDir: string,
	args: readonly string[],
): Promise<{
	readonly exitCode: number;
	readonly stdout: string;
	readonly stderr: string;
}> => {
	const proc = Bun.spawn(["bun", "src/main.ts", ...args], {
		cwd: cliRoot,
		env: {
			...process.env,
			HOME: homeDir,
			NO_COLOR: "1",
			RP1_GEMINI_BUNDLE_DIR: bundleDir,
		},
		stdout: "pipe",
		stderr: "pipe",
	});
	const [exitCode, stdout, stderr] = await Promise.all([
		proc.exited,
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
	]);

	return {
		exitCode,
		stdout: stdout.replace(ANSI_REGEX, ""),
		stderr: stderr.replace(ANSI_REGEX, ""),
	};
};

describe("Gemini P3 lifecycle command contracts", () => {
	let tempDir: string;
	let bundleDir: string;

	beforeEach(async () => {
		tempDir = await createTempDir("gemini-p3-lifecycle-contract");
		bundleDir = await writeGeminiBundleDistFixture(tempDir);
	});

	afterEach(async () => {
		await cleanupTempDir(tempDir);
	});

	test("exercises targeted install, update, uninstall, and removed-verify routes in isolated HOME", async () => {
		const install = await runCli(tempDir, bundleDir, ["install", "gemini"]);
		expect(install.exitCode).toBe(0);
		expect(install.stderr).not.toContain("Logger not initialized");
		expect(install.stdout).toContain("Gemini extension assets");

		const boundaryCommandPath = join(
			tempDir,
			".gemini/extensions/rp1-base/commands/rp1-base/guide.toml",
		);
		await writeFile(boundaryCommandPath, "stale boundary command", "utf-8");

		const dryRunUpdate = await runCli(tempDir, bundleDir, [
			"update",
			"plugins",
			"gemini",
			"--dry-run",
		]);
		expect(dryRunUpdate.exitCode).toBe(0);
		expect(dryRunUpdate.stderr).not.toContain("Invalid tool: gemini");
		expect(dryRunUpdate.stdout).toContain("Updating plugins for gemini");
		expect(dryRunUpdate.stdout).toContain(
			"Gemini CLI: Plugins updated successfully",
		);
		expect(dryRunUpdate.stdout).toContain("Lifecycle stage: update");
		expect(dryRunUpdate.stdout).toContain("Lifecycle state: stale");
		expect(dryRunUpdate.stdout).toContain("Would refresh:");
		expect(dryRunUpdate.stdout).toContain("rp1 update plugins gemini -y");

		const update = await runCli(tempDir, bundleDir, [
			"update",
			"plugins",
			"gemini",
			"-y",
		]);
		expect(update.exitCode).toBe(0);
		expect(update.stderr).not.toContain("Invalid tool: gemini");
		expect(update.stdout).toContain("Lifecycle result: refreshed");
		expect(update.stdout).toContain("Restart Gemini CLI");
		expect(await readFile(boundaryCommandPath, "utf-8")).toContain(
			"Use rp1-guide",
		);

		const dryRunUninstall = await runCli(tempDir, bundleDir, [
			"uninstall",
			"gemini",
			"--dry-run",
		]);
		expect(dryRunUninstall.exitCode).toBe(0);
		expect(dryRunUninstall.stderr).not.toContain("Logger not initialized");
		expect(dryRunUninstall.stdout).toContain(
			"Gemini CLI extension bundle uninstall",
		);
		expect(dryRunUninstall.stdout).toContain(
			"Dry run: would remove rp1-owned Gemini assets",
		);

		const uninstall = await runCli(tempDir, bundleDir, [
			"uninstall",
			"gemini",
			"--yes",
		]);
		expect(uninstall.exitCode).toBe(0);
		expect(uninstall.stdout).toContain(
			"Removed rp1-owned Gemini extension assets",
		);

		const verifyAfterRemoval = await runCli(tempDir, bundleDir, [
			"verify",
			"gemini",
		]);
		expect(verifyAfterRemoval.exitCode).toBe(1);
		expect(verifyAfterRemoval.stdout).toContain("Manifest lifecycle:");
		expect(verifyAfterRemoval.stdout).toContain("State: removed");
		expect(verifyAfterRemoval.stdout).toContain(
			"No rp1-owned Gemini extension assets are installed.",
		);
		expect(verifyAfterRemoval.stdout).toContain("rp1 install gemini");
	});
});
