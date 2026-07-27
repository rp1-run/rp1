/**
 * Unit tests for L017: skill-body-size lint rule.
 *
 * Enforces Anthropic's 500-line SKILL.md ceiling against compiled output.
 * Compiled size is what matters: the build injects generated sections and
 * expands shared includes, so two skills in this repo sat under the limit as
 * authored and over it once built.
 */

import { describe, expect, test } from "bun:test";
import { skillBodySizeRule } from "../../../build/lint/rules/skill-body-size.js";

const body = (lines: number): string =>
	Array.from({ length: lines }, (_, i) => `line ${i + 1}`).join("\n");

describe("L017: skill-body-size", () => {
	test("flags a compiled SKILL.md over 500 lines", () => {
		const diagnostics = skillBodySizeRule(
			body(501),
			"claude-code",
			"rp1-build/SKILL.md",
		);
		expect(diagnostics).toHaveLength(1);
		expect(diagnostics[0].rule).toBe("L017");
		expect(diagnostics[0].severity).toBe("error");
		expect(diagnostics[0].message).toContain("501 lines");
		expect(diagnostics[0].suggestion).toContain("references/");
	});

	test("accepts a SKILL.md exactly at the limit", () => {
		expect(
			skillBodySizeRule(body(500), "claude-code", "rp1-build/SKILL.md"),
		).toHaveLength(0);
	});

	test("accepts a SKILL.md under the limit", () => {
		expect(
			skillBodySizeRule(body(120), "claude-code", "rp1-build/SKILL.md"),
		).toHaveLength(0);
	});

	test("ignores agents, which have no companion directory to split into", () => {
		expect(
			skillBodySizeRule(body(900), "claude-code", "task-reviewer.md"),
		).toHaveLength(0);
	});

	test("ignores reference and companion files", () => {
		// The build lints only SKILL.md and agent artifacts, but assert the
		// filename guard directly so a future call site cannot flag tier-3 files.
		expect(
			skillBodySizeRule(body(900), "claude-code", "references/protocol.md"),
		).toHaveLength(0);
		expect(
			skillBodySizeRule(body(900), "claude-code", "EXAMPLES.md"),
		).toHaveLength(0);
	});

	test("applies on every platform", () => {
		for (const platform of [
			"claude-code",
			"opencode",
			"codex",
			"copilot",
			"antigravity",
		] as const) {
			expect(
				skillBodySizeRule(body(650), platform, "rp1-build/SKILL.md"),
			).toHaveLength(1);
		}
	});
});
