import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	type AntigravityCheckoutRoots,
	type AntigravityCheckoutScenario,
	type AntigravityCheckoutScenarioEvidence,
	collectAntigravityCheckoutScenarioEvidence,
	parseAntigravityCheckoutEvidenceArgs,
	writeAntigravityCheckoutEvidenceArtifacts,
} from "../../../scripts/record-antigravity-checkout-evidence.ts";

const createRoots = async (): Promise<AntigravityCheckoutRoots> => {
	const root = await mkdtemp(join(tmpdir(), "rp1-antigravity-checkouts-"));
	return {
		projectRoot: root,
		codeRoot: root,
		workRoot: join(root, ".rp1", "work"),
		kbRoot: join(root, ".rp1", "context"),
		isWorktree: false,
	};
};

const scenarioEvidence = (
	scenario: AntigravityCheckoutScenario,
	status: "passed" | "failed" = "passed",
): AntigravityCheckoutScenarioEvidence => ({
	scenario,
	status,
	requirementRefs: ["REQ-005", "REQ-011", "REQ-012"],
	sourceVerification:
		"features/antigravity/feature_verification_1.md REQ-005 blocker/manual items",
	automationMode: "local rp1 agent-tools smoke",
	bootstrap: {
		runId: `run-${scenario}`,
		projectRoot: "/tmp/project",
		kbRoot: "/tmp/project/.rp1/context",
		workRoot: "/tmp/project/.rp1/work",
		codeRoot:
			scenario === "worktree_checkout"
				? "/tmp/linked-worktree"
				: "/tmp/project",
		harness: "antigravity",
		isWorktree: scenario === "worktree_checkout",
	},
	runState: {
		status:
			scenario === "artifact_registration_failure" ? "failed" : "completed",
		harness: "antigravity",
		projectRoot: "/tmp/project",
		kbRoot: "/tmp/project/.rp1/context",
		workRoot: "/tmp/project/.rp1/work",
		artifactCount: scenario === "artifact_registration_failure" ? 0 : 1,
		recentEventTypes:
			scenario === "artifact_registration_failure"
				? ["status_change"]
				: ["status_change", "artifact_registered"],
	},
	artifact:
		scenario === "artifact_registration_failure"
			? null
			: {
					path: `features/antigravity-${scenario}/checkout-smoke-artifact.md`,
					storageRoot: "work_dir",
					step: "build",
					absolutePath: `/tmp/project/.rp1/work/features/antigravity-${scenario}/checkout-smoke-artifact.md`,
					registered: true,
				},
	expectedFailure:
		scenario === "artifact_registration_failure"
			? {
					observed: true,
					exitCode: 1,
					output:
						"artifact_registered paths must not contain '..' unless storageRoot is 'absolute'",
				}
			: null,
	assertions: [
		"bootstrap trace records harness=antigravity",
		"workflow-state records harness=antigravity",
		"artifact is registered with storageRoot=work_dir",
	],
	commands: [],
});

