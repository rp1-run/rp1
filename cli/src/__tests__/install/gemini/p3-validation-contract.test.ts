import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
	createGeminiBoundaryEvidence,
	GEMINI_BOUNDARY_HARNESS,
	GEMINI_BOUNDARY_SCENARIOS,
	GEMINI_BOUNDARY_WORKFLOW_NAME,
	type GeminiBoundaryEvidenceCommandResult,
	type GeminiBoundaryScenarioEvidence,
	getGeminiManifestLifecycleStatus,
	installGeminiSmokeCommand,
	persistGeminiBoundaryEvidence,
	refreshGeminiManifestAssets,
	uninstallGeminiExtensionAssets,
} from "../../../install/gemini/index.js";
import { createGeminiBundleAssetManifestFixture } from "../../helpers/gemini-bundle.js";
import {
	cleanupTempDir,
	createTempDir,
	expectTaskRight,
	writeFixture,
} from "../../helpers/index.js";

const bundleAssets = createGeminiBundleAssetManifestFixture();

const writeManifestAssets = async (homeDir: string): Promise<void> => {
	for (const asset of bundleAssets) {
		await writeFixture(homeDir, asset.relativePath, asset.expectedContent);
	}
};

const argAfter = (command: readonly string[], flag: string): string => {
	const index = command.indexOf(flag);
	expect(index).toBeGreaterThanOrEqual(0);
	return command[index + 1] ?? "";
};

const parseDataArg = (command: readonly string[]): Record<string, unknown> =>
	JSON.parse(argAfter(command, "--data")) as Record<string, unknown>;

const manualP3Scenarios = (): readonly GeminiBoundaryScenarioEvidence[] => [
	{
		scenario: "user_input",
		mode: "interactive",
		status: "blocked",
		state: "requires_user_input",
		blocker: "Gemini requested interactive input before continuing.",
		userAction: "Provide the requested input in Gemini, then resume or retry.",
		resumeSupported: true,
		workflowClasses: [],
		evidenceArtifactPath: null,
	},
	{
		scenario: "approval",
		mode: "interactive",
		status: "blocked",
		state: "requires_approval",
		blocker: "Gemini required shell or tool approval.",
		userAction: "Approve the Gemini action, then retry the boundary command.",
		resumeSupported: true,
		workflowClasses: [],
		evidenceArtifactPath: null,
	},
	{
		scenario: "trust",
		mode: "interactive",
		status: "blocked",
		state: "requires_trust",
		blocker: "Gemini required workspace trust before rp1 evidence could run.",
		userAction: "Trust the workspace in Gemini, then retry.",
		resumeSupported: true,
		workflowClasses: [],
		evidenceArtifactPath: null,
	},
	{
		scenario: "headless_no_gate",
		mode: "headless",
		status: "passed",
		state: "headless_supported",
		blocker: null,
		userAction: "Keep this as headless no-gate evidence.",
		resumeSupported: true,
		workflowClasses: [],
		evidenceArtifactPath: null,
	},
	{
		scenario: "headless_user_gate",
		mode: "headless",
		status: "unsupported",
		state: "headless_unsupported",
		blocker:
			"Gemini headless mode reached a user, trust, approval, or auth gate.",
		userAction:
			"Satisfy the gate in an interactive Gemini session, then rerun headless validation.",
		resumeSupported: false,
		workflowClasses: [],
		evidenceArtifactPath: null,
	},
	{
		scenario: "install_lifecycle",
		mode: "lifecycle",
		status: "passed",
		state: "current",
		blocker: null,
		userAction: "Run `rp1 verify gemini` after install.",
		resumeSupported: false,
		workflowClasses: [],
		evidenceArtifactPath: null,
		lifecycleStage: "install",
		lifecycleState: "current",
	},
	{
		scenario: "verify_lifecycle",
		mode: "lifecycle",
		status: "degraded",
		state: "missing",
		blocker: "Gemini binary or evidence was unavailable during verification.",
		userAction:
			"Install Gemini CLI or rerun verification with evidence present.",
		resumeSupported: false,
		workflowClasses: [],
		evidenceArtifactPath: null,
		lifecycleStage: "verify",
		lifecycleState: "missing",
	},
	{
		scenario: "update_lifecycle",
		mode: "lifecycle",
		status: "passed",
		state: "current",
		blocker: null,
		userAction: "Restart Gemini CLI, then run `rp1 verify gemini`.",
		resumeSupported: false,
		workflowClasses: [],
		evidenceArtifactPath: null,
		lifecycleStage: "update",
		lifecycleState: "current",
	},
	{
		scenario: "uninstall_lifecycle",
		mode: "lifecycle",
		status: "passed",
		state: "removed",
		blocker: null,
		userAction: "Run `rp1 verify gemini` to confirm assets are removed.",
		resumeSupported: false,
		workflowClasses: [],
		evidenceArtifactPath: null,
		lifecycleStage: "uninstall",
		lifecycleState: "removed",
	},
];

