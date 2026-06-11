/**
 * Unit tests for L015: description-length lint rule.
 * Validates skill descriptions against length thresholds.
 */

import { describe, expect, test } from "bun:test";
import { lintSkillDescriptionLength } from "../../../build/lint/rules/description-length.js";

describe("L015: description-length", () => {
	describe("clean descriptions", () => {
		test("no diagnostic at exactly 160 chars", () => {
			const description = "a".repeat(160);
			const diagnostics = lintSkillDescriptionLength(
				description,
				"test-skill/SKILL.md",
			);
			expect(diagnostics.length).toBe(0);
		});

		test("no diagnostic well under threshold", () => {
			const description =
				"Create and validate Mermaid diagrams. Use when generating flowcharts or visualizations.";
			const diagnostics = lintSkillDescriptionLength(
				description,
				"test-skill/SKILL.md",
			);
			expect(diagnostics.length).toBe(0);
		});
	});

	describe("warnings (161-200 chars)", () => {
		test("warns at 161 chars", () => {
			const description = "a".repeat(161);
			const diagnostics = lintSkillDescriptionLength(
				description,
				"test-skill/SKILL.md",
			);
			expect(diagnostics.length).toBe(1);
			expect(diagnostics[0].rule).toBe("L015");
			expect(diagnostics[0].severity).toBe("warning");
			expect(diagnostics[0].message).toContain("161");
		});

		test("warns at exactly 200 chars", () => {
			const description = "a".repeat(200);
			const diagnostics = lintSkillDescriptionLength(
				description,
				"test-skill/SKILL.md",
			);
			expect(diagnostics.length).toBe(1);
			expect(diagnostics[0].severity).toBe("warning");
			expect(diagnostics[0].message).toContain("200");
		});
	});

	describe("errors (>200 chars)", () => {
		test("errors at 201 chars", () => {
			const description = "a".repeat(201);
			const diagnostics = lintSkillDescriptionLength(
				description,
				"test-skill/SKILL.md",
			);
			expect(diagnostics.length).toBe(1);
			expect(diagnostics[0].rule).toBe("L015");
			expect(diagnostics[0].severity).toBe("error");
			expect(diagnostics[0].message).toContain("201");
		});

		test("error message includes max threshold", () => {
			const description = "a".repeat(250);
			const diagnostics = lintSkillDescriptionLength(
				description,
				"test-skill/SKILL.md",
			);
			expect(diagnostics[0].message).toContain("200");
		});
	});

	describe("diagnostics include file path", () => {
		test("warning includes file", () => {
			const description = "a".repeat(170);
			const diagnostics = lintSkillDescriptionLength(
				description,
				"plugins/base/skills/mermaid/SKILL.md",
			);
			expect(diagnostics[0].file).toBe("plugins/base/skills/mermaid/SKILL.md");
		});

		test("error includes file", () => {
			const description = "a".repeat(210);
			const diagnostics = lintSkillDescriptionLength(
				description,
				"plugins/base/skills/mermaid/SKILL.md",
			);
			expect(diagnostics[0].file).toBe("plugins/base/skills/mermaid/SKILL.md");
		});
	});

	describe("suggestion included", () => {
		test("warning has suggestion", () => {
			const description = "a".repeat(170);
			const diagnostics = lintSkillDescriptionLength(description, "test.md");
			expect(diagnostics[0].suggestion).toBeDefined();
			expect(diagnostics[0].suggestion).toContain("160");
		});

		test("error has suggestion", () => {
			const description = "a".repeat(210);
			const diagnostics = lintSkillDescriptionLength(description, "test.md");
			expect(diagnostics[0].suggestion).toBeDefined();
			expect(diagnostics[0].suggestion).toContain("160");
		});
	});
});
