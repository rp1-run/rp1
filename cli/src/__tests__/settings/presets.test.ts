/**
 * Unit tests for blessed preset definitions (budget, standard, premium).
 */

import { describe, expect, test } from "bun:test";
import {
	getPreset,
	listPresets,
	VALID_PRESET_NAMES,
} from "../../settings/presets.js";

const REMAPPABLE_TIERS = ["deep", "standard", "fast"] as const;
const PRESET_PLATFORMS = ["claude-code", "codex"] as const;

describe("preset definitions", () => {
	test("budget preset maps every remappable tier for Claude Code and Codex", () => {
		const preset = getPreset("budget");
		expect(preset).toBeDefined();
		for (const platform of PRESET_PLATFORMS) {
			const mapping = preset!.platforms[platform];
			expect(mapping).toBeDefined();
			for (const tier of REMAPPABLE_TIERS) {
				expect(mapping![tier]).toBeString();
				expect(mapping![tier].length).toBeGreaterThan(0);
			}
		}
	});

	test("standard preset maps every remappable tier for Claude Code and Codex", () => {
		const preset = getPreset("standard");
		expect(preset).toBeDefined();
		for (const platform of PRESET_PLATFORMS) {
			const mapping = preset!.platforms[platform];
			expect(mapping).toBeDefined();
			for (const tier of REMAPPABLE_TIERS) {
				expect(mapping![tier]).toBeString();
				expect(mapping![tier].length).toBeGreaterThan(0);
			}
		}
	});

	test("premium preset maps every remappable tier for Claude Code and Codex", () => {
		const preset = getPreset("premium");
		expect(preset).toBeDefined();
		for (const platform of PRESET_PLATFORMS) {
			const mapping = preset!.platforms[platform];
			expect(mapping).toBeDefined();
			for (const tier of REMAPPABLE_TIERS) {
				expect(mapping![tier]).toBeString();
				expect(mapping![tier].length).toBeGreaterThan(0);
			}
		}
	});

	test("premium preset matches TIER_MODEL_MAP build defaults", () => {
		const preset = getPreset("premium")!;
		expect(preset.platforms["claude-code"]!.deep).toBe("opus");
		expect(preset.platforms["claude-code"]!.standard).toBe("sonnet");
		expect(preset.platforms["claude-code"]!.fast).toBe("haiku");
		expect(preset.platforms.codex!.deep).toBe("gpt-5.6-sol");
		expect(preset.platforms.codex!.standard).toBe("gpt-5.6-terra");
		expect(preset.platforms.codex!.fast).toBe("gpt-5.6-luna");
	});

	test("budget preset uses only fast-class models", () => {
		const preset = getPreset("budget")!;
		expect(preset.platforms["claude-code"]!.deep).toBe("haiku");
		expect(preset.platforms["claude-code"]!.standard).toBe("haiku");
		expect(preset.platforms["claude-code"]!.fast).toBe("haiku");
		expect(preset.platforms.codex!.deep).toBe("gpt-5.6-luna");
		expect(preset.platforms.codex!.standard).toBe("gpt-5.6-luna");
		expect(preset.platforms.codex!.fast).toBe("gpt-5.6-luna");
	});

	test("standard preset collapses deep to sonnet-class", () => {
		const preset = getPreset("standard")!;
		expect(preset.platforms["claude-code"]!.deep).toBe("sonnet");
		expect(preset.platforms["claude-code"]!.standard).toBe("sonnet");
		expect(preset.platforms["claude-code"]!.fast).toBe("haiku");
		expect(preset.platforms.codex!.deep).toBe("gpt-5.6-terra");
		expect(preset.platforms.codex!.standard).toBe("gpt-5.6-terra");
		expect(preset.platforms.codex!.fast).toBe("gpt-5.6-luna");
	});
});

describe("getPreset", () => {
	test("returns undefined for unknown preset name", () => {
		expect(getPreset("nonexistent")).toBeUndefined();
	});

	test("returns correct preset for each valid name", () => {
		for (const name of VALID_PRESET_NAMES) {
			const preset = getPreset(name);
			expect(preset).toBeDefined();
			expect(preset!.name).toBe(name);
		}
	});
});

describe("listPresets", () => {
	test("returns all three presets in order", () => {
		const presets = listPresets();
		expect(presets).toHaveLength(3);
		expect(presets[0].name).toBe("budget");
		expect(presets[1].name).toBe("standard");
		expect(presets[2].name).toBe("premium");
	});

	test("each preset has a non-empty description", () => {
		for (const preset of listPresets()) {
			expect(preset.description).toBeString();
			expect(preset.description.length).toBeGreaterThan(0);
		}
	});
});

describe("VALID_PRESET_NAMES", () => {
	test("contains exactly budget, standard, premium", () => {
		expect(VALID_PRESET_NAMES).toEqual(["budget", "standard", "premium"]);
	});
});