describe("Antigravity checkout evidence recorder", () => {
	test("writes combined REQ-005 checkout and artifact-registration evidence", async () => {
		const roots = await createRoots();
		const result = await writeAntigravityCheckoutEvidenceArtifacts({
			featureId: "antigravity",
			runId: "run-1",
			roots,
			now: new Date("2026-05-20T00:00:00.000Z"),
			scenarios: [
				scenarioEvidence("normal_checkout"),
				scenarioEvidence("worktree_checkout"),
				scenarioEvidence("artifact_registration_failure"),
			],
		});

		expect(result.markdownRelativePath).toBe(
			"features/antigravity/antigravity-checkout-evidence.md",
		);
		expect(result.jsonRelativePath).toBe(
			"features/antigravity/antigravity-checkout-evidence.json",
		);
		expect(result.evidence.overallStatus).toBe("passed");
		expect(result.evidence.selectedScenarios).toEqual([
			"normal_checkout",
			"worktree_checkout",
			"artifact_registration_failure",
		]);

		const markdown = await readFile(result.markdownPath, "utf-8");
		expect(markdown).toContain("feature_verification_1.md REQ-005");
		expect(markdown).toContain("normal_checkout");
		expect(markdown).toContain("worktree_checkout");
		expect(markdown).toContain("artifact_registration_failure");
		expect(markdown).toContain("storageRoot=work_dir");
		expect(markdown).toContain("temporary `RP1_DB`");
		expect(markdown).toContain(
			"does not mutate the user's real Antigravity profile",
		);

		const parsed = JSON.parse(await readFile(result.jsonPath, "utf-8")) as {
			readonly overallStatus: string;
			readonly scenarios: readonly {
				readonly scenario: string;
				readonly bootstrap: { readonly harness: string };
			}[];
		};
		expect(parsed.overallStatus).toBe("passed");
		expect(
			parsed.scenarios.every(
				(scenario) => scenario.bootstrap.harness === "antigravity",
			),
		).toBe(true);
	});

	test("fails the aggregate evidence status when a smoke fails", async () => {
		const roots = await createRoots();
		const result = await writeAntigravityCheckoutEvidenceArtifacts({
			featureId: "antigravity",
			runId: "run-2",
			roots,
			scenarios: [
				scenarioEvidence("normal_checkout"),
				scenarioEvidence("worktree_checkout", "failed"),
			],
		});

		expect(result.evidence.overallStatus).toBe("failed");

		const markdown = await readFile(result.markdownPath, "utf-8");
		expect(markdown).toContain("Checkout evidence result: FAILED");
	});

	test("parses checkout evidence recipe options and rejects unknown scenarios", () => {
		expect(
			parseAntigravityCheckoutEvidenceArgs([], {
				FEATURE_ID: "from-env",
				RUN_ID: "run-env",
			}),
		).toEqual({
			featureId: "from-env",
			runId: "run-env",
			scenario: "all",
			workRoot: undefined,
			keepTemp: false,
		});
		expect(
			parseAntigravityCheckoutEvidenceArgs(
				[
					"--feature-id",
					"antigravity",
					"--run-id",
					"run-args",
					"--scenario",
					"worktree_checkout",
					"--work-root",
					"/tmp/work",
					"--keep-temp",
				],
				{},
			),
		).toEqual({
			featureId: "antigravity",
			runId: "run-args",
			scenario: "worktree_checkout",
			workRoot: "/tmp/work",
			keepTemp: true,
		});
		expect(() =>
			parseAntigravityCheckoutEvidenceArgs(["--scenario", "static_agents"], {}),
		).toThrow("Invalid scenario: static_agents");
		expect(() =>
			parseAntigravityCheckoutEvidenceArgs(["--unexpected"], {}),
		).toThrow("Unknown argument: --unexpected");
	});

	test(
		"collects disposable checkout smokes for roots, artifacts, and recoverable registration failure",
		async () => {
			const scenarios = await collectAntigravityCheckoutScenarioEvidence({
				cliRoot: process.cwd(),
				scenario: "all",
				keepTemp: false,
			});

			expect(scenarios.map((scenario) => scenario.scenario)).toEqual([
				"normal_checkout",
				"worktree_checkout",
				"artifact_registration_failure",
			]);
			expect(scenarios.every((scenario) => scenario.status === "passed")).toBe(
				true,
			);

			const normalCheckout = scenarios.find(
				(scenario) => scenario.scenario === "normal_checkout",
			);
			expect(normalCheckout?.bootstrap.harness).toBe("antigravity");
			expect(normalCheckout?.bootstrap.projectRoot).toBe(
				normalCheckout?.bootstrap.codeRoot,
			);
			expect(normalCheckout?.artifact?.storageRoot).toBe("work_dir");
			expect(normalCheckout?.runState.recentEventTypes).toContain(
				"artifact_registered",
			);

			const worktreeCheckout = scenarios.find(
				(scenario) => scenario.scenario === "worktree_checkout",
			);
			expect(worktreeCheckout?.bootstrap.isWorktree).toBe(true);
			expect(worktreeCheckout?.bootstrap.codeRoot).not.toBe(
				worktreeCheckout?.bootstrap.projectRoot,
			);
			expect(worktreeCheckout?.runState.status).toBe("completed");

			const failureScenario = scenarios.find(
				(scenario) => scenario.scenario === "artifact_registration_failure",
			);
			expect(failureScenario?.runState.status).toBe("failed");
			expect(failureScenario?.artifact).toBeNull();
			expect(failureScenario?.expectedFailure?.observed).toBe(true);
			expect(failureScenario?.expectedFailure?.output).toContain(
				"artifact_registered paths must not contain '..'",
			);
		},
		{ timeout: 30000 },
	);
});
