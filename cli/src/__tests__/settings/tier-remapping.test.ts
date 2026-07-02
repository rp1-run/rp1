/**
 * Unit tests for tier remapping settings loader.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
	loadTierRemappings,
	resetSettingsCache,
} from "../../settings/loader.js";
import {
	cleanupTempDir,
	createTempDir,
	writeFixture,
} from "../helpers/index.js";

let tempDir: string;

beforeEach(async () => {
	resetSettingsCache();
	tempDir = await createTempDir("tier-remapping");
});

afterEach(async () => {
	await cleanupTempDir(tempDir);
});

describe("loadTierRemappings", () => {
	test("returns empty config when no settings files exist", async () => {
		const result = await loadTierRemappings(tempDir);
		expect(result.preset).toBeUndefined();
		expect(result.platforms).toEqual({});
	});

	test("parses [models.claude-code] section with tier mappings", async () => {
		await writeFixture(
			tempDir,
			".rp1/settings.toml",
			[
				"[models.claude-code]",
				'deep = "sonnet"',
				'standard = "sonnet"',
				'fast = "haiku"',
			].join("\n"),
		);

		const result = await loadTierRemappings(tempDir);
		expect(result.platforms["claude-code"]).toBeDefined();
		expect(result.platforms["claude-code"]!.deep).toBe("sonnet");
		expect(result.platforms["claude-code"]!.standard).toBe("sonnet");
		expect(result.platforms["claude-code"]!.fast).toBe("haiku");
	});

	test("parses preset from [models] section", async () => {
		await writeFixture(
			tempDir,
			".rp1/settings.toml",
			["[models]", 'preset = "budget"'].join("\n"),
		);

		const result = await loadTierRemappings(tempDir);
		expect(result.preset).toBe("budget");
		expect(result.platforms).toEqual({});
	});

	test("parses preset alongside platform-specific overrides", async () => {
		await writeFixture(
			tempDir,
			".rp1/settings.toml",
			[
				"[models]",
				'preset = "budget"',
				"",
				"[models.claude-code]",
				'deep = "sonnet"',
				"",
				"[models.codex]",
				'deep = "gpt-5.4"',
			].join("\n"),
		);

		const result = await loadTierRemappings(tempDir);
		expect(result.preset).toBe("budget");
		expect(result.platforms["claude-code"]!.deep).toBe("sonnet");
		expect(result.platforms.codex!.deep).toBe("gpt-5.4");
	});

	test("omitted tiers are absent from parsed config", async () => {
		await writeFixture(
			tempDir,
			".rp1/settings.toml",
			["[models.claude-code]", 'deep = "sonnet"'].join("\n"),
		);

		const result = await loadTierRemappings(tempDir);
		const ccMap = result.platforms["claude-code"]!;
		expect(ccMap.deep).toBe("sonnet");
		expect(ccMap.standard).toBeUndefined();
		expect(ccMap.fast).toBeUndefined();
		expect(ccMap.frontier).toBeUndefined();
	});

	test("returns empty config when settings has no [models] section", async () => {
		await writeFixture(
			tempDir,
			".rp1/settings.toml",
			["[arguments.build]", "AFK = false"].join("\n"),
		);

		const result = await loadTierRemappings(tempDir);
		expect(result.preset).toBeUndefined();
		expect(result.platforms).toEqual({});
	});

	test("ignores non-string values in tier mappings", async () => {
		await writeFixture(
			tempDir,
			".rp1/settings.toml",
			[
				"[models.claude-code]",
				'deep = "sonnet"',
				"standard = 42",
				"fast = true",
			].join("\n"),
		);

		const result = await loadTierRemappings(tempDir);
		const ccMap = result.platforms["claude-code"]!;
		expect(ccMap.deep).toBe("sonnet");
		expect(ccMap.standard).toBeUndefined();
		expect(ccMap.fast).toBeUndefined();
	});

	test("handles malformed TOML gracefully", async () => {
		await writeFixture(
			tempDir,
			".rp1/settings.toml",
			"this is not valid toml {{{}}}",
		);

		const result = await loadTierRemappings(tempDir);
		expect(result.preset).toBeUndefined();
		expect(result.platforms).toEqual({});
	});

	test("parses multiple platforms", async () => {
		await writeFixture(
			tempDir,
			".rp1/settings.toml",
			[
				"[models.claude-code]",
				'deep = "sonnet"',
				'standard = "haiku"',
				"",
				"[models.codex]",
				'deep = "gpt-5.5"',
				'standard = "gpt-5.4"',
				'fast = "gpt-5.4-mini"',
			].join("\n"),
		);

		const result = await loadTierRemappings(tempDir);
		expect(Object.keys(result.platforms)).toHaveLength(2);
		expect(result.platforms["claude-code"]!.deep).toBe("sonnet");
		expect(result.platforms.codex!.deep).toBe("gpt-5.5");
		expect(result.platforms.codex!.fast).toBe("gpt-5.4-mini");
	});

	test("project-level settings override user-level per-platform", async () => {
		// Project-level has claude-code overrides
		await writeFixture(
			tempDir,
			".rp1/settings.toml",
			["[models.claude-code]", 'deep = "sonnet"', 'standard = "haiku"'].join(
				"\n",
			),
		);

		// We can verify project values are present - user-level settings
		// at ~/.config/rp1/settings.toml can't be controlled in isolation,
		// but the project values should appear in the result.
		const result = await loadTierRemappings(tempDir);
		expect(result.platforms["claude-code"]!.deep).toBe("sonnet");
		expect(result.platforms["claude-code"]!.standard).toBe("haiku");
	});

	test("caches tier remapping results across calls", async () => {
		await writeFixture(
			tempDir,
			".rp1/settings.toml",
			["[models.claude-code]", 'deep = "sonnet"'].join("\n"),
		);

		const first = await loadTierRemappings(tempDir);
		expect(first.platforms["claude-code"]!.deep).toBe("sonnet");

		// Change the file, should still get cached result
		await writeFixture(
			tempDir,
			".rp1/settings.toml",
			["[models.claude-code]", 'deep = "opus"'].join("\n"),
		);

		const second = await loadTierRemappings(tempDir);
		expect(second.platforms["claude-code"]!.deep).toBe("sonnet");
	});

	test("resetSettingsCache forces fresh read for tier remappings", async () => {
		await writeFixture(
			tempDir,
			".rp1/settings.toml",
			["[models.claude-code]", 'deep = "sonnet"'].join("\n"),
		);

		const first = await loadTierRemappings(tempDir);
		expect(first.platforms["claude-code"]!.deep).toBe("sonnet");

		await writeFixture(
			tempDir,
			".rp1/settings.toml",
			["[models.claude-code]", 'deep = "opus"'].join("\n"),
		);

		resetSettingsCache();

		const second = await loadTierRemappings(tempDir);
		expect(second.platforms["claude-code"]!.deep).toBe("opus");
	});

	test("ignores non-string preset value", async () => {
		await writeFixture(
			tempDir,
			".rp1/settings.toml",
			["[models]", "preset = 42"].join("\n"),
		);

		const result = await loadTierRemappings(tempDir);
		expect(result.preset).toBeUndefined();
	});
});
