/**
 * Unit tests for the namespace_ref Liquid filter.
 * Tests all three platform transformations and edge cases.
 */

import { describe, expect, test } from "bun:test";
import { namespaceRef } from "../../../build/filters/namespace-ref.js";

describe("namespace_ref filter", () => {
	describe("claude-code (passthrough)", () => {
		test("returns content unchanged", () => {
			const content = "Use rp1-base:knowledge-load for context.";
			expect(namespaceRef(content, "claude-code")).toBe(content);
		});

		test("preserves slash-prefixed references", () => {
			const content = "Run /rp1-dev:build to build.";
			expect(namespaceRef(content, "claude-code")).toBe(content);
		});
	});

	describe("opencode (colon to slash)", () => {
		test("replaces rp1-base: with rp1-base/", () => {
			const content = "Use rp1-base:knowledge-load for context.";
			expect(namespaceRef(content, "opencode")).toBe(
				"Use rp1-base/knowledge-load for context.",
			);
		});

		test("replaces rp1-dev: with rp1-dev/", () => {
			const content = "Use rp1-dev:feature-build to implement.";
			expect(namespaceRef(content, "opencode")).toBe(
				"Use rp1-dev/feature-build to implement.",
			);
		});

		test("transforms multiple namespace references", () => {
			const content =
				"First rp1-base:cmd1, then rp1-dev:cmd2, and rp1-base:cmd3.";
			expect(namespaceRef(content, "opencode")).toBe(
				"First rp1-base/cmd1, then rp1-dev/cmd2, and rp1-base/cmd3.",
			);
		});

		test("transforms references everywhere (not code-block-aware)", () => {
			const content = [
				"Outside rp1-base:cmd here.",
				"```",
				"Inside rp1-base:cmd here.",
				"```",
			].join("\n");

			const result = namespaceRef(content, "opencode");
			expect(result).toContain("rp1-base/cmd");
			expect(result).not.toContain("rp1-base:");
		});
	});

	describe("codex (slash-prefix to dollar-prefix)", () => {
		test("transforms /rp1-base:skill to $rp1-base-skill", () => {
			const content = "Use /rp1-base:knowledge-load for context.";
			expect(namespaceRef(content, "codex")).toBe(
				"Use $rp1-base-knowledge-load for context.",
			);
		});

		test("transforms /rp1-dev:skill to $rp1-dev-skill", () => {
			const content = "Run /rp1-dev:build-fast to build.";
			expect(namespaceRef(content, "codex")).toBe(
				"Run $rp1-dev-build-fast to build.",
			);
		});

		test("transforms /rp1-utils:skill to $rp1-utils-skill", () => {
			const content = "Use /rp1-utils:tersify-prompt to optimize.";
			expect(namespaceRef(content, "codex")).toBe(
				"Use $rp1-utils-tersify-prompt to optimize.",
			);
		});

		test("transforms multiple references", () => {
			const content =
				"First /rp1-base:cmd1, then /rp1-dev:cmd2, and /rp1-utils:cmd3.";
			expect(namespaceRef(content, "codex")).toBe(
				"First $rp1-base-cmd1, then $rp1-dev-cmd2, and $rp1-utils-cmd3.",
			);
		});

		test("preserves references inside code blocks", () => {
			const content = [
				"Use /rp1-base:knowledge-load outside.",
				"```",
				"/rp1-base:knowledge-load",
				"```",
				"And /rp1-dev:build here.",
			].join("\n");

			const result = namespaceRef(content, "codex");
			expect(result).toContain("$rp1-base-knowledge-load");
			expect(result).toContain("/rp1-base:knowledge-load");
			expect(result).toContain("$rp1-dev-build");
		});

		test("does not transform bare rp1-base: without leading slash", () => {
			const content = "Use rp1-base:knowledge-load (no slash).";
			expect(namespaceRef(content, "codex")).toBe(content);
		});
	});
});
