/**
 * Unit tests for L005: null-tool-in-prose lint rule.
 * Detects CC-specific tool names appearing in non-CC rendered prose.
 */

import { describe, expect, test } from "bun:test";
import { nullToolInProseRule } from "../../../build/lint/rules/null-tool-in-prose.js";

describe("L005: null-tool-in-prose", () => {
	describe("positive detection", () => {
		test("detects 'the Edit tool' in Codex output", () => {
			const content = "Use the Edit tool to modify files.";
			const diagnostics = nullToolInProseRule(content, "codex", "test.md");
			expect(diagnostics.length).toBe(1);
			expect(diagnostics[0].rule).toBe("L005");
			expect(diagnostics[0].severity).toBe("warning");
			expect(diagnostics[0].message).toContain("Edit");
		});

		test("detects TodoWrite in OpenCode output", () => {
			const content = "Use TodoWrite to track tasks.";
			const diagnostics = nullToolInProseRule(content, "opencode", "test.md");
			expect(diagnostics.length).toBe(1);
			expect(diagnostics[0].message).toContain("TodoWrite");
		});

		test("detects AskUserQuestion in Codex output", () => {
			const content = "Call AskUserQuestion to get input.";
			const diagnostics = nullToolInProseRule(content, "codex", "test.md");
			expect(diagnostics.length).toBe(1);
			expect(diagnostics[0].message).toContain("AskUserQuestion");
		});

		test("detects WebFetch in Codex output", () => {
			const content = "Use WebFetch to download resources.";
			const diagnostics = nullToolInProseRule(content, "codex", "test.md");
			expect(diagnostics.length).toBe(1);
		});

		test("detects EnterPlanMode in non-CC output", () => {
			const content = "Call EnterPlanMode before planning.";
			const diagnostics = nullToolInProseRule(content, "codex", "test.md");
			expect(diagnostics.length).toBe(1);
		});

		test("detects ExitPlanMode in non-CC output", () => {
			const content = "Call ExitPlanMode when done.";
			const diagnostics = nullToolInProseRule(content, "opencode", "test.md");
			expect(diagnostics.length).toBe(1);
		});

		test("detects multiple CC tool names", () => {
			const content = "Use the Edit tool and TodoWrite and AskUserQuestion.";
			const diagnostics = nullToolInProseRule(content, "codex", "test.md");
			expect(diagnostics.length).toBe(3);
		});

		test("includes suggestion with appropriate tag", () => {
			const content = "Use the Edit tool.";
			const diagnostics = nullToolInProseRule(content, "codex", "test.md");
			expect(diagnostics[0].suggestion).toContain("edit_model");
		});

		test("reports correct line number", () => {
			const content = "Line 1\nLine 2\nUse TodoWrite here.\nLine 4";
			const diagnostics = nullToolInProseRule(content, "codex", "test.md");
			expect(diagnostics[0].line).toBe(3);
		});
	});

	describe("claude-code platform (no-op)", () => {
		test("returns empty for claude-code", () => {
			const content = "Use the Edit tool and TodoWrite.";
			const diagnostics = nullToolInProseRule(
				content,
				"claude-code",
				"test.md",
			);
			expect(diagnostics).toEqual([]);
		});
	});

	describe("clean content", () => {
		test("returns empty when no CC tool names in prose", () => {
			const content =
				"Use the apply_patch tool and update_plan for task tracking.";
			const diagnostics = nullToolInProseRule(content, "codex", "test.md");
			expect(diagnostics).toEqual([]);
		});
	});
});
