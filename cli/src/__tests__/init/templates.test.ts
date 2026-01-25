/**
 * Unit tests for the init tool templates module.
 * Tests that templates contain required references and structure.
 */

import { describe, expect, test } from "bun:test";
import {
	AGENTS_TEMPLATE,
	CLAUDE_CODE_TEMPLATE,
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
	});

	describe("template consistency", () => {
		test("both templates reference the same KB files", () => {
			const kbFiles = [
				"index.md",
				"architecture.md",
				"modules.md",
				"patterns.md",
			];

			for (const file of kbFiles) {
				expect(CLAUDE_CODE_TEMPLATE).toContain(file);
				expect(AGENTS_TEMPLATE).toContain(file);
			}
		});

		test("both templates have consistent structure", () => {
			expect(CLAUDE_CODE_TEMPLATE).toContain("rp1 Knowledge Base");
			expect(AGENTS_TEMPLATE).toContain("rp1 Knowledge Base");

			expect(CLAUDE_CODE_TEMPLATE).toContain("Loading rules");
			expect(AGENTS_TEMPLATE).toContain("Loading rules");

			expect(CLAUDE_CODE_TEMPLATE).toContain("Progressive Disclosure");
			expect(AGENTS_TEMPLATE).toContain("Progressive Disclosure");
		});
	});
});
