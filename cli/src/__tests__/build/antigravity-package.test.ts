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

const activeGeminiPatterns = [
	/\bGemini CLI\b/,
	/\bGemini skill\b/,
	/\bGemini workflows\b/,
	/\bGEMINI\.md\b/,
	/\bgemini-extension\b/,
	/\bgeminiCli\b/,
];

const expectNoActiveGeminiWording = (content: string): void => {
	for (const pattern of activeGeminiPatterns) {
		expect(content).not.toMatch(pattern);
	}
};

const writePluginMetadata = async (
	projectRoot: string,
	description = "Development workflows for Antigravity",
): Promise<void> => {
	await writeFixture(
		projectRoot,
		"plugins/dev/.claude-plugin/plugin.json",
		JSON.stringify({
			name: "rp1-dev",
			description,
			version: "1.2.3",
		}),
	);
};

const writeWorkflowSkill = async (
	projectRoot: string,
	subAgents: readonly string[] = ["task-builder"],
): Promise<void> => {
	await writeFixture(
		projectRoot,
		"plugins/dev/skills/build-fast/SKILL.md",
		`---
name: build-fast
description: "Build-fast workflow for Antigravity package coverage"
allowed-tools: Bash(rp1 *), Read, Edit
metadata:
  category: development
  is_workflow: true
  sub_agents:
${subAgents.map((subAgent) => `    - "${subAgent}"`).join("\n")}
  workflow:
    run_policy: fresh
    identity_args: []
  arguments:
    - name: DEVELOPMENT_REQUEST
      type: string
      required: true
      description: "Development request"
---

Build fast content.
`,
	);
};

const writeDelegatedAgent = async (
	projectRoot: string,
	name = "task-builder",
	description = "Builds assigned implementation tasks",
): Promise<void> => {
	await writeFixture(
		projectRoot,
		`plugins/dev/agents/${name}.md`,
		`---
name: ${name}
description: "${description}"
tools: Read, Grep, Bash, Edit, Task
model: inherit
---

Build assigned implementation tasks and return a concise result.
`,
	);
};

