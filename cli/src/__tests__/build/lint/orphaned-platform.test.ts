/**
 * Unit tests for L002: orphaned-platform lint rule.
 * Detects raw platform conditionals that survived preprocessing.
 */

import { describe, expect, test } from "bun:test";
import { orphanedPlatformRule } from "../../../build/lint/rules/orphaned-platform.js";

describe("L002: orphaned-platform", () => {
	describe("positive detection", () => {
		test("detects {% if platform %} block", () => {
			const content = '{% if platform == "codex" %}\nCodex only.\n{% endif %}';
			const diagnostics = orphanedPlatformRule(content, "codex", "test.md");
			expect(diagnostics.length).toBeGreaterThan(0);
			expect(diagnostics[0].rule).toBe("L002");
			expect(diagnostics[0].severity).toBe("error");
		});

		test("detects {% case platform %} block", () => {
			const content =
				'{% case platform %}\n{% when "codex" %}\nCodex\n{% endcase %}';
			const diagnostics = orphanedPlatformRule(content, "codex", "test.md");
			expect(diagnostics.length).toBeGreaterThan(0);
		});

		test("detects {% elsif platform %}", () => {
			const content = '{% elsif platform == "opencode" %}\nOC content.';
			const diagnostics = orphanedPlatformRule(content, "opencode", "test.md");
			expect(diagnostics.length).toBeGreaterThan(0);
		});

		test("detects {% when 'claude-code' %}", () => {
			const content = "{% when 'claude-code' %}\nCC content.";
			const diagnostics = orphanedPlatformRule(
				content,
				"claude-code",
				"test.md",
			);
			expect(diagnostics.length).toBeGreaterThan(0);
		});

		test("detects {% when 'opencode' %}", () => {
			const content = '{% when "opencode" %}\nOC.';
			const diagnostics = orphanedPlatformRule(content, "opencode", "test.md");
			expect(diagnostics.length).toBeGreaterThan(0);
		});

		test("detects {% when 'codex' %}", () => {
			const content = '{% when "codex" %}\nCX.';
			const diagnostics = orphanedPlatformRule(content, "codex", "test.md");
			expect(diagnostics.length).toBeGreaterThan(0);
		});

		test("detects {% when 'goose' %}", () => {
			const content = '{% when "goose" %}\\nGoose.';
			expect(orphanedPlatformRule(content, "goose", "test.md").length).toBeGreaterThan(0);
		});

		test("reports correct line number", () => {
			const content = 'Line 1\nLine 2\n{% if platform == "codex" %}\nLine 4';
			const diagnostics = orphanedPlatformRule(content, "codex", "test.md");
			expect(diagnostics[0].line).toBe(3);
		});

		test("detects multiple orphaned blocks", () => {
			const content = [
				'{% if platform == "codex" %}',
				"Block 1",
				"{% endif %}",
				"{% case platform %}",
				'{% when "codex" %}',
				"Block 2",
				"{% endcase %}",
			].join("\n");
			const diagnostics = orphanedPlatformRule(content, "codex", "test.md");
			expect(diagnostics.length).toBeGreaterThan(1);
		});
	});

	describe("negative (clean content)", () => {
		test("returns empty for content without platform conditionals", () => {
			const content = "This is clean rendered content.\nNo platform blocks.";
			const diagnostics = orphanedPlatformRule(content, "codex", "test.md");
			expect(diagnostics).toEqual([]);
		});

		test("does not flag non-platform if blocks", () => {
			const content = '{% if someVar == "value" %}\nContent.\n{% endif %}';
			const diagnostics = orphanedPlatformRule(content, "codex", "test.md");
			expect(diagnostics).toEqual([]);
		});

		test("works for all platforms", () => {
			const content = "Clean content.";
			expect(orphanedPlatformRule(content, "claude-code", "test.md")).toEqual(
				[],
			);
			expect(orphanedPlatformRule(content, "opencode", "test.md")).toEqual([]);
			expect(orphanedPlatformRule(content, "codex", "test.md")).toEqual([]);
			expect(orphanedPlatformRule(content, "goose", "test.md")).toEqual([]);
		});
	});
});
