import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { stat } from "node:fs/promises";
import { join } from "node:path";
import {
	GEMINI_BOUNDARY_SCENARIOS,
	GEMINI_BOUNDARY_STATES,
	GEMINI_BOUNDARY_STATUSES,
	GEMINI_LIFECYCLE_STATES,
	GEMINI_P3_LIFECYCLE_GAP_CONSTRAINT,
	GEMINI_SAFE_REMOVAL_RESULTS,
	GEMINI_SMOKE_STATUS_DETAILS,
	installGeminiBundleAssets,
	loadGeminiBundleAssetManifest,
	verifyGeminiBundleSetup,
	writeGeminiBoundaryEvidenceArtifacts,
} from "../../../install/gemini/index.js";
import {
	createBundledGeminiAssetsFixture,
	createGeminiBundleAssetManifestFixture,
} from "../../helpers/gemini-bundle.js";
import {
	cleanupTempDir,
	createTempDir,
	expectTaskRight,
	writeFixture,
} from "../../helpers/index.js";

const exists = async (path: string): Promise<boolean> => {
	try {
		await stat(path);
		return true;
	} catch {
		return false;
	}
};

describe("Gemini bundle asset installer", () => {
	let tempDir: string;
	const bundleAssets = createGeminiBundleAssetManifestFixture();
	const primaryCommand = bundleAssets.find((asset) => asset.kind === "command");

	beforeEach(async () => {
		tempDir = await createTempDir("gemini-installer");
	});

	afterEach(async () => {
		await cleanupTempDir(tempDir);
	});

	test("models the required Gemini bundle readiness and failure states", () => {
		expect(Object.keys(GEMINI_SMOKE_STATUS_DETAILS)).toEqual([
			"experimental_ready",
			"degraded_missing_binary",
			"degraded_missing_command",
			"degraded_trust_or_approval",
			"registration_failed",
		]);
		expect(
			GEMINI_SMOKE_STATUS_DETAILS.degraded_trust_or_approval.remediation,
		).toContain("Approve Gemini shell execution");
		expect(
			GEMINI_SMOKE_STATUS_DETAILS.registration_failed.remediation,
		).toContain("artifact registration output");
	});

	test("models the P3 lifecycle states and boundary evidence contracts", () => {
		expect(GEMINI_LIFECYCLE_STATES).toEqual([
			"current",
			"missing",
			"partial",
			"stale",
			"removed",
			"blocked",
			"unsupported_before_p3",
		]);
		expect(GEMINI_SAFE_REMOVAL_RESULTS).toContain("blocked_unowned");
		expect(GEMINI_P3_LIFECYCLE_GAP_CONSTRAINT).toContain(
			"named Gemini update and uninstall lifecycle routes are not assumed to exist",
		);
		expect(GEMINI_BOUNDARY_SCENARIOS).toContain("headless_user_gate");
		expect(GEMINI_BOUNDARY_SCENARIOS).toContain("uninstall_lifecycle");
		expect(GEMINI_BOUNDARY_STATUSES).toEqual([
			"passed",
			"degraded",
			"blocked",
			"unsupported",
			"failed",
			"not_run",
		]);
		expect(GEMINI_BOUNDARY_STATES).toContain("requires_trust");
		expect(GEMINI_BOUNDARY_STATES).toContain("unsupported_before_p3");
	});

	test("derives manifest-owned assets from a generated Gemini bundle", async () => {
		const assets = await loadGeminiBundleAssetManifest({
			bundledAssets: createBundledGeminiAssetsFixture(),
		});

		expect(assets.map((asset) => asset.relativePath)).toEqual(
			expect.arrayContaining([
				".gemini/extensions/rp1-base/commands/rp1-base/guide.toml",
				".gemini/extensions/rp1-base/skills/rp1-guide/SKILL.md",
				".gemini/extensions/rp1-base/gemini-extension.json",
				".gemini/extensions/rp1-dev/agents/rp1-dev-task-builder.md",
				".gemini/extensions/rp1-dev/support-matrix.json",
			]),
		);
		expect(
			assets.every(
				(asset) =>
					asset.owner === "rp1" &&
					asset.contentCheck === "exact_content" &&
					asset.safeRemovalEligible &&
					asset.lifecycleStages.includes("update") &&
					asset.lifecycleStages.includes("uninstall"),
			),
		).toBe(true);
	});

	test("rejects non-Gemini bundle manifests before deriving lifecycle ownership", async () => {
		const bundledAssets = createBundledGeminiAssetsFixture();
		const geminiPlatform = bundledAssets.platforms.gemini;
		if (!geminiPlatform?.platform) throw new Error("missing Gemini fixture");

		await expect(
			loadGeminiBundleAssetManifest({
				bundledAssets: {
					...bundledAssets,
					platforms: {
						gemini: {
							...geminiPlatform,
							platform: {
								...geminiPlatform.platform,
								id: "opencode",
							},
						},
					},
				},
			}),
		).rejects.toThrow("Embedded Gemini bundle metadata is for opencode");

		const distDir = join(tempDir, "dist-opencode");
		await writeFixture(
			distDir,
			"bundle-manifest.json",
			`${JSON.stringify({
				platform: {
					id: "opencode",
					name: "OpenCode",
					binary: "opencode",
					instructionFile: "AGENTS.md",
				},
				plugins: {
					base: {
						name: "rp1-base",
						commands: [],
						agents: [],
						skills: [],
						stateMachines: [],
						verbatimFiles: [],
					},
					dev: {
						name: "rp1-dev",
						commands: [],
						agents: [],
						skills: [],
						stateMachines: [],
						verbatimFiles: [],
					},
				},
				version: "0.0.0-test",
				buildTimestamp: "2026-05-19T00:00:00Z",
			})}\n`,
		);

		await expect(loadGeminiBundleAssetManifest({ distDir })).rejects.toThrow(
			"Expected Gemini bundle manifest",
		);
	});

	test("dry-run reports the primary command path without writing", async () => {
		const result = await expectTaskRight(
			installGeminiBundleAssets({
				dryRun: true,
				homeDir: tempDir,
				getGeminiBinaryPath: () => "/usr/local/bin/gemini",
				assetManifest: bundleAssets,
			}),
		);

		expect(result.commandWritten).toBe(false);
		expect(result.commandDisplayPath).toBe(bundleAssets[1]?.displayPath);
		expect(await exists(result.commandPath)).toBe(false);
	});

	test("explicit install writes generated Gemini bundle assets", async () => {
		const result = await expectTaskRight(
			installGeminiBundleAssets({
				dryRun: false,
				homeDir: tempDir,
				getGeminiBinaryPath: () => "/usr/local/bin/gemini",
				assetManifest: bundleAssets,
			}),
		);

		expect(result.commandWritten).toBe(true);
		expect(result.commandPath).toBe(
			join(tempDir, bundleAssets[1]?.relativePath ?? ""),
		);
		expect(await Bun.file(result.commandPath).text()).toBe(
			bundleAssets[1]?.expectedContent,
		);
		for (const asset of bundleAssets) {
			expect(await Bun.file(join(tempDir, asset.relativePath)).text()).toBe(
				asset.expectedContent,
			);
		}
	});

	test("persists mergeable Gemini boundary markdown and JSON evidence", async () => {
		const first = await writeGeminiBoundaryEvidenceArtifacts({
			workRoot: tempDir,
			featureId: "gemini-phase-3",
			runId: "run-boundary-1",
			geminiVersion: "gemini 1.2.3",
			runContext: "manual",
			scenarios: [
				{
					scenario: "trust",
					mode: "interactive",
					status: "blocked",
					state: "requires_trust",
					blocker: "Workspace trust required.",
					userAction: "Trust the workspace, then retry.",
					resumeSupported: true,
					workflowClasses: [],
					evidenceArtifactPath: null,
				},
			],
		});
		const second = await writeGeminiBoundaryEvidenceArtifacts({
			workRoot: tempDir,
			featureId: "gemini-phase-3",
			runId: "run-boundary-2",
			geminiVersion: "gemini 1.2.4",
			runContext: "headless",
			scenarios: [
				{
					scenario: "headless_user_gate",
					mode: "headless",
					status: "unsupported",
					state: "headless_unsupported",
					blocker: "Headless run reached an interactive gate.",
					userAction: "Complete the gate interactively, then retry.",
					resumeSupported: false,
					workflowClasses: [],
					evidenceArtifactPath: null,
				},
			],
		});

		expect(first.markdownRelativePath).toBe(
			"features/gemini-phase-3/gemini-boundaries.md",
		);
		expect(second.jsonRelativePath).toBe(
			"features/gemini-phase-3/gemini-boundaries.json",
		);
		expect(second.evidence.overallStatus).toBe("blocked");
		expect(
			second.evidence.scenarios.map((scenario) => scenario.scenario),
		).toEqual(["trust", "headless_user_gate"]);
		expect(
			second.evidence.scenarios.every(
				(scenario) =>
					scenario.evidenceArtifactPath ===
					"features/gemini-phase-3/gemini-boundaries.md",
			),
		).toBe(true);
		expect(await Bun.file(second.markdownPath).text()).toContain(
			"Workspace trust required.",
		);
		expect(JSON.parse(await Bun.file(second.jsonPath).text())).toMatchObject({
			featureId: "gemini-phase-3",
			runId: "run-boundary-2",
			geminiVersion: "gemini 1.2.4",
			overallStatus: "blocked",
		});
	});

	test("verify reports a missing Gemini binary with install guidance", async () => {
		if (!primaryCommand) throw new Error("missing primary command fixture");

		const result = await verifyGeminiBundleSetup({
			paths: {
				commandFile: join(tempDir, primaryCommand.relativePath),
				commandDisplayPath: primaryCommand.displayPath,
			},
			assetManifest: bundleAssets,
			getGeminiBinaryPath: () => null,
			pathExists: async () => false,
		});

		expect(result.status).toBe("degraded_missing_binary");
		expect(result.verified).toBe(false);
		expect(result.issues).toContain("Gemini CLI not found in PATH.");
		expect(result.remediation.join("\n")).toContain("Install Gemini CLI");
	});

	test("verify reports a missing primary command when Gemini is installed", async () => {
		if (!primaryCommand) throw new Error("missing primary command fixture");

		const result = await verifyGeminiBundleSetup({
			paths: {
				commandFile: join(tempDir, primaryCommand.relativePath),
				commandDisplayPath: primaryCommand.displayPath,
			},
			assetManifest: bundleAssets,
			getGeminiBinaryPath: () => "/usr/local/bin/gemini",
			getGeminiVersion: async () => "gemini 1.2.3",
			pathExists: async () => false,
		});

		expect(result.status).toBe("degraded_missing_command");
		expect(result.verified).toBe(false);
		expect(result.remediation).toContain(
			"Install the Gemini extension assets with `rp1 install gemini`.",
		);
	});

	test("verify reports ready when Gemini and the primary command are present", async () => {
		if (!primaryCommand) throw new Error("missing primary command fixture");

		const commandFile = await writeFixture(
			tempDir,
			primaryCommand.relativePath,
			primaryCommand.expectedContent,
		);

		const result = await verifyGeminiBundleSetup({
			paths: {
				commandFile,
				commandDisplayPath: primaryCommand.displayPath,
			},
			assetManifest: bundleAssets,
			getGeminiBinaryPath: () => "/usr/local/bin/gemini",
			getGeminiVersion: async () => "gemini 1.2.3",
		});

		expect(result.status).toBe("experimental_ready");
		expect(result.verified).toBe(true);
		expect(result.issues).toEqual([]);
	});
});
