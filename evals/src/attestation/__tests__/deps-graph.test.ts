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
	getDistPluginPath,
	parseAgentRefs,
	parseSkillRefs,
	toPosixPath,
} from "../deps-graph.js";

let tempDir: string;

beforeAll(async () => {
	tempDir = join(import.meta.dirname, ".test-fixtures");
	await mkdir(tempDir, { recursive: true });
});

afterAll(async () => {
	await rm(tempDir, { recursive: true, force: true });
});

describe("getDistPluginPath", () => {
	test("returns correct path for claude-code", () => {
		expect(getDistPluginPath("claude-code", "rp1-dev")).toBe(
			"dist/claude-code/dev",
		);
	});

	test("returns correct path for opencode", () => {
		expect(getDistPluginPath("opencode", "rp1-base")).toBe(
			"dist/opencode/base",
		);
	});

	test("returns correct path for codex", () => {
		expect(getDistPluginPath("codex", "rp1-utils")).toBe("dist/codex/utils");
	});
});

describe("parseAgentRefs", () => {
	test("extracts single Task reference for claude-code", () => {
		const content = `
# Skill

Task: rp1-dev:build-fast-executor
prompt: Build fast
`;
		const refs = parseAgentRefs(content, "claude-code");

		expect(refs).toEqual([
			"dist/claude-code/dev/agents/build-fast-executor.md",
		]);
	});

	test("extracts single Task reference for opencode", () => {
		const content = `
# Skill

Task: rp1-dev:build-fast-executor
prompt: Build fast
`;
		const refs = parseAgentRefs(content, "opencode");

		expect(refs).toEqual(["dist/opencode/dev/agents/build-fast-executor.md"]);
	});

	test("extracts multiple Task references", () => {
		const content = `
# Skill

Task: rp1-dev:feature-architect
prompt: Design

Task: rp1-base:kb-analyzer
prompt: Analyze
`;
		const refs = parseAgentRefs(content, "claude-code");

		expect(refs).toContain("dist/claude-code/dev/agents/feature-architect.md");
		expect(refs).toContain("dist/claude-code/base/agents/kb-analyzer.md");
		expect(refs).toHaveLength(2);
	});

	test("deduplicates repeated Task references", () => {
		const content = `
Task: rp1-dev:builder
prompt: First

Task: rp1-dev:builder
prompt: Second
`;
		const refs = parseAgentRefs(content, "claude-code");

		expect(refs).toEqual(["dist/claude-code/dev/agents/builder.md"]);
	});

	test("extracts subagent_type references", () => {
		const content = `
subagent_type: rp1-dev:task-builder
prompt: Build the feature

subagent_type: rp1-dev:task-reviewer
prompt: Review the build
`;
		const refs = parseAgentRefs(content, "claude-code");

		expect(refs).toContain("dist/claude-code/dev/agents/task-builder.md");
		expect(refs).toContain("dist/claude-code/dev/agents/task-reviewer.md");
		expect(refs).toHaveLength(2);
	});

	test("extracts mixed Task and subagent_type references", () => {
		const content = `
Task: rp1-dev:feature-architect
prompt: Design

subagent_type: rp1-dev:task-builder
prompt: Build
`;
		const refs = parseAgentRefs(content, "claude-code");

		expect(refs).toContain("dist/claude-code/dev/agents/feature-architect.md");
		expect(refs).toContain("dist/claude-code/dev/agents/task-builder.md");
		expect(refs).toHaveLength(2);
	});

	test("ignores unknown plugin names", () => {
		const content = `
Task: unknown-plugin:agent-name
prompt: test
`;
		const refs = parseAgentRefs(content, "claude-code");

		expect(refs).toEqual([]);
	});

	test("returns empty array when no Task references found", () => {
		const content = `
# Simple Skill

No agent references here.
`;
		const refs = parseAgentRefs(content, "claude-code");

		expect(refs).toEqual([]);
	});

	test("handles all known plugin paths", () => {
		const content = `
Task: rp1-base:base-agent
Task: rp1-dev:dev-agent
Task: rp1-utils:utils-agent
`;
		const refs = parseAgentRefs(content, "codex");

		expect(refs).toContain("dist/codex/base/agents/base-agent.md");
		expect(refs).toContain("dist/codex/dev/agents/dev-agent.md");
		expect(refs).toContain("dist/codex/utils/agents/utils-agent.md");
	});
});

