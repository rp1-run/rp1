import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { stat } from "node:fs/promises";
import { join } from "node:path";
import {
	GEMINI_ALPHA_AGENT_MARKDOWN,
	GEMINI_ALPHA_AGENT_RELATIVE_PATH,
	GEMINI_ASSET_MANIFEST,
	GEMINI_BETA_AGENT_MARKDOWN,
	GEMINI_BETA_AGENT_RELATIVE_PATH,
	GEMINI_BOUNDARY_COMMAND_RELATIVE_PATH,
	GEMINI_BOUNDARY_COMMAND_TOML,
	GEMINI_BOUNDARY_SCENARIOS,
	GEMINI_BOUNDARY_STATES,
	GEMINI_BOUNDARY_STATUSES,
	GEMINI_EXTENSION_MANIFEST_JSON,
	GEMINI_EXTENSION_MANIFEST_RELATIVE_PATH,
	GEMINI_LIFECYCLE_STATES,
	GEMINI_MANIFEST_OWNED_RELATIVE_PATHS,
	GEMINI_P3_LIFECYCLE_GAP_CONSTRAINT,
	GEMINI_RUNTIME_FAIL_AGENT_MARKDOWN,
	GEMINI_RUNTIME_FAIL_AGENT_RELATIVE_PATH,
	GEMINI_SAFE_REMOVAL_RESULTS,
	GEMINI_SMOKE_COMMAND_DISPLAY_PATH,
	GEMINI_SMOKE_COMMAND_RELATIVE_PATH,
	GEMINI_SMOKE_COMMAND_TOML,
	GEMINI_SMOKE_STATUS_DETAILS,
	GEMINI_SUBAGENT_COMMAND_RELATIVE_PATH,
	GEMINI_SUBAGENT_COMMAND_TOML,
	installGeminiSmokeCommand,
	verifyGeminiSmokeSetup,
	writeGeminiBoundaryEvidenceArtifacts,
} from "../../../install/gemini/index.js";
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

