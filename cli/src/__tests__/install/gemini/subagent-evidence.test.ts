import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import {
	createGeminiSubagentEvidence,
	GEMINI_HEAVYWEIGHT_WORKFLOW_CLASSES,
	GEMINI_SUBAGENT_HARNESS,
	GEMINI_SUBAGENT_MARKERS,
	GEMINI_SUBAGENT_WORKFLOW_NAME,
	type GeminiSubagentReductionPayload,
	getGeminiSubagentEvidenceRelativePaths,
	persistGeminiSubagentEvidence,
} from "../../../install/gemini/index.js";
import { cleanupTempDir, createTempDir } from "../../helpers/index.js";

const passingPayload = (
	overrides: GeminiSubagentReductionPayload = {},
): GeminiSubagentReductionPayload => ({
	alpha_agent: "rp1-alpha",
	alpha_output: `alpha says ${GEMINI_SUBAGENT_MARKERS.alpha}`,
	beta_agent: "@rp1-beta",
	beta_output: `beta says ${GEMINI_SUBAGENT_MARKERS.beta}`,
	failing_agent: "rp1-runtime-fail",
	failing_status: "failed",
	failing_error: "ModelNotFoundError: intentional invalid model",
	acknowledgement_required: false,
	...overrides,
});

const createEvidence = (parentPayload: GeminiSubagentReductionPayload) =>
	createGeminiSubagentEvidence({
		featureId: "gemini-phase2",
		runId: "run-123",
		geminiVersion: "gemini 1.2.3",
		parentPayload,
	});

const argAfter = (command: readonly string[], flag: string): string => {
	const index = command.indexOf(flag);
	expect(index).toBeGreaterThanOrEqual(0);
	const value = command[index + 1];
	expect(value).toBeDefined();
	return value ?? "";
};

const parseEmitData = (command: readonly string[]): Record<string, unknown> =>
	JSON.parse(argAfter(command, "--data"));