describe("parseSkillRefs", () => {
	test("extracts skill reference for claude-code (bare names)", () => {
		const content = `
# Agent

Use the skill: rp1-base:artifact-templates
`;
		const refs = parseSkillRefs(content, "claude-code");

		expect(refs).toEqual([
			"dist/claude-code/base/skills/artifact-templates/SKILL.md",
		]);
	});

	test("extracts skill reference for opencode (rp1-prefixed names)", () => {
		const content = `
# Agent

Use the skill: rp1-base:artifact-templates
`;
		const refs = parseSkillRefs(content, "opencode");

		expect(refs).toEqual([
			"dist/opencode/base/skills/rp1-artifact-templates/SKILL.md",
		]);
	});

	test("extracts Skill prefix reference", () => {
		const content = `
Skill rp1-dev:worktree-workflow
`;
		const refs = parseSkillRefs(content, "claude-code");

		expect(refs).toEqual([
			"dist/claude-code/dev/skills/worktree-workflow/SKILL.md",
		]);
	});

	test("extracts backtick-quoted skill reference", () => {
		const content = `
Use worktree-workflow skill \`rp1-dev:worktree-workflow\`
`;
		const refs = parseSkillRefs(content, "codex");

		expect(refs).toEqual([
			"dist/codex/dev/skills/rp1-worktree-workflow/SKILL.md",
		]);
	});

	test("extracts multiple skill references", () => {
		const content = `
skill: rp1-base:mermaid
Skill rp1-base:artifact-templates
`;
		const refs = parseSkillRefs(content, "claude-code");

		expect(refs).toContain("dist/claude-code/base/skills/mermaid/SKILL.md");
		expect(refs).toContain(
			"dist/claude-code/base/skills/artifact-templates/SKILL.md",
		);
		expect(refs).toHaveLength(2);
	});

	test("deduplicates repeated skill references", () => {
		const content = `
skill: rp1-base:mermaid
skill: rp1-base:mermaid
`;
		const refs = parseSkillRefs(content, "claude-code");

		expect(refs).toEqual(["dist/claude-code/base/skills/mermaid/SKILL.md"]);
	});

	test("returns empty array when no skill references found", () => {
		const content = `
# Agent

No skills used here.
`;
		const refs = parseSkillRefs(content, "claude-code");

		expect(refs).toEqual([]);
	});

	test("ignores unknown plugin names", () => {
		const content = `
skill: unknown-plugin:some-skill
`;
		const refs = parseSkillRefs(content, "claude-code");

		expect(refs).toEqual([]);
	});
});

describe("toPosixPath", () => {
	test("rewrites Windows separators", () => {
		expect(toPosixPath("dist\\claude-code\\dev\\skills\\build\\SKILL.md")).toBe(
			"dist/claude-code/dev/skills/build/SKILL.md",
		);
	});

	test("leaves a posix path untouched", () => {
		expect(toPosixPath("dist/claude-code/dev/agents/task-builder.md")).toBe(
			"dist/claude-code/dev/agents/task-builder.md",
		);
	});
});

