/**
 * Unit tests for tier remapping settings validation.
 */

import { describe, expect, test } from "bun:test";
import type { BundleAgentEntry } from "../../build/models.js";
import type { TierRemappingConfig } from "../../settings/models.js";
import { validateTierRemappings } from "../../settings/validator.js";

describe("validateTierRemappings", () => {
	test("returns valid result for correct config", () => {
		const config: TierRemappingConfig = {
			platforms: {
				"claude-code": { deep: "sonnet", standard: "sonnet", fast: "haiku" },
			},
		};

		const result = validateTierRemappings(config);
		expect(result.valid).toBe(true);
		expect(result.errors).toHaveLength(0);
		expect(result.warnings).toHaveLength(0);
	});

	test("returns valid for empty config", () => {
		const config: TierRemappingConfig = { platforms: {} };
		const result = validateTierRemappings(config);
		expect(result.valid).toBe(true);
		expect(result.errors).toHaveLength(0);
	});

	test("warns on unrecognized model identifier but stays valid", () => {
		const config: TierRemappingConfig = {
			platforms: {
				"claude-code": { deep: "nonexistent" },
			},
		};

		const result = validateTierRemappings(config);
		expect(result.valid).toBe(true);
		expect(result.errors).toHaveLength(0);
		expect(result.warnings.length).toBeGreaterThan(0);

		const warningMsg = result.warnings[0];
		expect(warningMsg).toContain("nonexistent");
		expect(warningMsg).toContain("not recognized");
		expect(warningMsg).toContain("applying as-is");
	});

	test("warns on unrecognized model ID for codex platform but stays valid", () => {
		const config: TierRemappingConfig = {
			platforms: {
				codex: { standard: "gpt-9.9-future" },
			},
		};

		const result = validateTierRemappings(config);
		expect(result.valid).toBe(true);
		expect(result.errors).toHaveLength(0);
		expect(result.warnings[0]).toContain("gpt-9.9-future");
		expect(result.warnings[0]).toContain("not recognized");
	});

	test("warns on unknown platform name (forward compatibility)", () => {
		const config: TierRemappingConfig = {
			platforms: {
				"future-platform": { deep: "some-model" },
			} as TierRemappingConfig["platforms"],
		};

		const result = validateTierRemappings(config);
		expect(result.valid).toBe(true);
		expect(result.warnings.length).toBeGreaterThan(0);
		expect(result.warnings[0]).toContain("future-platform");
		expect(result.warnings[0]).toContain("unknown platform");
	});

	test("warns on unsupported platform with no model fields (copilot)", () => {
		const config: TierRemappingConfig = {
			platforms: {
				copilot: { deep: "some-model" },
			},
		};

		const result = validateTierRemappings(config);
		expect(result.valid).toBe(true);
		expect(result.warnings.length).toBeGreaterThan(0);
		expect(result.warnings[0]).toContain("copilot");
		expect(result.warnings[0]).toContain("no effect");
	});

	test("warns on unsupported platform with no model fields (opencode)", () => {
		const config: TierRemappingConfig = {
			platforms: {
				opencode: { deep: "some-model" },
			},
		};

		const result = validateTierRemappings(config);
		expect(result.valid).toBe(true);
		expect(result.warnings.length).toBeGreaterThan(0);
		expect(result.warnings[0]).toContain("opencode");
		expect(result.warnings[0]).toContain("no effect");
	});

	test("reports effort adjustment when remapping to fast-class model", () => {
		const config: TierRemappingConfig = {
			platforms: {
				"claude-code": { deep: "haiku" },
			},
		};

		const agents: readonly BundleAgentEntry[] = [
			{
				name: "feature-architect",
				path: "agents/feature-architect.md",
				tier: "deep",
				effort: "high",
			},
			{
				name: "task-builder",
				path: "agents/task-builder.md",
				tier: "deep",
				effort: "medium",
			},
		];

		const result = validateTierRemappings(config, agents);
		expect(result.effortAdjustments.length).toBeGreaterThan(0);
		expect(
			result.effortAdjustments.some((a) => a.includes("feature-architect")),
		).toBe(true);
		expect(
			result.effortAdjustments.some((a) => a.includes("task-builder")),
		).toBe(true);
	});

	test("no effort adjustments when remapped model supports effort", () => {
		const config: TierRemappingConfig = {
			platforms: {
				"claude-code": { deep: "sonnet" },
			},
		};

		const agents: readonly BundleAgentEntry[] = [
			{
				name: "feature-architect",
				path: "agents/feature-architect.md",
				tier: "deep",
				effort: "high",
			},
		];

		const result = validateTierRemappings(config, agents);
		expect(result.effortAdjustments).toHaveLength(0);
	});

	test("skips effort adjustment for agents without effort set", () => {
		const config: TierRemappingConfig = {
			platforms: {
				"claude-code": { deep: "haiku" },
			},
		};

		const agents: readonly BundleAgentEntry[] = [
			{
				name: "speedrun-builder",
				path: "agents/speedrun-builder.md",
				tier: "deep",
			},
		];

		const result = validateTierRemappings(config, agents);
		expect(result.effortAdjustments).toHaveLength(0);
	});

	test("validates preset name when specified", () => {
		const config: TierRemappingConfig = {
			preset: "nonexistent-preset",
			platforms: {},
		};

		const result = validateTierRemappings(config);
		expect(result.valid).toBe(false);
		expect(result.errors[0]).toContain("nonexistent-preset");
		expect(result.errors[0]).toContain("budget");
		expect(result.errors[0]).toContain("standard");
		expect(result.errors[0]).toContain("premium");
	});

	test("accepts valid preset names", () => {
		const config: TierRemappingConfig = {
			preset: "budget",
			platforms: {},
		};

		const result = validateTierRemappings(config);
		expect(result.valid).toBe(true);
	});

	test("warns per unrecognized model across platforms", () => {
		const config: TierRemappingConfig = {
			platforms: {
				"claude-code": { deep: "bad-model-1" },
				codex: { standard: "bad-model-2" },
			},
		};

		const result = validateTierRemappings(config);
		expect(result.valid).toBe(true);
		expect(result.warnings.length).toBe(2);
		expect(result.warnings[0]).toContain("bad-model-1");
		expect(result.warnings[1]).toContain("bad-model-2");
	});

	test("effort adjustments for codex platform", () => {
		const config: TierRemappingConfig = {
			platforms: {
				codex: { deep: "gpt-5.6-luna" },
			},
		};

		const agents: readonly BundleAgentEntry[] = [
			{
				name: "feature-architect",
				path: "agents/feature-architect.md",
				tier: "deep",
				effort: "high",
			},
		];

		const result = validateTierRemappings(config, agents);
		expect(result.effortAdjustments.length).toBeGreaterThan(0);
		expect(result.effortAdjustments[0]).toContain("feature-architect");
	});

	test("valid config with codex platform mappings", () => {
		const config: TierRemappingConfig = {
			platforms: {
				codex: {
					deep: "gpt-5.6-sol",
					standard: "gpt-5.6-terra",
					fast: "gpt-5.6-luna",
				},
			},
		};

		const result = validateTierRemappings(config);
		expect(result.valid).toBe(true);
		expect(result.errors).toHaveLength(0);
	});

	test("antigravity platform produces cannot-rewrite warning", () => {
		const config: TierRemappingConfig = {
			platforms: {
				antigravity: { deep: "gemini-3.1-pro", standard: "gemini-3.5-flash" },
			},
		};

		const result = validateTierRemappings(config);
		expect(result.valid).toBe(true);
		expect(result.errors).toHaveLength(0);
		expect(result.warnings.length).toBeGreaterThan(0);
		expect(result.warnings[0]).toContain("antigravity");
		expect(result.warnings[0]).toContain("no effect");
	});
});
