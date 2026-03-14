/**
 * Unit tests for the allowed_tools Liquid filter.
 * Tests string-to-array (OpenCode), string-to-filtered-string (Codex),
 * and passthrough (Claude Code).
 */

import { describe, expect, test } from "bun:test";
import { codexRegistry } from "../../../build/codex/registry.js";
import { allowedToolsFilter } from "../../../build/filters/allowed-tools.js";
import { defaultRegistry } from "../../../build/registry.js";

describe("allowed_tools filter", () => {
	describe("claude-code (passthrough)", () => {
		test("returns the input string unchanged", () => {
			const input = "Bash(echo *), Read, Write, Edit";
			expect(allowedToolsFilter(input, "claude-code", defaultRegistry)).toBe(
				input,
			);
		});

		test("preserves single tool", () => {
			expect(allowedToolsFilter("Read", "claude-code", defaultRegistry)).toBe(
				"Read",
			);
		});
	});

	describe("opencode (split to array)", () => {
		test("splits comma-separated tools into array", () => {
			const result = allowedToolsFilter(
				"Bash(echo *), Read, Write, Edit",
				"opencode",
				defaultRegistry,
			);
			expect(result).toEqual(["Bash(echo *)", "Read", "Write", "Edit"]);
		});

		test("trims whitespace from tool names", () => {
			const result = allowedToolsFilter(
				"Read ,  Write , Edit",
				"opencode",
				defaultRegistry,
			);
			expect(result).toEqual(["Read", "Write", "Edit"]);
		});

		test("handles single tool", () => {
			const result = allowedToolsFilter("Bash", "opencode", defaultRegistry);
			expect(result).toEqual(["Bash"]);
		});
	});

	describe("codex (map through registry)", () => {
		test("maps Bash to functions.exec_command", () => {
			const result = allowedToolsFilter("Bash", "codex", codexRegistry);
			expect(result).toBe("functions.exec_command");
		});

		test("filters out null-mapped tools", () => {
			const result = allowedToolsFilter(
				"Bash, Read, Write, Grep, Glob",
				"codex",
				codexRegistry,
			);
			expect(result).toBe("functions.exec_command");
		});

		test("handles parenthesized tool patterns", () => {
			const result = allowedToolsFilter(
				"Bash(echo *), Read, Edit",
				"codex",
				codexRegistry,
			);
			expect(result).toContain("functions.exec_command(echo *)");
			expect(result).toContain("functions.apply_patch");
		});

		test("returns undefined when all tools are filtered out", () => {
			const result = allowedToolsFilter(
				"Read, Write, Grep, Glob",
				"codex",
				codexRegistry,
			);
			expect(result).toBeUndefined();
		});

		test("passes through unknown tools as-is", () => {
			const result = allowedToolsFilter(
				"Bash, CustomTool",
				"codex",
				codexRegistry,
			);
			expect(result).toContain("functions.exec_command");
			expect(result).toContain("CustomTool");
		});

		test("maps Edit to functions.apply_patch", () => {
			const result = allowedToolsFilter("Edit", "codex", codexRegistry);
			expect(result).toBe("functions.apply_patch");
		});
	});
});
