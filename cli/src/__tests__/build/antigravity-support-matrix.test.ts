import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Logger } from "../../../shared/logger.js";
import { buildPlatformPlugin } from "../../build/command.js";
import { PLATFORM_DEFINITIONS } from "../../build/platform-definitions.js";
import {
	cleanupTempDir,
	createTempDir,
	writeFixture,
} from "../helpers/index.js";

const noopLogger: Logger = {
	trace: () => {},
	debug: () => {},
	info: () => {},
	warn: () => {},
	error: () => {},
	start: () => {},
	success: () => {},
	fail: () => {},
	box: () => {},
};

const antigravityDef = PLATFORM_DEFINITIONS.get("antigravity")!;

const skillFrontmatter = (
	name: string,
	description: string,
	subAgents: readonly string[] = [],
) => `---
name: ${name}
description: "${description}"
allowed-tools: Bash(echo *)
metadata:
  category: development
  is_workflow: true
${subAgents.length > 0 ? `  sub_agents:\n${subAgents.map((agent) => `    - ${agent}`).join("\n")}\n` : ""}  workflow:
    run_policy: fresh
    identity_args: []
  version: 1.0.0
  created: 2026-01-01
  author: test
---

# ${name}

Skill content here.
`;

const agentFrontmatter = (name: string, description: string) => `---
name: ${name}
description: "${description}"
tools: Read, Grep, Bash, Edit
model: inherit
---

# ${name}

Return a concise delegated result.
`;

describe("Antigravity build support matrix", () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await createTempDir("antigravity-build-support-matrix");
	});

	afterEach(async () => {
		await cleanupTempDir(tempDir);
	});

	test("writes the catalog-backed Antigravity support matrix into generated bundle assets", async () => {
		const projectRoot = join(tempDir, "project");
		const out = join(tempDir, "dist", "antigravity");

		await writeFixture(
			projectRoot,
			"plugins/dev/.claude-plugin/plugin.json",
			JSON.stringify({
				name: "rp1-dev",
				description: "Development workflows for Antigravity",
				version: "1.0.0",
			}),
		);
		await writeFixture(
			projectRoot,
			"plugins/dev/skills/build-fast/SKILL.md",
			skillFrontmatter(
				"build-fast",
				"Build-fast workflow for Antigravity support matrix coverage.",
				["task-builder", "task-reviewer"],
			),
		);
		await writeFixture(
			projectRoot,
			"plugins/dev/agents/task-builder.md",
			agentFrontmatter("task-builder", "Builds assigned implementation tasks"),
		);
		await writeFixture(
			projectRoot,
			"plugins/dev/agents/task-reviewer.md",
			agentFrontmatter(
				"task-reviewer",
				"Reviews assigned implementation tasks",
			),
		);

		const result = await buildPlatformPlugin(
			"dev",
			projectRoot,
			out,
			antigravityDef,
			noopLogger,
			true,
		);

		expect(result.summary.errors).toEqual([]);
		expect(result.assets.verbatimFiles.map((file) => file.path)).toEqual(
			expect.arrayContaining([
				"dev/support-matrix.json",
				"dev/delegation-definitions/index.json",
				"dev/delegation-definitions/rp1-dev-task-builder.json",
				"dev/delegation-definitions/rp1-dev-task-reviewer.json",
			]),
		);

		const supportMatrix = JSON.parse(
			await readFile(join(out, "dev", "support-matrix.json"), "utf-8"),
		);
		expect(supportMatrix.entries).toHaveLength(1);
		expect(supportMatrix.entries[0]).toMatchObject({
			workflowId: "dev:build-fast",
			status: "limited",
			delegation: {
				mode: "dynamic_session_subagents",
				requiredSubAgents: ["task-builder", "task-reviewer"],
				runtimeContract: "define_once_invoke_many",
				staticAgentsDiscovery: "not_used",
			},
		});
		expect(supportMatrix.entries[0].userAction).toContain(
			"rp1 install antigravity",
		);
		expect(supportMatrix.entries[0].limitation).toContain("define_subagent");
		expect(supportMatrix.entries[0].limitation).toContain("invoke_subagent");
		expect(JSON.stringify(supportMatrix)).not.toContain("Gemini");

		const definitionIndex = JSON.parse(
			await readFile(
				join(out, "dev", "delegation-definitions", "index.json"),
				"utf-8",
			),
		);
		expect(definitionIndex.definitions).toEqual([
			expect.objectContaining({
				rp1AgentId: "dev:task-builder",
				path: "delegation-definitions/rp1-dev-task-builder.json",
			}),
			expect.objectContaining({
				rp1AgentId: "dev:task-reviewer",
				path: "delegation-definitions/rp1-dev-task-reviewer.json",
			}),
		]);
	});
});
