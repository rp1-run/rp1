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
import { trackedWorkflowBootstrapRule } from "../../../build/lint/rules/tracked-workflow-bootstrap.js";
import { unresolvedTagsRule } from "../../../build/lint/rules/unresolved-tags.js";

describe("lintArtifact integration", () => {
	beforeEach(() => {
		clearLintRules();
		registerLintRule(nullToolRefsRule);
		registerLintRule(orphanedPlatformRule);
		registerLintRule(incompleteDispatchRule);
		registerLintRule(unresolvedTagsRule);
		registerLintRule(nullToolInProseRule);
		registerLintRule(trackedWorkflowBootstrapRule);
	});

	afterEach(() => {
		clearLintRules();
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
