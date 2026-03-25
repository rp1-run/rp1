/**
 * Unit tests for L003: incomplete-dispatch lint rule.
 * Detects Codex spawn blocks without corresponding wait instructions.
 */

import { describe, expect, test } from "bun:test";
import { incompleteDispatchRule } from "../../../build/lint/rules/incomplete-dispatch.js";

describe("L003: incomplete-dispatch", () => {
	describe("positive detection (codex)", () => {
		test("detects foreground spawn without wait", () => {
			const content = [
				"Spawn agent:",
				"  agent_type: rp1-dev-writer",
				"  fork_context: false",
				'  prompt: "Write code"',
				"",
				"Continue with other work.",
			].join("\n");
			const diagnostics = incompleteDispatchRule(content, "codex", "test.md");
			expect(diagnostics.length).toBe(1);
			expect(diagnostics[0].rule).toBe("L003");
			expect(diagnostics[0].severity).toBe("error");
			expect(diagnostics[0].message).toContain("missing wait instructions");
		});

		test("detects spawn without explicit fork_context", () => {
			const content = [
				"Spawn agent:",
				"  agent_type: rp1-dev-writer",
				'  prompt: "Write code"',
				"",
				"Wait for the spawned agent to complete. Do NOT proceed until the agent has finished and returned its result.",
			].join("\n");
			const diagnostics = incompleteDispatchRule(content, "codex", "test.md");
			expect(diagnostics.length).toBe(1);
			expect(diagnostics[0].message).toContain("missing explicit fork_context");
		});

		test("reports correct line number", () => {
			const content = [
				"Some intro.",
				"",
				"Spawn agent:",
				"  agent_type: rp1-dev-writer",
				"  fork_context: false",
			].join("\n");
			const diagnostics = incompleteDispatchRule(content, "codex", "test.md");
			expect(diagnostics[0].line).toBe(3);
		});
	});

	describe("negative (valid content)", () => {
		test("accepts foreground spawn with wait instructions", () => {
			const content = [
				"Spawn agent:",
				"  agent_type: rp1-dev-writer",
				"  fork_context: false",
				'  prompt: "Write code"',
				"",
				"Wait for the spawned agent to complete. Do NOT proceed until the agent has finished and returned its result.",
			].join("\n");
			const diagnostics = incompleteDispatchRule(content, "codex", "test.md");
			expect(diagnostics).toEqual([]);
		});

		test("accepts background spawn without wait", () => {
			const content = [
				"Spawn agent (background):",
				"  agent_type: rp1-dev-writer",
				"  fork_context: false",
				'  prompt: "Write code"',
				"",
				"Continue with other work.",
			].join("\n");
			const diagnostics = incompleteDispatchRule(content, "codex", "test.md");
			expect(diagnostics).toEqual([]);
		});

		test("returns empty for non-codex platforms", () => {
			const content = "Spawn agent:\n  agent_type: rp1-dev-writer";
			expect(incompleteDispatchRule(content, "claude-code", "test.md")).toEqual(
				[],
			);
			expect(incompleteDispatchRule(content, "opencode", "test.md")).toEqual(
				[],
			);
		});

		test("returns empty when no spawn blocks exist", () => {
			const content = "This is normal content without any spawn.";
			const diagnostics = incompleteDispatchRule(content, "codex", "test.md");
			expect(diagnostics).toEqual([]);
		});
	});
});
