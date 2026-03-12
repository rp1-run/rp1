/**
 * Unit tests for L004: unresolved-tags lint rule.
 * Detects unprocessed semantic tags in rendered output.
 */

import { describe, expect, test } from "bun:test";
import { unresolvedTagsRule } from "../../../build/lint/rules/unresolved-tags.js";

describe("L004: unresolved-tags", () => {
	describe("positive detection", () => {
		test("detects unresolved {% dispatch_agent %}", () => {
			const content = '{% dispatch_agent "rp1-dev:writer", "Write code" %}';
			const diagnostics = unresolvedTagsRule(content, "codex", "test.md");
			expect(diagnostics.length).toBe(1);
			expect(diagnostics[0].rule).toBe("L004");
			expect(diagnostics[0].severity).toBe("error");
			expect(diagnostics[0].message).toContain("dispatch_agent");
		});

		test("detects unresolved {% ask_user %}", () => {
			const content = '{% ask_user "What?" %}';
			const diagnostics = unresolvedTagsRule(content, "opencode", "test.md");
			expect(diagnostics.length).toBe(1);
			expect(diagnostics[0].message).toContain("ask_user");
		});

		test("detects unresolved {% plan_tool %}", () => {
			const content = '{% plan_tool "Track progress" %}';
			const diagnostics = unresolvedTagsRule(content, "claude-code", "test.md");
			expect(diagnostics.length).toBe(1);
		});

		test("detects unresolved {% web_access %}", () => {
			const content = '{% web_access "search", "Find docs" %}';
			const diagnostics = unresolvedTagsRule(content, "codex", "test.md");
			expect(diagnostics.length).toBe(1);
		});

		test("detects unresolved {% edit_model %}", () => {
			const content = '{% edit_model "modify files" %}';
			const diagnostics = unresolvedTagsRule(content, "codex", "test.md");
			expect(diagnostics.length).toBe(1);
		});

		test("detects unresolved {% permissions %}", () => {
			const content = '{% permissions "restrict access" %}';
			const diagnostics = unresolvedTagsRule(content, "codex", "test.md");
			expect(diagnostics.length).toBe(1);
		});

		test("detects multiple unresolved tags", () => {
			const content = [
				'{% dispatch_agent "rp1-dev:w", "Go" %}',
				'{% ask_user "What?" %}',
			].join("\n");
			const diagnostics = unresolvedTagsRule(content, "codex", "test.md");
			expect(diagnostics.length).toBe(2);
		});

		test("reports correct line number", () => {
			const content = 'Line 1\nLine 2\n{% ask_user "Q?" %}\nLine 4';
			const diagnostics = unresolvedTagsRule(content, "codex", "test.md");
			expect(diagnostics[0].line).toBe(3);
		});
	});

	describe("negative (clean content)", () => {
		test("returns empty for content without semantic tags", () => {
			const content = "Task tool:\nsubagent_type: rp1-dev:writer";
			const diagnostics = unresolvedTagsRule(content, "codex", "test.md");
			expect(diagnostics).toEqual([]);
		});

		test("does not flag non-semantic Liquid tags", () => {
			const content = "{% if someVar %}\nContent.\n{% endif %}";
			const diagnostics = unresolvedTagsRule(content, "codex", "test.md");
			expect(diagnostics).toEqual([]);
		});

		test("works for all platforms", () => {
			const clean = "No tags here.";
			expect(unresolvedTagsRule(clean, "claude-code", "t.md")).toEqual([]);
			expect(unresolvedTagsRule(clean, "opencode", "t.md")).toEqual([]);
			expect(unresolvedTagsRule(clean, "codex", "t.md")).toEqual([]);
		});
	});
});
