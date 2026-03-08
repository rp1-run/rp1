/**
 * Unit tests for the Codex platform registry.
 * Tests tool mappings, null filtering, and unknown tool passthrough.
 */

import { describe, expect, test } from "bun:test";
import { codexRegistry } from "../../../build/codex/registry.js";

describe("codexRegistry", () => {
	describe("toolMappings", () => {
		test("maps confirmed Codex tools to their equivalents", () => {
			expect(codexRegistry.toolMappings.Bash).toBe("functions.exec_command");
			expect(codexRegistry.toolMappings.Edit).toBe("functions.apply_patch");
			expect(codexRegistry.toolMappings.AskUserQuestion).toBe(
				"functions.request_user_input",
			);
		});

		test("maps file operation tools to null", () => {
			expect(codexRegistry.toolMappings.Read).toBeNull();
			expect(codexRegistry.toolMappings.Write).toBeNull();
			expect(codexRegistry.toolMappings.Grep).toBeNull();
			expect(codexRegistry.toolMappings.Glob).toBeNull();
		});

		test("maps Claude Code-only tools to null", () => {
			expect(codexRegistry.toolMappings.ExitPlanMode).toBeNull();
			expect(codexRegistry.toolMappings.EnterPlanMode).toBeNull();
			expect(codexRegistry.toolMappings.NotebookEdit).toBeNull();
			expect(codexRegistry.toolMappings.BashOutput).toBeNull();
			expect(codexRegistry.toolMappings.KillShell).toBeNull();
			expect(codexRegistry.toolMappings.WebFetch).toBeNull();
			expect(codexRegistry.toolMappings.WebSearch).toBeNull();
			expect(codexRegistry.toolMappings.TodoWrite).toBeNull();
		});

		test("maps agent coordination tools to null", () => {
			expect(codexRegistry.toolMappings.Task).toBeNull();
			expect(codexRegistry.toolMappings.SlashCommand).toBeNull();
			expect(codexRegistry.toolMappings.Skill).toBeNull();
		});

		test("returns undefined for unknown tools (passthrough)", () => {
			expect(codexRegistry.toolMappings.SomeUnknownTool).toBeUndefined();
		});
	});

	describe("completeness", () => {
		test("contains all expected tool mappings", () => {
			const expectedTools = [
				"Bash",
				"Edit",
				"AskUserQuestion",
				"Read",
				"Write",
				"Grep",
				"Glob",
				"NotebookEdit",
				"BashOutput",
				"KillShell",
				"WebFetch",
				"WebSearch",
				"TodoWrite",
				"Task",
				"SlashCommand",
				"Skill",
				"ExitPlanMode",
				"EnterPlanMode",
			];

			for (const tool of expectedTools) {
				expect(codexRegistry.toolMappings).toHaveProperty(tool);
			}
		});

		test("contains directory mappings", () => {
			expect(codexRegistry.directoryMappings).toHaveProperty("agents");
			expect(codexRegistry.directoryMappings.agents).toBe("agents");
		});

		test("contains metadata mappings", () => {
			expect(codexRegistry.metadataMappings).toHaveProperty("name");
			expect(codexRegistry.metadataMappings).toHaveProperty("description");
			expect(codexRegistry.metadataMappings).toHaveProperty("version");
			expect(codexRegistry.metadataMappings).toHaveProperty("tags");
			expect(codexRegistry.metadataMappings).toHaveProperty("created");
			expect(codexRegistry.metadataMappings).toHaveProperty("author");
			expect(codexRegistry.metadataMappings).toHaveProperty("argument-hint");
		});
	});
});
