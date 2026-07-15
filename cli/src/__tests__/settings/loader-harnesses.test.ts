/**
 * Unit tests for TOML [harnesses] section parsing and loadEnabledHarnesses().
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { join } from "node:path";
import {
	loadEnabledHarnesses,
	resetSettingsCache,
} from "../../settings/loader.js";
import {
	cleanupTempDir,
	createTempDir,
	writeFixture,
} from "../helpers/index.js";

let tempDir: string;

/** Path to a nonexistent global settings file within tempDir, isolating tests from ~/.config/rp1/settings.toml. */
const isolatedGlobalPath = (): string =>
	join(tempDir, "global-config", "settings.toml");

beforeEach(async () => {
	resetSettingsCache();
	tempDir = await createTempDir("settings-loader-harnesses");
});

afterEach(async () => {
	await cleanupTempDir(tempDir);
});

describe("loadEnabledHarnesses", () => {
	test("returns undefined when settings file does not exist", () => {
		const result = loadEnabledHarnesses(isolatedGlobalPath());
		expect(result).toBeUndefined();
	});

	test("returns undefined when [harnesses] section is absent", async () => {
		await writeFixture(
			tempDir,
			"global-config/settings.toml",
			`[arguments.build]\nAFK = false\n`,
		);

		const result = loadEnabledHarnesses(isolatedGlobalPath());
		expect(result).toBeUndefined();
	});

	test("parses valid [harnesses] section with enabled array", async () => {
		await writeFixture(
			tempDir,
			"global-config/settings.toml",
			["[harnesses]", 'enabled = ["claude-code", "codex"]'].join("\n"),
		);

		const result = loadEnabledHarnesses(isolatedGlobalPath());
		expect(result).toEqual(["claude-code", "codex"]);
	});

	test("parses empty enabled array", async () => {
		await writeFixture(
			tempDir,
			"global-config/settings.toml",
			["[harnesses]", "enabled = []"].join("\n"),
		);

		const result = loadEnabledHarnesses(isolatedGlobalPath());
		expect(result).toEqual([]);
	});

	test("returns undefined when enabled is not an array", async () => {
		await writeFixture(
			tempDir,
			"global-config/settings.toml",
			["[harnesses]", 'enabled = "claude-code"'].join("\n"),
		);

		const result = loadEnabledHarnesses(isolatedGlobalPath());
		expect(result).toBeUndefined();
	});

	test("filters out non-string entries in enabled array", async () => {
		await writeFixture(
			tempDir,
			"global-config/settings.toml",
			["[harnesses]", 'enabled = ["claude-code", 42, "codex", true]'].join(
				"\n",
			),
		);

		const result = loadEnabledHarnesses(isolatedGlobalPath());
		expect(result).toEqual(["claude-code", "codex"]);
	});

	test("returns undefined when [harnesses] section has no enabled key", async () => {
		await writeFixture(
			tempDir,
			"global-config/settings.toml",
			["[harnesses]", 'other_key = "value"'].join("\n"),
		);

		const result = loadEnabledHarnesses(isolatedGlobalPath());
		expect(result).toBeUndefined();
	});

	test("coexists with other settings sections", async () => {
		await writeFixture(
			tempDir,
			"global-config/settings.toml",
			[
				"[arguments.build]",
				"AFK = false",
				"",
				"[models.claude-code]",
				'deep = "claude-sonnet-4-20250514"',
				"",
				"[harnesses]",
				'enabled = ["claude-code", "codex", "copilot"]',
				"",
				"[arcade]",
				'theme = "dark"',
				"",
				"[storage]",
				'mode = "central"',
			].join("\n"),
		);

		const result = loadEnabledHarnesses(isolatedGlobalPath());
		expect(result).toEqual(["claude-code", "codex", "copilot"]);
	});

	test("returns a defensive copy (not the internal array)", async () => {
		await writeFixture(
			tempDir,
			"global-config/settings.toml",
			["[harnesses]", 'enabled = ["claude-code"]'].join("\n"),
		);

		const first = loadEnabledHarnesses(isolatedGlobalPath());
		const second = loadEnabledHarnesses(isolatedGlobalPath());
		expect(first).toEqual(second);
		expect(first).not.toBe(second);
	});

	test("handles malformed TOML gracefully", async () => {
		await writeFixture(
			tempDir,
			"global-config/settings.toml",
			"[harnesses\nenabled = broken",
		);

		const result = loadEnabledHarnesses(isolatedGlobalPath());
		expect(result).toBeUndefined();
	});
});

describe("loadEnabledHarnesses cache behavior", () => {
	test("resetSettingsCache forces fresh read", async () => {
		await writeFixture(
			tempDir,
			"global-config/settings.toml",
			["[harnesses]", 'enabled = ["claude-code"]'].join("\n"),
		);

		const first = loadEnabledHarnesses(isolatedGlobalPath());
		expect(first).toEqual(["claude-code"]);

		await writeFixture(
			tempDir,
			"global-config/settings.toml",
			["[harnesses]", 'enabled = ["claude-code", "codex"]'].join("\n"),
		);

		resetSettingsCache();

		const second = loadEnabledHarnesses(isolatedGlobalPath());
		expect(second).toEqual(["claude-code", "codex"]);
	});
});
