/**
 * Unit tests for L006: missing-emit-harness lint rule.
 * Detects emit event invocations in compiled output that lack --harness.
 */

import { describe, expect, test } from "bun:test";
import { missingEmitHarnessRule } from "../../../build/lint/rules/missing-emit-harness.js";

describe("L006: missing-emit-harness", () => {
	describe("flags missing --harness", () => {
		test("detects emit with flags but no --harness", () => {
			const content = `rp1 agent-tools emit --workflow build --type status_change`;
			const diagnostics = missingEmitHarnessRule(content, "codex", "test.md");
			expect(diagnostics.length).toBe(1);
			expect(diagnostics[0].rule).toBe("L006");
			expect(diagnostics[0].severity).toBe("warning");
			expect(diagnostics[0].message).toContain("--harness");
		});

		test("detects emit with backslash continuation but no --harness", () => {
			const content = `rp1 agent-tools emit \\
  --workflow build \\
  --type status_change`;
			const diagnostics = missingEmitHarnessRule(
				content,
				"claude-code",
				"test.md",
			);
			expect(diagnostics.length).toBe(1);
		});

		test("detects multiple missing --harness calls", () => {
			const content = `rp1 agent-tools emit --type status_change
some text
rp1 agent-tools emit --type artifact_registered`;
			const diagnostics = missingEmitHarnessRule(
				content,
				"opencode",
				"test.md",
			);
			expect(diagnostics.length).toBe(2);
		});

		test("includes line number", () => {
			const content = `line 1
line 2
rp1 agent-tools emit --type status_change`;
			const diagnostics = missingEmitHarnessRule(content, "codex", "test.md");
			expect(diagnostics[0].line).toBe(3);
		});
	});

	describe("passes when --harness present", () => {
		test("no diagnostic when --harness is present", () => {
			const content = `rp1 agent-tools emit --harness codex --workflow build`;
			const diagnostics = missingEmitHarnessRule(content, "codex", "test.md");
			expect(diagnostics.length).toBe(0);
		});

		test("no diagnostic when --harness appears later on the line", () => {
			const content = `rp1 agent-tools emit --workflow build --harness codex --type status_change`;
			const diagnostics = missingEmitHarnessRule(content, "codex", "test.md");
			expect(diagnostics.length).toBe(0);
		});

		test("no diagnostic when --harness is on a continuation line", () => {
			const content = `rp1 agent-tools emit \\
  --workflow build \\
  --harness codex \\
  --type status_change`;
			const diagnostics = missingEmitHarnessRule(content, "codex", "test.md");
			expect(diagnostics.length).toBe(0);
		});
	});

	describe("ignores non-event contexts", () => {
		test("ignores emit resume-run subcommand", () => {
			const content = `rp1 agent-tools emit resume-run --feature test`;
			const diagnostics = missingEmitHarnessRule(content, "codex", "test.md");
			expect(diagnostics.length).toBe(0);
		});

		test("ignores prose mentions", () => {
			const content = `This is about the rp1 agent-tools emit command.`;
			const diagnostics = missingEmitHarnessRule(content, "codex", "test.md");
			expect(diagnostics.length).toBe(0);
		});

		test("ignores content with no emit calls", () => {
			const content = `No emit calls here.`;
			const diagnostics = missingEmitHarnessRule(content, "codex", "test.md");
			expect(diagnostics.length).toBe(0);
		});
	});

	describe("applies to all platforms", () => {
		test("fires for codex", () => {
			const content = `rp1 agent-tools emit --type status_change`;
			expect(missingEmitHarnessRule(content, "codex", "test.md").length).toBe(
				1,
			);
		});

		test("fires for claude-code", () => {
			const content = `rp1 agent-tools emit --type status_change`;
			expect(
				missingEmitHarnessRule(content, "claude-code", "test.md").length,
			).toBe(1);
		});

		test("fires for opencode", () => {
			const content = `rp1 agent-tools emit --type status_change`;
			expect(
				missingEmitHarnessRule(content, "opencode", "test.md").length,
			).toBe(1);
		});
	});
});
