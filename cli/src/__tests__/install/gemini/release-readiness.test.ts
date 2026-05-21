import { describe, expect, test } from "bun:test";
import type { GeminiWorkflowSupportMatrix } from "../../../catalog/index.js";
import {
	buildGeminiReleaseReadinessRecord,
	evaluateGeminiRuntimeContract,
	renderGeminiReleaseReadinessMarkdown,
} from "../../../install/gemini/index.js";

const matrixWithUnsupportedRows = (): GeminiWorkflowSupportMatrix => ({
	updatedAt: "2026-05-19",
	entries: [
		{
			workflowId: "dev:build",
			name: "build",
			userFacingName: "rp1-dev:build",
			plugin: "dev",
			category: "development",
			workflowClass: "development_workflow",
			status: "unsupported",
			evidenceSource: null,
			unsupportedRationale:
				"No accepted Gemini runtime evidence currently promotes dev:build.",
			userAction:
				"Use Claude Code, OpenCode, Codex CLI, or GitHub Copilot CLI.",
			exceptionOwner: "rp1-maintainers",
			updatedAt: "2026-05-19",
			sourcePath: "plugins/dev/skills/build/SKILL.md",
			argumentNames: ["FEATURE_ID"],
		},
	],
	excludedEntries: [
		{
			workflowId: "dev:gemini-harness-smoke",
			name: "gemini-harness-smoke",
			userFacingName: "rp1-dev:gemini-harness-smoke",
			plugin: "dev",
			reason: "validation_only",
			rationale:
				"Gemini validation workflows collect release evidence and are not shipped product workflow support claims.",
			updatedAt: "2026-05-19",
			sourcePath: "plugins/dev/skills/gemini-harness-smoke/SKILL.md",
		},
	],
});

const existingHarnessPasses = [
	{
		harness: "claude-code" as const,
		status: "pass" as const,
		evidence: "verify-claude-code.test.ts",
	},
	{
		harness: "opencode" as const,
		status: "pass" as const,
		evidence: "install-core.test.ts",
	},
	{
		harness: "codex" as const,
		status: "pass" as const,
		evidence: "install-core.test.ts",
	},
	{
		harness: "copilot" as const,
		status: "pass" as const,
		evidence: "install-core.test.ts",
	},
];

describe("Gemini release readiness gate", () => {
	test("records pass, product exception, and blocking gap gates for release review", () => {
		const matrix = matrixWithUnsupportedRows();
		const runtimeEvaluation = evaluateGeminiRuntimeContract(matrix, null);

		const record = buildGeminiReleaseReadinessRecord({
			featureId: "gemini-cli-rp1-harness-first-class",
			runId: "run-123",
			generatedAt: "2026-05-19",
			matrix,
			lifecycleState: "current",
			bundleAssetCount: 6,
			runtimeEvaluation,
			docsAligned: false,
			cleanupRecorded: true,
			existingHarnessRegressions: existingHarnessPasses,
			nonGeminiSetupRequired: false,
		});

		expect(record.readinessStatus).toBe("fail");
		expect(record.readyForRelease).toBe(false);
		expect(record.blockingGaps).toEqual(["docs"]);
		expect(record.gates.map((gate) => [gate.id, gate.status])).toEqual([
			["inventory", "pass"],
			["lifecycle", "pass"],
			["bundle", "pass"],
			["runtime", "product_exception"],
			["docs", "blocking_gap"],
			["cleanup", "pass"],
			["existing_harness_regression", "pass"],
			["first_class_install", "pass"],
		]);

		const markdown = renderGeminiReleaseReadinessMarkdown(record);
		expect(markdown).toContain("| runtime | product_exception |");
		expect(markdown).toContain("| docs | blocking_gap |");
		expect(markdown).toContain("ready_for_release: false");
	});

	test("blocks release when stable harness regression evidence is incomplete or Gemini is missing from default install", () => {
		const matrix = matrixWithUnsupportedRows();
		const runtimeEvaluation = evaluateGeminiRuntimeContract(matrix, null);

		const record = buildGeminiReleaseReadinessRecord({
			featureId: "gemini-cli-rp1-harness-first-class",
			runId: "run-123",
			generatedAt: "2026-05-19",
			matrix,
			lifecycleState: "current",
			bundleAssetCount: 6,
			runtimeEvaluation,
			docsAligned: true,
			cleanupRecorded: true,
			existingHarnessRegressions: existingHarnessPasses.filter(
				(regression) => regression.harness !== "copilot",
			),
			nonGeminiSetupRequired: true,
		});

		expect(record.blockingGaps).toEqual([
			"existing_harness_regression",
			"first_class_install",
		]);
		expect(
			record.gates.find((gate) => gate.id === "existing_harness_regression")
				?.evidence,
		).toContain("missing=copilot");
		expect(
			record.gates.find((gate) => gate.id === "first_class_install")?.rationale,
		).toContain("Default install/update flow is missing a stable harness.");
	});
});
