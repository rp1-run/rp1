/**
 * Unit tests for the role_type Liquid filter.
 * Tests heuristic matching for Codex role types.
 */

import { describe, expect, test } from "bun:test";
import { roleType } from "../../../build/filters/role-type.js";

describe("role_type filter", () => {
	describe("worker heuristic", () => {
		test("matches 'builder' in name", () => {
			expect(roleType("task-builder", "Implements tasks")).toBe("worker");
		});

		test("matches 'scaffolder' in name", () => {
			expect(roleType("project-scaffolder", "Sets up projects")).toBe("worker");
		});

		test("matches 'implement' in description", () => {
			expect(roleType("agent", "Will implement features")).toBe("worker");
		});

		test("matches 'writer' in name", () => {
			expect(roleType("doc-writer", "Writes docs")).toBe("worker");
		});
	});

	describe("reviewer heuristic", () => {
		test("matches 'reviewer' in name", () => {
			expect(roleType("pr-sub-reviewer", "Reviews code")).toBe("reviewer");
		});

		test("matches 'checker' in name", () => {
			expect(roleType("type-checker", "Checks types")).toBe("reviewer");
		});

		test("matches 'auditor' in description", () => {
			expect(roleType("agent", "Security auditor")).toBe("reviewer");
		});

		test("matches 'verifier' in name", () => {
			expect(roleType("build-verifier", "Verifies builds")).toBe("reviewer");
		});

		test("matches 'validator' in description", () => {
			expect(roleType("agent", "Input validator")).toBe("reviewer");
		});
	});

	describe("explorer heuristic", () => {
		test("matches 'investigator' in name", () => {
			expect(roleType("bug-investigator", "Finds bugs")).toBe("explorer");
		});

		test("matches 'analyzer' in name", () => {
			expect(roleType("kb-spatial-analyzer", "Analyzes structure")).toBe(
				"explorer",
			);
		});

		test("matches 'extractor' in name", () => {
			expect(roleType("data-extractor", "Extracts data")).toBe("explorer");
		});

		test("matches 'research' in description", () => {
			expect(roleType("agent", "Does research")).toBe("explorer");
		});

		test("matches 'explorer' in name", () => {
			expect(roleType("code-explorer", "Explores codebase")).toBe("explorer");
		});

		test("matches 'spatial' in name", () => {
			expect(roleType("spatial-agent", "Spatial analysis")).toBe("explorer");
		});
	});

	describe("default fallback", () => {
		test("returns default when no pattern matches", () => {
			expect(roleType("generic-agent", "Does things")).toBe("default");
		});

		test("returns default for empty strings", () => {
			expect(roleType("", "")).toBe("default");
		});
	});

	describe("case insensitivity", () => {
		test("matches regardless of case", () => {
			expect(roleType("Task-BUILDER", "IMPLEMENTS things")).toBe("worker");
		});
	});

	describe("combined name and description matching", () => {
		test("matches keyword in description when name has no match", () => {
			expect(roleType("my-agent", "a code reviewer")).toBe("reviewer");
		});
	});
});
