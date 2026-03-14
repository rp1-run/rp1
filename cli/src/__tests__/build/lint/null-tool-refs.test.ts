/**
 * Unit tests for L001: null-tool-refs lint rule.
 * Detects tool invocation references to tools that map to null on the target platform.
 */

import { describe, expect, test } from "bun:test";
import { nullToolRefsRule } from "../../../build/lint/rules/null-tool-refs.js";

describe("L001: null-tool-refs", () => {
	describe("codex platform", () => {
		test("detects 'Use TodoWrite' in rendered Codex output", () => {
			const content = "Use TodoWrite to track progress.";
			const diagnostics = nullToolRefsRule(content, "codex", "test.md");
			expect(diagnostics.length).toBeGreaterThan(0);
			expect(diagnostics[0].rule).toBe("L001");
			expect(diagnostics[0].severity).toBe("warning");
			expect(diagnostics[0].message).toContain("TodoWrite");
			expect(diagnostics[0].message).toContain("null");
		});

		test("detects 'Use WebFetch' in rendered Codex output", () => {
			const content = "Use WebFetch to download.";
			const diagnostics = nullToolRefsRule(content, "codex", "test.md");
			expect(diagnostics.length).toBeGreaterThan(0);
			expect(diagnostics[0].message).toContain("WebFetch");
		});

		test("detects 'Use the Read tool' in Codex output", () => {
			const content = "Use the Read tool to view files.";
			const diagnostics = nullToolRefsRule(content, "codex", "test.md");
			expect(diagnostics.length).toBeGreaterThan(0);
		});

		test("detects 'Read tool' pattern in Codex output", () => {
			const content = "The Read tool can view files.";
			const diagnostics = nullToolRefsRule(content, "codex", "test.md");
			expect(diagnostics.length).toBeGreaterThan(0);
		});

		test("does not flag bare tool names in regular prose", () => {
			const content = "Read the file contents carefully.";
			const diagnostics = nullToolRefsRule(content, "codex", "test.md");
			expect(diagnostics).toEqual([]);
		});

		test("reports correct line number", () => {
			const content = "Line 1\nLine 2\nUse TodoWrite here.\nLine 4";
			const diagnostics = nullToolRefsRule(content, "codex", "test.md");
			expect(diagnostics[0].line).toBe(3);
		});

		test("reports multiple occurrences", () => {
			const content = "Use TodoWrite first.\nThen invoke TodoWrite again.";
			const diagnostics = nullToolRefsRule(content, "codex", "test.md");
			expect(diagnostics.length).toBe(2);
		});

		test("does not flag tools that have Codex equivalents", () => {
			const content = "Use Bash to run commands.";
			const diagnostics = nullToolRefsRule(content, "codex", "test.md");
			expect(diagnostics.length).toBe(0);
		});

		test("includes suggestion in diagnostic", () => {
			const content = "Use TodoWrite to plan.";
			const diagnostics = nullToolRefsRule(content, "codex", "test.md");
			expect(diagnostics[0].suggestion).toBeTruthy();
		});
	});

	describe("opencode platform", () => {
		test("detects 'call ExitPlanMode' in OpenCode output", () => {
			const content = "Call ExitPlanMode when done.";
			const diagnostics = nullToolRefsRule(content, "opencode", "test.md");
			expect(diagnostics.length).toBeGreaterThan(0);
			expect(diagnostics[0].message).toContain("ExitPlanMode");
		});

		test("detects 'Use EnterPlanMode' in OpenCode output", () => {
			const content = "Use EnterPlanMode first.";
			const diagnostics = nullToolRefsRule(content, "opencode", "test.md");
			expect(diagnostics.length).toBeGreaterThan(0);
		});
	});

	describe("claude-code platform (no-op)", () => {
		test("returns empty for claude-code (all tools are native)", () => {
			const content = "Use TodoWrite and Read tool and Edit.";
			const diagnostics = nullToolRefsRule(content, "claude-code", "test.md");
			expect(diagnostics).toEqual([]);
		});
	});

	describe("clean content", () => {
		test("returns empty when no null-mapped tools are referenced", () => {
			const content = "This content has no tool references at all.";
			const diagnostics = nullToolRefsRule(content, "codex", "test.md");
			expect(diagnostics).toEqual([]);
		});
	});
});
