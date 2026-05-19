import { afterEach, describe, expect, test } from "bun:test";
import type { Logger } from "../../../shared/logger.js";
import {
	executeVerifyGemini,
	type GeminiVerifyDelegationDeps,
	type GeminiVerifyLifecycleDeps,
	type GeminiVerifyOptions,
} from "../../commands/verify/gemini.js";
import {
	createGeminiSubagentEvidence,
	GEMINI_BOUNDARY_EVIDENCE_SCHEMA_VERSION,
	GEMINI_DEFAULT_WORKFLOW_CLASSIFICATIONS,
	GEMINI_SMOKE_COMMAND_DISPLAY_PATH,
	GEMINI_SUBAGENT_MARKERS,
	type GeminiVerifyDeps,
} from "../../install/gemini/index.js";
import { createGeminiBundleAssetManifestFixture } from "../helpers/gemini-bundle.js";

const ANSI_REGEX = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g");

const smokeCommandPath = {
	commandFile: "/tmp/.gemini/extensions/rp1-base/commands/rp1-base/guide.toml",
	commandDisplayPath: GEMINI_SMOKE_COMMAND_DISPLAY_PATH,
};
const bundleAssets = createGeminiBundleAssetManifestFixture();

const logger = {} as Logger;
const originalLog = console.log;

type VerifyCommandDeps = GeminiVerifyDeps &
	GeminiVerifyDelegationDeps &
	GeminiVerifyLifecycleDeps;

const captureVerifyOutput = async (
	deps: VerifyCommandDeps,
	options: GeminiVerifyOptions = {},
): Promise<{ readonly ok: boolean; readonly output: string }> => {
	const logs: string[] = [];
	console.log = (...args: unknown[]) => {
		logs.push(args.map(String).join(" "));
	};

	try {
		const ok = await executeVerifyGemini(logger, deps, options);
		return {
			ok,
			output: logs.join("\n").replace(ANSI_REGEX, ""),
		};
	} finally {
		console.log = originalLog;
	}
};

const currentManifestAssetReader = async (path: string): Promise<string> => {
	const asset = bundleAssets.find((entry) => path.endsWith(entry.relativePath));
	if (!asset) throw new Error(`Unexpected Gemini manifest asset: ${path}`);
	return asset.expectedContent;
};

const readySmokeDeps = (
	readFile?: (path: string) => Promise<string>,
	readAssetFile: (path: string) => Promise<string> = currentManifestAssetReader,
): VerifyCommandDeps => ({
	paths: smokeCommandPath,
	getGeminiBinaryPath: () => "/usr/local/bin/gemini",
	getGeminiVersion: async () => "gemini 1.2.3",
	pathExists: async () => true,
	homeDir: "/tmp",
	assetManifest: bundleAssets,
	readAssetFile,
	workRoot: "/tmp/rp1-work",
	readFile,
});

const passingEvidenceJson = (): string =>
	`${JSON.stringify(
		createGeminiSubagentEvidence({
			featureId: "gemini-phase2",
			runId: "run-123",
			geminiVersion: "gemini 1.2.3",
			parentPayload: {
				alpha_agent: "rp1-alpha",
				alpha_output: GEMINI_SUBAGENT_MARKERS.alpha,
				beta_agent: "rp1-beta",
				beta_output: GEMINI_SUBAGENT_MARKERS.beta,
				failing_agent: "rp1-runtime-fail",
				failing_status: "failed",
				failing_error: "ModelNotFoundError: intentional invalid model",
				acknowledgement_required: false,
			},
		}),
	)}\n`;

const failedEvidenceJson = (): string =>
	`${JSON.stringify(
		createGeminiSubagentEvidence({
			featureId: "gemini-phase2",
			runId: "run-123",
			geminiVersion: "gemini 1.2.3",
			parentPayload: {
				alpha_agent: "rp1-alpha",
				alpha_output: GEMINI_SUBAGENT_MARKERS.alpha,
				beta_agent: "rp1-beta",
				beta_output: GEMINI_SUBAGENT_MARKERS.alpha,
				failing_agent: "rp1-runtime-fail",
				failing_error: "ModelNotFoundError: intentional invalid model",
				failing_status: "completed",
				acknowledgement_required: false,
			},
		}),
	)}\n`;

