/**
 * Unit tests for the build tool registry module.
 * Tests rp1's platform mapping logic.
 */

import { describe, expect, test } from "bun:test";
import {
	defaultRegistry,
	getDirectoryMapping,
	getToolMapping,
} from "../../build/registry.js";

describe("registry", () => {
	describe("getToolMapping", () => {
		test("returns mapped tool name for known tools", () => {
			expect(getToolMapping(defaultRegistry, "Read")).toBe("read_file");
			expect(getToolMapping(defaultRegistry, "Write")).toBe("write_file");
			expect(getToolMapping(defaultRegistry, "Bash")).toBe("bash_run");
			expect(getToolMapping(defaultRegistry, "Grep")).toBe("grep_file");
			expect(getToolMapping(defaultRegistry, "Glob")).toBe("glob_pattern");
		});

		test("returns null for Claude Code specific tools", () => {
			expect(getToolMapping(defaultRegistry, "ExitPlanMode")).toBeNull();
			expect(getToolMapping(defaultRegistry, "EnterPlanMode")).toBeNull();
		});

		test("returns original tool name for unknown tools", () => {
			expect(getToolMapping(defaultRegistry, "UnknownTool")).toBe(
				"UnknownTool",
			);
			expect(getToolMapping(defaultRegistry, "SomeCustomTool")).toBe(
				"SomeCustomTool",
			);
		});
	});

	describe("getDirectoryMapping", () => {
		test("maps 'agents' to 'agent'", () => {
			expect(getDirectoryMapping(defaultRegistry, "agents")).toBe("agent");
		});

		test("maps 'commands' to 'command'", () => {
			expect(getDirectoryMapping(defaultRegistry, "commands")).toBe("command");
		});

		test("returns original for unmapped directories", () => {
			expect(getDirectoryMapping(defaultRegistry, "skills")).toBe("skills");
			expect(getDirectoryMapping(defaultRegistry, "unknown")).toBe("unknown");
		});
	});

	describe("defaultRegistry completeness", () => {
		test("contains all expected tool mappings", () => {
			const expectedTools = [
				"Read",
				"Write",
				"Edit",
				"Bash",
				"Grep",
				"Glob",
				"NotebookEdit",
				"BashOutput",
				"KillShell",
				"Task",
				"SlashCommand",
				"Skill",
				"WebFetch",
				"WebSearch",
				"AskUserQuestion",
				"TodoWrite",
				"ExitPlanMode",
				"EnterPlanMode",
			];

			for (const tool of expectedTools) {
				expect(defaultRegistry.toolMappings).toHaveProperty(tool);
			}
		});

		test("contains directory mappings", () => {
			expect(defaultRegistry.directoryMappings).toHaveProperty("agents");
			expect(defaultRegistry.directoryMappings).toHaveProperty("commands");
		});

		test("contains metadata mappings", () => {
			expect(defaultRegistry.metadataMappings).toHaveProperty("name");
			expect(defaultRegistry.metadataMappings).toHaveProperty("description");
			expect(defaultRegistry.metadataMappings).toHaveProperty("version");
		});
	});
});
