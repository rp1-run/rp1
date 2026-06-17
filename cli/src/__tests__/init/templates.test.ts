/**
 * Unit tests for the init tool templates module.
 * Tests that pre-rendered templates contain required references and structure,
 * and that platform-specific sections are correctly included/excluded.
 */

import { describe, expect, test } from "bun:test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
	collectScopedCatalogRegistry,
	renderInitSkillAwarenessBlock,
} from "../../catalog/index.js";
import {
	AGENTS_TEMPLATE,
	CLAUDE_CODE_TEMPLATE,
	CODEX_TEMPLATE,
	getPrimaryInstructionTemplateTarget,
	resolveInstructionTemplate,
} from "../../init/templates/index.js";
import type { DetectedTool } from "../../init/tool-detector.js";

const createDetectedTool = (
	id: "claude-code" | "opencode" | "codex",
	instructionFile: "CLAUDE.md" | "AGENTS.md",
): DetectedTool => ({
	tool: {
		id,
		name: id,
		binary: id,
		min_version: "1.0.0",
		instruction_file: instructionFile,
		install_url: `https://${id}.example.com`,
		plugin_install_cmd: null,
		capabilities: [],
	},
	version: "1.0.0",
	meetsMinVersion: true,
});

const PROJECT_ROOT = resolve(
	dirname(fileURLToPath(import.meta.url)),
	"../../../..",
);

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

		test("contains slim skill awareness block", () => {
			expect(CLAUDE_CODE_TEMPLATE).toContain("rp1 Skill Awareness");
			expect(CLAUDE_CODE_TEMPLATE).toContain("Installed plugins: rp1-");
			expect(CLAUDE_CODE_TEMPLATE).toContain("/guide");
			expect(CLAUDE_CODE_TEMPLATE).not.toContain("Skill Categories");
			expect(CLAUDE_CODE_TEMPLATE).not.toContain("Suggestion Rules");
		});

		test("ambient block matches the distributable registry rendering", async () => {
			const { entries } = await collectScopedCatalogRegistry(
				PROJECT_ROOT,
				"distributable",
			);
			const expectedBlock = renderInitSkillAwarenessBlock(entries);

			expect(CLAUDE_CODE_TEMPLATE).toContain(expectedBlock);
			expect(AGENTS_TEMPLATE).toContain(expectedBlock);
		});

		test("slim block includes condensed suggestion rules", () => {
			expect(CLAUDE_CODE_TEMPLATE).toContain(
				"Suggest at most 1 skill per turn",
			);
			expect(CLAUDE_CODE_TEMPLATE).toContain(
				"declined this session or a workflow is already running",
			);
			expect(CLAUDE_CODE_TEMPLATE).toContain(
				"clear match to the user's current activity",
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

		test("contains slim skill awareness block", () => {
			expect(AGENTS_TEMPLATE).toContain("rp1 Skill Awareness");
			expect(AGENTS_TEMPLATE).toContain("Installed plugins: rp1-");
			expect(AGENTS_TEMPLATE).toContain("/guide");
			expect(AGENTS_TEMPLATE).not.toContain("Skill Categories");
			expect(AGENTS_TEMPLATE).not.toContain("Suggestion Rules");
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

		test("does not contain skill awareness block", () => {
			expect(CODEX_TEMPLATE).not.toContain("rp1 Skill Awareness");
			expect(CODEX_TEMPLATE).not.toContain("Installed plugins: rp1-");
			expect(CODEX_TEMPLATE).not.toContain("Skill Categories");
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

		test("codex template shares KB section but not skill awareness block", () => {
			expect(CODEX_TEMPLATE).toContain("rp1 Knowledge Base");
			expect(CODEX_TEMPLATE).toContain("Loading rules");
			expect(CODEX_TEMPLATE).not.toContain("rp1 Skill Awareness");
			expect(CODEX_TEMPLATE).not.toContain("Installed plugins: rp1-");
		});
	});

	describe("template resolution", () => {
		test("defaults to the Claude template when no tool is detected", () => {
			expect(getPrimaryInstructionTemplateTarget(null)).toEqual({
				file: "CLAUDE.md",
				template: CLAUDE_CODE_TEMPLATE,
			});
		});

		test("uses the Codex template for Codex AGENTS.md files", () => {
			const codex = createDetectedTool("codex", "AGENTS.md");

			expect(getPrimaryInstructionTemplateTarget(codex)).toEqual({
				file: "AGENTS.md",
				template: CODEX_TEMPLATE,
			});
			expect(
				resolveInstructionTemplate("AGENTS.md", { detectedTool: codex }),
			).toBe(CODEX_TEMPLATE);
		});

		test("uses the generic AGENTS template for OpenCode AGENTS.md files", () => {
			const opencode = createDetectedTool("opencode", "AGENTS.md");

			expect(
				resolveInstructionTemplate("AGENTS.md", { detectedTool: opencode }),
			).toBe(AGENTS_TEMPLATE);
		});

		test("preserves Codex AGENTS.md flavor when refreshing existing content", () => {
			const existingContent = `# Project\n\n<!-- rp1:start:v0.1.0 -->\n## Codex agent conventions\n<!-- rp1:end:v0.1.0 -->`;

			expect(resolveInstructionTemplate("AGENTS.md", { existingContent })).toBe(
				CODEX_TEMPLATE,
			);
		});
	});
});