const boundaryEvidenceJson = (
	status: "passed" | "blocked",
	state: "current" | "requires_trust",
): string =>
	`${JSON.stringify({
		schemaVersion: GEMINI_BOUNDARY_EVIDENCE_SCHEMA_VERSION,
		featureId: "gemini-phase-3",
		runId: "run-456",
		geminiVersion: "gemini 1.2.3",
		runContext: "manual-p3",
		scenarios: [
			{
				scenario: status === "passed" ? "verify_lifecycle" : "trust",
				mode: status === "passed" ? "lifecycle" : "interactive",
				status,
				state,
				blocker:
					status === "passed"
						? "Stale blocker text should not be printed after the boundary passed."
						: "Gemini workspace trust blocked shell execution.",
				userAction:
					status === "passed"
						? "Use this artifact as passing boundary evidence."
						: "Trust this workspace in Gemini CLI, then retry the validation command.",
				resumeSupported: status === "passed",
				workflowClasses: GEMINI_DEFAULT_WORKFLOW_CLASSIFICATIONS,
				evidenceArtifactPath: "features/gemini-phase-3/gemini-boundaries.md",
				lifecycleStage: "verify",
				lifecycleState: state === "current" ? "current" : "blocked",
			},
		],
		overallStatus: status,
		workflowClasses: GEMINI_DEFAULT_WORKFLOW_CLASSIFICATIONS,
	})}\n`;