describe("Antigravity native package build", () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await createTempDir("antigravity-package");
	});

	afterEach(async () => {
		await cleanupTempDir(tempDir);
	});

	test("writes native package assets and dynamic delegation definitions", async () => {
		const projectRoot = join(tempDir, "project");
		const out = join(tempDir, "dist", "antigravity");
		await writePluginMetadata(projectRoot);
		await writeWorkflowSkill(projectRoot);
		await writeDelegatedAgent(projectRoot);

		const result = await buildPlatformPlugin(
			"dev",
			projectRoot,
			out,
			antigravityDef,
			noopLogger,
			true,
		);

		expect(result.summary.errors).toEqual([]);
		expect(result.summary.commands).toBe(1);
		expect(result.assets.commands).toEqual([
			{
				name: "rp1-dev:build-fast",
				path: "dev/commands/rp1-dev/build-fast.toml",
			},
		]);
		expect(result.assets.verbatimFiles.map((file) => file.path).sort()).toEqual(
			expect.arrayContaining([
				"dev/AGENTS.md",
				"dev/delegation-definitions/index.json",
				"dev/delegation-definitions/rp1-dev-task-builder.json",
				"dev/hooks/hooks.json",
				"dev/mcp_config.json",
				"dev/plugin.json",
				"dev/rules/rp1-rules.md",
				"dev/support-matrix.json",
				"dev/support-metadata.json",
			]),
		);

		const pluginJson = JSON.parse(
			await readFile(join(out, "dev", "plugin.json"), "utf-8"),
		);
		expect(pluginJson).toMatchObject({
			name: "rp1-dev",
			version: "1.2.3",
			host: {
				id: "antigravity",
				name: "Antigravity CLI",
				binary: "agy",
			},
			entrypoints: {
				instructions: "AGENTS.md",
				skills: "skills/",
				rules: "rules/",
				hooks: "hooks/hooks.json",
				mcp: "mcp_config.json",
				supportMatrix: "support-matrix.json",
				supportMetadata: "support-metadata.json",
				delegationDefinitions: "delegation-definitions/index.json",
			},
			runtime: {
				delegation: "dynamic_define_subagent",
				runtimeContract:
					"define_subagent_once_per_session_then_invoke_subagent",
				staticAgentsDiscovery: "not_used",
			},
		});

		const skillContent = await readFile(
			join(out, "dev", "skills", "rp1-build-fast", "SKILL.md"),
			"utf-8",
		);
		expect(skillContent).toContain(
			'--schema-path "$HOME/.gemini/antigravity-cli/rp1-dev/skills/rp1-build-fast/SKILL.md"',
		);
		expect(skillContent).toContain("export CURRENT_HOST=antigravity");
		expect(skillContent).toContain("--harness antigravity");
		expect(skillContent).toContain("## Antigravity Runtime Semantics");
		expect(skillContent).toContain(
			"Resolve source-code reads and writes against `codeRoot`",
		);
		expect(skillContent).toContain(
			"projectRoot` and `workRoot` can point at the canonical project while `codeRoot` points at the active worktree",
		);
		expect(skillContent).toContain(
			"Antigravity support exception: <mode> requires validation",
		);
		expect(skillContent).toContain("## Dynamic Delegation Session Registry");
		expect(skillContent).toMatch(
			/Key entries as `\$\{definition\.rp1AgentId\}:\$\{definition\.definitionHash\}`/,
		);
		expect(skillContent).toContain(
			"$HOME/.gemini/antigravity-cli/rp1-dev/delegation-definitions/rp1-dev-task-builder.json",
		);
		expect(skillContent).toContain(
			"call Antigravity `define_subagent` with the loaded `definition.defineSubagent` fields",
		);
		expect(skillContent).toContain(
			"reuse the cached `TypeName` with `invoke_subagent`",
		);
		expect(skillContent).toContain(
			"Carry the registry through all parent workflow planning, delegated task units, fanout batches, and reduction steps",
		);
		expect(skillContent).toContain("Default to the inherited workspace");
		expect(skillContent).toContain(
			"have the parent write/register the artifact from the returned result",
		);
		expect(skillContent).toContain('"unit_id": "stable unit id"');
		expect(skillContent).toContain("Do not query `/agents`");

		const command = Bun.TOML.parse(
			await readFile(
				join(out, "dev", "commands", "rp1-dev", "build-fast.toml"),
				"utf-8",
			),
		) as { readonly prompt?: unknown };
		expect(command.prompt).toContain(
			"Use the bundled Antigravity skill `rp1-build-fast`",
		);

		const definitionIndex = JSON.parse(
			await readFile(
				join(out, "dev", "delegation-definitions", "index.json"),
				"utf-8",
			),
		);
		expect(definitionIndex).toMatchObject({
			plugin: "rp1-dev",
			runtimeContract: "define_subagent_once_per_session_then_invoke_subagent",
			staticAgentsDiscovery: "not_used",
		});
		expect(definitionIndex.definitions).toEqual([
			expect.objectContaining({
				rp1AgentId: "dev:task-builder",
				definitionHash: expect.stringMatching(/^[a-f0-9]{16}$/),
				typeName: "rp1-dev-task-builder",
				path: "delegation-definitions/rp1-dev-task-builder.json",
			}),
		]);

		const definition = JSON.parse(
			await readFile(
				join(out, "dev", "delegation-definitions", "rp1-dev-task-builder.json"),
				"utf-8",
			),
		);
		expect(definition).toMatchObject({
			rp1AgentId: "dev:task-builder",
			typeName: "rp1-dev-task-builder",
			staticAgentsDiscovery: "not_used",
			defineSubagent: {
				name: "rp1-dev-task-builder",
				description: "Builds assigned implementation tasks",
				enable_mcp_tools: false,
				enable_write_tools: true,
				enable_subagent_tools: false,
			},
			nestedDelegation: {
				sourceUsesSubagents: true,
				enabled: false,
				validation: "requires_workflow_validation",
			},
		});
		expect(definition.definitionHash).toMatch(/^[a-f0-9]{16}$/);
		expect(definition.defineSubagent.system_prompt).toContain(
			"Build assigned implementation tasks",
		);
		expect(definition.defineSubagent.system_prompt).toContain(
			"Antigravity generated workflows export `CURRENT_HOST=antigravity`",
		);

		const supportMetadata = JSON.parse(
			await readFile(join(out, "dev", "support-metadata.json"), "utf-8"),
		);
		expect(supportMetadata.runtime).toMatchObject({
			currentHost: "antigravity",
			bootstrapHarness: "antigravity",
			rootContract: {
				sourceOperations: "codeRoot",
				knowledgeReads: "kbRoot",
				durableArtifacts: "workRoot",
				worktreeSplit: "preserve",
			},
			unsupportedModePolicy: "block_or_label_antigravity_support_exception",
			staticAgentsDiscovery: "not_used",
		});
		expect(supportMetadata.runtime.unsupportedModes).toEqual(
			expect.arrayContaining([
				"permissions",
				"headless",
				"mcp",
				"workspace",
				"nested-delegation",
			]),
		);
		expect(supportMetadata.delegation).toMatchObject({
			definitionIndex: "delegation-definitions/index.json",
			runtimeContract: "define_subagent_once_per_session_then_invoke_subagent",
			staticAgentsDiscovery: "not_used",
		});
		expect(supportMetadata.delegation.definitions).toEqual([
			expect.objectContaining({
				rp1AgentId: "dev:task-builder",
				definitionHash: definition.definitionHash,
				typeName: "rp1-dev-task-builder",
				workspace: {
					defaultPolicy: "inherited",
					isolatedWorktree: "requires_validation",
				},
				tools: {
					enable_mcp_tools: false,
					enable_write_tools: true,
					enable_subagent_tools: false,
				},
				nestedDelegation: {
					sourceUsesSubagents: true,
					enabled: false,
					validation: "requires_workflow_validation",
				},
			}),
		]);

		const generatedPackageText = await Promise.all(
			[
				"AGENTS.md",
				"commands/rp1-dev/build-fast.toml",
				"delegation-definitions/index.json",
				"delegation-definitions/rp1-dev-task-builder.json",
				"hooks/hooks.json",
				"manifest.json",
				"mcp_config.json",
				"plugin.json",
				"rules/rp1-rules.md",
				"skills/rp1-build-fast/SKILL.md",
				"support-matrix.json",
				"support-metadata.json",
			].map((path) => readFile(join(out, "dev", path), "utf-8")),
		);
		expectNoActiveGeminiWording(generatedPackageText.join("\n"));
	});

	test("normalizes namespaced subagent metadata to indexed definition paths", async () => {
		const projectRoot = join(tempDir, "project-namespaced-subagents");
		const out = join(tempDir, "dist", "antigravity-namespaced");
		await writePluginMetadata(projectRoot);
		await writeWorkflowSkill(projectRoot, [
			"rp1-dev:feature-requirement-gatherer",
		]);
		await writeDelegatedAgent(
			projectRoot,
			"feature-requirement-gatherer",
			"Gathers feature requirements",
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
		const skillContent = await readFile(
			join(out, "dev", "skills", "rp1-build-fast", "SKILL.md"),
			"utf-8",
		);
		expect(skillContent).toContain(
			"$HOME/.gemini/antigravity-cli/rp1-dev/delegation-definitions/index.json",
		);
		expect(skillContent).toContain(
			"source `rp1-dev:feature-requirement-gatherer` -> `dev:feature-requirement-gatherer`",
		);
		expect(skillContent).toContain(
			"$HOME/.gemini/antigravity-cli/rp1-dev/delegation-definitions/rp1-dev-feature-requirement-gatherer.json",
		);
		expect(skillContent).not.toContain("rp1-dev-rp1-dev");
		expect(skillContent).not.toContain("dev:rp1-dev");

		const definitionIndex = JSON.parse(
			await readFile(
				join(out, "dev", "delegation-definitions", "index.json"),
				"utf-8",
			),
		);
		expect(definitionIndex.definitions).toEqual([
			expect.objectContaining({
				rp1AgentId: "dev:feature-requirement-gatherer",
				path: "delegation-definitions/rp1-dev-feature-requirement-gatherer.json",
			}),
		]);
		for (const definition of definitionIndex.definitions as readonly {
			readonly path: string;
		}[]) {
			const definitionContent = await readFile(
				join(out, "dev", definition.path),
				"utf-8",
			);
			expect(definitionContent).toContain(
				'"rp1AgentId": "dev:feature-requirement-gatherer"',
			);
		}
	});

	test("reports active Gemini wording in generated Antigravity package metadata", async () => {
		const projectRoot = join(tempDir, "project-gemini-wording");
		const out = join(tempDir, "dist", "antigravity-gemini-wording");
		await writePluginMetadata(
			projectRoot,
			"Development workflows for Gemini CLI",
		);
		await writeWorkflowSkill(projectRoot);

		const result = await buildPlatformPlugin(
			"dev",
			projectRoot,
			out,
			antigravityDef,
			noopLogger,
			true,
		);

		expect(result.summary.errors).toContainEqual(
			expect.stringContaining("Active Gemini wording is not allowed"),
		);
		expect(result.summary.errors.join("\n")).toContain("plugin.json");
	});
});
