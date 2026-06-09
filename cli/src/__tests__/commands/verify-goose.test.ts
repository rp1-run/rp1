import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { Logger } from "../../../shared/logger.js";
import {
	executeVerifyGoose,
	verifyGooseSubcommand,
} from "../../commands/verify/goose.js";
import {
	type GooseVerifyDeps,
	installGooseBundleAssets,
} from "../../install/goose/index.js";
import {
	createGooseBundleAssetManifestFixture,
	writeGooseBundleAssetManifestFixture,
} from "../helpers/goose-bundle.js";
import {
	cleanupTempDir,
	createTempDir,
	expectTaskRight,
} from "../helpers/index.js";

const ANSI_REGEX = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g");

const logger = {} as Logger;
const originalLog = console.log;
const bundleAssets = createGooseBundleAssetManifestFixture();

const passingCommand = async () => ({
	exitCode: 0,
	stdout: "ok",
	stderr: "",
});

const readyVerifyDeps = (homeDir: string): GooseVerifyDeps => ({
	homeDir,
	getGooseBinaryPath: () => "/usr/local/bin/goose",
	getGooseVersion: async () => "goose 1.37.0",
	assetManifest: bundleAssets,
	runGooseRecipeValidate: passingCommand,
	runGooseRecipeRender: passingCommand,
});

const captureVerifyOutput = async (
	deps: GooseVerifyDeps,
): Promise<{ readonly ok: boolean; readonly output: string }> => {
	const logs: string[] = [];
	console.log = (...args: unknown[]) => {
		logs.push(args.map(String).join(" "));
	};

	try {
		const ok = await executeVerifyGoose(logger, deps);
		return {
			ok,
			output: logs.join("\n").replace(ANSI_REGEX, ""),
		};
	} finally {
		console.log = originalLog;
	}
};

describe("Goose verify command", () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await createTempDir("goose-verify-command");
		await writeGooseBundleAssetManifestFixture(tempDir, bundleAssets);
	});

	afterEach(async () => {
		console.log = originalLog;
		await cleanupTempDir(tempDir);
	});

	test("prints binary, asset, recipe, support metadata, and smoke status", async () => {
		const result = await captureVerifyOutput(readyVerifyDeps(tempDir));

		expect(result.ok).toBe(false);
		expect(result.output).toContain("Goose CLI verification");
		expect(result.output).toContain("Goose CLI");
		expect(result.output).toContain("Manifest assets");
		expect(result.output).toContain("Recipe validation:");
		expect(result.output).toContain("State: passed");
		expect(result.output).toContain("Support metadata:");
		expect(result.output).toContain("Runtime smoke:");
		expect(result.output).toContain("not_run");
		expect(result.output).toContain("Goose lifecycle path is degraded");
	});

	test("reports ready after install writes the version marker", async () => {
		const deps = readyVerifyDeps(tempDir);
		await expectTaskRight(
			installGooseBundleAssets({
				dryRun: false,
				homeDir: tempDir,
				assetManifest: bundleAssets,
				getGooseBinaryPath: () => "/usr/local/bin/goose",
			}),
		);

		const result = await captureVerifyOutput(deps);

		expect(result.ok).toBe(true);
		expect(result.output).toContain("Goose CLI ready");
		expect(result.output).toContain("Runtime smoke:");
		expect(result.output).toContain("not_run");
		expect(result.output).not.toContain("Issues Found:");
	});

	test("exposes Goose verify in command help", () => {
		const help = verifyGooseSubcommand.helpInformation();

		expect(help).toContain("Verify Goose CLI");
		expect(help).toContain("support metadata");
	});
});