describe("buildDependencyGraph", () => {
	test("handles skill with no dependencies", async () => {
		const skillDir = join(tempDir, "skills/simple-skill");
		await mkdir(skillDir, { recursive: true });
		const skillPath = join(skillDir, "SKILL.md");
		await writeFile(
			skillPath,
			`---
name: simple-skill
description: A simple skill
---

# Simple Skill

No agent references here.
`,
		);

		const result = await buildDependencyGraph(skillPath, "claude-code")();

		expect(E.isRight(result)).toBe(true);
		if (E.isRight(result)) {
			expect(result.right.skill).toBe("simple-skill");
			expect(result.right.skillPath).toBe(skillPath);
			expect(result.right.platform).toBe("claude-code");
			expect(result.right.agents).toEqual([]);
			expect(result.right.skills).toEqual([]);
		}
	});

	test("extracts skill name from SKILL.md path", async () => {
		const skillDir = join(tempDir, "skills/my-skill");
		await mkdir(skillDir, { recursive: true });
		const skillPath = join(skillDir, "SKILL.md");
		await writeFile(
			skillPath,
			`---
name: my-skill
description: A test skill
---
Content.
`,
		);

		const result = await buildDependencyGraph(skillPath, "opencode")();

		expect(E.isRight(result)).toBe(true);
		if (E.isRight(result)) {
			expect(result.right.skill).toBe("my-skill");
			expect(result.right.skillPath).toBe(skillPath);
			expect(result.right.platform).toBe("opencode");
		}
	});

	test("handles transitive skill dependencies", async () => {
		const distBase = join(tempDir, "dist/claude-code/base");
		const distDev = join(tempDir, "dist/claude-code/dev");
		await mkdir(join(distBase, "agents"), { recursive: true });
		await mkdir(join(distBase, "skills/mermaid"), { recursive: true });
		await mkdir(join(distDev, "skills/build-cmd"), { recursive: true });

		const skillPath = join(distDev, "skills/build-cmd/SKILL.md");
		await writeFile(
			skillPath,
			`---
name: build-cmd
description: Build skill
---

# Build Skill

Task: rp1-base:kb-builder
`,
		);

		const agentPath = join(distBase, "agents/kb-builder.md");
		await writeFile(
			agentPath,
			`---
name: kb-builder
---

# KB Builder Agent

Use skill: rp1-base:mermaid for diagrams.
`,
		);

		const mermaidPath = join(distBase, "skills/mermaid/SKILL.md");
		await writeFile(
			mermaidPath,
			`---
name: mermaid
description: Mermaid diagram skill
---
Content.
`,
		);

		const result = await buildDependencyGraph(skillPath, "claude-code")();

		expect(E.isRight(result)).toBe(true);
		if (E.isRight(result)) {
			expect(result.right.skill).toBe("build-cmd");
			expect(result.right.skillPath).toBe(skillPath);
			expect(result.right.platform).toBe("claude-code");
			expect(result.right.agents).toEqual([
				"dist/claude-code/base/agents/kb-builder.md",
			]);
		}
	});

	test("returns error for non-existent skill file with build hint", async () => {
		const nonExistentPath = join(tempDir, "skills/does-not-exist/SKILL.md");

		const result = await buildDependencyGraph(nonExistentPath, "claude-code")();

		expect(E.isLeft(result)).toBe(true);
		if (E.isLeft(result)) {
			expect(result.left.message).toContain("Skill file not found");
			expect(result.left.message).toContain("platform has been built");
		}
	});

	test("handles cycles without infinite loop", async () => {
		// Create circular dependency: skill A -> agent B -> skill A
		const distBase = join(tempDir, "dist/claude-code/base");
		await mkdir(join(distBase, "agents"), { recursive: true });
		await mkdir(join(distBase, "skills/cyclic-skill"), { recursive: true });

		const skillPath = join(distBase, "skills/cyclic-skill/SKILL.md");
		await writeFile(
			skillPath,
			`---
name: cyclic-skill
---

Task: rp1-base:cyclic-agent
`,
		);

		// Agent references the same skill it was spawned from
		await writeFile(
			join(distBase, "agents/cyclic-agent.md"),
			`---
name: cyclic-agent
---

Use skill: rp1-base:cyclic-skill
`,
		);

		const result = await buildDependencyGraph(skillPath, "claude-code")();

		expect(E.isRight(result)).toBe(true);
		if (E.isRight(result)) {
			expect(result.right.skill).toBe("cyclic-skill");
			expect(result.right.platform).toBe("claude-code");
			expect(result.right.agents).toEqual([
				"dist/claude-code/base/agents/cyclic-agent.md",
			]);
		}
	});

	test("uses full path when skill name cannot be extracted", async () => {
		const weirdPath = join(tempDir, "weird-location.md");
		await writeFile(
			weirdPath,
			`---
name: weird
---
Content.
`,
		);

		const result = await buildDependencyGraph(weirdPath, "claude-code")();

		expect(E.isRight(result)).toBe(true);
		if (E.isRight(result)) {
			expect(result.right.skill).toBe(weirdPath);
		}
	});

	test("includes reference companions and the agents they dispatch", async () => {
		// Progressive disclosure moves whole phases into references/. Without
		// traversing them, an attestation stays "current" while the agents those
		// phases dispatch change underneath it.
		const distDev = join(tempDir, "dist/claude-code/dev");
		const skillDir = join(distDev, "skills/split-skill");
		await mkdir(join(distDev, "agents"), { recursive: true });
		await mkdir(join(skillDir, "references"), { recursive: true });

		const skillPath = join(skillDir, "SKILL.md");
		await writeFile(
			skillPath,
			`---
name: split-skill
description: Skill whose implementation phase lives in a companion
---

Read \`references/phase.md\` and follow it.

subagent_type: rp1-dev:planner
`,
		);
		await writeFile(
			join(skillDir, "references", "phase.md"),
			"subagent_type: rp1-dev:builder\n",
		);
		await writeFile(join(distDev, "agents/planner.md"), "Planner.\n");
		await writeFile(join(distDev, "agents/builder.md"), "Builder.\n");

		const result = await buildDependencyGraph(skillPath, "claude-code")();

		expect(E.isRight(result)).toBe(true);
		if (E.isRight(result)) {
			expect(result.right.companions).toEqual([
				join(skillDir, "references", "phase.md"),
			]);
			const agentNames = result.right.agents.map(
				(a) => a.split("/").pop() as string,
			);
			expect(agentNames.sort()).toEqual(["builder.md", "planner.md"]);
		}
	});

	test("keeps every graph path forward-slashed", async () => {
		// Graph paths are identity: computeDepsHash sorts by them, so a
		// platform-dependent separator would hash the same content differently on
		// Windows than on POSIX.
		const distDev = join(tempDir, "dist/claude-code/dev");
		const skillDir = join(distDev, "skills/posix-skill");
		await mkdir(join(distDev, "agents"), { recursive: true });
		await mkdir(join(skillDir, "references"), { recursive: true });
		const skillPath = join(skillDir, "SKILL.md");
		await writeFile(
			skillPath,
			"---\nname: posix-skill\n---\nsubagent_type: rp1-dev:worker\n",
		);
		await writeFile(
			join(skillDir, "references", "phase.md"),
			"Companion.\n",
		);
		await writeFile(join(distDev, "agents/worker.md"), "Worker.\n");

		const result = await buildDependencyGraph(skillPath, "claude-code")();

		expect(E.isRight(result)).toBe(true);
		if (E.isRight(result)) {
			const g = result.right;
			const all = [g.skillPath, ...g.agents, ...g.skills, ...g.companions];
			expect(all.length).toBeGreaterThan(2);
			expect(all.filter((path) => path.includes("\\"))).toEqual([]);
		}
	});

	test("reports no companions for a skill without a references directory", async () => {
		const skillDir = join(tempDir, "skills/flat-skill");
		await mkdir(skillDir, { recursive: true });
		const skillPath = join(skillDir, "SKILL.md");
		await writeFile(skillPath, "---\nname: flat-skill\n---\nContent.\n");

		const result = await buildDependencyGraph(skillPath, "claude-code")();

		expect(E.isRight(result)).toBe(true);
		if (E.isRight(result)) {
			expect(result.right.companions).toEqual([]);
		}
	});
});
