import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { stat } from "node:fs/promises";
import { join } from "node:path";
import {
	GEMINI_SMOKE_COMMAND_TOML,
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

	test("dry-run reports the smoke command path without writing", async () => {
		const result = await expectTaskRight(
			installGeminiSmokeCommand({
				dryRun: true,
				homeDir: tempDir,
				getGeminiBinaryPath: () => "/usr/local/bin/gemini",
			}),
		);

		expect(result.commandWritten).toBe(false);
		expect(result.commandDisplayPath).toBe("~/.gemini/commands/rp1/smoke.toml");
		expect(await exists(result.commandPath)).toBe(false);
	});

	test("explicit install writes only the Gemini smoke command", async () => {
		const result = await expectTaskRight(
			installGeminiSmokeCommand({
				dryRun: false,
				homeDir: tempDir,
				getGeminiBinaryPath: () => "/usr/local/bin/gemini",
			}),
		);

		expect(result.commandWritten).toBe(true);
		expect(await Bun.file(result.commandPath).text()).toBe(
			GEMINI_SMOKE_COMMAND_TOML,
		);
		expect(
			await exists(join(tempDir, ".gemini", "commands", "rp1", "smoke.toml")),
		).toBe(true);
	});

	test("verify reports a missing Gemini binary with install guidance", async () => {
		const result = await verifyGeminiSmokeSetup({
			paths: {
				commandFile: join(tempDir, ".gemini", "commands", "rp1", "smoke.toml"),
				commandDisplayPath: "~/.gemini/commands/rp1/smoke.toml",
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
				commandFile: join(tempDir, ".gemini", "commands", "rp1", "smoke.toml"),
				commandDisplayPath: "~/.gemini/commands/rp1/smoke.toml",
			},
			getGeminiBinaryPath: () => "/usr/local/bin/gemini",
			getGeminiVersion: async () => "gemini 1.2.3",
			pathExists: async () => false,
		});

		expect(result.status).toBe("degraded_missing_command");
		expect(result.verified).toBe(false);
		expect(result.remediation).toContain(
			"Install the smoke command with `rp1 install gemini`.",
		);
	});

	test("verify reports ready when Gemini and the smoke command are present", async () => {
		const commandFile = await writeFixture(
			tempDir,
			join(".gemini", "commands", "rp1", "smoke.toml"),
			GEMINI_SMOKE_COMMAND_TOML,
		);

		const result = await verifyGeminiSmokeSetup({
			paths: {
				commandFile,
				commandDisplayPath: "~/.gemini/commands/rp1/smoke.toml",
			},
			getGeminiBinaryPath: () => "/usr/local/bin/gemini",
			getGeminiVersion: async () => "gemini 1.2.3",
		});

		expect(result.status).toBe("experimental_ready");
		expect(result.verified).toBe(true);
		expect(result.issues).toEqual([]);
	});
});
