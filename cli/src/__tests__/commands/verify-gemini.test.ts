import { afterEach, describe, expect, test } from "bun:test";
import type { Logger } from "../../../shared/logger.js";
import {
	executeVerifyGemini,
	type GeminiVerifyOptions,
} from "../../commands/verify/gemini.js";
import {
	createGeminiSubagentEvidence,
	GEMINI_SMOKE_COMMAND_DISPLAY_PATH,
	GEMINI_SUBAGENT_MARKERS,
	type GeminiVerifyDeps,
} from "../../install/gemini/index.js";

const ANSI_REGEX = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g");

const smokeCommandPath = {
	commandFile:
		"/tmp/.gemini/extensions/rp1-phase2-validation/commands/rp1/smoke.toml",
	commandDisplayPath: GEMINI_SMOKE_COMMAND_DISPLAY_PATH,
};

const logger = {} as Logger;
const originalLog = console.log;

const captureVerifyOutput = async (
	deps: GeminiVerifyDeps,
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

const readySmokeDeps = (
	readFile?: (path: string) => Promise<string>,
): GeminiVerifyDeps & {
	readonly workRoot: string;
	readonly readFile?: (path: string) => Promise<string>;
} => ({
	paths: smokeCommandPath,
	getGeminiBinaryPath: () => "/usr/local/bin/gemini",
	getGeminiVersion: async () => "gemini 1.2.3",
	pathExists: async () => true,
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

describe("verify:gemini command", () => {
	afterEach(() => {
		console.log = originalLog;
	});

	test("reports missing Gemini CLI as an experimental degraded state", async () => {
		const result = await captureVerifyOutput({
			paths: smokeCommandPath,
			getGeminiBinaryPath: () => null,
			pathExists: async () => false,
		});

		expect(result.ok).toBe(false);
		expect(result.output).toContain("Support: experimental (smoke-only)");
		expect(result.output).toContain("State: degraded_missing_binary");
		expect(result.output).toContain(
			"Meaning: degraded: Gemini CLI binary missing",
		);
		expect(result.output).toContain("Gemini CLI not found in PATH.");
		expect(result.output).toContain(
			"Install Gemini CLI, then confirm `gemini --version` succeeds.",
		);
		expect(result.output).toContain("Gemini smoke path is degraded");
	});

	test("reports missing smoke command with explicit install guidance", async () => {
		const result = await captureVerifyOutput({
			paths: smokeCommandPath,
			getGeminiBinaryPath: () => "/usr/local/bin/gemini",
			getGeminiVersion: async () => "gemini 1.2.3",
			pathExists: async () => false,
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
		const result = await captureVerifyOutput({
			paths: smokeCommandPath,
			getGeminiBinaryPath: () => "/usr/local/bin/gemini",
			getGeminiVersion: async () => "gemini 1.2.3",
			pathExists: async () => true,
		});

		expect(result.ok).toBe(true);
		expect(result.output).toContain("Support: experimental (smoke-only)");
		expect(result.output).toContain("State: experimental_ready");
		expect(result.output).toContain("Meaning: experimental smoke path ready");
		expect(result.output).toContain(
			"Run /rp1:smoke FEATURE_ID=<feature-id> RUN_CONTEXT=<label>",
		);
		expect(result.output).toContain("Gemini experimental smoke command ready");
		expect(result.output).not.toContain("stable");
	});

	test("gates P2 delegation readiness when feature evidence is missing", async () => {
		const result = await captureVerifyOutput(
			readySmokeDeps(async () => {
				throw new Error("missing");
			}),
			{ featureId: "gemini-phase2" },
		);

		expect(result.ok).toBe(false);
		expect(result.output).toContain("Support: experimental (smoke-only)");
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
