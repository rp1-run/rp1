import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { stat } from "node:fs/promises";
import { join } from "node:path";
import {
	GEMINI_ALPHA_AGENT_MARKDOWN,
	GEMINI_ALPHA_AGENT_RELATIVE_PATH,
	GEMINI_BETA_AGENT_MARKDOWN,
	GEMINI_BETA_AGENT_RELATIVE_PATH,
	GEMINI_EXTENSION_MANIFEST_JSON,
	GEMINI_EXTENSION_MANIFEST_RELATIVE_PATH,
	GEMINI_RUNTIME_FAIL_AGENT_MARKDOWN,
	GEMINI_RUNTIME_FAIL_AGENT_RELATIVE_PATH,
	GEMINI_SMOKE_COMMAND_DISPLAY_PATH,
	GEMINI_SMOKE_COMMAND_RELATIVE_PATH,
	GEMINI_SMOKE_COMMAND_TOML,
	GEMINI_SMOKE_STATUS_DETAILS,
	GEMINI_SUBAGENT_COMMAND_RELATIVE_PATH,
	GEMINI_SUBAGENT_COMMAND_TOML,
	installGeminiSmokeCommand,
	verifyGeminiSmokeSetup,
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

	test("explicit install writes the Gemini smoke and P2 validation extension assets", async () => {
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
