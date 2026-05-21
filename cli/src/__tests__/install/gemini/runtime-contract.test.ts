import { describe, expect, test } from "bun:test";
import type { GeminiWorkflowSupportMatrix } from "../../../catalog/index.js";
import {
	attributeGeminiWorkflowAttempt,
	evaluateGeminiRuntimeContract,
	type GeminiRuntimeContractEvidence,
} from "../../../install/gemini/index.js";

const matrixFixture = (): GeminiWorkflowSupportMatrix => ({
	updatedAt: "2026-05-19",
	entries: [
		{
			workflowId: "dev:build",
			name: "build",
			userFacingName: "rp1-dev:build",
			plugin: "dev",
			category: "development",
			workflowClass: "development_workflow",
			status: "supported",
			evidenceSource:
				"features/gemini-cli-rp1-harness-first-class/gemini-runtime-contract.md",
			unsupportedRationale: null,
			userAction: "Run the Gemini workflow.",
			exceptionOwner: null,
			updatedAt: "2026-05-19",
			sourcePath: "plugins/dev/skills/build/SKILL.md",
			argumentNames: ["FEATURE_ID"],
			runPolicy: "resumable",
			identityArgs: ["FEATURE_ID"],
		},
		{
			workflowId: "dev:pr-review",
			name: "pr-review",
			userFacingName: "rp1-dev:pr-review",
			plugin: "dev",
			category: "review",
			workflowClass: "review_workflow",
			status: "unsupported",
			evidenceSource: null,
			unsupportedRationale:
				"No accepted Gemini runtime evidence currently promotes dev:pr-review or its review workflow class from the catalog-backed matrix.",
			userAction:
				"Use Claude Code, OpenCode, Codex CLI, or GitHub Copilot CLI for this workflow until Gemini evidence promotes this entry.",
			exceptionOwner: "rp1-maintainers",
			updatedAt: "2026-05-19",
			sourcePath: "plugins/dev/skills/pr-review/SKILL.md",
			argumentNames: ["TARGET"],
			runPolicy: "fresh",
			identityArgs: ["TARGET"],
		},
	],
	excludedEntries: [],
});

const runtimeEvidence = (
	overrides: Partial<GeminiRuntimeContractEvidence["workflows"][number]> = {},
): GeminiRuntimeContractEvidence => ({
	schemaVersion: 1,
	featureId: "gemini-cli-rp1-harness-first-class",
	runId: "run-runtime",
	geminiVersion: "gemini 1.2.3",
	geminiExtensionAssets: true,
	workflows: [
		{
			workflowId: "dev:build",
			status: "passed",
			launchedFromBundle: true,
			artifactRelativePath:
				"features/gemini-cli-rp1-harness-first-class/build-readiness.md",
			artifactStorageRoot: "work_dir",
			artifactRegistered: true,
			activeRunId: "run-runtime",
			workRoot: "/tmp/rp1-work",
			failureAttribution: null,
			unsupportedRationale: null,
			userAction: null,
			...overrides,
		},
	],
});

describe("Gemini runtime contract", () => {
	test("passes supported Gemini workflows without requiring per-workflow runtime attestation", () => {
		const result = evaluateGeminiRuntimeContract(matrixFixture(), null);

		expect(result.status).toBe("passed");
		expect(result.workflows).toEqual([
			expect.objectContaining({
				workflowId: "dev:build",
				status: "passed",
				artifactRelativePath: null,
				activeRunId: null,
			}),
		]);
	});

	test("passes supported workflows with recorded work-root artifacts", () => {
		const result = evaluateGeminiRuntimeContract(
			matrixFixture(),
			runtimeEvidence(),
		);

		expect(result.status).toBe("passed");
		expect(result.workflows).toEqual([
			expect.objectContaining({
				workflowId: "dev:build",
				status: "passed",
				artifactRelativePath:
					"features/gemini-cli-rp1-harness-first-class/build-readiness.md",
				activeRunId: "run-runtime",
			}),
		]);
	});

	test("fails supported workflows when artifact registration evidence is missing", () => {
		const result = evaluateGeminiRuntimeContract(
			matrixFixture(),
			runtimeEvidence({
				artifactRegistered: false,
				failureAttribution:
					"Workflow completed locally but did not emit artifact_registered.",
			}),
		);

		expect(result.status).toBe("failed");
		expect(result.issue).toContain("did not register the expected work-root");
		expect(result.workflows[0]).toMatchObject({
			workflowId: "dev:build",
			status: "failed",
			activeRunId: "run-runtime",
		});
	});

	test("keeps supported workflow failures attributed to the failed workflow", () => {
		const result = evaluateGeminiRuntimeContract(
			matrixFixture(),
			runtimeEvidence({
				status: "failed",
				failureAttribution: "dev:build failed at release readiness gate.",
				userAction: "Fix the release gate and rerun dev:build.",
			}),
		);

		expect(result.status).toBe("failed");
		expect(result.issue).toBe("dev:build failed at release readiness gate.");
		expect(result.workflows[0]).toMatchObject({
			workflowId: "dev:build",
			status: "failed",
			userAction: "Fix the release gate and rerun dev:build.",
		});
	});

	test("attributes unsupported attempts to the product-owned matrix row", () => {
		const attribution = attributeGeminiWorkflowAttempt(
			matrixFixture(),
			"dev:pr-review",
		);

		expect(attribution).toMatchObject({
			workflowId: "dev:pr-review",
			status: "unsupported",
			productOwnedScope: true,
			exceptionOwner: "rp1-maintainers",
		});
		expect(attribution.rationale).toContain(
			"No accepted Gemini runtime evidence",
		);
		expect(attribution.userAction).toContain("Claude Code");
	});

	test("does not claim supported runtime work when the matrix has no supported rows", () => {
		const unsupportedOnly: GeminiWorkflowSupportMatrix = {
			...matrixFixture(),
			entries: matrixFixture().entries.filter(
				(entry) => entry.status === "unsupported",
			),
		};

		const result = evaluateGeminiRuntimeContract(unsupportedOnly, null);

		expect(result.status).toBe("not_run");
		expect(result.supportedWorkflowCount).toBe(0);
		expect(result.unsupportedWorkflowCount).toBe(1);
		expect(result.issue).toContain("no supported workflow runtime contract");
	});
});
