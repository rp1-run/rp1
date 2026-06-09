import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Logger } from "../../../../shared/logger.js";
import { buildPlatformPlugin } from "../../../build/command.js";
import { PLATFORM_DEFINITIONS } from "../../../build/platform-definitions.js";
import {
	cleanupTempDir,
	createTempDir,
	writeFixture,
} from "../../helpers/index.js";

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

const gooseDef = PLATFORM_DEFINITIONS.get("goose")!;

describe("Goose package build", () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await createTempDir("goose-package");
	});

	afterEach(async () => {
		await cleanupTempDir(tempDir);
	});

	test("writes skills, agents, recipes, manifest, support metadata, and bundle assets", async () => {
		const projectRoot = join(tempDir, "project");
		const out = join(tempDir, "dist", "goose");

		await writeFixture(
			projectRoot,
			"plugins/dev/.claude-plugin/plugin.json",
			JSON.stringify({ version: "1.0.0" }),
		);
		await writeFixture(
			projectRoot,
			"plugins/dev/skills/build-fast/SKILL.md",
			`---
name: build-fast
description: "Fast tracked workflow that exercises generated Goose assets"
allowed-tools: Bash(rp1 *), Read, Task, NotebookEdit, CustomMcpTool
metadata:
  category: development
  is_workflow: true
  workflow:
    run_policy: fresh
    identity_args: []
  arguments:
    - name: FEATURE_ID
      type: string
      required: true
      description: "Feature identifier"
---

Use /rp1-base:knowledge-load, emit artifacts, then complete the requested task.
{% ask_user "Release, Add Task, Review feedback from Arcade, or Stop?", options: "Release", "Add Task", "Review feedback from Arcade", "Stop" %}
On Add Task: collect the user's task request.
{% dispatch_agent "rp1-dev:feature-tasker" %}
FEATURE_ID=test-feature, UPDATE_MODE=true
{% enddispatch_agent %}
`,
		);
		await writeFixture(
			projectRoot,
			"plugins/dev/agents/task-builder.md",
			`---
name: task-builder
description: "Implements assigned feature tasks for the Goose package test"
tools: Read, Bash, Edit, Task, NotebookEdit, BashOutput, CustomMcpTool
model: inherit
---

# Task Reviewer Agent
# Build Task Parser

Build assigned implementation tasks. Preserve Task Plan and Add Task labels. Use the Task tool, AskUserQuestion, NotebookEdit, BashOutput, and WebSearch only when supported.
`,
		);

		const result = await buildPlatformPlugin(
			"dev",
			projectRoot,
			out,
			gooseDef,
			noopLogger,
			true,
		);

		expect(result.summary.errors).toEqual([]);
		expect(result.summary.skills).toBe(1);
		expect(result.summary.agents).toBe(1);
		expect(result.assets.verbatimFiles.map((file) => file.path).sort()).toEqual(
			expect.arrayContaining([
				"dev/recipes/rp1-dev-build-fast.yaml",
				"dev/support-metadata.json",
			]),
		);

		const skillContent = await readFile(
			join(out, "dev", "skills", "rp1-build-fast", "SKILL.md"),
			"utf-8",
		);
		expect(skillContent).toContain("export CURRENT_HOST=goose");
		expect(skillContent).toContain("--harness goose");
		expect(skillContent).toContain("--name rp1-dev:build-fast");
		expect(skillContent).toContain(
			'--schema-path "{{ recipe_dir }}/../skills/rp1-build-fast/SKILL.md"',
		);
		expect(skillContent).toContain("Use /rp1-base:knowledge-load");
		expect(skillContent).toContain(
			"| FEATURE_ID | `data.arguments.FEATURE_ID` |",
		);
		expect(skillContent).toContain("Use `RUN_ID` for all subsequent emits");
		expect(skillContent).toContain(
			"Use the builtin `developer` extension for basic filesystem and shell work only",
		);
		expect(skillContent).toContain(
			"Treat Goose JSON output as a transcript or metadata envelope",
		);
		expect(skillContent).toContain(
			"Goose fails closed for unsupported runtime paths",
		);
		expect(skillContent).toContain(
			"Release, Add Task, Review feedback from Arcade, or Stop?",
		);
		expect(skillContent).toContain("On Add Task: collect");
		expect(skillContent).toContain(
			"Goose unsupported capability: rp1 subagent delegation is fail-closed",
		);
		expect(skillContent).not.toContain("Add subagent delegation");

		const agentContent = await readFile(
			join(out, "dev", "agents", "rp1-dev-task-builder.md"),
			"utf-8",
		);
		expect(agentContent).toContain("Set `CURRENT_HOST=goose`");
		expect(agentContent).toContain("tools:\n  - developer");
		expect(agentContent).not.toContain("summon");
		expect(agentContent).toContain("# Task Reviewer Agent");
		expect(agentContent).toContain("# Build Task Parser");
		expect(agentContent).toContain("Preserve Task Plan and Add Task labels");
		expect(agentContent).toContain(
			"subagent delegation tool (unsupported on Goose",
		);
		expect(agentContent).toContain(
			"interactive user input (unsupported on Goose; stop and ask the user directly)",
		);
		expect(agentContent).toContain("notebook editing (unsupported on Goose)");
		expect(agentContent).toContain(
			"background shell output collection (unsupported on Goose)",
		);
		expect(agentContent).toContain("web searching (unsupported on Goose)");

		const recipePath = join(out, "dev", "recipes", "rp1-dev-build-fast.yaml");
		const recipeContent = await readFile(recipePath, "utf-8");
		expect(recipeContent).toContain("title: rp1-dev-build-fast");
		expect(recipeContent).toContain(
			"{{ recipe_dir }}/../skills/rp1-build-fast/SKILL.md",
		);
		expect(recipeContent).toContain("goose run --recipe <this file>");
		expect(recipeContent).toContain("name: developer");
		expect(recipeContent).toContain("key: ARGUMENTS");
		expect(recipeContent).toContain("{{ ARGUMENTS }}");
		expect(recipeContent).toContain(
			"Before running the rp1 workflow, use the developer shell to run `goose --version`",
		);
		expect(recipeContent).toContain(
			"Goose 1.35.0 or newer is required for rp1 generated recipes",
		);
		expect(recipeContent).toContain(
			"When generated skill instructions ask for basic filesystem or shell capabilities",
		);
		expect(recipeContent).toContain(
			"If the generated skill reports `Goose unsupported capability`, stop",
		);

		const manifest = JSON.parse(
			await readFile(join(out, "dev", "manifest.json"), "utf-8"),
		);
		expect(manifest).toMatchObject({
			plugin: "dev",
			nativePluginName: "rp1-dev",
			supportScope: "generated-core-harness-assets",
			artifacts: {
				agents: ["rp1-dev-task-builder"],
				skills: ["rp1-build-fast"],
				recipes: ["rp1-dev-build-fast"],
				supportMetadata: "support-metadata.json",
			},
			requirements: {
				gooseVersion: ">=1.35.0",
				extensions: ["developer"],
			},
		});

		const supportMetadata = JSON.parse(
			await readFile(join(out, "dev", "support-metadata.json"), "utf-8"),
		);
		expect(supportMetadata).toMatchObject({
			schemaVersion: 1,
			plugin: "dev",
			nativePluginName: "rp1-dev",
			supportScope: "generated-core-harness-assets",
			runtime: {
				harness: "goose",
				currentHost: "goose",
				bootstrapHarness: "goose",
				jsonOutput: "transcript-or-metadata-envelope",
			},
			capabilities: {
				shellAndFilesystem: {
					status: "supported",
					extension: "developer",
					tools: ["Read", "Write", "Edit", "Grep", "Glob", "Bash"],
				},
				delegation: {
					status: "unsupported_fail_closed",
				},
				interactiveInput: {
					status: "unsupported_fail_closed",
				},
				jsonOutput: {
					status: "metadata_envelope",
				},
			},
			agents: ["rp1-dev-task-builder"],
		});
		expect(supportMetadata.recipes).toEqual([
			expect.objectContaining({
				name: "rp1-dev-build-fast",
				path: "recipes/rp1-dev-build-fast.yaml",
				skill: "rp1-build-fast",
				sourceSkill: "dev:build-fast",
				isWorkflow: true,
				requiredExtensions: ["developer"],
				unsupportedTools: ["CustomMcpTool", "NotebookEdit", "Task"],
				arguments: [
					expect.objectContaining({
						name: "FEATURE_ID",
						required: true,
					}),
				],
			}),
		]);

		if (await hasGooseCli()) {
			const validation = spawnSync(
				"goose",
				["recipe", "validate", recipePath],
				{
					encoding: "utf-8",
				},
			);
			expect(validation.status).toBe(0);
			expect(`${validation.stdout}${validation.stderr}`).toContain(
				"recipe file is valid",
			);
		}
	});
});

const hasGooseCli = async (): Promise<boolean> => {
	const result = spawnSync("goose", ["--version"], { encoding: "utf-8" });
	return result.status === 0;
};
