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
	test("deep tier returns frontier model for claude-code", () => {
		const result = resolveTier("deep", "claude-code");
		expect(result).toBe("opus");
	});

	test("deep tier returns frontier model for codex", () => {
		const result = resolveTier("deep", "codex");
		expect(result).toBe("o3");
	});

	test("deep tier returns frontier model for opencode", () => {
		const result = resolveTier("deep", "opencode");
		expect(result).toBe("opus");
	});

	test("deep tier returns frontier model for antigravity", () => {
		const result = resolveTier("deep", "antigravity");
		expect(result).toBe("opus");
	});

	test("deep tier returns frontier model for gemini", () => {
		const result = resolveTier("deep", "gemini");
		expect(result).toBe("gemini-2.5-pro");
	});

	test("standard tier returns balanced model for each platform", () => {
		expect(resolveTier("standard", "claude-code")).toBe("sonnet");
		expect(resolveTier("standard", "codex")).toBe("o4-mini");
		expect(resolveTier("standard", "opencode")).toBe("sonnet");
		expect(resolveTier("standard", "antigravity")).toBe("sonnet");
		expect(resolveTier("standard", "gemini")).toBe("gemini-2.5-flash");
	});

	test("fast tier returns cheapest model for each platform", () => {
		expect(resolveTier("fast", "claude-code")).toBe("haiku");
		expect(resolveTier("fast", "codex")).toBe("gpt-4.1-nano");
		expect(resolveTier("fast", "opencode")).toBe("haiku");
		expect(resolveTier("fast", "antigravity")).toBe("haiku");
		expect(resolveTier("fast", "gemini")).toBe("gemini-2.5-flash");
	});

	test("inherit returns null for every platform", () => {
		const platforms: BuildPlatform[] = [
			"claude-code",
			"codex",
			"opencode",
			"antigravity",
			"gemini",
			"copilot",
		];
		for (const p of platforms) {
			expect(resolveTier("inherit", p)).toBeNull();
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
		const result = resolveEffort("high", "deep", "claude-code", "opus");
		expect(result).toEqual({ fieldName: "effort", value: "high" });
	});

	test("claude-code passes through all effort levels", () => {
		const levels: EffortLevel[] = ["low", "medium", "high", "xhigh", "max"];
		for (const level of levels) {
			const result = resolveEffort(level, "deep", "claude-code", "opus");
			expect(result).not.toBeNull();
			expect(result!.fieldName).toBe("effort");
			expect(result!.value).toBe(level);
		}
	});

	// --- Codex ---

	test("codex returns model_reasoning_effort field", () => {
		const result = resolveEffort("high", "deep", "codex", "o3");
		expect(result).toEqual({
			fieldName: "model_reasoning_effort",
			value: "high",
		});
	});

	test("codex clamps xhigh and max to high", () => {
		expect(resolveEffort("xhigh", "deep", "codex", "o3")).toEqual({
			fieldName: "model_reasoning_effort",
			value: "high",
		});
		expect(resolveEffort("max", "deep", "codex", "o3")).toEqual({
			fieldName: "model_reasoning_effort",
			value: "high",
		});
	});

	// --- OpenCode (provider-aware) ---

	test("opencode with OpenAI model returns reasoningEffort field", () => {
		const result = resolveEffort("high", "deep", "opencode", "o3");
		expect(result).toEqual({ fieldName: "reasoningEffort", value: "high" });
	});

	test("opencode with OpenAI model clamps xhigh/max to high", () => {
		expect(resolveEffort("xhigh", "standard", "opencode", "o4-mini")).toEqual({
			fieldName: "reasoningEffort",
			value: "high",
		});
	});

	test("opencode with Anthropic model returns null", () => {
		const result = resolveEffort("high", "deep", "opencode", "opus");
		expect(result).toBeNull();
	});

	test("opencode with Anthropic model (sonnet) returns null", () => {
		const result = resolveEffort("medium", "standard", "opencode", "sonnet");
		expect(result).toBeNull();
	});

	// --- Antigravity / Gemini ---

	test("antigravity returns null (effort not supported per-agent)", () => {
		const result = resolveEffort("high", "deep", "antigravity", "opus");
		expect(result).toBeNull();
	});

	test("gemini returns null (effort not supported per-agent)", () => {
		const result = resolveEffort("high", "deep", "gemini", "gemini-2.5-pro");
		expect(result).toBeNull();
	});

	// --- Copilot ---

	test("copilot returns null (not supported)", () => {
		const result = resolveEffort("high", "deep", "copilot", null);
		expect(result).toBeNull();
	});

	// --- Fast tier ---

	test("fast tier returns null regardless of platform", () => {
		const platforms: BuildPlatform[] = [
			"claude-code",
			"codex",
			"opencode",
			"antigravity",
			"gemini",
		];
		for (const p of platforms) {
			expect(resolveEffort("high", "fast", p, "haiku")).toBeNull();
		}
	});

	// --- Undefined effort ---

	test("undefined effort returns null", () => {
		expect(resolveEffort(undefined, "deep", "claude-code", "opus")).toBeNull();
	});

	// --- Inherit tier with effort ---

	test("inherit tier with effort still resolves effort (tier gating is fast-only)", () => {
		// inherit just means no model override; effort can still be set
		// (though this combination may be caught by validation separately)
		const result = resolveEffort("high", "inherit", "claude-code", null);
		expect(result).toEqual({ fieldName: "effort", value: "high" });
	});
});
