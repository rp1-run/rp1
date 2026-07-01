/**
 * Unit tests for the build orchestrator (command.ts).
 * Validates skills-only processing pipeline.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Logger } from "../../../shared/logger.js";
import {
	buildPlatformPlugin,
	deriveAntigravityOutputDir,
	deriveGeminiOutputDir,
	executeBuild,
	parseBuildArgs,
} from "../../build/command.js";
import { ParseCache } from "../../build/parse-cache.js";
import { PLATFORM_DEFINITIONS } from "../../build/platform-definitions.js";
import {
	assertTestIsolation,
	cleanupTempDir,
	createTempDir,
	expectLeft,
	expectRight,
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

const opencodeDef = PLATFORM_DEFINITIONS.get("opencode")!;
const claudeCodeDef = PLATFORM_DEFINITIONS.get("claude-code")!;
const codexDef = PLATFORM_DEFINITIONS.get("codex")!;
const copilotDef = PLATFORM_DEFINITIONS.get("copilot")!;
const antigravityDef = PLATFORM_DEFINITIONS.get("antigravity")!;
const geminiDef = PLATFORM_DEFINITIONS.get("gemini")!;

const extractBootstrapTarget = (
	content: string,
): { readonly name: string; readonly schemaPath: string } => {
	const nameMatch = content.match(/--name\s+([^\s\\]+)/);
	const schemaPathMatch = content.match(
		/--schema-path\s+(?:"([^"]+)"|([^\s\\]+))/,
	);

	const schemaPath = schemaPathMatch?.[1] ?? schemaPathMatch?.[2];
	if (!nameMatch?.[1] || !schemaPath) {
		throw new Error("Missing generated workflow bootstrap target");
	}

	return {
		name: nameMatch[1],
		schemaPath,
	};
};

describe("build platform support", () => {
	test("registers Antigravity as the active Google bundle-producing build platform", () => {
		const activePlatformIds = Array.from(PLATFORM_DEFINITIONS.values())
			.filter((definition) => definition.config.enabled !== false)
			.map((definition) => definition.id)
			.sort();

		expect(activePlatformIds).toEqual([
			"antigravity",
			"claude-code",
			"codex",
			"copilot",
			"opencode",
		]);
		expect(
			expectRight(parseBuildArgs(["--platform", "antigravity"])),
		).toMatchObject({
			platform: "antigravity",
		});
		expect(antigravityDef.producesBundleAssets).toBe(true);
		expect(antigravityDef.config).toMatchObject({
			id: "antigravity",
			name: "Antigravity CLI",
			binary: "agy",
		});
	});

	test("derives the default Google harness output directories next to other platform outputs", () => {
		expect(deriveAntigravityOutputDir("dist/opencode")).toBe(
			"dist/antigravity",
		);
		expect(deriveAntigravityOutputDir("dist/opencode/")).toBe(
			"dist/antigravity",
		);
		expect(deriveGeminiOutputDir("dist/opencode")).toBe("dist/gemini");
		expect(deriveGeminiOutputDir("dist/opencode/")).toBe("dist/gemini");
	});
});

describe("parseBuildArgs", () => {
	test("accepts equals and separated forms for output, plugin, platform, and mode flags", () => {
		expect(
			expectRight(
				parseBuildArgs([
					"--output-dir=dist/codex",
					"--plugin",
					"dev",
					"--platform=codex",
					"--json",
					"--lint",
				]),
			),
		).toEqual({
			outputDir: "dist/codex",
			plugin: "dev",
			platform: "codex",
			jsonOutput: true,
			lintOnly: true,
		});

		expect(
			expectRight(
				parseBuildArgs(["-o", "out", "-p", "utils", "--platform", "copilot"]),
			),
		).toMatchObject({
			outputDir: "out",
			plugin: "utils",
			platform: "copilot",
		});

		expect(
			expectRight(
				parseBuildArgs([
					"-o",
					"out",
					"-p",
					"utils",
					"--platform",
					"antigravity",
				]),
			),
		).toMatchObject({
			outputDir: "out",
			plugin: "utils",
			platform: "antigravity",
		});
	});

	test("treats a positional argument as output directory", () => {
		expect(expectRight(parseBuildArgs(["custom-output"]))).toMatchObject({
			outputDir: "custom-output",
			plugin: "all",
			platform: "opencode",
		});
	});

	test("rejects missing or unsupported plugin and platform values", () => {
		expect(expectLeft(parseBuildArgs(["--output-dir"]))).toMatchObject({
			_tag: "UsageError",
		});
		expect(expectLeft(parseBuildArgs(["--plugin", "unknown"]))).toMatchObject({
			_tag: "UsageError",
		});
		expect(expectLeft(parseBuildArgs(["--plugin=unknown"]))).toMatchObject({
			_tag: "UsageError",
		});
		expect(expectLeft(parseBuildArgs(["--platform", "unknown"]))).toMatchObject(
			{
				_tag: "UsageError",
			},
		);
		expect(expectLeft(parseBuildArgs(["--platform=unknown"]))).toMatchObject({
			_tag: "UsageError",
		});
	});
});

describe("buildPlatformPlugin (opencode)", () => {
	let tempDir: string;
	let outputDir: string;

	beforeAll(async () => {
		tempDir = await createTempDir("build-cmd");
		await assertTestIsolation(tempDir);
		outputDir = join(tempDir, "output");
	});

	afterAll(async () => {
		await cleanupTempDir(tempDir);
	});

	test("processes skills for non-base plugins (base-only guard removed)", async () => {
		const projectRoot = join(tempDir, "project-dev-skills");

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
description: "Fast build workflow for rapid iteration on features"
---

Build fast skill content.
`,
		);

		const out = join(outputDir, "dev-skills");
		const result = await buildPlatformPlugin(
			"dev",
			projectRoot,
			out,
			opencodeDef,
			noopLogger,
			true,
		);

		expect(result.summary.skills).toBeGreaterThanOrEqual(1);
		expect(
			result.assets.skills.some((s) => s.name.startsWith("rp1-build-fast/")),
		).toBe(true);
	});

	test("skills produce output in skills/{name}/ directory", async () => {
		const projectRoot = join(tempDir, "project-skill-output");

		await writeFixture(
			projectRoot,
			"plugins/base/.claude-plugin/plugin.json",
			JSON.stringify({ version: "1.0.0" }),
		);

		await writeFixture(
			projectRoot,
			"plugins/base/skills/knowledge-load/SKILL.md",
			`---
name: knowledge-load
description: "Load knowledge base context files for AI agent consumption"
---

Skill version of knowledge-load content.
`,
		);

		const out = join(outputDir, "skill-output");
		const result = await buildPlatformPlugin(
			"base",
			projectRoot,
			out,
			opencodeDef,
			noopLogger,
			true,
		);

		expect(
			result.assets.skills.some((s) =>
				s.name.startsWith("rp1-knowledge-load/"),
			),
		).toBe(true);
		expect(result.summary.skills).toBe(1);
		expect(result.summary.commands).toBe(0);

		const skillOutputPath = join(
			out,
			"base",
			"skills",
			"rp1-knowledge-load",
			"SKILL.md",
		);
		const skillContent = await readFile(skillOutputPath, "utf-8");
		expect(skillContent).toContain("rp1-knowledge-load");
	});

	test("manifest reflects accurate skill counts", async () => {
		const projectRoot = join(tempDir, "project-manifest");

		await writeFixture(
			projectRoot,
			"plugins/base/.claude-plugin/plugin.json",
			JSON.stringify({ version: "2.0.0" }),
		);

		await writeFixture(
			projectRoot,
			"plugins/base/skills/skill-a/SKILL.md",
			`---
name: skill-a
description: "First skill with a description that meets the minimum length"
---

Skill A content.
`,
		);
		await writeFixture(
			projectRoot,
			"plugins/base/skills/skill-b/SKILL.md",
			`---
name: skill-b
description: "Second skill with a description that meets the minimum length"
---

Skill B content.
`,
		);

		const out = join(outputDir, "manifest");
		const result = await buildPlatformPlugin(
			"base",
			projectRoot,
			out,
			opencodeDef,
			noopLogger,
			true,
		);

		expect(result.summary.skills).toBe(2);
		expect(result.summary.commands).toBe(0);

		const manifestPath = join(out, "base", "manifest.json");
		const manifestContent = JSON.parse(await readFile(manifestPath, "utf-8"));
		expect(manifestContent.artifacts.skills).toEqual([
			"rp1-skill-a",
			"rp1-skill-b",
		]);
		expect(manifestContent.artifacts.commands).toEqual([]);
	});

	test("processes skills for utils plugin", async () => {
		const projectRoot = join(tempDir, "project-utils");

		await writeFixture(
			projectRoot,
			"plugins/utils/.claude-plugin/plugin.json",
			JSON.stringify({ version: "1.0.0" }),
		);
		await writeFixture(
			projectRoot,
			"plugins/utils/skills/prompt-writer/SKILL.md",
			`---
name: prompt-writer
description: "Expert prompt engineering skill for creating optimal agent prompts"
---

Prompt writer skill content.
`,
		);

		const out = join(outputDir, "utils");
		const result = await buildPlatformPlugin(
			"utils",
			projectRoot,
			out,
			opencodeDef,
			noopLogger,
			true,
		);

		expect(result.summary.skills).toBe(1);
		expect(
			result.assets.skills.some((s) => s.name.startsWith("rp1-prompt-writer/")),
		).toBe(true);
	});

	test("renders stable workflow target inputs across supported hosts", async () => {
		const projectRoot = join(tempDir, "project-workflow-targets");

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
description: "Fast tracked workflow that exercises generated bootstrap targets"
metadata:
  category: development
  is_workflow: true
  workflow:
    run_policy: fresh
    identity_args: []
---

Workflow content.
`,
		);

		const opencodeOut = join(outputDir, "workflow-targets-opencode");
		const codexOut = join(outputDir, "workflow-targets-codex");
		const claudeOut = join(outputDir, "workflow-targets-claude");

		await buildPlatformPlugin(
			"dev",
			projectRoot,
			opencodeOut,
			opencodeDef,
			noopLogger,
			true,
		);
		await buildPlatformPlugin(
			"dev",
			projectRoot,
			codexOut,
			codexDef,
			noopLogger,
			true,
		);
		await buildPlatformPlugin(
			"dev",
			projectRoot,
			claudeOut,
			claudeCodeDef,
			noopLogger,
			true,
		);

		const opencodeSkill = await readFile(
			join(opencodeOut, "dev", "skills", "rp1-build-fast", "SKILL.md"),
			"utf-8",
		);
		const codexSkill = await readFile(
			join(codexOut, "dev", "skills", "rp1-build-fast", "SKILL.md"),
			"utf-8",
		);
		const claudeSkill = await readFile(
			join(claudeOut, "dev", "skills", "build-fast", "SKILL.md"),
			"utf-8",
		);

		expect(extractBootstrapTarget(opencodeSkill)).toEqual({
			name: "rp1-dev:build-fast",
			schemaPath: "$HOME/.config/opencode/skills/rp1-build-fast/SKILL.md",
		});
		expect(extractBootstrapTarget(codexSkill)).toEqual({
			name: "rp1-dev:build-fast",
			schemaPath: "$HOME/.codex/skills/rp1-build-fast/SKILL.md",
		});
		expect(extractBootstrapTarget(claudeSkill)).toEqual({
			name: "rp1-dev:build-fast",
			schemaPath: "$HOME/.rp1/claude/plugins/dev/skills/build-fast/SKILL.md",
		});
	});
});

describe("buildPlatformPlugin (claude-code dev versioning)", () => {
	let tempDir: string;
	let outputDir: string;

	beforeAll(async () => {
		tempDir = await createTempDir("build-cmd-claude");
		await assertTestIsolation(tempDir);
		outputDir = join(tempDir, "output");
	});

	afterAll(async () => {
		await cleanupTempDir(tempDir);
	});

	test("uses -dev suffix for Claude Code plugin.json in local dev builds only", async () => {
		const projectRoot = join(tempDir, "project-claude-dev");

		await writeFixture(
			projectRoot,
			"plugins/base/.claude-plugin/plugin.json",
			JSON.stringify({
				name: "rp1-base",
				version: "1.2.3",
			}),
		);
		await writeFixture(
			projectRoot,
			"plugins/base/skills/sample/SKILL.md",
			`---
name: sample
description: "Sample skill with enough description text for validation"
---

Sample content.
`,
		);

		const original = process.env.RP1_BUILD_INTERNAL;
		process.env.RP1_BUILD_INTERNAL = "1";

		try {
			const out = join(outputDir, "claude-dev");
			await buildPlatformPlugin(
				"base",
				projectRoot,
				out,
				claudeCodeDef,
				noopLogger,
				true,
			);

			const pluginJson = JSON.parse(
				await readFile(
					join(out, "base", ".claude-plugin", "plugin.json"),
					"utf-8",
				),
			);
			expect(pluginJson.version).toBe("1.2.3-dev");
		} finally {
			if (original === undefined) {
				delete process.env.RP1_BUILD_INTERNAL;
			} else {
				process.env.RP1_BUILD_INTERNAL = original;
			}
		}
	});

	test("does not add -dev suffix for Claude Code when not in a local dev build", async () => {
		const projectRoot = join(tempDir, "project-claude-stable");

		await writeFixture(
			projectRoot,
			"plugins/base/.claude-plugin/plugin.json",
			JSON.stringify({
				name: "rp1-base",
				version: "2.3.4",
			}),
		);
		await writeFixture(
			projectRoot,
			"plugins/base/skills/sample/SKILL.md",
			`---
name: sample
description: "Sample skill with enough description text for validation"
---

Sample content.
`,
		);

		try {
			delete process.env.RP1_BUILD_INTERNAL;
			const out = join(outputDir, "claude-stable");
			await buildPlatformPlugin(
				"base",
				projectRoot,
				out,
				claudeCodeDef,
				noopLogger,
				true,
			);

			const pluginJson = JSON.parse(
				await readFile(
					join(out, "base", ".claude-plugin", "plugin.json"),
					"utf-8",
				),
			);
			expect(pluginJson.version).toBe("2.3.4");
		} finally {
			delete process.env.RP1_BUILD_INTERNAL;
		}
	});
});

describe("buildPlatformPlugin (copilot)", () => {
	let tempDir: string;
	let outputDir: string;

	beforeAll(async () => {
		tempDir = await createTempDir("build-cmd-copilot");
		await assertTestIsolation(tempDir);
		outputDir = join(tempDir, "output");
	});

	afterAll(async () => {
		await cleanupTempDir(tempDir);
	});

	test("writes native Copilot plugin artifacts and namespaced .agent.md files", async () => {
		const projectRoot = join(tempDir, "project-copilot-native");

		await writeFixture(
			projectRoot,
			"plugins/base/.claude-plugin/plugin.json",
			JSON.stringify({
				name: "rp1-base",
				description: "Base workflows for Copilot",
				version: "1.2.3",
			}),
		);
		await writeFixture(
			projectRoot,
			"plugins/base/skills/knowledge-build/SKILL.md",
			`---
name: knowledge-build
description: "Build knowledge base artifacts for downstream workflows"
---

Knowledge build content.
`,
		);
		await writeFixture(
			projectRoot,
			"plugins/base/agents/task-builder.md",
			`---
name: task-builder
description: "Builds feature tasks from a tracked task list"
tools: Bash, Read, WebSearch
model: inherit
---

Task builder content.
`,
		);

		const out = join(outputDir, "copilot-native");
		const result = await buildPlatformPlugin(
			"base",
			projectRoot,
			out,
			copilotDef,
			noopLogger,
			true,
		);

		expect(result.summary.skills).toBe(1);
		expect(result.summary.agents).toBe(1);
		expect(
			result.assets.agents.some((agent) =>
				agent.path.endsWith("base/agents/rp1-base-task-builder.agent.md"),
			),
		).toBe(true);
		expect(result.assets.verbatimFiles.map((file) => file.path).sort()).toEqual(
			["base/README.md", "base/plugin.json"],
		);

		const agentPath = join(
			out,
			"base",
			"agents",
			"rp1-base-task-builder.agent.md",
		);
		const agentContent = await readFile(agentPath, "utf-8");
		expect(agentContent).toContain("name: rp1-base-task-builder");
		expect(agentContent).toContain("- run_terminal_command");
		expect(agentContent).toContain("- read_file");
		expect(agentContent).not.toContain("WebSearch");

		const pluginJson = JSON.parse(
			await readFile(join(out, "base", "plugin.json"), "utf-8"),
		);
		expect(pluginJson.name).toBe("rp1-base");
		expect(pluginJson.description).toBe("Base workflows for Copilot");
		expect(pluginJson.skills).toBe("skills/");
		expect(pluginJson.agents).toBe("agents/");
		expect(pluginJson.hooks).toBeUndefined();

		const readme = await readFile(join(out, "base", "README.md"), "utf-8");
		expect(readme).toContain("# rp1-base");
		expect(readme).toContain("`rp1-knowledge-build`");
		expect(readme).toContain("`rp1-base-task-builder`");

		const manifest = JSON.parse(
			await readFile(join(out, "base", "manifest.json"), "utf-8"),
		);
		expect(manifest.nativePluginName).toBe("rp1-base");
		expect(manifest.installation.method).toBe("native-plugin-marketplace");
		expect(JSON.stringify(manifest)).not.toContain("github-copilot");
	});

	test("copies optional Copilot hooks and exposes them in plugin.json", async () => {
		const projectRoot = join(tempDir, "project-copilot-hooks");

		await writeFixture(
			projectRoot,
			"plugins/base/.claude-plugin/plugin.json",
			JSON.stringify({
				name: "rp1-base",
				description: "Base workflows for Copilot",
				version: "1.2.3",
			}),
		);
		await writeFixture(
			projectRoot,
			"plugins/base/skills/sample/SKILL.md",
			`---
name: sample
description: "Sample skill with enough text to pass build validation"
---

Sample skill content.
`,
		);
		await writeFixture(
			projectRoot,
			"plugins/base/hooks/copilot-hooks.json",
			JSON.stringify({
				hooks: {
					SessionStart: [{ command: "echo start" }],
				},
			}),
		);

		const out = join(outputDir, "copilot-hooks");
		const result = await buildPlatformPlugin(
			"base",
			projectRoot,
			out,
			copilotDef,
			noopLogger,
			true,
		);

		expect(result.assets.verbatimFiles.map((file) => file.path).sort()).toEqual(
			["base/README.md", "base/hooks/copilot-hooks.json", "base/plugin.json"],
		);

		const pluginJson = JSON.parse(
			await readFile(join(out, "base", "plugin.json"), "utf-8"),
		);
		expect(pluginJson.hooks).toBe("hooks/copilot-hooks.json");

		const hooksContent = JSON.parse(
			await readFile(join(out, "base", "hooks", "copilot-hooks.json"), "utf-8"),
		);
		expect(hooksContent.hooks.SessionStart[0].command).toBe("echo start");
	});
});

describe("buildPlatformPlugin (gemini)", () => {
	let tempDir: string;
	let outputDir: string;

	beforeAll(async () => {
		tempDir = await createTempDir("build-cmd-gemini");
		await assertTestIsolation(tempDir);
		outputDir = join(tempDir, "output");
	});

	afterAll(async () => {
		await cleanupTempDir(tempDir);
	});

	test("writes Gemini extension assets, command TOML, and support matrix", async () => {
		const projectRoot = join(tempDir, "project-gemini-extension");

		await writeFixture(
			projectRoot,
			"plugins/base/.claude-plugin/plugin.json",
			JSON.stringify({
				name: "rp1-base",
				description: "Base workflows for Gemini CLI",
				version: "1.2.3",
			}),
		);
		await writeFixture(
			projectRoot,
			"plugins/base/skills/knowledge-build/SKILL.md",
			`---
name: knowledge-build
description: "Build knowledge base artifacts for downstream workflows"
allowed-tools: Bash(rp1 *), Read
metadata:
  category: knowledge
  is_workflow: true
  workflow:
    run_policy: fresh
    identity_args: []
  arguments:
    - name: FEATURE_ID
      type: string
      required: false
      description: "Feature identifier"
---

Knowledge build content.
`,
		);
		await writeFixture(
			projectRoot,
			"plugins/base/agents/research-explorer.md",
			`---
name: research-explorer
description: "Explores code and docs for a research report"
tools: Read, Grep, Bash
model: inherit
---

Research explorer content.
`,
		);

		const out = join(outputDir, "gemini-extension");
		const result = await buildPlatformPlugin(
			"base",
			projectRoot,
			out,
			geminiDef,
			noopLogger,
			true,
		);

		expect(result.summary.commands).toBe(1);
		expect(result.summary.skills).toBe(1);
		expect(result.summary.agents).toBe(1);
		expect(result.assets.commands).toEqual([
			{
				name: "rp1-base:knowledge-build",
				path: "base/commands/rp1-base/knowledge-build.toml",
			},
		]);
		expect(result.assets.verbatimFiles.map((file) => file.path).sort()).toEqual(
			[
				"base/GEMINI.md",
				"base/gemini-extension.json",
				"base/support-matrix.json",
			],
		);

		const extension = JSON.parse(
			await readFile(join(out, "base", "gemini-extension.json"), "utf-8"),
		);
		expect(extension).toMatchObject({
			name: "rp1-base",
			version: "1.2.3",
			contextFileName: "GEMINI.md",
		});

		const commandToml = await readFile(
			join(out, "base", "commands", "rp1-base", "knowledge-build.toml"),
			"utf-8",
		);
		expect(commandToml).toContain("{{args}}");
		expect(commandToml).toContain("rp1-base:knowledge-build");
		const commandPrompt = (
			Bun.TOML.parse(commandToml) as { readonly prompt?: unknown }
		).prompt;
		expect(typeof commandPrompt).toBe("string");
		expect(commandPrompt).toContain(
			"Use the bundled Gemini skill `rp1-knowledge-build`",
		);
		expect(commandPrompt).not.toContain("rp1-base-knowledge-build");

		const generatedSkillNames = new Set(
			result.assets.skills
				.map((skill) => skill.name)
				.filter((name) => name.endsWith("/SKILL.md"))
				.map((name) => name.replace(/\/SKILL\.md$/, "")),
		);
		expect(generatedSkillNames.has("rp1-knowledge-build")).toBe(true);
		for (const command of result.assets.commands) {
			const parsedCommand = Bun.TOML.parse(
				await readFile(join(out, command.path), "utf-8"),
			) as { readonly prompt?: unknown };
			expect(typeof parsedCommand.prompt).toBe("string");
			const referencedSkillNames = [
				...(parsedCommand.prompt as string).matchAll(
					/Use the bundled Gemini skill `([^`]+)`/g,
				),
			].map((match) => match[1]);
			expect(referencedSkillNames.length).toBeGreaterThan(0);
			for (const skillName of referencedSkillNames) {
				expect(generatedSkillNames.has(skillName)).toBe(true);
			}
		}

		const agentContent = await readFile(
			join(out, "base", "agents", "rp1-base-research-explorer.md"),
			"utf-8",
		);
		expect(agentContent).toContain("kind: local");
		expect(agentContent).toContain("- read_file");
		expect(agentContent).toContain("- search_file_content");
		expect(agentContent).toContain("- run_shell_command");

		const context = await readFile(join(out, "base", "GEMINI.md"), "utf-8");
		expect(context).toContain("/rp1-base:knowledge-build");
		expect(context).toContain("support-matrix.json");

		const supportMatrix = JSON.parse(
			await readFile(join(out, "base", "support-matrix.json"), "utf-8"),
		);
		expect(supportMatrix.entries[0]).toMatchObject({
			workflowId: "base:knowledge-build",
			status: "supported",
		});

		const manifest = JSON.parse(
			await readFile(join(out, "base", "manifest.json"), "utf-8"),
		);
		expect(manifest.artifacts.commands).toEqual(["rp1-base:knowledge-build"]);
		expect(manifest.artifacts.supportMatrix).toBe("support-matrix.json");
	});

	test("excludes removed Gemini validation-only workflows from the dev bundle", async () => {
		const projectRoot = join(import.meta.dir, "..", "..", "..", "..");
		const out = join(outputDir, "gemini-cleanup-dev");
		const result = await buildPlatformPlugin(
			"dev",
			projectRoot,
			out,
			geminiDef,
			noopLogger,
			true,
		);

		const manifest = JSON.parse(
			await readFile(join(out, "dev", "manifest.json"), "utf-8"),
		) as {
			readonly artifacts: {
				readonly commands: readonly string[];
				readonly skills: readonly string[];
			};
		};
		const context = await readFile(join(out, "dev", "GEMINI.md"), "utf-8");
		const supportMatrix = await readFile(
			join(out, "dev", "support-matrix.json"),
			"utf-8",
		);
		const generatedAssetIndex = JSON.stringify(result.assets);

		for (const validationAsset of [
			"gemini-harness-smoke",
			"gemini-harness-subagents",
			"gemini-harness-boundaries",
		]) {
			expect(manifest.artifacts.commands.join("\n")).not.toContain(
				validationAsset,
			);
			expect(manifest.artifacts.skills.join("\n")).not.toContain(
				validationAsset,
			);
			expect(context).not.toContain(validationAsset);
			expect(supportMatrix).not.toContain(validationAsset);
			expect(generatedAssetIndex).not.toContain(validationAsset);
		}
	});
});

describe("buildPlatformPlugin (tier resolution)", () => {
	let tempDir: string;
	let outputDir: string;

	beforeAll(async () => {
		tempDir = await createTempDir("tier-resolution");
		outputDir = join(tempDir, "output");
	});

	afterAll(async () => {
		await cleanupTempDir(tempDir);
	});

	test("opencode agent with real tier omits model field (inherit)", async () => {
		const projectRoot = join(tempDir, "project-tier-resolution");
		await writeFixture(
			projectRoot,
			"plugins/base/skills/sample/SKILL.md",
			`---
name: sample
description: "Sample skill with enough text to pass build validation"
---

Sample skill content.
`,
		);
		await writeFixture(
			projectRoot,
			"plugins/base/agents/deep-agent.md",
			`---
name: deep-agent
description: "Agent with deep tier and high effort for resolution testing"
tools: Read
model: deep
effort: high
---

Deep agent content for tier resolution.
`,
		);

		const out = join(outputDir, "tier-opencode");
		const result = await buildPlatformPlugin(
			"base",
			projectRoot,
			out,
			opencodeDef,
			noopLogger,
			true,
			false,
		);

		expect(result.summary.errors).toEqual([]);
		expect(result.summary.agents).toBe(1);

		const agentPath = join(out, "base", "agents", "rp1-base-deep-agent.md");
		const agentContent = await readFile(agentPath, "utf-8");

		// OpenCode is now unmapped — model field should be omitted (inherit)
		expect(agentContent).not.toContain("model:");
		expect(agentContent).not.toContain("model: deep");
	});

	test("preserves inherit model as-is and omits effort when resolveEffort returns null", async () => {
		const projectRoot = join(tempDir, "project-tier-inherit");
		await writeFixture(
			projectRoot,
			"plugins/base/skills/sample/SKILL.md",
			`---
name: sample
description: "Sample skill with enough text to pass build validation"
---

Sample skill content.
`,
		);
		await writeFixture(
			projectRoot,
			"plugins/base/agents/inherit-agent.md",
			`---
name: inherit-agent
description: "Agent with inherit model for backward compatibility testing"
tools: Read
model: inherit
---

Inherit agent content.
`,
		);

		const out = join(outputDir, "tier-inherit");
		const result = await buildPlatformPlugin(
			"base",
			projectRoot,
			out,
			opencodeDef,
			noopLogger,
			true,
			false,
		);

		expect(result.summary.errors).toEqual([]);
		expect(result.summary.agents).toBe(1);

		const agentPath = join(out, "base", "agents", "rp1-base-inherit-agent.md");
		const agentContent = await readFile(agentPath, "utf-8");

		// Inherit model should NOT emit model field at all (backward compatible)
		expect(agentContent).not.toContain("model:");
	});

	test("Claude Code agent with deep tier emits YAML frontmatter with model and effort", async () => {
		const projectRoot = join(tempDir, "project-tier-cc");
		await writeFixture(
			projectRoot,
			"plugins/base/skills/sample/SKILL.md",
			`---
name: sample
description: "Sample skill with enough text to pass build validation"
metadata:
  category: development
  is_workflow: false
---

Sample skill content.
`,
		);
		await writeFixture(
			projectRoot,
			"plugins/base/agents/deep-agent.md",
			`---
name: deep-agent
description: "Agent with deep tier for Claude Code pipeline test"
tools: Read
model: deep
effort: high
---

Deep agent content for CC pipeline test.
`,
		);

		const out = join(outputDir, "tier-cc");
		const result = await buildPlatformPlugin(
			"base",
			projectRoot,
			out,
			claudeCodeDef,
			noopLogger,
			true,
			false,
		);

		expect(result.summary.errors).toEqual([]);
		expect(result.summary.agents).toBe(1);

		const agentPath = join(out, "base", "agents", "deep-agent.md");
		const agentContent = await readFile(agentPath, "utf-8");

		// Deep tier resolves to "opus" for Claude Code
		expect(agentContent).toContain("model: opus");
		expect(agentContent).not.toContain("model: deep");
		// Effort emitted as "effort" field for Claude Code
		expect(agentContent).toContain("effort: high");
		// Frontmatter markers present
		expect(agentContent).toContain("---");
	});

	test("Codex agent with deep tier emits model and model_reasoning_effort TOML fields", async () => {
		const projectRoot = join(tempDir, "project-tier-codex");
		await writeFixture(
			projectRoot,
			"plugins/base/skills/sample/SKILL.md",
			`---
name: sample
description: "Sample skill with enough text to pass build validation"
metadata:
  category: development
  is_workflow: false
---

Sample skill content.
`,
		);
		await writeFixture(
			projectRoot,
			"plugins/base/agents/deep-agent.md",
			`---
name: deep-agent
description: "Agent with deep tier for Codex pipeline test"
tools: Read
model: deep
effort: high
---

Deep agent content for Codex pipeline test.
`,
		);

		const out = join(outputDir, "tier-codex");
		const result = await buildPlatformPlugin(
			"base",
			projectRoot,
			out,
			codexDef,
			noopLogger,
			true,
			false,
		);

		expect(result.summary.errors).toEqual([]);
		expect(result.summary.agents).toBe(1);

		const agentPath = join(out, "base", "agents", "rp1-base-deep-agent.toml");
		const agentContent = await readFile(agentPath, "utf-8");

		// Deep tier resolves to "gpt-5.5" for Codex
		expect(agentContent).toContain('model = "gpt-5.5"');
		expect(agentContent).not.toContain('model = "deep"');
		// Effort emitted as "model_reasoning_effort" for Codex
		expect(agentContent).toContain('model_reasoning_effort = "high"');
	});

	test("fast tier agent omits effort across all platforms", async () => {
		const projectRoot = join(tempDir, "project-tier-fast");
		await writeFixture(
			projectRoot,
			"plugins/base/skills/sample/SKILL.md",
			`---
name: sample
description: "Sample skill with enough text to pass build validation"
metadata:
  category: development
  is_workflow: false
---

Sample skill content.
`,
		);
		await writeFixture(
			projectRoot,
			"plugins/base/agents/fast-agent.md",
			`---
name: fast-agent
description: "Agent with fast tier for omission testing"
tools: Read
model: fast
---

Fast agent content.
`,
		);

		// Claude Code
		const outCC = join(outputDir, "tier-fast-cc");
		const ccResult = await buildPlatformPlugin(
			"base",
			projectRoot,
			outCC,
			claudeCodeDef,
			noopLogger,
			true,
			false,
		);
		expect(ccResult.summary.errors).toEqual([]);
		const ccContent = await readFile(
			join(outCC, "base", "agents", "fast-agent.md"),
			"utf-8",
		);
		expect(ccContent).toContain("model: haiku");
		expect(ccContent).not.toContain("effort:");

		// Codex
		const outCdx = join(outputDir, "tier-fast-codex");
		const cdxResult = await buildPlatformPlugin(
			"base",
			projectRoot,
			outCdx,
			codexDef,
			noopLogger,
			true,
			false,
		);
		expect(cdxResult.summary.errors).toEqual([]);
		const cdxContent = await readFile(
			join(outCdx, "base", "agents", "rp1-base-fast-agent.toml"),
			"utf-8",
		);
		expect(cdxContent).toContain('model = "gpt-5.4-mini"');
		expect(cdxContent).not.toContain("model_reasoning_effort");
	});
});

describe("ParseCache", () => {
	let tempDir: string;
	let outputDir: string;

	beforeAll(async () => {
		tempDir = await createTempDir("build-parse-cache");
		await assertTestIsolation(tempDir);
		outputDir = join(tempDir, "output");
	});

	afterAll(async () => {
		await cleanupTempDir(tempDir);
	});

	test("parses each source file exactly once across multiple platform builds", async () => {
		const projectRoot = join(tempDir, "project-cache-dedup");

		await writeFixture(
			projectRoot,
			"plugins/base/.claude-plugin/plugin.json",
			JSON.stringify({ version: "1.0.0" }),
		);
		await writeFixture(
			projectRoot,
			"plugins/base/skills/cached-skill/SKILL.md",
			`---
name: cached-skill
description: "Skill to verify parse cache deduplication across platforms"
metadata:
  category: development
  is_workflow: false
---

Cached skill content.
`,
		);
		await writeFixture(
			projectRoot,
			"plugins/base/agents/cached-agent.md",
			`---
name: cached-agent
description: "Agent to verify parse cache deduplication"
tools: Read
model: inherit
---

Cached agent content.
`,
		);

		const cache = new ParseCache();
		const opencodeOut = join(outputDir, "cache-opencode");
		const claudeOut = join(outputDir, "cache-claude");

		const result1 = await buildPlatformPlugin(
			"base",
			projectRoot,
			opencodeOut,
			opencodeDef,
			noopLogger,
			true,
			false,
			cache,
		);

		const result2 = await buildPlatformPlugin(
			"base",
			projectRoot,
			claudeOut,
			claudeCodeDef,
			noopLogger,
			true,
			false,
			cache,
		);

		expect(result1.summary.skills).toBe(1);
		expect(result1.summary.agents).toBe(1);
		expect(result2.summary.errors).toEqual([]);
		expect(result2.summary.skills).toBe(1);
		expect(result2.summary.agents).toBe(1);

		// Verify the cache returns the same object identity on
		// subsequent calls -- proving it was parsed once and reused.
		const skillDir = join(
			projectRoot,
			"plugins",
			"base",
			"skills",
			"cached-skill",
		);
		const agentPath = join(
			projectRoot,
			"plugins",
			"base",
			"agents",
			"cached-agent.md",
		);
		const skillResult1 = await cache.getSkill(skillDir);
		const skillResult2 = await cache.getSkill(skillDir);
		const agentResult1 = await cache.getAgent(agentPath);
		const agentResult2 = await cache.getAgent(agentPath);
		expect(skillResult1).toBe(skillResult2);
		expect(agentResult1).toBe(agentResult2);
	});
});

describe("executeBuild", () => {
	let tempDir: string;
	let originalCwd: string;
	const originalLog = console.log;
	let logs: string[];

	beforeAll(async () => {
		tempDir = await createTempDir("build-execute");
		await assertTestIsolation(tempDir);
		originalCwd = process.cwd();
		logs = [];
		console.log = (...args: unknown[]) => {
			logs.push(args.map(String).join(" "));
		};
	});

	afterAll(async () => {
		process.chdir(originalCwd);
		console.log = originalLog;
		await cleanupTempDir(tempDir);
	});

	test("builds all distributable plugins across platforms and emits JSON summary", async () => {
		const projectRoot = join(tempDir, "project-all-platforms");
		const outputDir = "dist/opencode";

		for (const plugin of ["base", "dev"] as const) {
			await writeFixture(
				projectRoot,
				`plugins/${plugin}/.claude-plugin/plugin.json`,
				JSON.stringify({
					name: `rp1-${plugin}`,
					description: `${plugin} plugin used by executeBuild coverage`,
					version: "1.0.0",
				}),
			);
			await writeFixture(
				projectRoot,
				`plugins/${plugin}/skills/${plugin}-sample/SKILL.md`,
				`---
name: ${plugin}-sample
description: "${plugin} sample skill with enough description text for validation"
metadata:
  category: development
  is_workflow: false
---

${plugin} sample content.
`,
			);
		}

		process.chdir(projectRoot);
		logs = [];

		const result = await executeBuild(
			[
				"--platform",
				"all",
				"--plugin",
				"all",
				"--output-dir",
				outputDir,
				"--json",
			],
			noopLogger,
		)();

		expectRight(result);
		const summary = JSON.parse(logs.at(-1) ?? "{}") as {
			status: string;
			skills: number;
			errors: string[];
		};
		expect(summary.status).toBe("success");
		expect(summary.skills).toBeGreaterThanOrEqual(10);
		expect(summary.errors).toEqual([]);

		const bundleManifest = JSON.parse(
			await readFile(
				join(projectRoot, "dist", "opencode", "bundle-manifest.json"),
				"utf-8",
			),
		);
		expect(bundleManifest.plugins.base).toBeDefined();
		expect(bundleManifest.plugins.dev).toBeDefined();

		const antigravityBundleManifest = JSON.parse(
			await readFile(
				join(projectRoot, "dist", "antigravity", "bundle-manifest.json"),
				"utf-8",
			),
		);
		expect(antigravityBundleManifest.platform.icon).toEqual({
			source: "@lobehub/icons",
			name: "Antigravity",
			variant: "mono",
		});
		expect(antigravityBundleManifest.platform).toMatchObject({
			id: "antigravity",
			name: "Antigravity CLI",
			binary: "agy",
		});
		expect(antigravityBundleManifest.plugins.base).toBeDefined();
		expect(antigravityBundleManifest.plugins.dev).toBeDefined();
	});

	test("parallel multi-platform build produces identical skill/agent counts to serial baseline", async () => {
		const projectRoot = join(tempDir, "project-parallel-parity");
		const outputDir = "dist/opencode";

		for (const plugin of ["base", "dev"] as const) {
			await writeFixture(
				projectRoot,
				`plugins/${plugin}/.claude-plugin/plugin.json`,
				JSON.stringify({
					name: `rp1-${plugin}`,
					description: `${plugin} plugin for parallel parity test`,
					version: "1.0.0",
				}),
			);
			await writeFixture(
				projectRoot,
				`plugins/${plugin}/skills/${plugin}-parity/SKILL.md`,
				`---
name: ${plugin}-parity
description: "${plugin} parity skill with enough description text for validation"
metadata:
  category: development
  is_workflow: false
---

${plugin} parity content.
`,
			);
		}

		// Build single platforms serially to get baseline counts
		process.chdir(projectRoot);
		logs = [];

		let baselineSkills = 0;
		let baselineAgents = 0;
		for (const platform of ["opencode", "claude-code"] as const) {
			logs = [];
			const singleResult = await executeBuild(
				[
					"--platform",
					platform,
					"--plugin",
					"all",
					"--output-dir",
					outputDir,
					"--json",
				],
				noopLogger,
			)();
			expectRight(singleResult);
			const singleSummary = JSON.parse(logs.at(-1) ?? "{}") as {
				skills: number;
				agents: number;
			};
			baselineSkills += singleSummary.skills;
			baselineAgents += singleSummary.agents;
		}

		// Build all platforms (parallel path)
		logs = [];
		const parallelResult = await executeBuild(
			[
				"--platform",
				"all",
				"--plugin",
				"all",
				"--output-dir",
				outputDir,
				"--json",
			],
			noopLogger,
		)();

		expectRight(parallelResult);
		const parallelSummary = JSON.parse(logs.at(-1) ?? "{}") as {
			status: string;
			skills: number;
			agents: number;
			errors: string[];
		};

		// The parallel all-platform build includes more platforms than the
		// two we summed above, so its totals must be >= the serial baseline.
		expect(parallelSummary.skills).toBeGreaterThanOrEqual(baselineSkills);
		expect(parallelSummary.agents).toBeGreaterThanOrEqual(baselineAgents);
		expect(parallelSummary.errors).toEqual([]);
		expect(parallelSummary.status).toBe("success");
	});
});
