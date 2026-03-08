/**
 * Unit tests for the Codex artifact generators.
 * Tests TOML output, openai.yaml, skill directory, and manifest generation.
 */

import { describe, expect, test } from "bun:test";
import { parse as parseToml } from "smol-toml";
import {
	generateAgentToml,
	generateCodexManifest,
	generateCodexSkillDir,
	generateOpenaiYaml,
} from "../../../build/codex/generator.js";
import type { CodexAgent, CodexSkill } from "../../../build/codex/models.js";
import { expectRight } from "../../helpers/index.js";

const createTestCodexSkill = (overrides?: Partial<CodexSkill>): CodexSkill => ({
	name: "test-skill",
	description: "A test skill for unit testing purposes",
	content: "Test skill content here.",
	supportingFiles: [],
	...overrides,
});

const createTestCodexAgent = (overrides?: Partial<CodexAgent>): CodexAgent => ({
	name: "test-agent",
	description: "A test agent for testing",
	model: "inherit",
	roleType: "default",
	developerInstructions: "You are a test agent.",
	tools: ["functions.exec_command"],
	...overrides,
});

describe("generateCodexSkillDir", () => {
	test("produces valid YAML frontmatter structure", () => {
		const skill = createTestCodexSkill();
		const result = expectRight(generateCodexSkillDir(skill));

		expect(result.skillMdContent).toMatch(/^---\n/);
		expect(result.skillMdContent).toMatch(/\n---\n/);
		expect(result.skillMdContent).toContain("name: test-skill");
	});

	test("includes description in frontmatter", () => {
		const skill = createTestCodexSkill();
		const result = expectRight(generateCodexSkillDir(skill));

		expect(result.skillMdContent).toContain(
			"description: A test skill for unit testing purposes",
		);
	});

	test("includes allowed-tools when present", () => {
		const skill = createTestCodexSkill({
			allowedTools: "functions.exec_command, functions.apply_patch",
		});
		const result = expectRight(generateCodexSkillDir(skill));

		expect(result.skillMdContent).toContain("allowed-tools:");
		expect(result.skillMdContent).toContain("functions.exec_command");
	});

	test("omits allowed-tools when undefined", () => {
		const skill = createTestCodexSkill({ allowedTools: undefined });
		const result = expectRight(generateCodexSkillDir(skill));

		expect(result.skillMdContent).not.toContain("allowed-tools:");
	});

	test("includes metadata map when present", () => {
		const skill = createTestCodexSkill({
			metadata: {
				version: "1.0.0",
				tags: ["workflow", "build"] as readonly string[],
				created: "2026-01-01",
				author: "cloud-on-prem/rp1",
				argumentHint: "<feature-id>",
			},
		});
		const result = expectRight(generateCodexSkillDir(skill));

		expect(result.skillMdContent).toContain("metadata:");
		expect(result.skillMdContent).toContain("  version: 1.0.0");
		expect(result.skillMdContent).toContain("  tags:");
		expect(result.skillMdContent).toContain("    - workflow");
		expect(result.skillMdContent).toContain("    - build");
		expect(result.skillMdContent).toContain("  created: 2026-01-01");
		expect(result.skillMdContent).toContain("  author: cloud-on-prem/rp1");
		expect(result.skillMdContent).toContain('  argument-hint: "<feature-id>"');
	});

	test("includes content after frontmatter", () => {
		const skill = createTestCodexSkill({
			content: "This is the main skill content.",
		});
		const result = expectRight(generateCodexSkillDir(skill));

		expect(result.skillMdContent).toContain("This is the main skill content.");
	});

	test("returns skill directory name matching skill name", () => {
		const skill = createTestCodexSkill({ name: "my-skill" });
		const result = expectRight(generateCodexSkillDir(skill));

		expect(result.skillDir).toBe("my-skill");
	});

	test("returns supporting files list", () => {
		const skill = createTestCodexSkill({
			supportingFiles: ["template.md", "config.yaml"],
		});
		const result = expectRight(generateCodexSkillDir(skill));

		expect(result.supportingFiles).toEqual(["template.md", "config.yaml"]);
	});

	test("escapes special YAML characters in description", () => {
		const skill = createTestCodexSkill({
			description: "Skill with [brackets] and: colons here",
		});
		const result = expectRight(generateCodexSkillDir(skill));

		expect(result.skillMdContent).toContain(
			'"Skill with [brackets] and: colons here"',
		);
	});
});

