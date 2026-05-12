import { afterEach, describe, expect, test } from "bun:test";
import type { Logger } from "../../../shared/logger.js";
import { executeVerifyGemini } from "../../commands/verify/gemini.js";
import type { GeminiVerifyDeps } from "../../install/gemini/index.js";

const ANSI_REGEX = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g");

const smokeCommandPath = {
	commandFile: "/tmp/.gemini/commands/rp1/smoke.toml",
	commandDisplayPath: "~/.gemini/commands/rp1/smoke.toml",
};

const logger = {} as Logger;
const originalLog = console.log;

const captureVerifyOutput = async (
	deps: GeminiVerifyDeps,
): Promise<{ readonly ok: boolean; readonly output: string }> => {
	const logs: string[] = [];
	console.log = (...args: unknown[]) => {
		logs.push(args.map(String).join(" "));
	};

	try {
		const ok = await executeVerifyGemini(logger, deps);
		return {
			ok,
			output: logs.join("\n").replace(ANSI_REGEX, ""),
		};
	} finally {
		console.log = originalLog;
	}
};

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
			"Install the smoke command with `rp1 install gemini`.",
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
});
