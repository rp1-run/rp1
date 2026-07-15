/**
 * Unit tests for the param_transform Liquid filter.
 * Tests Codex parameter rewriting and passthrough for other platforms.
 */

import { describe, expect, test } from "bun:test";
import { paramTransform } from "../../../build/filters/param-transform.js";

describe("param_transform filter", () => {
	describe("claude-code (passthrough)", () => {
		test("returns content unchanged", () => {
			const content = "Use $1 as the feature ID and $ARGUMENTS for context.";
			expect(paramTransform(content, "claude-code")).toBe(content);
		});
	});

	describe("opencode (passthrough)", () => {
		test("returns content unchanged", () => {
			const content = "Use $1 as the feature ID and $ARGUMENTS for context.";
			expect(paramTransform(content, "opencode")).toBe(content);
		});
	});

	describe("codex (rewrite)", () => {
		test("replaces $1 with instructional text", () => {
			const content = "The feature ID is $1.";
			const result = paramTransform(content, "codex");
			expect(result).toContain(
				"the value of the first argument (extracted from the user's prompt)",
			);
			expect(result).not.toContain("$1");
		});

		test("replaces $2 with second ordinal", () => {
			const content = "The context is $2.";
			const result = paramTransform(content, "codex");
			expect(result).toContain(
				"the value of the second argument (extracted from the user's prompt)",
			);
			expect(result).not.toContain("$2");
		});

		test("replaces $ARGUMENTS with descriptive prose", () => {
			const content = "Process $ARGUMENTS as input.";
			const result = paramTransform(content, "codex");
			expect(result).toContain(
				"the arguments provided by the user in their prompt",
			);
			expect(result).not.toContain("$ARGUMENTS");
		});

		test("replaces multiple positional parameters", () => {
			const content = "Use $1 for ID, $2 for scope, and $3 for mode.";
			const result = paramTransform(content, "codex");
			expect(result).toContain("first argument");
			expect(result).toContain("second argument");
			expect(result).toContain("third argument");
			expect(result).not.toMatch(/\$\d+\b/);
		});

		test("handles both $ARGUMENTS and positional in same content", () => {
			const content = "Feature $1 with $ARGUMENTS.";
			const result = paramTransform(content, "codex");
			expect(result).not.toContain("$1");
			expect(result).not.toContain("$ARGUMENTS");
			expect(result).toContain("first argument");
			expect(result).toContain(
				"the arguments provided by the user in their prompt",
			);
		});

		test("preserves references inside code blocks", () => {
			const content = [
				"Use $1 outside.",
				"```",
				"echo $1",
				"```",
				"And $ARGUMENTS here.",
			].join("\n");

			const result = paramTransform(content, "codex");
			expect(result).toContain("first argument");
			expect(result).toContain("echo $1");
			expect(result).toContain(
				"the arguments provided by the user in their prompt",
			);
		});

		test("returns content unchanged when no parameter references exist", () => {
			const content = "This content has no parameter references at all.";
			expect(paramTransform(content, "codex")).toBe(content);
		});

		test("uses numeric fallback for parameters beyond tenth", () => {
			const content = "Parameter $11 is beyond ordinals.";
			const result = paramTransform(content, "codex");
			expect(result).toContain(
				"the value of the #11 argument (extracted from the user's prompt)",
			);
		});
	});

	describe("copilot (model-parsed recovery, same as codex)", () => {
		test("replaces $1 with instructional text", () => {
			const content = "The feature ID is $1.";
			const result = paramTransform(content, "copilot");
			expect(result).toContain(
				"the value of the first argument (extracted from the user's prompt)",
			);
			expect(result).not.toContain("$1");
		});

		test("replaces $ARGUMENTS with descriptive prose", () => {
			const content = "Process $ARGUMENTS as input.";
			const result = paramTransform(content, "copilot");
			expect(result).toContain(
				"the arguments provided by the user in their prompt",
			);
			expect(result).not.toContain("$ARGUMENTS");
		});

		test("preserves references inside code blocks", () => {
			const content = ["Use $1 outside.", "```", "echo $1", "```"].join("\n");

			const result = paramTransform(content, "copilot");
			expect(result).toContain("first argument");
			expect(result).toContain("echo $1");
		});
	});
});
