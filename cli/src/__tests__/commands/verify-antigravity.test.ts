import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Command } from "commander";
import type { Logger } from "../../../shared/logger.js";
import {
	type AntigravityVerifyOptions,
	executeVerifyAntigravity,
	verifyAntigravitySubcommand,
} from "../../commands/verify/antigravity.js";
import type { AntigravityVerifyDeps } from "../../install/antigravity/index.js";
import { createAntigravityBundleAssetManifestFixture } from "../helpers/antigravity-bundle.js";
import { cleanupTempDir, createTempDir } from "../helpers/index.js";

const ANSI_REGEX = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g");

const logger = {} as Logger;
const originalLog = console.log;
const bundleAssets = createAntigravityBundleAssetManifestFixture();

const currentManifestAssetReader = async (path: string): Promise<string> => {
	const asset = bundleAssets.find((entry) => path.endsWith(entry.relativePath));
	if (!asset) throw new Error(`Unexpected Antigravity manifest asset: ${path}`);
	return asset.expectedContent;
};

const readyVerifyDeps = (homeDir: string): AntigravityVerifyDeps => ({
	homeDir,
	getAntigravityBinaryPath: () => "/usr/local/bin/agy",
	getAntigravityVersion: async () => "agy 1.2.3",
	assetManifest: bundleAssets,
	readAssetFile: currentManifestAssetReader,
	runAgyPluginValidate: async () => ({
		exitCode: 0,
		stdout: "ok",
		stderr: "",
	}),
});

const captureVerifyOutput = async (
	deps: AntigravityVerifyDeps,
	options: AntigravityVerifyOptions = {},
): Promise<{ readonly ok: boolean; readonly output: string }> => {
	const logs: string[] = [];
	console.log = (...args: unknown[]) => {
		logs.push(args.map(String).join(" "));
	};

	try {
		const ok = await executeVerifyAntigravity(logger, deps, options);
		return {
			ok,
			output: logs.join("\n").replace(ANSI_REGEX, ""),
		};
	} finally {
		console.log = originalLog;
	}
};

describe("Antigravity verify command", () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await createTempDir("antigravity-verify-command");
	});

	afterEach(async () => {
		console.log = originalLog;
		await cleanupTempDir(tempDir);
	});

	test("attributes supported workflow attempts from the support matrix", async () => {
		const result = await captureVerifyOutput(readyVerifyDeps(tempDir), {
			workflowId: "dev:build",
		});

		expect(result.ok).toBe(true);
		expect(result.output).toContain("Workflow attempt attribution:");
		expect(result.output).toContain("Workflow: dev:build");
		expect(result.output).toContain("State: supported");
		expect(result.output).toContain(
			"Product scope: supported Antigravity matrix row",
		);
		expect(result.output).toContain(
			"Workflow is distributable, user-invocable",
		);
		expect(result.output).toContain("Limitation: none");
		expect(result.output).toContain("Next action:");
		expect(result.output).toContain("Antigravity verification passed");
	});

	test("prints limited delegated workflow boundaries without failing verification", async () => {
		const result = await captureVerifyOutput(readyVerifyDeps(tempDir), {
			workflowId: "dev:build-fast",
		});

		expect(result.ok).toBe(true);
		expect(result.output).toContain("Workflow: dev:build-fast");
		expect(result.output).toContain("State: limited");
		expect(result.output).toContain("define_subagent");
		expect(result.output).toContain("invoke_subagent");
		expect(result.output).toContain("Delegation: dynamic_session_subagents");
		expect(result.output).toContain("Required subagents: dev:task-builder");
		expect(result.output).toContain("Antigravity workflow support is limited");
	});

	test("fails unsupported workflow attempts with reason and fallback", async () => {
		const result = await captureVerifyOutput(readyVerifyDeps(tempDir), {
			workflowId: "dev:legacy-workflow",
		});

		expect(result.ok).toBe(false);
		expect(result.output).toContain("Workflow: dev:legacy-workflow");
		expect(result.output).toContain("State: unsupported");
		expect(result.output).toContain(
			"Workflow is not validated for Antigravity CLI",
		);
		expect(result.output).toContain(
			"No Antigravity runtime evidence exists for this workflow.",
		);
		expect(result.output).toContain("Fallback:");
		expect(result.output).toContain(
			"Antigravity workflow support requires attention",
		);
	});

	test("fails unknown workflow attempts with a catalog refresh fallback", async () => {
		const result = await captureVerifyOutput(readyVerifyDeps(tempDir), {
			workflowId: "dev:unknown",
		});

		expect(result.ok).toBe(false);
		expect(result.output).toContain("Workflow: dev:unknown");
		expect(result.output).toContain("State: unknown");
		expect(result.output).toContain(
			"dev:unknown is not present in the Antigravity support matrix.",
		);
		expect(result.output).toContain(
			"Confirm the workflow id or rebuild Antigravity assets",
		);
		expect(result.output).toContain(
			"Antigravity workflow support requires attention",
		);
	});

	test("exposes workflow attribution in command help", () => {
		const root = new Command("rp1");
		const verify = new Command("verify");
		root.addCommand(verify);
		verify.addCommand(verifyAntigravitySubcommand);

		const help = verifyAntigravitySubcommand.helpInformation();

		expect(help).toContain("--workflow <workflowId>");
		expect(help).toContain(
			"Attribute an Antigravity workflow attempt against the",
		);
		expect(help).toContain("support matrix");
	});
});
