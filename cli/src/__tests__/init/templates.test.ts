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

		test("codex template extends shared content with codex-specific sections", () => {
			expect(CODEX_TEMPLATE).toContain(AGENTS_TEMPLATE);
		});
	});
});
