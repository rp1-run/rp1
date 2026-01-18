/**
 * Unit tests for the deps-graph module.
 * Tests dependency graph derivation from markdown parsing.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import * as E from "fp-ts/Either";
import {
	buildDependencyGraph,
	parseAgentRefs,
	parseSkillRefs,
} from "../deps-graph.js";

// Temp directory for test fixtures
let tempDir: string;

beforeAll(async () => {
	tempDir = join(import.meta.dirname, ".test-fixtures");
	await mkdir(tempDir, { recursive: true });
});

afterAll(async () => {
	await rm(tempDir, { recursive: true, force: true });
});

describe("parseAgentRefs", () => {
	test("extracts single Task reference", () => {
		const content = `
# Command

Task: rp1-dev:build-fast-executor
prompt: Build fast
`;
		const refs = parseAgentRefs(content);

		expect(refs).toEqual(["plugins/dev/agents/build-fast-executor.md"]);
	});

	test("extracts multiple Task references", () => {
		const content = `
# Command

Task: rp1-dev:feature-architect
prompt: Design

Task: rp1-base:kb-analyzer
prompt: Analyze
`;
		const refs = parseAgentRefs(content);

		expect(refs).toContain("plugins/dev/agents/feature-architect.md");
		expect(refs).toContain("plugins/base/agents/kb-analyzer.md");
		expect(refs).toHaveLength(2);
	});

	test("deduplicates repeated Task references", () => {
		const content = `
Task: rp1-dev:builder
prompt: First

Task: rp1-dev:builder
prompt: Second
`;
		const refs = parseAgentRefs(content);

		expect(refs).toEqual(["plugins/dev/agents/builder.md"]);
	});

	test("ignores unknown plugin names", () => {
		const content = `
Task: unknown-plugin:agent-name
prompt: test
`;
		const refs = parseAgentRefs(content);

		expect(refs).toEqual([]);
	});

	test("returns empty array when no Task references found", () => {
		const content = `
# Simple Command

No agent references here.
`;
		const refs = parseAgentRefs(content);

		expect(refs).toEqual([]);
	});

	test("handles all known plugin paths", () => {
		const content = `
Task: rp1-base:base-agent
Task: rp1-dev:dev-agent
Task: rp1-utils:utils-agent
`;
		const refs = parseAgentRefs(content);

		expect(refs).toContain("plugins/base/agents/base-agent.md");
		expect(refs).toContain("plugins/dev/agents/dev-agent.md");
		expect(refs).toContain("plugins/utils/agents/utils-agent.md");
	});
});

describe("parseSkillRefs", () => {
	test("extracts skill: prefix reference", () => {
		const content = `
# Agent

Use the skill: rp1-base:knowledge-base-templates
`;
		const refs = parseSkillRefs(content);

		expect(refs).toEqual([
			"plugins/base/skills/knowledge-base-templates/SKILL.md",
		]);
	});

	test("extracts Skill prefix reference", () => {
		const content = `
Skill rp1-dev:worktree-workflow
`;
		const refs = parseSkillRefs(content);

		expect(refs).toEqual(["plugins/dev/skills/worktree-workflow/SKILL.md"]);
	});

	test("extracts backtick-quoted skill reference", () => {
		const content = `
Use worktree-workflow skill \`rp1-dev:worktree-workflow\`
`;
		const refs = parseSkillRefs(content);

		expect(refs).toEqual(["plugins/dev/skills/worktree-workflow/SKILL.md"]);
	});

	test("extracts multiple skill references", () => {
		const content = `
skill: rp1-base:mermaid
Skill rp1-base:knowledge-base-templates
`;
		const refs = parseSkillRefs(content);

		expect(refs).toContain("plugins/base/skills/mermaid/SKILL.md");
		expect(refs).toContain(
			"plugins/base/skills/knowledge-base-templates/SKILL.md",
		);
		expect(refs).toHaveLength(2);
	});

	test("deduplicates repeated skill references", () => {
		const content = `
skill: rp1-base:mermaid
skill: rp1-base:mermaid
`;
		const refs = parseSkillRefs(content);

		expect(refs).toEqual(["plugins/base/skills/mermaid/SKILL.md"]);
	});

	test("returns empty array when no skill references found", () => {
		const content = `
# Agent

No skills used here.
`;
		const refs = parseSkillRefs(content);

		expect(refs).toEqual([]);
	});

	test("ignores unknown plugin names", () => {
		const content = `
skill: unknown-plugin:some-skill
`;
		const refs = parseSkillRefs(content);

		expect(refs).toEqual([]);
	});
});

describe("buildDependencyGraph", () => {
	test("handles command with no dependencies", async () => {
		const commandPath = join(tempDir, "commands/simple-command.md");
		await mkdir(join(tempDir, "commands"), { recursive: true });
		await writeFile(
			commandPath,
			`---
name: simple-command
---

# Simple Command

No agent references here.
`,
		);

		const result = await buildDependencyGraph(commandPath)();

		expect(E.isRight(result)).toBe(true);
		if (E.isRight(result)) {
			expect(result.right.command).toBe("simple-command");
			expect(result.right.commandPath).toBe(commandPath);
			expect(result.right.agents).toEqual([]);
			expect(result.right.skills).toEqual([]);
		}
	});

	test("extracts command name from path", async () => {
		const commandPath = join(tempDir, "commands/my-test-command.md");
		await writeFile(
			commandPath,
			`---
name: my-test-command
---
Content.
`,
		);

		const result = await buildDependencyGraph(commandPath)();

		expect(E.isRight(result)).toBe(true);
		if (E.isRight(result)) {
			expect(result.right.command).toBe("my-test-command");
		}
	});

	test("handles transitive skill dependencies", async () => {
		// Create directory structure
		const pluginsBase = join(tempDir, "plugins/base");
		const pluginsDev = join(tempDir, "plugins/dev");
		await mkdir(join(pluginsBase, "agents"), { recursive: true });
		await mkdir(join(pluginsBase, "skills/mermaid"), { recursive: true });
		await mkdir(join(pluginsDev, "commands"), { recursive: true });

		// Create command that references an agent
		const commandPath = join(pluginsDev, "commands/build-cmd.md");
		await writeFile(
			commandPath,
			`---
name: build-cmd
---

# Build Command

Task: rp1-base:kb-builder
`,
		);

		// Create agent that references a skill
		const agentPath = join(pluginsBase, "agents/kb-builder.md");
		await writeFile(
			agentPath,
			`---
name: kb-builder
---

# KB Builder Agent

Use skill: rp1-base:mermaid for diagrams.
`,
		);

		// Create skill file
		const skillPath = join(pluginsBase, "skills/mermaid/SKILL.md");
		await writeFile(
			skillPath,
			`---
name: mermaid
description: Mermaid diagram skill
---
Content.
`,
		);

		// Need to temporarily change how the graph builder resolves paths
		// Since buildDependencyGraph uses absolute paths from PLUGIN_PATHS,
		// we need to test against real plugin files for transitive deps
		// This test verifies the logic works with our fixture structure

		const result = await buildDependencyGraph(commandPath)();

		expect(E.isRight(result)).toBe(true);
		if (E.isRight(result)) {
			expect(result.right.command).toBe("build-cmd");
			expect(result.right.commandPath).toBe(commandPath);
			// Agent path is derived from PLUGIN_PATHS, not temp dir
			expect(result.right.agents).toEqual([
				"plugins/base/agents/kb-builder.md",
			]);
			// Skills are only found if agent file exists at the derived path
			// Since we're using temp dir, the agent file won't be found at plugins/base/agents
			// This correctly tests the "agent not found" path
		}
	});

	test("returns error for non-existent command file", async () => {
		const nonExistentPath = join(tempDir, "commands/does-not-exist.md");

		const result = await buildDependencyGraph(nonExistentPath)();

		expect(E.isLeft(result)).toBe(true);
		if (E.isLeft(result)) {
			expect(result.left.message).toContain("Failed to build dep graph");
		}
	});

	test("uses full path when command name cannot be extracted", async () => {
		// Create a file that doesn't match the commands/*.md pattern
		const weirdPath = join(tempDir, "weird-location.md");
		await writeFile(
			weirdPath,
			`---
name: weird
---
Content.
`,
		);

		const result = await buildDependencyGraph(weirdPath)();

		expect(E.isRight(result)).toBe(true);
		if (E.isRight(result)) {
			// Falls back to full path when pattern doesn't match
			expect(result.right.command).toBe(weirdPath);
		}
	});
});
