import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	type AntigravityAutomatedCheck,
	type AntigravityRoots,
	collectAntigravityAutomatedBoundaryChecks,
	createAntigravityBoundaryEvidence,
	getAntigravityBoundaryEvidenceRelativePaths,
	parseAntigravityBoundaryEvidenceArgs,
	writeAntigravityBoundaryEvidenceArtifacts,
} from "../../../scripts/record-antigravity-boundary-evidence.ts";

const passedChecks: readonly AntigravityAutomatedCheck[] = [
	{
		id: "agy-version",
		status: "passed",
		evidence: "Antigravity CLI version: 1.0.0",
		nextAction: null,
	},
	{
		id: "generated-mcp-config",
		status: "passed",
		evidence: "Inspected generated Antigravity MCP config files.",
		nextAction: null,
	},
];

const createRoots = async (): Promise<AntigravityRoots> => {
	const root = await mkdtemp(join(tmpdir(), "rp1-antigravity-boundaries-"));
	return {
		projectRoot: root,
		codeRoot: root,
		workRoot: join(root, ".rp1", "work"),
		kbRoot: join(root, ".rp1", "context"),
		isWorktree: false,
	};
};

describe("Antigravity boundary evidence recorder", () => {
	test("writes explicit manual evidence requirements when live transcripts are absent", async () => {
		const roots = await createRoots();
		const result = await writeAntigravityBoundaryEvidenceArtifacts({
			featureId: "antigravity",
			runId: "run-1",
			roots,
			scenario: "all",
			env: {},
			now: new Date("2026-05-20T00:00:00.000Z"),
			automatedChecks: passedChecks,
		});

		expect(result.markdownRelativePath).toBe(
			"features/antigravity/antigravity-boundaries.md",
		);
		expect(result.jsonRelativePath).toBe(
			"features/antigravity/antigravity-boundaries.json",
		);
		expect(result.evidence.overallStatus).toBe("manual_required");
		expect(
			result.evidence.scenarios.map((scenario) => scenario.scenario),
		).toEqual(["permissions_trust", "mcp_failure"]);

		const markdown = await readFile(result.markdownPath, "utf-8");
		expect(markdown).toContain("feature_verification_1.md blocker 4");
		expect(markdown).toContain("RP1_ANTIGRAVITY_REQUIRE_LIVE=1");
		expect(markdown).toContain("RP1_ANTIGRAVITY_PERMISSIONS_TRUST_TRANSCRIPT");
		expect(markdown).toContain("RP1_ANTIGRAVITY_MCP_FAILURE_TRANSCRIPT");
		expect(markdown).toContain("disposable Antigravity profile");

		const parsed = JSON.parse(await readFile(result.jsonPath, "utf-8")) as {
			readonly overallStatus: string;
			readonly scenarios: readonly { readonly status: string }[];
		};
		expect(parsed.overallStatus).toBe("manual_required");
		expect(
			parsed.scenarios.every(
				(scenario) => scenario.status === "manual_required",
			),
		).toBe(true);
	});

	test("records transcript hashes without copying live transcript content", async () => {
		const roots = await createRoots();
		const transcriptPath = join(roots.projectRoot, "mcp-failure.txt");
		const transcript = "MCP server rp1-missing-smoke was unavailable.\n";
		await writeFile(transcriptPath, transcript, "utf-8");

		const result = await writeAntigravityBoundaryEvidenceArtifacts({
			featureId: "antigravity",
			runId: "run-2",
			roots,
			scenario: "mcp_failure",
			env: {
				RP1_ANTIGRAVITY_MCP_FAILURE_TRANSCRIPT: transcriptPath,
			},
			now: new Date("2026-05-20T00:00:00.000Z"),
			automatedChecks: passedChecks,
		});

		const scenario = result.evidence.scenarios[0];
		expect(result.evidence.overallStatus).toBe("recorded");
		expect(scenario.status).toBe("recorded");
		expect(scenario.requiredEvidence).toEqual([]);
		expect(scenario.transcript?.env).toBe(
			"RP1_ANTIGRAVITY_MCP_FAILURE_TRANSCRIPT",
		);
		expect(scenario.transcript?.sha256).toBe(
			createHash("sha256").update(transcript).digest("hex"),
		);

		const markdown = await readFile(result.markdownPath, "utf-8");
		expect(markdown).toContain("transcript_sha256");
		expect(markdown).not.toContain(transcript);
	});

	test("collects generated boundary metadata checks from Antigravity package assets", async () => {
		const roots = await createRoots();
		const packageRoot = join(roots.codeRoot, "dist", "antigravity", "base");
		await mkdir(packageRoot, { recursive: true });
		await writeFile(
			join(packageRoot, "mcp_config.json"),
			`${JSON.stringify({ mcpServers: { rp1: { command: "rp1" } } })}\n`,
			"utf-8",
		);
		await writeFile(
			join(packageRoot, "support-metadata.json"),
			`${JSON.stringify({
				runtime: {
					unsupportedModes: [
						"permissions",
						"trust",
						"sandbox",
						"headless",
						"mcp",
					],
				},
			})}\n`,
			"utf-8",
		);

		const checks = await collectAntigravityAutomatedBoundaryChecks(roots);
		const byId = new Map(checks.map((check) => [check.id, check]));

		expect(byId.get("generated-mcp-config")?.status).toBe("passed");
		expect(byId.get("generated-mcp-config")?.details).toContain(
			"dist/antigravity/base/mcp_config.json: mcpServers=object",
		);
		expect(byId.get("support-metadata-boundaries")?.status).toBe("passed");
		expect(byId.get("support-metadata-boundaries")?.details).toContain(
			"dist/antigravity/base/support-metadata.json: all boundary modes present",
		);
		expect(byId.get("agy-version")?.status).toMatch(/passed|warning/);
		expect(byId.get("agy-boundary-flags")?.status).toMatch(/passed|warning/);
	});

	test("fails aggregate boundary evidence when automated package checks fail", async () => {
		const roots = await createRoots();
		const evidence = await createAntigravityBoundaryEvidence({
			featureId: "antigravity",
			runId: "run-3",
			roots,
			scenario: "permissions_trust",
			env: {},
			now: new Date("2026-05-20T00:00:00.000Z"),
			automatedChecks: [
				{
					id: "support-metadata-boundaries",
					status: "failed",
					evidence: "support metadata omitted mcp boundary",
					nextAction: "Regenerate Antigravity package support metadata.",
					details: ["dist/antigravity/base/support-metadata.json: missing mcp"],
				},
			],
		});

		expect(evidence.overallStatus).toBe("failed");
		expect(evidence.scenarios[0].status).toBe("manual_required");
		expect(evidence.automatedChecks[0].details).toEqual([
			"dist/antigravity/base/support-metadata.json: missing mcp",
		]);
		expect(() =>
			getAntigravityBoundaryEvidenceRelativePaths("../bad-feature"),
		).toThrow("Invalid Antigravity boundary evidence feature id");
	});

	test("parses boundary evidence recipe options and live-evidence mode", () => {
		expect(
			parseAntigravityBoundaryEvidenceArgs([], {
				FEATURE_ID: "from-env",
				RUN_ID: "run-env",
				RP1_ANTIGRAVITY_REQUIRE_LIVE: "1",
			}),
		).toEqual({
			featureId: "from-env",
			runId: "run-env",
			scenario: "all",
			workRoot: undefined,
			requireLive: true,
		});
		expect(
			parseAntigravityBoundaryEvidenceArgs(
				[
					"--feature-id",
					"antigravity",
					"--run-id",
					"run-args",
					"--scenario",
					"mcp_failure",
					"--work-root",
					"/tmp/work",
					"--require-live",
				],
				{},
			),
		).toEqual({
			featureId: "antigravity",
			runId: "run-args",
			scenario: "mcp_failure",
			workRoot: "/tmp/work",
			requireLive: true,
		});
		expect(() =>
			parseAntigravityBoundaryEvidenceArgs(["--scenario", "headless"], {}),
		).toThrow("Invalid scenario: headless");
		expect(() =>
			parseAntigravityBoundaryEvidenceArgs(["--unexpected"], {}),
		).toThrow("Unknown argument: --unexpected");
	});
});