describe("generateOpenaiYaml", () => {
	test("produces display_name and allow_implicit_invocation", () => {
		const content = expectRight(generateOpenaiYaml("rp1-build"));

		expect(content).toContain("display_name: rp1-build");
		expect(content).toContain("allow_implicit_invocation: false");
	});

	test("escapes special characters in skill name", () => {
		const content = expectRight(
			generateOpenaiYaml("rp1-build: special [name]"),
		);

		expect(content).toContain("display_name:");
		expect(content).toContain("allow_implicit_invocation: false");
	});
});

describe("generateAgentToml", () => {
	test("produces valid TOML with [agents.<name>] sections", () => {
		const agents: CodexAgent[] = [
			createTestCodexAgent({ name: "my-agent", roleType: "worker" }),
		];

		const tomlContent = expectRight(generateAgentToml(agents));
		const parsed = parseToml(tomlContent) as Record<string, unknown>;

		expect(parsed).toHaveProperty("agents");
		const agentsTable = parsed.agents as Record<string, unknown>;
		expect(agentsTable).toHaveProperty("my-agent");
	});

	test("includes model, role, and developer_instructions", () => {
		const agents: CodexAgent[] = [
			createTestCodexAgent({
				name: "task-builder",
				model: "inherit",
				roleType: "worker",
				developerInstructions: "Build tasks carefully.",
			}),
		];

		const tomlContent = expectRight(generateAgentToml(agents));
		const parsed = parseToml(tomlContent) as Record<string, unknown>;
		const agentSection = (parsed.agents as Record<string, unknown>)[
			"task-builder"
		] as Record<string, unknown>;

		expect(agentSection.model).toBe("inherit");
		expect(agentSection.role).toBe("worker");
		expect(agentSection.developer_instructions).toBe("Build tasks carefully.");
	});

	test("handles multiline developer_instructions", () => {
		const instructions = [
			"# Task Builder Agent",
			"",
			"You are an expert developer.",
			"",
			"## Rules",
			"",
			"1. Follow patterns",
			'2. Use `code blocks` and "quotes"',
		].join("\n");

		const agents: CodexAgent[] = [
			createTestCodexAgent({
				name: "task-builder",
				developerInstructions: instructions,
			}),
		];

		const tomlContent = expectRight(generateAgentToml(agents));
		const parsed = parseToml(tomlContent) as Record<string, unknown>;
		const agentSection = (parsed.agents as Record<string, unknown>)[
			"task-builder"
		] as Record<string, unknown>;

		expect(agentSection.developer_instructions).toBe(instructions);
	});

	test("generates multiple agent sections", () => {
		const agents: CodexAgent[] = [
			createTestCodexAgent({ name: "builder", roleType: "worker" }),
			createTestCodexAgent({ name: "reviewer", roleType: "reviewer" }),
			createTestCodexAgent({ name: "analyzer", roleType: "explorer" }),
		];

		const tomlContent = expectRight(generateAgentToml(agents));
		const parsed = parseToml(tomlContent) as Record<string, unknown>;
		const agentsTable = parsed.agents as Record<string, unknown>;

		expect(Object.keys(agentsTable)).toHaveLength(3);
		expect(agentsTable).toHaveProperty("builder");
		expect(agentsTable).toHaveProperty("reviewer");
		expect(agentsTable).toHaveProperty("analyzer");
	});
});

describe("generateCodexManifest", () => {
	test("produces valid JSON with required fields", () => {
		const content = expectRight(
			generateCodexManifest(
				"rp1-base",
				"1.0.0",
				["skill-a", "skill-b"],
				["agent-x", "agent-y"],
			),
		);

		const manifest = JSON.parse(content);
		expect(manifest.plugin).toBe("rp1-base");
		expect(manifest.version).toBe("1.0.0");
		expect(manifest.codexVersionTested).toBe("0.1.x");
	});

	test("includes artifact lists", () => {
		const content = expectRight(
			generateCodexManifest(
				"rp1-dev",
				"2.0.0",
				["build", "review"],
				["builder", "reviewer"],
			),
		);

		const manifest = JSON.parse(content);
		expect(manifest.artifacts.skills).toEqual(["build", "review"]);
		expect(manifest.artifacts.agents).toEqual(["builder", "reviewer"]);
	});

	test("includes installation paths", () => {
		const content = expectRight(
			generateCodexManifest("rp1-base", "1.0.0", [], []),
		);

		const manifest = JSON.parse(content);
		expect(manifest.installation.skillsDir).toBe(".agents/skills/");
		expect(manifest.installation.configFile).toBe("codex.toml");
	});

	test("includes generatedAt timestamp", () => {
		const content = expectRight(
			generateCodexManifest("rp1-base", "1.0.0", [], []),
		);

		const manifest = JSON.parse(content);
		expect(manifest.generatedAt).toBeDefined();
		expect(new Date(manifest.generatedAt).getTime()).not.toBeNaN();
	});
});