describe("Gemini subagent evidence helper", () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await createTempDir("gemini-subagent-evidence");
	});

	afterEach(async () => {
		await cleanupTempDir(tempDir);
	});

	test("classifies complete alpha beta and intentional failure evidence as passed", () => {
		const evidence = createEvidence(passingPayload());

		expect(evidence.overallStatus).toBe("passed");
		expect(evidence.customSubagent).toMatchObject({
			status: "passed",
			agentName: "rp1-alpha",
			expectedOutput: GEMINI_SUBAGENT_MARKERS.alpha,
		});
		expect(evidence.fanout).toMatchObject({
			status: "passed",
			expectedUnits: ["alpha", "beta"],
			missingUnits: [],
			duplicateUnits: [],
		});
		expect(evidence.failureHandling).toMatchObject({
			status: "passed",
			failedUnitVisible: true,
			successfulOutputsPreserved: true,
		});
		expect(evidence.acknowledgement).toMatchObject({
			status: "passed",
			usableWithoutExtraAcknowledgement: true,
			caveats: [],
		});
		expect(evidence.workflowClasses).toEqual(
			GEMINI_HEAVYWEIGHT_WORKFLOW_CLASSES.map((workflowClass) => ({
				workflowClass,
				status: "experimental",
				reason:
					"Gemini P2 delegation evidence passed; heavyweight workflow classes remain experimental until maintainers upgrade support policy.",
				evidenceArtifactPath: "features/gemini-phase2/gemini-subagents.md",
				evidenceStatus: "passed",
			})),
		);
	});

	test("fails missing successful delegated output without dropping preserved attribution", () => {
		const evidence = createEvidence(passingPayload({ beta_output: "" }));

		expect(evidence.overallStatus).toBe("failed");
		expect(evidence.fanout.status).toBe("failed");
		expect(evidence.fanout.missingUnits).toEqual(["beta"]);
		expect(
			evidence.fanout.outputs.find((output) => output.unitId === "alpha"),
		).toMatchObject({
			status: "passed",
			actualMarker: GEMINI_SUBAGENT_MARKERS.alpha,
		});
		expect(evidence.failureHandling.status).toBe("failed");
		expect(evidence.failureHandling.successfulOutputsPreserved).toBe(false);
		expect(
			evidence.workflowClasses.every(({ status }) => status === "blocked"),
		).toBe(true);
	});

	test("fails duplicated delegated output markers", () => {
		const evidence = createEvidence(
			passingPayload({
				beta_output: `duplicate ${GEMINI_SUBAGENT_MARKERS.alpha}`,
			}),
		);

		expect(evidence.overallStatus).toBe("failed");
		expect(evidence.fanout.status).toBe("failed");
		expect(evidence.fanout.duplicateUnits).toEqual(["alpha", "beta"]);
		expect(evidence.fanout.issue).toContain(
			"duplicated expected outputs: alpha, beta",
		);
	});

	test("fails when the intentional delegated failure is not visibly reported", () => {
		const evidence = createEvidence(
			passingPayload({
				failing_status: "completed",
			}),
		);

		expect(evidence.overallStatus).toBe("failed");
		expect(evidence.fanout.status).toBe("passed");
		expect(evidence.failureHandling).toMatchObject({
			status: "failed",
			failedUnitVisible: false,
			successfulOutputsPreserved: true,
		});
		expect(evidence.failureHandling.issue).toContain(
			"missing visible failure status",
		);
	});

	test("fails when the runtime delegated failure lacks an error message", () => {
		const evidence = createEvidence(
			passingPayload({
				failing_error: "",
			}),
		);

		expect(evidence.overallStatus).toBe("failed");
		expect(evidence.failureHandling.issue).toContain(
			"missing visible failure message",
		);
	});

	test("blocks validation when acknowledgement caveats are reported", () => {
		const evidence = createEvidence(
			passingPayload({
				acknowledgement_required: true,
				acknowledgement_scope: "project",
				acknowledgement_reason:
					"New Agents Discovered acknowledgement required.",
				acknowledgement_user_action:
					"Review Gemini project agents and rerun validation.",
			}),
		);

		expect(evidence.overallStatus).toBe("blocked");
		expect(evidence.acknowledgement.status).toBe("blocked");
		expect(evidence.acknowledgement.caveats).toEqual([
			{
				scope: "project",
				required: true,
				affectedWorkflowClasses: GEMINI_HEAVYWEIGHT_WORKFLOW_CLASSES,
				reason: "New Agents Discovered acknowledgement required.",
				userAction: "Review Gemini project agents and rerun validation.",
			},
		]);
		expect(
			evidence.workflowClasses.every(({ status }) => status === "blocked"),
		).toBe(true);
	});

	test("writes markdown and JSON artifacts and emits explicit work-root registrations", async () => {
		const commands: string[][] = [];
		const result = await persistGeminiSubagentEvidence({
			featureId: "gemini-phase2",
			runId: "run-123",
			geminiVersion: "gemini 1.2.3",
			runContext: "unit-test",
			workRoot: tempDir,
			parentPayload: passingPayload(),
			rp1Command: ["rp1-test"],
			commandRunner: async (command) => {
				commands.push([...command]);
				return { exitCode: 0, stdout: "", stderr: "" };
			},
		});

		const paths = getGeminiSubagentEvidenceRelativePaths("gemini-phase2");
		expect(result.markdownRelativePath).toBe(paths.markdownRelativePath);
		expect(result.jsonRelativePath).toBe(paths.jsonRelativePath);
		expect(JSON.parse(await readFile(result.jsonPath, "utf-8"))).toEqual(
			result.evidence,
		);

		const markdown = await readFile(result.markdownPath, "utf-8");
		expect(markdown).toContain("# Gemini Subagent Validation Evidence");
		expect(markdown).toContain("| alpha | rp1-alpha | passed |");
		expect(markdown).toContain("Validation result: PASSED");

		expect(commands).toHaveLength(3);
		expect(commands.map((command) => command.slice(0, 3))).toEqual([
			["rp1-test", "agent-tools", "emit"],
			["rp1-test", "agent-tools", "emit"],
			["rp1-test", "agent-tools", "emit"],
		]);

		expect(argAfter(commands[0], "--type")).toBe("artifact_registered");
		expect(argAfter(commands[0], "--step")).toBe("validation");
		expect(parseEmitData(commands[0])).toEqual({
			path: "features/gemini-phase2/gemini-subagents.md",
			feature: "gemini-phase2",
			storageRoot: "work_dir",
			format: "markdown",
			harness: GEMINI_SUBAGENT_HARNESS,
		});

		expect(argAfter(commands[1], "--type")).toBe("artifact_registered");
		expect(parseEmitData(commands[1])).toEqual({
			path: "features/gemini-phase2/gemini-subagents.json",
			feature: "gemini-phase2",
			storageRoot: "work_dir",
			format: "json",
			harness: GEMINI_SUBAGENT_HARNESS,
		});

		expect(argAfter(commands[2], "--workflow")).toBe(
			GEMINI_SUBAGENT_WORKFLOW_NAME,
		);
		expect(argAfter(commands[2], "--type")).toBe("status_change");
		expect(argAfter(commands[2], "--step")).toBe("completed");
		expect(commands[2]).toContain("--close-run");
		expect(parseEmitData(commands[2])).toEqual({
			status: "completed",
			feature: "gemini-phase2",
			classification: "passed",
			reason:
				"Gemini P2 delegation evidence passed; heavyweight workflow classes remain experimental until maintainers upgrade support policy.",
		});
	});
});
