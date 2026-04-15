/**
 * Unit tests for the tool_prose Liquid filter.
 * Tests prose-level CC tool name rewriting for non-CC platforms.
 */

import { describe, expect, test } from "bun:test";
import { claudeCodeRegistry } from "../../../build/claude-code/registry.js";
import { codexRegistry } from "../../../build/codex/registry.js";
import { copilotRegistry } from "../../../build/copilot/registry.js";
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

		test("replaces null-mapped tools with prose fallbacks", () => {
			const input = "Use Read tool and Grep tool.";
			const result = toolProse(input, "codex", codexRegistry);
			expect(result).toBe(
				"Use cat/head/tail via shell tool and grep via shell tool.",
			);
		});

		test("replaces Write with shell fallback", () => {
			const input = "Use Write to create the file.";
			const result = toolProse(input, "codex", codexRegistry);
			expect(result).toBe("Use file writes via shell to create the file.");
		});

		test("replaces Glob with shell fallback", () => {
			const input = "Run Glob to find files.";
			const result = toolProse(input, "codex", codexRegistry);
			expect(result).toBe("Run find via shell to find files.");
		});

		test("replaces WebFetch with not-available fallback", () => {
			const input = "Use WebFetch to download.";
			const result = toolProse(input, "codex", codexRegistry);
			expect(result).toBe("Use web fetching (not available) to download.");
		});

		test("replaces WebSearch with not-available fallback", () => {
			const input = "Use WebSearch to look up docs.";
			const result = toolProse(input, "codex", codexRegistry);
			expect(result).toBe("Use web searching (not available) to look up docs.");
		});

		test("replaces TodoWrite with not-available fallback", () => {
			const input = "Call TodoWrite to track tasks.";
			const result = toolProse(input, "codex", codexRegistry);
			expect(result).toBe("Call task tracking (not available) to track tasks.");
		});

		test("leaves Task, Skill, SlashCommand unchanged (null-mapped, no fallback)", () => {
			const input = "Use Task to spawn. Call Skill next. Try SlashCommand too.";
			const result = toolProse(input, "codex", codexRegistry);
			expect(result).toBe(input);
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

	describe("copilot", () => {
		test("rewrites AskUserQuestion to Copilot equivalent", () => {
			const input = "Use AskUserQuestion for user input.";
			const result = toolProse(input, "copilot", copilotRegistry);
			expect(result).toBe("Use ask_user for user input.");
		});

		test("rewrites Edit to Copilot equivalent", () => {
			const input = "Use Edit to modify the file.";
			const result = toolProse(input, "copilot", copilotRegistry);
			expect(result).toBe("Use edit_file to modify the file.");
		});

		test("rewrites Read to Copilot equivalent", () => {
			const input = "Use Read to view the file.";
			const result = toolProse(input, "copilot", copilotRegistry);
			expect(result).toBe("Use read_file to view the file.");
		});

		test("replaces WebSearch with not-available fallback", () => {
			const input = "Use WebSearch to look up docs.";
			const result = toolProse(input, "copilot", copilotRegistry);
			expect(result).toBe("Use web searching (not available) to look up docs.");
		});

		test("replaces TodoWrite with not-available fallback", () => {
			const input = "Call TodoWrite to track tasks.";
			const result = toolProse(input, "copilot", copilotRegistry);
			expect(result).toBe("Call task tracking (not available) to track tasks.");
		});

		test("leaves SlashCommand unchanged (null-mapped, no fallback)", () => {
			const input = "Use SlashCommand to invoke.";
			const result = toolProse(input, "copilot", copilotRegistry);
			expect(result).toBe(input);
		});

		test("rewrites WebFetch to Copilot equivalent", () => {
			const input = "Use WebFetch to download.";
			const result = toolProse(input, "copilot", copilotRegistry);
			expect(result).toBe("Use fetch_url to download.");
		});
	});
});
