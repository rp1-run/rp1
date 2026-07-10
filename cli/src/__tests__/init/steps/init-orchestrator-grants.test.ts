/**
 * Integration tests for sandbox grants wiring in the init orchestrator.
 *
 * Verifies: sandbox-grants step is wired into executeInit, grant files are
 * produced for stable platforms, and generateSandboxGrants returns GrantResult[].
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import * as E from "fp-ts/lib/Either.js";
import type { Logger } from "../../../../shared/logger.js";
import { executeInit } from "../../../init/index.js";
import type { InitOptions, InitResult } from "../../../init/models.js";
import {
	type GrantResult,
	generateSandboxGrants,
} from "../../../init/steps/sandbox-grants.js";
import { cleanupTempDir, createTempDir } from "../../helpers/index.js";

function createTrackingLogger(): Logger & {
	calls: { method: string; args: unknown[] }[];
} {
	const calls: { method: string; args: unknown[] }[] = [];
	return {
		calls,
		trace: (...args) => calls.push({ method: "trace", args }),
		debug: (...args) => calls.push({ method: "debug", args }),
		info: (...args) => calls.push({ method: "info", args }),
		warn: (...args) => calls.push({ method: "warn", args }),
		error: (...args) => calls.push({ method: "error", args }),
		start: (...args) => calls.push({ method: "start", args }),
		success: (...args) => calls.push({ method: "success", args }),
		fail: (...args) => calls.push({ method: "fail", args }),
		box: (...args) => calls.push({ method: "box", args }),
	};
}

describe("generateSandboxGrants returns GrantResult[]", () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await createTempDir("grants-return-");
	});

	afterEach(async () => {
		await cleanupTempDir(tempDir);
	});

	test("returns array of GrantResult for each generated platform", async () => {
		const results: GrantResult[] = await generateSandboxGrants(
			["claude-code", "codex"],
			tempDir,
		);

		expect(Array.isArray(results)).toBe(true);
		expect(results).toHaveLength(2);

		const platforms = results.map((r) => r.platform);
		expect(platforms).toContain("claude-code");
		expect(platforms).toContain("codex");

		for (const result of results) {
			expect(result.written).toBe(true);
			expect(typeof result.path).toBe("string");
		}
	});

	test("returns empty array when harness list is empty", async () => {
		const results: GrantResult[] = await generateSandboxGrants([], tempDir);
		expect(results).toEqual([]);
	});
});

describe("integration: executeInit produces sandbox grant files", () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await createTempDir("init-grants-integration-");
	});

	afterEach(async () => {
		await cleanupTempDir(tempDir);
	});

	test(
		"fresh init produces settings.toml with mode=central and platform grants",
		async () => {
			const logger = createTrackingLogger();
			// Use non-existent globalSettingsPath so loadEnabledHarnesses returns
			// undefined, triggering fallback to all stable platforms (hermetic test)
			const bogusSettingsPath = join(tempDir, "nonexistent-global.toml");
			const options: InitOptions = {
				cwd: tempDir,
				yes: true,
				globalSettingsPath: bogusSettingsPath,
			};

			const result = await executeInit(options, logger)();

			expect(E.isRight(result)).toBe(true);
			if (!E.isRight(result)) return;

			const initResult: InitResult = result.right;

			const settingsPath = join(tempDir, ".rp1", "settings.toml");
			expect(existsSync(settingsPath)).toBe(true);
			const settingsContent = readFileSync(settingsPath, "utf-8");
			expect(settingsContent).toContain("[storage]");
			expect(settingsContent).toContain('mode = "central"');

			// Grant files should exist for all stable platforms (fallback behavior)
			const claudeSettingsPath = join(tempDir, ".claude", "settings.json");
			expect(existsSync(claudeSettingsPath)).toBe(true);

			const claudeSettings = JSON.parse(
				readFileSync(claudeSettingsPath, "utf-8"),
			);
			expect(claudeSettings.permissions.additionalDirectories).toContain(
				"~/.rp1",
			);
			expect(claudeSettings.permissions.allow).toContain("Read(~/.rp1/**)");
			expect(claudeSettings.sandbox.filesystem.allowWrite).toContain("~/.rp1");

			expect(existsSync(join(tempDir, "codex.toml"))).toBe(true);
			const codexContent = readFileSync(join(tempDir, "codex.toml"), "utf-8");
			expect(codexContent).toContain("~/.rp1");

			const grantFileActions = initResult.actions.filter(
				(a) =>
					a.type === "created_file" &&
					(a.path.includes(".claude") ||
						a.path.includes("codex.toml") ||
						a.path.includes(".opencode") ||
						a.path.includes(".gemini") ||
						a.path.includes("copilot-settings.json")),
			);
			expect(grantFileActions.length).toBeGreaterThanOrEqual(2);

			const grantErrors = initResult.warnings.filter((w) =>
				w.includes("Sandbox grants failed"),
			);
			expect(grantErrors).toHaveLength(0);
		},
		{ timeout: 30000 },
	);

	test(
		"init summary logs sandbox grant status for each platform",
		async () => {
			const logger = createTrackingLogger();
			const bogusSettingsPath = join(tempDir, "nonexistent-global.toml");
			const options: InitOptions = {
				cwd: tempDir,
				yes: true,
				globalSettingsPath: bogusSettingsPath,
			};

			const result = await executeInit(options, logger)();

			expect(E.isRight(result)).toBe(true);
			if (!E.isRight(result)) return;

			const successMessages = logger.calls
				.filter((c) => c.method === "success")
				.map((c) => String(c.args[0]));

			const grantMessages = successMessages.filter((m) =>
				m.includes("Sandbox grant"),
			);
			// With fallback to all stable platforms, should have at least 2 messages
			expect(grantMessages.length).toBeGreaterThanOrEqual(2);

			expect(grantMessages.some((m) => m.includes("claude-code"))).toBe(true);
			expect(grantMessages.some((m) => m.includes("codex"))).toBe(true);
		},
		{ timeout: 30000 },
	);
});
