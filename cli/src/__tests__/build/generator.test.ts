/**
 * Unit tests for the build tool generator module.
 * Tests rp1's artifact generation logic.
 */

import { describe, expect, test } from "bun:test";
import * as E from "fp-ts/lib/Either.js";
import {
	generateAgentFile,
	generateCommandFile,
	generateManifest,
	generateSkillFile,
} from "../../build/generator.js";
import type {
	OpenCodeAgent,
	OpenCodeCommand,
	OpenCodeSkill,
} from "../../build/models.js";
import {
	validateAgentSyntax,
	validateCommandSyntax,
	validateSkillSyntax,
} from "../../build/validator.js";
import { expectRight } from "../helpers/index.js";

describe("generator", () => {
	describe("generateCommandFile", () => {
		test("produces valid YAML frontmatter + body structure", () => {
			const cmd: OpenCodeCommand = {
				template: "Command content here.",
				description: "A test command",
				subtask: false,
			};

			const { filename, content } = expectRight(
				generateCommandFile(cmd, "test-cmd"),
			);

			expect(filename).toBe("test-cmd.md");
			expect(content).toMatch(/^---\n/);
			expect(content).toMatch(/\n---\n/);
			expect(content).toContain("description: A test command");
			expect(content).toContain("Command content here.");

			const validationResult = validateCommandSyntax(content, filename);
			expect(E.isRight(validationResult)).toBe(true);
		});

		test("properly escapes special YAML characters in description", () => {
			const cmd: OpenCodeCommand = {
				template: "Content",
				description: "Test with [brackets] and: colons",
				subtask: false,
			};

			const { content } = expectRight(generateCommandFile(cmd, "escape-test"));

			expect(content).toContain('"Test with [brackets] and: colons"');

			const validationResult = validateCommandSyntax(content, "escape-test.md");
			expect(E.isRight(validationResult)).toBe(true);
		});

		test("includes argument-hint when present", () => {
			const cmd: OpenCodeCommand = {
				template: "Content",
				description: "Test command",
				argumentHint: "[arg1] [arg2]",
				subtask: false,
			};

			const { content } = expectRight(generateCommandFile(cmd, "hint-test"));

			expect(content).toContain('argument-hint: "[arg1] [arg2]"');
		});

		test("includes model when specified", () => {
			const cmd: OpenCodeCommand = {
				template: "Content",
				description: "Test command",
				model: "sonnet",
				subtask: false,
			};

			const { content } = expectRight(generateCommandFile(cmd, "model-test"));

			expect(content).toContain("model: sonnet");
		});
	});

	describe("generateAgentFile", () => {
		test("includes tools dict with boolean values", () => {
			const agent: OpenCodeAgent = {
				name: "test-agent",
				description: "Test agent",
				mode: "subagent",
				model: "sonnet",
				tools: ["bash_run", "write_file", "edit_file"],
				permissions: {},
				content: "Agent content.",
			};

			const { content } = expectRight(generateAgentFile(agent));

			expect(content).toContain("tools:");
			expect(content).toContain("bash: true");
			expect(content).toContain("write: true");
			expect(content).toContain("edit: true");
		});

		test("omits model field when value is 'inherit'", () => {
			const agent: OpenCodeAgent = {
				name: "inherit-agent",
				description: "Agent with inherited model",
				mode: "subagent",
				model: "inherit",
				tools: ["read_file"],
				permissions: {},
				content: "Content.",
			};

			const { content } = expectRight(generateAgentFile(agent));

			expect(content).not.toContain("model:");
		});

		test("includes model field when not 'inherit'", () => {
			const agent: OpenCodeAgent = {
				name: "model-agent",
				description: "Agent with specific model",
				mode: "subagent",
				model: "opus",
				tools: ["read_file"],
				permissions: {},
				content: "Content.",
			};

			const { content } = expectRight(generateAgentFile(agent));

			expect(content).toContain("model: opus");
		});

		test("produces valid YAML structure", () => {
			const agent: OpenCodeAgent = {
				name: "valid-agent",
				description: "A valid test agent",
				mode: "subagent",
				model: "sonnet",
				tools: ["bash_run"],
				permissions: {},
				content: "Agent content here.",
			};

			const { filename, content } = expectRight(generateAgentFile(agent));

			expect(filename).toBe("valid-agent.md");

			const validationResult = validateAgentSyntax(content, filename);
			expect(E.isRight(validationResult)).toBe(true);
		});
	});

	describe("generateSkillFile", () => {
		test("returns skill directory name and SKILL.md content", () => {
			const skill: OpenCodeSkill = {
				name: "my-skill",
				description: "A test skill with enough chars",
				content: "Skill content here.",
				supportingFiles: [],
			};

			const result = expectRight(generateSkillFile(skill));

			expect(result.skillDir).toBe("my-skill");
			expect(result.skillMdContent).toContain("name: my-skill");
			expect(result.skillMdContent).toContain("Skill content here.");
		});

		test("produces valid skill YAML structure", () => {
			const skill: OpenCodeSkill = {
				name: "valid-skill",
				description: "A valid skill description of at least 20 chars",
				content: "Content.",
				supportingFiles: ["templates/foo.md"],
			};

			const result = expectRight(generateSkillFile(skill));

			const validationResult = validateSkillSyntax(
				result.skillMdContent,
				"SKILL.md",
			);
			expect(E.isRight(validationResult)).toBe(true);
		});

		test("includes supporting files in result", () => {
			const skill: OpenCodeSkill = {
				name: "files-skill",
				description: "Skill with supporting files at least 20",
				content: "Content.",
				supportingFiles: ["templates/a.md", "scripts/b.sh"],
			};

			const result = expectRight(generateSkillFile(skill));

			expect(result.supportingFiles).toEqual([
				"templates/a.md",
				"scripts/b.sh",
			]);
		});
	});

	describe("generateManifest", () => {
		test("produces valid JSON with all required fields", () => {
			const json = expectRight(
				generateManifest(
					"test-plugin",
					"1.0.0",
					["cmd1"],
					["agent1"],
					["skill1"],
				),
			);

			const manifest = JSON.parse(json);

			expect(manifest.plugin).toBe("test-plugin");
			expect(manifest.version).toBe("1.0.0");
			expect(manifest.generatedAt).toBeDefined();
			expect(manifest.opencodeVersionTested).toBe("0.9.x");
			expect(manifest.artifacts.commands).toEqual(["cmd1"]);
			expect(manifest.artifacts.agents).toEqual(["agent1"]);
			expect(manifest.artifacts.skills).toEqual(["skill1"]);
			expect(manifest.installation.commandsDir).toBeDefined();
			expect(manifest.requirements.opencodeVersion).toBe(">=0.8.0");
		});

		test("sets opencodeSkillsRequired based on skills count", () => {
			const withSkills = expectRight(
				generateManifest("p1", "1.0.0", [], [], ["skill1"]),
			);
			expect(JSON.parse(withSkills).requirements.opencodeSkillsRequired).toBe(
				true,
			);

			const noSkills = expectRight(
				generateManifest("p2", "1.0.0", ["cmd1"], [], []),
			);
			expect(JSON.parse(noSkills).requirements.opencodeSkillsRequired).toBe(
				false,
			);
		});
	});
});