describe("verify:gemini command", () => {
	afterEach(() => {
		console.log = originalLog;
	});

	test("reports missing Gemini CLI as an experimental degraded state", async () => {
		const result = await captureVerifyOutput({
			paths: smokeCommandPath,
			getGeminiBinaryPath: () => null,
			pathExists: async () => false,
			assetManifest: bundleAssets,
			readAssetFile: async () => {
				throw new Error("missing");
			},
		});

		expect(result.ok).toBe(false);
		expect(result.output).toContain(
			"Support: generated bundle (Gemini extension assets)",
		);
		expect(result.output).toContain("State: degraded_missing_binary");
		expect(result.output).toContain(
			"Meaning: degraded: Gemini CLI binary missing",
		);
		expect(result.output).toContain("Gemini CLI not found in PATH.");
		expect(result.output).toContain(
			"Install Gemini CLI, then confirm `gemini --version` succeeds.",
		);
		expect(result.output).toContain("Gemini lifecycle path is degraded");
	});

	test("reports missing smoke command with explicit install guidance", async () => {
		const result = await captureVerifyOutput({
			paths: smokeCommandPath,
			getGeminiBinaryPath: () => "/usr/local/bin/gemini",
			getGeminiVersion: async () => "gemini 1.2.3",
			pathExists: async () => false,
			assetManifest: bundleAssets,
			readAssetFile: async () => {
				throw new Error("missing");
			},
		});

		expect(result.ok).toBe(false);
		expect(result.output).toContain("State: degraded_missing_command");
		expect(result.output).toContain("Gemini smoke command missing");
		expect(result.output).toContain(
			"Install the Gemini extension assets with `rp1 install gemini`.",
		);
		expect(result.output).toContain("rp1 install gemini");
	});

	test("reports ready setup without first-class support claims", async () => {
		const result = await captureVerifyOutput(readySmokeDeps());

		expect(result.ok).toBe(true);
		expect(result.output).toContain(
			"Support: generated bundle (Gemini extension assets)",
		);
		expect(result.output).toContain("State: experimental_ready");
		expect(result.output).toContain("Meaning: experimental smoke path ready");
		expect(result.output).toContain("Manifest lifecycle:");
		expect(result.output).toContain("State: current");
		expect(result.output).toContain(
			"Trust/approval note: Gemini may still require workspace trust",
		);
		expect(result.output).toContain(
			"Run /rp1:smoke FEATURE_ID=<feature-id> RUN_CONTEXT=<label>",
		);
		expect(result.output).toContain("Gemini experimental smoke command ready");
		expect(result.output).not.toContain("stable");
	});

	test("fails ready smoke when a manifest asset is stale", async () => {
		const staleAsset = bundleAssets.find((asset) =>
			asset.displayPath.endsWith("/commands/rp1-base/guide.toml"),
		);
		const result = await captureVerifyOutput(
			readySmokeDeps(undefined, async (path) => {
				if (staleAsset && path.endsWith(staleAsset.relativePath)) {
					return "stale subagent command";
				}
				return currentManifestAssetReader(path);
			}),
		);

		expect(result.ok).toBe(false);
		expect(result.output).toContain("Manifest lifecycle:");
		expect(result.output).toContain("State: stale");
		expect(result.output).toContain(
			"does not match the bundled rp1 Gemini asset",
		);
		expect(result.output).toContain(
			"Run `rp1 update plugins gemini` to refresh Gemini extension assets.",
		);
		expect(result.output).toContain("Gemini lifecycle path is degraded");
	});

	test("reports blocked lifecycle state when manifest assets cannot be read", async () => {
		const result = await captureVerifyOutput(
			readySmokeDeps(undefined, async () => {
				throw Object.assign(new Error("permission denied"), {
					code: "EACCES",
				});
			}),
		);

		expect(result.ok).toBe(false);
		expect(result.output).toContain("Manifest lifecycle:");
		expect(result.output).toContain("State: blocked");
		expect(result.output).toContain("Unable to inspect");
		expect(result.output).toContain(
			"Check file permissions under ~/.gemini/extensions",
		);
	});

	test("distinguishes one missing manifest asset from partial installs", async () => {
		const [firstAsset, secondAsset] = bundleAssets;
		const oneMissing = await captureVerifyOutput(
			readySmokeDeps(undefined, async (path) => {
				if (firstAsset && path.endsWith(firstAsset.relativePath)) {
					throw Object.assign(new Error("missing"), { code: "ENOENT" });
				}
				return currentManifestAssetReader(path);
			}),
		);

		expect(oneMissing.ok).toBe(false);
		expect(oneMissing.output).toContain("State: missing");
		expect(oneMissing.output).toContain("Gemini extension assets are missing.");

		const partial = await captureVerifyOutput(
			readySmokeDeps(undefined, async (path) => {
				if (
					(firstAsset && path.endsWith(firstAsset.relativePath)) ||
					(secondAsset && path.endsWith(secondAsset.relativePath))
				) {
					throw Object.assign(new Error("missing"), { code: "ENOENT" });
				}
				return currentManifestAssetReader(path);
			}),
		);

		expect(partial.ok).toBe(false);
		expect(partial.output).toContain("State: partial");
		expect(partial.output).toContain(
			"Gemini extension assets are partially installed.",
		);
	});

	test("reports removed when no manifest-owned Gemini assets are active", async () => {
		const result = await captureVerifyOutput({
			paths: smokeCommandPath,
			getGeminiBinaryPath: () => "/usr/local/bin/gemini",
			getGeminiVersion: async () => "gemini 1.2.3",
			pathExists: async () => false,
			assetManifest: bundleAssets,
			readAssetFile: async () => {
				throw Object.assign(new Error("missing"), { code: "ENOENT" });
			},
		});

		expect(result.ok).toBe(false);
		expect(result.output).toContain("Manifest lifecycle:");
		expect(result.output).toContain("State: removed");
		expect(result.output).toContain(
			"No rp1-owned Gemini extension assets are installed.",
		);
		expect(result.output).toContain("rp1 install gemini");
	});

	test("attributes unsupported workflow attempts from the generated support matrix", async () => {
		const result = await captureVerifyOutput(readySmokeDeps(), {
			workflowId: "dev:build",
		});

		expect(result.ok).toBe(false);
		expect(result.output).toContain("Workflow attempt attribution:");
		expect(result.output).toContain("Workflow: dev:build");
		expect(result.output).toContain("State: unsupported");
		expect(result.output).toContain(
			"Product scope: product-owned Gemini support boundary",
		);
		expect(result.output).toContain(
			"No accepted Gemini runtime evidence currently promotes dev:build",
		);
		expect(result.output).toContain("Exception owner: rp1-maintainers");
		expect(result.output).toContain(
			"Use Claude Code, OpenCode, Codex CLI, or GitHub Copilot CLI",
		);
		expect(result.output).toContain("Gemini unsupported workflow attribution");
		expect(result.output).not.toContain("Gemini lifecycle path is degraded");
		expect(result.output).not.toContain(
			"Gemini experimental smoke command ready",
		);
	});

	test("keeps supported workflow attempts on the normal readiness path", async () => {
		const result = await captureVerifyOutput(readySmokeDeps(), {
			workflowId: "dev:build-fast",
		});

		expect(result.ok).toBe(true);
		expect(result.output).toContain("Workflow attempt attribution:");
		expect(result.output).toContain("Workflow: dev:build-fast");
		expect(result.output).toContain("State: supported");
		expect(result.output).toContain(
			"Product scope: supported Gemini matrix row",
		);
		expect(result.output).toContain(
			"features/gemini-cli-rp1-harness-first-class/gemini-runtime-contract.md",
		);
		expect(result.output).toContain("Gemini experimental smoke command ready");
	});

	test("reports unknown workflow attempts without blaming installation state", async () => {
		const result = await captureVerifyOutput(readySmokeDeps(), {
			workflowId: "dev:unknown",
		});

		expect(result.ok).toBe(false);
		expect(result.output).toContain("Workflow: dev:unknown");
		expect(result.output).toContain("State: unknown");
		expect(result.output).toContain(
			"dev:unknown is not present in the generated Gemini support matrix.",
		);
		expect(result.output).toContain("Gemini unsupported workflow attribution");
		expect(result.output).not.toContain("Gemini lifecycle path is degraded");
	});

	test("gates P2 delegation readiness when feature evidence is missing", async () => {
		const result = await captureVerifyOutput(
			readySmokeDeps(async () => {
				throw new Error("missing");
			}),
			{ featureId: "gemini-phase2" },
		);

		expect(result.ok).toBe(false);
		expect(result.output).toContain(
			"Support: generated bundle (Gemini extension assets)",
		);
		expect(result.output).toContain("P2 delegation readiness:");
		expect(result.output).toContain(
			"Evidence: features/gemini-phase2/gemini-subagents.json",
		);
		expect(result.output).toMatch(/Overall delegation\s+not_run/);
		expect(result.output).toMatch(/Custom subagent\s+not_run/);
		expect(result.output).toMatch(/build_fast\s+blocked\s+evidence=not_run/);
		expect(result.output).toContain("Gemini delegation evidence missing");
		expect(result.output).toContain("Gemini P2 delegation readiness is gated");
	});

	test("reports failed P2 evidence and keeps heavyweight workflows blocked", async () => {
		const result = await captureVerifyOutput(
			readySmokeDeps(async () => failedEvidenceJson()),
			{ featureId: "gemini-phase2" },
		);

		expect(result.ok).toBe(false);
		expect(result.output).toMatch(/Overall delegation\s+failed/);
		expect(result.output).toMatch(/Fanout attribution\s+failed/);
		expect(result.output).toMatch(/Delegated failure\s+failed/);
		expect(result.output).toMatch(/Acknowledgement\s+passed/);
		expect(result.output).toMatch(/build_fast\s+blocked\s+evidence=failed/);
		expect(result.output).toContain(
			"evidence: features/gemini-phase2/gemini-subagents.md",
		);
		expect(result.output).toContain("Gemini P2 delegation readiness is gated");
	});

	test("reports invalid feature ids as gated evidence checks", async () => {
		const result = await captureVerifyOutput(readySmokeDeps(), {
			featureId: "../bad-feature",
		});

		expect(result.ok).toBe(false);
		expect(result.output).toContain("Invalid Gemini evidence feature id");
		expect(result.output).toContain(
			"Gemini delegation readiness could not be verified",
		);
		expect(result.output).toContain(
			"Invalid Gemini boundary evidence feature id",
		);
	});

	test("reports malformed and incomplete P3 boundary evidence", async () => {
		const malformed = await captureVerifyOutput(
			readySmokeDeps(async (path) => {
				if (path.endsWith("gemini-boundaries.json")) return "{";
				throw new Error("missing");
			}),
			{ featureId: "gemini-phase-3" },
		);

		expect(malformed.ok).toBe(false);
		expect(malformed.output).toContain(
			"Gemini boundary evidence is not valid JSON",
		);

		const incomplete = await captureVerifyOutput(
			readySmokeDeps(async (path) => {
				if (path.endsWith("gemini-boundaries.json")) return "{}";
				throw new Error("missing");
			}),
			{ featureId: "gemini-phase-3" },
		);

		expect(incomplete.ok).toBe(false);
		expect(incomplete.output).toContain(
			"Gemini boundary evidence is incomplete",
		);
	});

	test("reports P2 delegation evidence parse and feature mismatch failures", async () => {
		const malformed = await captureVerifyOutput(
			readySmokeDeps(async (path) => {
				if (path.endsWith("gemini-subagents.json")) return "{";
				throw new Error("missing");
			}),
			{ featureId: "gemini-phase2" },
		);

		expect(malformed.ok).toBe(false);
		expect(malformed.output).toContain(
			"Gemini delegation evidence is not valid JSON",
		);

		const mismatch = await captureVerifyOutput(
			readySmokeDeps(async (path) => {
				if (path.endsWith("gemini-subagents.json")) {
					return passingEvidenceJson().replace(
						"gemini-phase2",
						"other-feature",
					);
				}
				throw new Error("missing");
			}),
			{ featureId: "gemini-phase2" },
		);

		expect(mismatch.ok).toBe(false);
		expect(mismatch.output).toContain(
			"Gemini delegation evidence feature mismatch",
		);
	});

	test("reports blocked P3 boundary evidence with trust remediation", async () => {
		const result = await captureVerifyOutput(
			readySmokeDeps(async (path) => {
				if (path.endsWith("gemini-boundaries.json")) {
					return boundaryEvidenceJson("blocked", "requires_trust");
				}
				throw new Error("missing");
			}),
			{ featureId: "gemini-phase-3" },
		);

		expect(result.ok).toBe(false);
		expect(result.output).toContain("P3 boundary evidence:");
		expect(result.output).toContain(
			"Evidence: features/gemini-phase-3/gemini-boundaries.json",
		);
		expect(result.output).toContain("Overall boundaries: blocked");
		expect(result.output).toContain("state=requires_trust");
		expect(result.output).toContain(
			"Blocker: Gemini workspace trust blocked shell execution.",
		);
		expect(result.output).toContain(
			"User action: Trust this workspace in Gemini CLI, then retry the validation command.",
		);
		expect(result.output).toContain("Gemini P3 boundary evidence is gated");
		expect(result.output).not.toContain(
			"Gemini P2 delegation readiness is gated",
		);
	});

	test("accepts passing P3 boundary evidence without requiring P2 delegation evidence for the same feature", async () => {
		const result = await captureVerifyOutput(
			readySmokeDeps(async (path) => {
				if (path.endsWith("gemini-boundaries.json")) {
					return boundaryEvidenceJson("passed", "current");
				}
				throw new Error("missing");
			}),
			{ featureId: "gemini-phase-3" },
		);

		expect(result.ok).toBe(true);
		expect(result.output).toContain("P3 boundary evidence:");
		expect(result.output).toContain("Overall boundaries: passed");
		expect(result.output).toContain("verify_lifecycle");
		expect(result.output).toContain("state=current");
		expect(result.output).not.toContain("Stale blocker text");
		expect(result.output).not.toContain("Blocker:");
		expect(result.output).toContain(
			"Use this artifact as passing boundary evidence.",
		);
		expect(result.output).toContain("Gemini experimental smoke command ready");
		expect(result.output).not.toContain(
			"Gemini P2 delegation readiness is gated",
		);
	});

	test("reports passing P2 evidence as experimental heavyweight workflow readiness", async () => {
		const result = await captureVerifyOutput(
			readySmokeDeps(async () => passingEvidenceJson()),
			{ featureId: "gemini-phase2" },
		);

		expect(result.ok).toBe(true);
		expect(result.output).toMatch(/Overall delegation\s+passed/);
		expect(result.output).toMatch(/Custom subagent\s+passed/);
		expect(result.output).toMatch(/Fanout attribution\s+passed/);
		expect(result.output).toMatch(/Delegated failure\s+passed/);
		expect(result.output).toMatch(/Acknowledgement\s+passed/);
		expect(result.output).toMatch(
			/build_fast\s+experimental\s+evidence=passed/,
		);
		expect(result.output).toContain(
			"evidence: features/gemini-phase2/gemini-subagents.md",
		);
		expect(result.output).toContain("Gemini experimental smoke command ready");
		expect(result.output).not.toContain(
			"Gemini P2 delegation readiness is gated",
		);
	});
});
