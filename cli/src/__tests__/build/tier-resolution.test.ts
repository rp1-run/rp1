/**
 * Unit tests for the tier resolution dictionary.
 * Validates abstract tier → platform model ID mapping and
 * effort → platform-specific field name + value mapping.
 */

import { describe, expect, test } from "bun:test";
import type { EffortLevel, ModelTier } from "../../build/models.js";
import type { BuildPlatform } from "../../build/template-context.js";
import { resolveEffort, resolveTier } from "../../build/tier-resolution.js";

// ---------------------------------------------------------------------------
// resolveTier
// ---------------------------------------------------------------------------

describe("resolveTier", () => {
	test("frontier tier returns fable for claude-code", () => {
		expect(resolveTier("frontier", "claude-code")).toBe("fable");
	});

	test("frontier tier returns gpt-5.6-sol for codex", () => {
		expect(resolveTier("frontier", "codex")).toBe("gpt-5.6-sol");
	});

	test("frontier tier returns null for opencode (inherit)", () => {
		expect(resolveTier("frontier", "opencode")).toBeNull();
	});

	test("frontier tier returns gemini-3.1-pro for antigravity", () => {
		expect(resolveTier("frontier", "antigravity")).toBe("gemini-3.1-pro");
	});

	test("deep tier returns opus for claude-code", () => {
		const result = resolveTier("deep", "claude-code");
		expect(result).toBe("opus");
	});

	test("deep tier returns gpt-5.6-sol for codex", () => {
		const result = resolveTier("deep", "codex");
		expect(result).toBe("gpt-5.6-sol");
	});

	test("deep tier returns null for opencode (inherit)", () => {
		const result = resolveTier("deep", "opencode");
		expect(result).toBeNull();
	});

	test("deep tier returns gemini-3.1-pro for antigravity", () => {
		const result = resolveTier("deep", "antigravity");
		expect(result).toBe("gemini-3.1-pro");
	});

	test("standard tier returns balanced model for each platform", () => {
		expect(resolveTier("standard", "claude-code")).toBe("sonnet");
		expect(resolveTier("standard", "codex")).toBe("gpt-5.6-terra");
		expect(resolveTier("standard", "opencode")).toBeNull();
		expect(resolveTier("standard", "antigravity")).toBe("gemini-3.5-flash");
	});

	test("fast tier returns cheapest model for each platform", () => {
		expect(resolveTier("fast", "claude-code")).toBe("haiku");
		expect(resolveTier("fast", "codex")).toBe("gpt-5.6-luna");
		expect(resolveTier("fast", "opencode")).toBeNull();
		expect(resolveTier("fast", "antigravity")).toBe("gemini-3.5-flash");
	});

	test("inherit returns null for every platform", () => {
		const platforms: BuildPlatform[] = [
			"claude-code",
			"codex",
			"opencode",
			"antigravity",
			"copilot",
		];
		for (const p of platforms) {
			expect(resolveTier("inherit", p)).toBeNull();
		}
	});

	test("opencode returns null for any tier (inherits session model)", () => {
		const tiers: ModelTier[] = ["frontier", "deep", "standard", "fast"];
		for (const t of tiers) {
			expect(resolveTier(t, "opencode")).toBeNull();
		}
	});

	test("copilot returns null for any tier (not supported)", () => {
		const tiers: ModelTier[] = ["deep", "standard", "fast"];
		for (const t of tiers) {
			expect(resolveTier(t, "copilot")).toBeNull();
		}
	});
});

// ---------------------------------------------------------------------------
// resolveEffort
// ---------------------------------------------------------------------------

describe("resolveEffort", () => {
	// --- Claude Code ---

	test("claude-code returns effort field with pass-through value", () => {
		const result = resolveEffort("high", "deep", "claude-code");
		expect(result).toEqual({ fieldName: "effort", value: "high" });
	});

	test("claude-code passes through all effort levels including max", () => {
		const levels: EffortLevel[] = ["low", "medium", "high", "xhigh", "max"];
		for (const level of levels) {
			const result = resolveEffort(level, "deep", "claude-code");
			expect(result).not.toBeNull();
			expect(result!.fieldName).toBe("effort");
			expect(result!.value).toBe(level);
		}
	});

	// --- Codex ---

	test("codex returns model_reasoning_effort field", () => {
		const result = resolveEffort("high", "deep", "codex");
		expect(result).toEqual({
			fieldName: "model_reasoning_effort",
			value: "high",
		});
	});

	test("codex passes through xhigh unchanged", () => {
		expect(resolveEffort("xhigh", "deep", "codex")).toEqual({
			fieldName: "model_reasoning_effort",
			value: "xhigh",
		});
	});

	test("codex clamps max to xhigh", () => {
		expect(resolveEffort("max", "deep", "codex")).toEqual({
			fieldName: "model_reasoning_effort",
			value: "xhigh",
		});
	});

	test("codex passes through low/medium/high unchanged", () => {
		for (const level of ["low", "medium", "high"] as EffortLevel[]) {
			const result = resolveEffort(level, "deep", "codex");
			expect(result).toEqual({
				fieldName: "model_reasoning_effort",
				value: level,
			});
		}
	});

	// --- OpenCode ---

	test("opencode returns null (effort not supported per-agent)", () => {
		const result = resolveEffort("high", "deep", "opencode");
		expect(result).toBeNull();
	});

	// --- Antigravity ---

	test("antigravity returns null (effort not supported per-agent)", () => {
		const result = resolveEffort("high", "deep", "antigravity");
		expect(result).toBeNull();
	});

	// --- Copilot ---

	test("copilot returns null (not supported)", () => {
		const result = resolveEffort("high", "deep", "copilot");
		expect(result).toBeNull();
	});

	// --- Fast tier ---

	test("fast tier returns null regardless of platform", () => {
		const platforms: BuildPlatform[] = [
			"claude-code",
			"codex",
			"opencode",
			"antigravity",
		];
		for (const p of platforms) {
			expect(resolveEffort("high", "fast", p)).toBeNull();
		}
	});

	// --- Undefined effort ---

	test("undefined effort returns null", () => {
		expect(resolveEffort(undefined, "deep", "claude-code")).toBeNull();
	});

	// --- Inherit tier with effort ---

	test("inherit tier with effort still resolves effort (tier gating is fast-only)", () => {
		// inherit just means no model override; effort can still be set
		// (though this combination may be caught by validation separately)
		const result = resolveEffort("high", "inherit", "claude-code");
		expect(result).toEqual({ fieldName: "effort", value: "high" });
	});

	// --- Frontier tier ---

	test("frontier tier on claude-code returns effort field with value", () => {
		const result = resolveEffort("high", "frontier", "claude-code");
		expect(result).toEqual({ fieldName: "effort", value: "high" });
	});
});