describe("Gemini smoke command installer", () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await createTempDir("gemini-installer");
	});

	afterEach(async () => {
		await cleanupTempDir(tempDir);
	});

	test("models the required Gemini smoke readiness and failure states", () => {
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
		).toContain("Registration Output");
	});

	test("models the P3 lifecycle manifest and boundary evidence contracts", () => {
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
		expect(GEMINI_ASSET_MANIFEST.map((asset) => asset.relativePath)).toEqual(
			GEMINI_MANIFEST_OWNED_RELATIVE_PATHS,
		);
		expect(
			GEMINI_ASSET_MANIFEST.every(
				(asset) =>
					asset.owner === "rp1" &&
					asset.contentCheck === "exact_content" &&
					asset.safeRemovalEligible &&
					asset.lifecycleStages.includes("update") &&
					asset.lifecycleStages.includes("uninstall"),
			),
		).toBe(true);
	});

	test("dry-run reports the smoke command path without writing", async () => {
		const result = await expectTaskRight(
			installGeminiSmokeCommand({
				dryRun: true,
				homeDir: tempDir,
				getGeminiBinaryPath: () => "/usr/local/bin/gemini",
			}),
		);

		expect(result.commandWritten).toBe(false);
		expect(result.commandDisplayPath).toBe(GEMINI_SMOKE_COMMAND_DISPLAY_PATH);
		expect(await exists(result.commandPath)).toBe(false);
	});

	test("explicit install writes the Gemini smoke, P2, and boundary validation extension assets", async () => {
		const result = await expectTaskRight(
			installGeminiSmokeCommand({
				dryRun: false,
				homeDir: tempDir,
				getGeminiBinaryPath: () => "/usr/local/bin/gemini",
			}),
		);

		expect(result.commandWritten).toBe(true);
		expect(result.commandPath).toBe(
			join(tempDir, GEMINI_SMOKE_COMMAND_RELATIVE_PATH),
		);
		expect(GEMINI_EXTENSION_MANIFEST_RELATIVE_PATH).toBe(
			".gemini/extensions/rp1-phase2-validation/gemini-extension.json",
		);
		expect(GEMINI_SUBAGENT_COMMAND_RELATIVE_PATH).toBe(
			".gemini/extensions/rp1-phase2-validation/commands/rp1/subagents.toml",
		);
		expect(GEMINI_BOUNDARY_COMMAND_RELATIVE_PATH).toBe(
			".gemini/extensions/rp1-phase2-validation/commands/rp1/boundaries.toml",
		);
		expect(GEMINI_ALPHA_AGENT_RELATIVE_PATH).toBe(
			".gemini/extensions/rp1-phase2-validation/agents/rp1-alpha.md",
		);
		expect(GEMINI_BETA_AGENT_RELATIVE_PATH).toBe(
			".gemini/extensions/rp1-phase2-validation/agents/rp1-beta.md",
		);
		expect(GEMINI_RUNTIME_FAIL_AGENT_RELATIVE_PATH).toBe(
			".gemini/extensions/rp1-phase2-validation/agents/rp1-runtime-fail.md",
		);
		expect(await Bun.file(result.commandPath).text()).toBe(
			GEMINI_SMOKE_COMMAND_TOML,
		);
		expect(
			JSON.parse(
				await Bun.file(
					join(tempDir, GEMINI_EXTENSION_MANIFEST_RELATIVE_PATH),
				).text(),
			),
		).toEqual(JSON.parse(GEMINI_EXTENSION_MANIFEST_JSON));
		expect(
			await exists(join(tempDir, GEMINI_SMOKE_COMMAND_RELATIVE_PATH)),
		).toBe(true);
		expect(
			await Bun.file(
				join(tempDir, GEMINI_SUBAGENT_COMMAND_RELATIVE_PATH),
			).text(),
		).toBe(GEMINI_SUBAGENT_COMMAND_TOML);
		expect(
			await Bun.file(
				join(tempDir, GEMINI_BOUNDARY_COMMAND_RELATIVE_PATH),
			).text(),
		).toBe(GEMINI_BOUNDARY_COMMAND_TOML);
		expect(
			await Bun.file(join(tempDir, GEMINI_ALPHA_AGENT_RELATIVE_PATH)).text(),
		).toBe(GEMINI_ALPHA_AGENT_MARKDOWN);
		expect(
			await Bun.file(join(tempDir, GEMINI_BETA_AGENT_RELATIVE_PATH)).text(),
		).toBe(GEMINI_BETA_AGENT_MARKDOWN);
		expect(
			await Bun.file(
				join(tempDir, GEMINI_RUNTIME_FAIL_AGENT_RELATIVE_PATH),
			).text(),
		).toBe(GEMINI_RUNTIME_FAIL_AGENT_MARKDOWN);
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
		const result = await verifyGeminiSmokeSetup({
			paths: {
				commandFile: join(tempDir, GEMINI_SMOKE_COMMAND_RELATIVE_PATH),
				commandDisplayPath: GEMINI_SMOKE_COMMAND_DISPLAY_PATH,
			},
			getGeminiBinaryPath: () => null,
			pathExists: async () => false,
		});

		expect(result.status).toBe("degraded_missing_binary");
		expect(result.verified).toBe(false);
		expect(result.issues).toContain("Gemini CLI not found in PATH.");
		expect(result.remediation.join("\n")).toContain("Install Gemini CLI");
	});

	test("verify reports a missing smoke command when Gemini is installed", async () => {
		const result = await verifyGeminiSmokeSetup({
			paths: {
				commandFile: join(tempDir, GEMINI_SMOKE_COMMAND_RELATIVE_PATH),
				commandDisplayPath: GEMINI_SMOKE_COMMAND_DISPLAY_PATH,
			},
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

	test("verify reports ready when Gemini and the smoke command are present", async () => {
		const commandFile = await writeFixture(
			tempDir,
			GEMINI_SMOKE_COMMAND_RELATIVE_PATH,
			GEMINI_SMOKE_COMMAND_TOML,
		);

		const result = await verifyGeminiSmokeSetup({
			paths: {
				commandFile,
				commandDisplayPath: GEMINI_SMOKE_COMMAND_DISPLAY_PATH,
			},
			getGeminiBinaryPath: () => "/usr/local/bin/gemini",
			getGeminiVersion: async () => "gemini 1.2.3",
		});

		expect(result.status).toBe("experimental_ready");
		expect(result.verified).toBe(true);
		expect(result.issues).toEqual([]);
	});
});
