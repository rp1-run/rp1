/**
 * Unit tests for the tool_prose Liquid filter.
 * Tests prose-level CC tool name rewriting for non-CC platforms.
 */

import { describe, expect, test } from "bun:test";
import { claudeCodeRegistry } from "../../../build/claude-code/registry.js";
import { codexRegistry } from "../../../build/codex/registry.js";
import { toolProse } from "../../../build/filters/tool-prose.js";
import { defaultRegistry } from "../../../build/registry.js";

describe("tool_prose filter", () => {
	describe("claude-code (passthrough)", () => {
		test("returns content unchanged", () => {
			const input = "Use AskUserQuestion to ask the user.";
			expect(toolProse(input, "claude-code", claudeCodeRegistry)).toBe(input);
		});
	});

	describe("codex", () => {
		test("rewrites AskUserQuestion to Codex equivalent", () => {
			const input = "Skip all AskUserQuestion calls in AFK mode.";
			const result = toolProse(input, "codex", codexRegistry);
			expect(result).toBe(
				"Skip all functions.request_user_input calls in AFK mode.",
			);
		});

		test("rewrites Edit to Codex equivalent", () => {
			const input = "Use Edit to modify the file.";
			const result = toolProse(input, "codex", codexRegistry);
			expect(result).toBe("Use functions.apply_patch to modify the file.");
		});

		test("does not rewrite tools mapped to null", () => {
			const input = "Use Read tool and Grep tool.";
			const result = toolProse(input, "codex", codexRegistry);
			expect(result).toBe("Use Read tool and Grep tool.");
		});

		test("preserves content inside code blocks", () => {
			const input =
				"Outside AskUserQuestion\n```\nInside AskUserQuestion\n```\nAfter AskUserQuestion";
			const result = toolProse(input, "codex", codexRegistry);
			expect(result).toContain("functions.request_user_input");
			expect(result).toContain("Inside AskUserQuestion");
			expect(result).toMatch(/Outside functions\.request_user_input/);
			expect(result).toMatch(/After functions\.request_user_input/);
		});

		test("rewrites multiple occurrences", () => {
			const input =
				"Do NOT call AskUserQuestion. All AskUserQuestion calls must be skipped.";
			const result = toolProse(input, "codex", codexRegistry);
			expect(result).not.toContain("AskUserQuestion");
			expect(result).toContain("functions.request_user_input");
		});
	});

	describe("opencode", () => {
		test("rewrites AskUserQuestion to OpenCode equivalent", () => {
			const input = "Use AskUserQuestion for user input.";
			const result = toolProse(input, "opencode", defaultRegistry);
			expect(result).toBe("Use ask_user for user input.");
		});
	});
});
