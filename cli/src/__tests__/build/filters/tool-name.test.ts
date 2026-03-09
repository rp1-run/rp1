/**
 * Unit tests for the tool_name Liquid filter.
 * Tests registry mapping, null filtering, and unmapped passthrough.
 */

import { describe, expect, test } from "bun:test";
import { claudeCodeRegistry } from "../../../build/claude-code/registry.js";
import { codexRegistry } from "../../../build/codex/registry.js";
import { toolName } from "../../../build/filters/tool-name.js";
import { defaultRegistry } from "../../../build/registry.js";

describe("tool_name filter", () => {
	describe("opencode registry", () => {
		test("maps Read to read_file", () => {
			expect(toolName("Read", defaultRegistry)).toBe("read_file");
		});

		test("maps Write to write_file", () => {
			expect(toolName("Write", defaultRegistry)).toBe("write_file");
		});

		test("maps Edit to edit_file", () => {
			expect(toolName("Edit", defaultRegistry)).toBe("edit_file");
		});

		test("maps Bash to bash_run", () => {
			expect(toolName("Bash", defaultRegistry)).toBe("bash_run");
		});

		test("maps Grep to grep_file", () => {
			expect(toolName("Grep", defaultRegistry)).toBe("grep_file");
		});

		test("maps Glob to glob_pattern", () => {
			expect(toolName("Glob", defaultRegistry)).toBe("glob_pattern");
		});

		test("returns null for filtered tools (ExitPlanMode)", () => {
			expect(toolName("ExitPlanMode", defaultRegistry)).toBeNull();
		});

		test("returns null for filtered tools (EnterPlanMode)", () => {
			expect(toolName("EnterPlanMode", defaultRegistry)).toBeNull();
		});

		test("returns original for unmapped tools", () => {
			expect(toolName("CustomTool", defaultRegistry)).toBe("CustomTool");
		});
	});

	describe("codex registry", () => {
		test("maps Bash to functions.exec_command", () => {
			expect(toolName("Bash", codexRegistry)).toBe("functions.exec_command");
		});

		test("maps Edit to functions.apply_patch", () => {
			expect(toolName("Edit", codexRegistry)).toBe("functions.apply_patch");
		});

		test("returns null for Read (no Codex equivalent)", () => {
			expect(toolName("Read", codexRegistry)).toBeNull();
		});

		test("returns null for Write (no Codex equivalent)", () => {
			expect(toolName("Write", codexRegistry)).toBeNull();
		});

		test("returns null for Grep (no Codex equivalent)", () => {
			expect(toolName("Grep", codexRegistry)).toBeNull();
		});

		test("returns null for Task (handled by native spawning)", () => {
			expect(toolName("Task", codexRegistry)).toBeNull();
		});

		test("returns original for unmapped tools", () => {
			expect(toolName("UnknownTool", codexRegistry)).toBe("UnknownTool");
		});
	});

	describe("claude-code registry (passthrough)", () => {
		test("maps Read to Read (passthrough)", () => {
			expect(toolName("Read", claudeCodeRegistry)).toBe("Read");
		});

		test("maps Bash to Bash (passthrough)", () => {
			expect(toolName("Bash", claudeCodeRegistry)).toBe("Bash");
		});

		test("returns original for unmapped tools", () => {
			expect(toolName("CustomTool", claudeCodeRegistry)).toBe("CustomTool");
		});
	});
});