describe("Gemini P3 validation contracts", () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await createTempDir("gemini-p3-validation-contract");
	});

	afterEach(async () => {
		await cleanupTempDir(tempDir);
	});

	test("drives the real Gemini manifest through install, update, and uninstall states", async () => {
		const missing = await expectTaskRight(
			getGeminiManifestLifecycleStatus({
				homeDir: tempDir,
				stage: "install",
				assetManifest: bundleAssets,
			}),
		);
		expect(missing.state).toBe("missing");
		expect(missing.assets.every((asset) => asset.freshness === "missing")).toBe(
			true,
		);

		const dryRun = await expectTaskRight(
			installGeminiSmokeCommand({
				dryRun: true,
				homeDir: tempDir,
				getGeminiBinaryPath: () => "",
				assetManifest: bundleAssets,
			}),
		);
		expect(dryRun.commandWritten).toBe(false);
		expect(dryRun.warnings.join("\n")).toContain("Gemini CLI was not found");

		const installed = await expectTaskRight(
			installGeminiSmokeCommand({
				dryRun: false,
				homeDir: tempDir,
				getGeminiBinaryPath: () => "/usr/local/bin/gemini",
				assetManifest: bundleAssets,
			}),
		);
		expect(installed.commandWritten).toBe(true);

		const current = await expectTaskRight(
			getGeminiManifestLifecycleStatus({
				homeDir: tempDir,
				stage: "verify",
				assetManifest: bundleAssets,
			}),
		);
		expect(current.state).toBe("current");

		const staleAsset = bundleAssets[1];
		if (!staleAsset) throw new Error("Gemini manifest is empty");
		await writeFixture(tempDir, staleAsset.relativePath, "locally edited");
		const stale = await expectTaskRight(
			getGeminiManifestLifecycleStatus({
				homeDir: tempDir,
				stage: "update",
				assetManifest: bundleAssets,
			}),
		);
		expect(stale.state).toBe("stale");
		expect(
			stale.assets.find((asset) => asset.asset === staleAsset),
		).toMatchObject({
			freshness: "stale",
		});

		const preview = await expectTaskRight(
			refreshGeminiManifestAssets({
				dryRun: true,
				homeDir: tempDir,
				assetManifest: bundleAssets,
			}),
		);
		expect(preview.initialStatus.state).toBe("stale");
		expect(
			preview.refreshableAssets.map((asset) => asset.relativePath),
		).toContain(staleAsset.relativePath);
		expect(
			await readFile(join(tempDir, staleAsset.relativePath), "utf-8"),
		).toBe("locally edited");

		const refreshed = await expectTaskRight(
			refreshGeminiManifestAssets({
				dryRun: false,
				homeDir: tempDir,
				assetManifest: bundleAssets,
			}),
		);
		expect(refreshed.finalStatus.state).toBe("current");
		expect(refreshed.refreshedAssets).toHaveLength(1);

		const uninstallPreview = await expectTaskRight(
			uninstallGeminiExtensionAssets({
				dryRun: true,
				homeDir: tempDir,
				assetManifest: bundleAssets,
			}),
		);
		expect(uninstallPreview.state).toBe("current");
		expect(uninstallPreview.wouldRemoveFiles).toHaveLength(bundleAssets.length);

		const uninstalled = await expectTaskRight(
			uninstallGeminiExtensionAssets({
				dryRun: false,
				homeDir: tempDir,
				assetManifest: bundleAssets,
			}),
		);
		expect(uninstalled.state).toBe("removed");
		expect(uninstalled.inactive).toBe(true);
		expect(uninstalled.userAction).toContain("rp1 verify gemini");
	});

	test("classifies safe-removal blockers before deleting Gemini assets", async () => {
		await writeManifestAssets(tempDir);

		const staleAsset = bundleAssets[0];
		const directoryAsset = bundleAssets[1];
		if (!staleAsset || !directoryAsset) {
			throw new Error("Gemini manifest needs at least two assets");
		}

		await writeFixture(tempDir, staleAsset.relativePath, "user edited content");
		await rm(join(tempDir, directoryAsset.relativePath), { force: true });
		await mkdir(join(tempDir, directoryAsset.relativePath), {
			recursive: true,
		});
		await writeFixture(
			tempDir,
			".gemini/extensions/rp1-dev/agents/local-note.md",
			"keep me",
		);
		await mkdir(join(tempDir, ".gemini/extensions/rp1-base/local-tools"), {
			recursive: true,
		});

		const result = await expectTaskRight(
			uninstallGeminiExtensionAssets({
				dryRun: true,
				homeDir: tempDir,
				assetManifest: bundleAssets,
			}),
		);

		expect(result.state).toBe("blocked");
		expect(
			result.statuses.filter((status) => status.result === "blocked_unowned"),
		).toHaveLength(2);
		expect(result.issue).toContain("Gemini asset content differs");
		expect(result.userAction).toContain("Review");
		expect(result.unexpectedLeftovers).toEqual(
			expect.arrayContaining([
				"~/.gemini/extensions/rp1-dev/agents/local-note.md",
				"~/.gemini/extensions/rp1-base/local-tools",
			]),
		);
		expect(
			await readFile(join(tempDir, staleAsset.relativePath), "utf-8"),
		).toBe("user edited content");
	});

	test("reports missing and obstructed Gemini uninstall states without removing user files", async () => {
		const missingPreview = await expectTaskRight(
			uninstallGeminiExtensionAssets({
				dryRun: true,
				homeDir: tempDir,
				assetManifest: bundleAssets,
			}),
		);
		expect(missingPreview.state).toBe("missing");
		expect(missingPreview.userAction).toContain("rp1 verify gemini");

		const inactive = await expectTaskRight(
			uninstallGeminiExtensionAssets({
				dryRun: false,
				homeDir: tempDir,
				assetManifest: bundleAssets,
			}),
		);
		expect(inactive.state).toBe("removed");
		expect(inactive.inactive).toBe(true);

		await mkdir(dirname(join(tempDir, ".gemini/extensions")), {
			recursive: true,
		});
		await writeFile(join(tempDir, ".gemini/extensions"), "not a dir");
		const obstructed = await expectTaskRight(
			uninstallGeminiExtensionAssets({
				dryRun: true,
				homeDir: tempDir,
				assetManifest: bundleAssets,
			}),
		);
		expect(obstructed.state).toBe("missing");
		expect(obstructed.issue).toContain("Unexpected files remain");
		expect(obstructed.unexpectedLeftovers).toEqual(["~/.gemini/extensions"]);
	});

	test("normalizes support-matrix-ready evidence for every P3 smoke scenario", () => {
		const evidence = createGeminiBoundaryEvidence({
			featureId: "gemini-phase-3",
			runId: "run-p3-manual",
			geminiVersion: "unavailable",
			runContext: "manual-p3-smoke",
			scenarios: manualP3Scenarios(),
		});

		expect(evidence.scenarios.map((scenario) => scenario.scenario)).toEqual([
			...GEMINI_BOUNDARY_SCENARIOS,
		]);
		expect(evidence.overallStatus).toBe("blocked");
		expect(
			evidence.scenarios.every(
				(scenario) =>
					scenario.evidenceArtifactPath ===
					"features/gemini-phase-3/gemini-boundaries.md",
			),
		).toBe(true);
		expect(
			evidence.scenarios.filter(
				(scenario) => scenario.lifecycleStage && scenario.lifecycleState,
			),
		).toHaveLength(4);
		expect(evidence.workflowClasses).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					workflowClass: "build_fast",
					status: "blocked",
					evidenceStatus: "blocked",
					evidenceArtifactPath: "features/gemini-phase-3/gemini-boundaries.md",
				}),
			]),
		);
	});

	test("rejects invalid feature ids before writing boundary evidence", () => {
		expect(() =>
			createGeminiBoundaryEvidence({
				featureId: "../gemini-phase-3",
				runId: "run-invalid",
				scenarios: [],
			}),
		).toThrow("Invalid Gemini boundary evidence feature id");
	});

	test("classifies degraded, failed, and not-run boundary evidence distinctly", () => {
		const degraded = createGeminiBoundaryEvidence({
			featureId: "gemini-phase-3",
			runId: "run-degraded",
			scenarios: [
				{
					scenario: "verify_lifecycle",
					mode: "lifecycle",
					status: "degraded",
					state: "partial",
					blocker: "Only part of the Gemini manifest was present.",
					userAction: "Run `rp1 update plugins gemini`.",
					resumeSupported: true,
					workflowClasses: [],
					evidenceArtifactPath: null,
					lifecycleStage: "verify",
					lifecycleState: "partial",
				},
			],
		});
		expect(degraded.overallStatus).toBe("degraded");
		expect(degraded.workflowClasses[0]).toMatchObject({
			status: "experimental",
			evidenceStatus: "failed",
		});

		const failed = createGeminiBoundaryEvidence({
			featureId: "gemini-phase-3",
			runId: "run-failed",
			scenarios: [
				{
					scenario: "update_lifecycle",
					mode: "lifecycle",
					status: "failed",
					state: "blocked",
					blocker: "Gemini update failed.",
					userAction: "Check permissions, then rerun update.",
					resumeSupported: false,
					workflowClasses: [],
					evidenceArtifactPath: null,
					lifecycleStage: "update",
					lifecycleState: "blocked",
				},
			],
		});
		expect(failed.overallStatus).toBe("failed");
		expect(failed.workflowClasses[0]).toMatchObject({
			status: "blocked",
			evidenceStatus: "failed",
		});

		const notRun = createGeminiBoundaryEvidence({
			featureId: "gemini-phase-3",
			runId: "run-not-run",
			scenarios: [],
		});
		expect(notRun.overallStatus).toBe("not_run");
		expect(notRun.workflowClasses[0]).toMatchObject({
			status: "blocked",
			evidenceStatus: "not_run",
		});
	});

	test("persists boundary artifacts and emits registered Gemini work-root evidence", async () => {
		const commands: string[][] = [];
		const commandRunner = async (
			command: readonly string[],
		): Promise<GeminiBoundaryEvidenceCommandResult> => {
			commands.push([...command]);
			return {
				exitCode: 0,
				stdout: "",
				stderr: "",
			};
		};

		const result = await persistGeminiBoundaryEvidence({
			workRoot: tempDir,
			featureId: "gemini-phase-3",
			runId: "run-p3-unsupported",
			geminiVersion: "gemini 1.2.3",
			runContext: "headless-smoke",
			scenarios: [
				{
					scenario: "headless_user_gate",
					mode: "headless",
					status: "unsupported",
					state: "headless_unsupported",
					blocker: "Headless Gemini reached an interactive gate.",
					userAction:
						"Complete the gate in Gemini, then rerun the headless check.",
					resumeSupported: false,
					workflowClasses: [],
					evidenceArtifactPath: null,
				},
			],
			commandRunner,
		});

		expect(result.evidence.overallStatus).toBe("unsupported");
		expect(commands).toHaveLength(3);
		expect(await readFile(result.markdownPath, "utf-8")).toContain(
			"Headless Gemini reached an interactive gate.",
		);
		expect(JSON.parse(await readFile(result.jsonPath, "utf-8"))).toMatchObject({
			featureId: "gemini-phase-3",
			runId: "run-p3-unsupported",
			overallStatus: "unsupported",
		});

		const registrations = commands.slice(0, 2);
		expect(
			registrations.map((command) => ({
				harness: argAfter(command, "--harness"),
				workflow: argAfter(command, "--workflow"),
				type: argAfter(command, "--type"),
				step: argAfter(command, "--step"),
				data: parseDataArg(command),
			})),
		).toEqual([
			{
				harness: GEMINI_BOUNDARY_HARNESS,
				workflow: GEMINI_BOUNDARY_WORKFLOW_NAME,
				type: "artifact_registered",
				step: "evidence",
				data: {
					path: "features/gemini-phase-3/gemini-boundaries.md",
					feature: "gemini-phase-3",
					storageRoot: "work_dir",
					format: "markdown",
					harness: "gemini-cli",
				},
			},
			{
				harness: GEMINI_BOUNDARY_HARNESS,
				workflow: GEMINI_BOUNDARY_WORKFLOW_NAME,
				type: "artifact_registered",
				step: "evidence",
				data: {
					path: "features/gemini-phase-3/gemini-boundaries.json",
					feature: "gemini-phase-3",
					storageRoot: "work_dir",
					format: "json",
					harness: "gemini-cli",
				},
			},
		]);

		const terminalCommand = commands[2] ?? [];
		expect(argAfter(terminalCommand, "--type")).toBe("status_change");
		expect(argAfter(terminalCommand, "--step")).toBe("unsupported");
		expect(terminalCommand).toContain("--close-run");
		expect(parseDataArg(terminalCommand)).toMatchObject({
			status: "failed",
			feature: "gemini-phase-3",
			classification: "unsupported",
		});
	});

	test("marks terminal status failed when artifact registration fails", async () => {
		const commands: string[][] = [];
		const commandRunner = async (
			command: readonly string[],
		): Promise<GeminiBoundaryEvidenceCommandResult> => {
			commands.push([...command]);
			return {
				exitCode: commands.length === 1 ? 1 : 0,
				stdout: "",
				stderr: commands.length === 1 ? "registration failed" : "",
			};
		};

		const result = await persistGeminiBoundaryEvidence({
			workRoot: tempDir,
			featureId: "gemini-phase-3",
			runId: "run-registration-failed",
			scenarios: [
				{
					scenario: "install_lifecycle",
					mode: "lifecycle",
					status: "passed",
					state: "current",
					blocker: null,
					userAction: "Run `rp1 verify gemini`.",
					resumeSupported: false,
					workflowClasses: [],
					evidenceArtifactPath: null,
					lifecycleStage: "install",
					lifecycleState: "current",
				},
			],
			commandRunner,
		});

		expect(result.registrationResults[0]?.exitCode).toBe(1);
		const terminalCommand = commands.at(-1) ?? [];
		expect(argAfter(terminalCommand, "--step")).toBe("failed");
		expect(parseDataArg(terminalCommand)).toMatchObject({
			status: "failed",
			classification: "failed",
			reason:
				"Artifact registration failed after Gemini boundary evidence was written.",
		});
	});
});
