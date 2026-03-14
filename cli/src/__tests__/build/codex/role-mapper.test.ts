/**
 * Unit tests for the Codex agent role-type mapper.
 * Tests keyword-based heuristic mapping to worker, reviewer, explorer, and default roles.
 */

import { describe, expect, test } from "bun:test";
import { mapAgentToRoleType } from "../../../build/codex/role-mapper.js";

describe("mapAgentToRoleType", () => {
	describe("worker role", () => {
		test("maps builder agents to worker", () => {
			expect(mapAgentToRoleType("task-builder", "Implements tasks")).toBe(
				"worker",
			);
		});

		test("maps scaffolder agents to worker", () => {
			expect(
				mapAgentToRoleType("project-scaffolder", "Scaffolds project structure"),
			).toBe("worker");
		});

		test("maps implement keyword to worker", () => {
			expect(
				mapAgentToRoleType("feature-agent", "Implements feature changes"),
			).toBe("worker");
		});

		test("maps writer agents to worker", () => {
			expect(
				mapAgentToRoleType("prompt-writer", "Writes optimized prompts"),
			).toBe("worker");
		});
	});

	describe("reviewer role", () => {
		test("maps reviewer agents to reviewer", () => {
			expect(
				mapAgentToRoleType("pr-sub-reviewer", "Reviews pull requests"),
			).toBe("reviewer");
		});

		test("maps checker agents to reviewer", () => {
			expect(mapAgentToRoleType("code-checker", "Checks code quality")).toBe(
				"reviewer",
			);
		});

		test("maps auditor agents to reviewer", () => {
			expect(
				mapAgentToRoleType("security-auditor", "Audits security concerns"),
			).toBe("reviewer");
		});

		test("maps verifier agents to reviewer", () => {
			expect(
				mapAgentToRoleType("build-verifier", "Verifies build output"),
			).toBe("reviewer");
		});

		test("maps validator agents to reviewer", () => {
			expect(mapAgentToRoleType("schema-validator", "Validates schemas")).toBe(
				"reviewer",
			);
		});
	});

	describe("explorer role", () => {
		test("maps analyzer agents to explorer", () => {
			expect(
				mapAgentToRoleType(
					"kb-spatial-analyzer",
					"Analyzes knowledge base structure",
				),
			).toBe("explorer");
		});

		test("maps extractor agents to explorer", () => {
			expect(
				mapAgentToRoleType(
					"kb-concept-extractor",
					"Extracts concepts from code",
				),
			).toBe("explorer");
		});

		test("maps research keyword to explorer", () => {
			expect(mapAgentToRoleType("deep-research", "Research agent")).toBe(
				"explorer",
			);
		});

		test("maps explorer keyword to explorer", () => {
			expect(mapAgentToRoleType("code-explorer", "Explores codebase")).toBe(
				"explorer",
			);
		});

		test("maps investigator keyword to explorer", () => {
			expect(mapAgentToRoleType("bug-investigator", "Investigates bugs")).toBe(
				"explorer",
			);
		});

		test("maps spatial keyword to explorer", () => {
			expect(
				mapAgentToRoleType("kb-spatial", "Spatial analysis of knowledge"),
			).toBe("explorer");
		});
	});

	describe("default role", () => {
		test("falls back to default for unrecognized names", () => {
			expect(mapAgentToRoleType("generic-agent", "Does generic things")).toBe(
				"default",
			);
		});

		test("falls back to default for empty strings", () => {
			expect(mapAgentToRoleType("", "")).toBe("default");
		});
	});

	describe("case insensitivity", () => {
		test("matches regardless of case in name", () => {
			expect(mapAgentToRoleType("Task-BUILDER", "Some agent")).toBe("worker");
		});

		test("matches regardless of case in description", () => {
			expect(mapAgentToRoleType("my-agent", "This REVIEWER checks code")).toBe(
				"reviewer",
			);
		});
	});

	describe("priority ordering", () => {
		test("worker takes precedence over reviewer", () => {
			expect(
				mapAgentToRoleType("builder-reviewer", "Builds and reviews code"),
			).toBe("worker");
		});

		test("reviewer takes precedence over explorer", () => {
			expect(
				mapAgentToRoleType("reviewer-analyzer", "Reviews and analyzes code"),
			).toBe("reviewer");
		});
	});
});
