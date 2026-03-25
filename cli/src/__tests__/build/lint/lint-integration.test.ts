/**
 * Integration tests for the lint system.
 * Tests lintArtifact() with multiple rules running together.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
	clearLintRules,
	type LintRule,
	lintArtifact,
	registerLintRule,
} from "../../../build/lint/index.js";
import { incompleteDispatchRule } from "../../../build/lint/rules/incomplete-dispatch.js";
import { nullToolInProseRule } from "../../../build/lint/rules/null-tool-in-prose.js";
import { nullToolRefsRule } from "../../../build/lint/rules/null-tool-refs.js";
import { orphanedPlatformRule } from "../../../build/lint/rules/orphaned-platform.js";
import { unresolvedTagsRule } from "../../../build/lint/rules/unresolved-tags.js";

describe("lintArtifact integration", () => {
	beforeEach(() => {
		clearLintRules();
		registerLintRule(nullToolRefsRule);
		registerLintRule(orphanedPlatformRule);
		registerLintRule(incompleteDispatchRule);
		registerLintRule(unresolvedTagsRule);
		registerLintRule(nullToolInProseRule);
	});

	afterEach(() => {
		clearLintRules();
	});

	test("clean Codex artifact passes all rules", () => {
		const content = [
			"Spawn agent:",
			"  agent_type: rp1-dev-implementer",
			"  fork_context: false",
			'  prompt: "Implement the feature"',
			"",
			"Wait for the spawned agent to complete. Do NOT proceed until the agent has finished.",
		].join("\n");

		const result = lintArtifact(content, "codex", "skill.md");
		expect(result.hasErrors).toBe(false);
		expect(result.diagnostics.length).toBe(0);
	});

	test("clean CC artifact passes all rules", () => {
		const content = [
			"Task tool:",
			"subagent_type: rp1-dev:writer",
			'prompt: "Write code"',
			"",
			"Use TodoWrite to track progress.",
		].join("\n");

		const result = lintArtifact(content, "claude-code", "skill.md");
		expect(result.hasErrors).toBe(false);
	});

	test("multiple violations across different rules", () => {
		const content = [
			"Use TodoWrite to track progress.",
			'{% if platform == "codex" %}',
			"Codex block.",
			"{% endif %}",
			'{% dispatch_agent "rp1-dev:w", "Go" %}',
		].join("\n");

		const result = lintArtifact(content, "codex", "skill.md");
		expect(result.hasErrors).toBe(true);

		const rules = result.diagnostics.map((d) => d.rule);
		expect(rules).toContain("L001");
		expect(rules).toContain("L002");
		expect(rules).toContain("L004");
	});

	test("hasErrors is true when errors exist", () => {
		const content = '{% dispatch_agent "rp1-dev:w", "Go" %}';
		const result = lintArtifact(content, "codex", "skill.md");
		expect(result.hasErrors).toBe(true);
	});

	test("hasErrors is false when only warnings exist", () => {
		const content = "Use the Edit tool to modify.";
		const result = lintArtifact(content, "codex", "skill.md");
		expect(result.hasErrors).toBe(false);
		expect(result.diagnostics.length).toBeGreaterThan(0);
		expect(result.diagnostics.every((d) => d.severity === "warning")).toBe(
			true,
		);
	});

	test("custom rule registration works", () => {
		clearLintRules();
		const customRule: LintRule = (content, _platform, file) => {
			if (content.includes("FORBIDDEN")) {
				return [
					{
						rule: "CUSTOM",
						severity: "error",
						message: "Found FORBIDDEN",
						file,
					},
				];
			}
			return [];
		};
		registerLintRule(customRule);

		const result = lintArtifact("This has FORBIDDEN text.", "codex", "t.md");
		expect(result.hasErrors).toBe(true);
		expect(result.diagnostics[0].rule).toBe("CUSTOM");
	});

	test("clearLintRules removes all rules", () => {
		clearLintRules();
		const content = "TodoWrite and {% dispatch_agent %} everywhere.";
		const result = lintArtifact(content, "codex", "test.md");
		expect(result.diagnostics).toEqual([]);
		expect(result.hasErrors).toBe(false);
	});
});
