/**
 * Unit tests for the init tool templates module.
 * Tests that pre-rendered templates contain required references and structure,
 * and that platform-specific sections are correctly included/excluded.
 */

import { describe, expect, test } from "bun:test";
import {
	AGENTS_TEMPLATE,
	CLAUDE_CODE_TEMPLATE,
	CODEX_TEMPLATE,
} from "../../init/templates/index.js";

describe("templates", () => {
	describe("CLAUDE_CODE_TEMPLATE", () => {
		test("contains KB file references", () => {
			expect(CLAUDE_CODE_TEMPLATE).toContain(".rp1/context/");
			expect(CLAUDE_CODE_TEMPLATE).toContain("index.md");
			expect(CLAUDE_CODE_TEMPLATE).toContain("architecture.md");
			expect(CLAUDE_CODE_TEMPLATE).toContain("modules.md");
			expect(CLAUDE_CODE_TEMPLATE).toContain("patterns.md");
		});

		test("contains loading rules", () => {
			expect(CLAUDE_CODE_TEMPLATE).toContain("Loading rules");
			expect(CLAUDE_CODE_TEMPLATE).toContain("read index.md first");
		});

		test("contains task-based loading guidance", () => {
			expect(CLAUDE_CODE_TEMPLATE).toContain("Code review");
			expect(CLAUDE_CODE_TEMPLATE).toContain("Bug investigation");
			expect(CLAUDE_CODE_TEMPLATE).toContain("Feature work");
		});

		test("does not contain Codex-specific sections", () => {
			expect(CLAUDE_CODE_TEMPLATE).not.toContain("Codex agent conventions");
			expect(CLAUDE_CODE_TEMPLATE).not.toContain("Task shorthand");
			expect(CLAUDE_CODE_TEMPLATE).not.toContain("Subagent waiting");
		});

		test("contains ambient skill awareness block", () => {
			expect(CLAUDE_CODE_TEMPLATE).toContain("rp1 Skill Awareness");
			expect(CLAUDE_CODE_TEMPLATE).toContain("Skill Categories");
			expect(CLAUDE_CODE_TEMPLATE).toContain("Suggestion Rules");
		});

		test("ambient block includes all skill categories", () => {
			expect(CLAUDE_CODE_TEMPLATE).toContain("Development");
			expect(CLAUDE_CODE_TEMPLATE).toContain("/build");
			expect(CLAUDE_CODE_TEMPLATE).toContain("Investigation");
			expect(CLAUDE_CODE_TEMPLATE).toContain("/code-investigate");
			expect(CLAUDE_CODE_TEMPLATE).toContain("Quality");
			expect(CLAUDE_CODE_TEMPLATE).toContain("Review");
			expect(CLAUDE_CODE_TEMPLATE).toContain("Documentation");
			expect(CLAUDE_CODE_TEMPLATE).toContain("Knowledge");
			expect(CLAUDE_CODE_TEMPLATE).toContain("Strategy");
			expect(CLAUDE_CODE_TEMPLATE).toContain("Planning");
			expect(CLAUDE_CODE_TEMPLATE).toContain("Prompt");
		});

		test("ambient block includes suggestion rules", () => {
			expect(CLAUDE_CODE_TEMPLATE).toContain("1 suggestion per turn");
			expect(CLAUDE_CODE_TEMPLATE).toContain("Do not re-suggest");
			expect(CLAUDE_CODE_TEMPLATE).toContain(
				"Do not suggest while an rp1 workflow",
			);
			expect(CLAUDE_CODE_TEMPLATE).toContain("/guide");
		});
	});

	describe("AGENTS_TEMPLATE", () => {
		test("contains KB file references", () => {
			expect(AGENTS_TEMPLATE).toContain(".rp1/context/");
			expect(AGENTS_TEMPLATE).toContain("index.md");
			expect(AGENTS_TEMPLATE).toContain("architecture.md");
		});

		test("contains loading rules", () => {
			expect(AGENTS_TEMPLATE).toContain("Loading rules");
			expect(AGENTS_TEMPLATE).toContain("read index.md first");
		});

		test("contains task-based loading guidance", () => {
			expect(AGENTS_TEMPLATE).toContain("Code review");
			expect(AGENTS_TEMPLATE).toContain("Bug investigation");
			expect(AGENTS_TEMPLATE).toContain("Feature work");
		});

		test("does not contain Codex-specific sections", () => {
			expect(AGENTS_TEMPLATE).not.toContain("Codex agent conventions");
			expect(AGENTS_TEMPLATE).not.toContain("Task shorthand");
			expect(AGENTS_TEMPLATE).not.toContain("Subagent waiting");
		});

		test("contains ambient skill awareness block", () => {
			expect(AGENTS_TEMPLATE).toContain("rp1 Skill Awareness");
			expect(AGENTS_TEMPLATE).toContain("Skill Categories");
			expect(AGENTS_TEMPLATE).toContain("Suggestion Rules");
		});
	});

	describe("CODEX_TEMPLATE", () => {
		test("contains KB file references", () => {
			expect(CODEX_TEMPLATE).toContain(".rp1/context/");
			expect(CODEX_TEMPLATE).toContain("index.md");
			expect(CODEX_TEMPLATE).toContain("architecture.md");
		});

		test("contains loading rules", () => {
			expect(CODEX_TEMPLATE).toContain("Loading rules");
			expect(CODEX_TEMPLATE).toContain("read index.md first");
		});

		test("contains Codex-specific sections", () => {
			expect(CODEX_TEMPLATE).toContain("Codex agent conventions");
			expect(CODEX_TEMPLATE).toContain("Task shorthand");
			expect(CODEX_TEMPLATE).toContain("Subagent waiting");
		});

		test("does not contain ambient skill awareness block", () => {
			expect(CODEX_TEMPLATE).not.toContain("rp1 Skill Awareness");
			expect(CODEX_TEMPLATE).not.toContain("Skill Categories");
			expect(CODEX_TEMPLATE).not.toContain("Suggestion Rules");
		});
	});

	describe("template consistency", () => {
		test("all templates reference the same KB files", () => {
			const kbFiles = [
				"index.md",
				"architecture.md",
				"modules.md",
				"patterns.md",
			];

			for (const file of kbFiles) {
				expect(CLAUDE_CODE_TEMPLATE).toContain(file);
				expect(AGENTS_TEMPLATE).toContain(file);
				expect(CODEX_TEMPLATE).toContain(file);
			}
		});

		test("all templates have consistent shared structure", () => {
			expect(CLAUDE_CODE_TEMPLATE).toContain("rp1 Knowledge Base");
			expect(AGENTS_TEMPLATE).toContain("rp1 Knowledge Base");
			expect(CODEX_TEMPLATE).toContain("rp1 Knowledge Base");

			expect(CLAUDE_CODE_TEMPLATE).toContain("Loading rules");
			expect(AGENTS_TEMPLATE).toContain("Loading rules");
			expect(CODEX_TEMPLATE).toContain("Loading rules");

			expect(CLAUDE_CODE_TEMPLATE).toContain("Progressive Disclosure");
			expect(AGENTS_TEMPLATE).toContain("Progressive Disclosure");
			expect(CODEX_TEMPLATE).toContain("Progressive Disclosure");
		});

		test("claude-code and opencode templates produce identical content", () => {
			expect(CLAUDE_CODE_TEMPLATE).toEqual(AGENTS_TEMPLATE);
		});

		test("codex template shares KB section but not ambient block", () => {
			expect(CODEX_TEMPLATE).toContain("rp1 Knowledge Base");
			expect(CODEX_TEMPLATE).toContain("Loading rules");
			expect(CODEX_TEMPLATE).not.toContain("rp1 Skill Awareness");
		});
	});
});
