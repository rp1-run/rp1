/**
 * Unit tests for the Codex artifact generators.
 * Tests TOML output, openai.yaml, skill directory, and manifest generation.
 */

import { describe, expect, test } from "bun:test";
import {
	generateAgentConfigEntries,
	generateCodexAgentsMd,
	generateCodexManifest,
	generateCodexSkillDir,
	generateOpenaiYaml,
	generatePerAgentToml,
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

describe("generateAgentConfigEntries", () => {
	test("produces [agents.<name>] sections with description and config_file only", () => {
		const agents: CodexAgent[] = [
			createTestCodexAgent({ name: "my-agent", description: "My agent desc" }),
		];

		const content = expectRight(generateAgentConfigEntries(agents));

		expect(content).toContain("[agents.my-agent]");
		expect(content).toContain('description = "My agent desc"');
		expect(content).toContain('config_file = "./agents/rp1/my-agent.toml"');
	});

	test("does not include role, tools, or developer_instructions in config entries", () => {
		const agents: CodexAgent[] = [
			createTestCodexAgent({
				name: "task-builder",
				roleType: "worker",
				developerInstructions: "Build tasks carefully.",
			}),
		];

		const content = expectRight(generateAgentConfigEntries(agents));

		expect(content).not.toContain("role");
		expect(content).not.toContain("tools");
		expect(content).not.toContain("developer_instructions");
	});

	test("generates multiple agent sections separated by blank lines", () => {
		const agents: CodexAgent[] = [
			createTestCodexAgent({ name: "builder", roleType: "worker" }),
			createTestCodexAgent({ name: "reviewer", roleType: "reviewer" }),
			createTestCodexAgent({ name: "analyzer", roleType: "explorer" }),
		];

		const content = expectRight(generateAgentConfigEntries(agents));

		expect(content).toContain("[agents.builder]");
		expect(content).toContain("[agents.reviewer]");
		expect(content).toContain("[agents.analyzer]");
		expect(content).toContain('config_file = "./agents/rp1/builder.toml"');
		expect(content).toContain('config_file = "./agents/rp1/reviewer.toml"');
		expect(content).toContain('config_file = "./agents/rp1/analyzer.toml"');
	});

	test("escapes special characters in description", () => {
		const agents: CodexAgent[] = [
			createTestCodexAgent({
				name: "test-agent",
				description: 'Agent with "quotes" and \\backslash',
			}),
		];

		const content = expectRight(generateAgentConfigEntries(agents));

		expect(content).toContain(
			'description = "Agent with \\"quotes\\" and \\\\backslash"',
		);
	});
});

describe("generatePerAgentToml", () => {
	test("produces multiline developer_instructions without model field", () => {
		const agent = createTestCodexAgent({
			name: "task-builder",
			model: "inherit",
			developerInstructions: "You are a test agent.",
		});

		const result = expectRight(generatePerAgentToml(agent));

		expect(result.filename).toBe("task-builder.toml");
		expect(result.content).not.toContain("model =");
		expect(result.content).toContain('developer_instructions = """');
		expect(result.content).toContain("You are a test agent.");
		expect(result.content).toContain('"""');
	});

	test("does not include role or tools in per-agent file", () => {
		const agent = createTestCodexAgent({
			name: "task-builder",
			roleType: "worker",
		});

		const result = expectRight(generatePerAgentToml(agent));

		expect(result.content).not.toContain("role");
		expect(result.content).not.toContain("tools");
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

		const agent = createTestCodexAgent({
			name: "task-builder",
			developerInstructions: instructions,
		});

		const result = expectRight(generatePerAgentToml(agent));

		expect(result.content).toContain(instructions);
		expect(result.content).toMatch(/developer_instructions = """\n/);
		expect(result.content).toMatch(/\n"""\n$/);
	});

	test("returns correct filename based on agent name", () => {
		const agent = createTestCodexAgent({ name: "code-checker" });

		const result = expectRight(generatePerAgentToml(agent));

		expect(result.filename).toBe("code-checker.toml");
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
		expect(manifest.installation.configFile).toBe("~/.codex/config.toml");
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

describe("generateCodexAgentsMd", () => {
	test("produces markdown table with agent details", () => {
		const agents: CodexAgent[] = [
			createTestCodexAgent({
				name: "task-builder",
				description: "Builds tasks from feature list",
				roleType: "worker",
			}),
			createTestCodexAgent({
				name: "task-reviewer",
				description: "Reviews completed tasks",
				roleType: "reviewer",
			}),
		];

		const content = expectRight(generateCodexAgentsMd("dev", agents));

		expect(content).toContain("# rp1-dev Agents");
		expect(content).toContain("| Agent | Role | Description |");
		expect(content).toContain(
			"| task-builder | worker | Builds tasks from feature list |",
		);
		expect(content).toContain(
			"| task-reviewer | reviewer | Reviews completed tasks |",
		);
	});

	test("produces valid markdown table header", () => {
		const agents: CodexAgent[] = [
			createTestCodexAgent({ name: "agent-a", roleType: "default" }),
		];

		const content = expectRight(generateCodexAgentsMd("base", agents));

		expect(content).toContain("|-------|------|-------------|");
	});

	test("uses plugin name in heading", () => {
		const content = expectRight(generateCodexAgentsMd("utils", []));

		expect(content).toContain("# rp1-utils Agents");
	});
});
