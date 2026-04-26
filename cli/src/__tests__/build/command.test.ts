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
	executeBuild,
	parseBuildArgs,
} from "../../build/command.js";
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

const extractBootstrapTarget = (
	content: string,
): { readonly name: string; readonly schemaPath: string } => {
	const nameMatch = content.match(/--name\s+([^\s\\]+)/);
	const schemaPathMatch = content.match(/--schema-path\s+([^\s\\]+)/);

	if (!nameMatch?.[1] || !schemaPathMatch?.[1]) {
		throw new Error("Missing generated workflow bootstrap target");
	}

	return {
		name: nameMatch[1],
		schemaPath: schemaPathMatch[1],
	};
};

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

		const expectedTarget = {
			name: "build-fast",
			schemaPath: "plugins/dev/skills/build-fast/SKILL.md",
		};

		expect(extractBootstrapTarget(opencodeSkill)).toEqual(expectedTarget);
		expect(extractBootstrapTarget(codexSkill)).toEqual(expectedTarget);
		expect(extractBootstrapTarget(claudeSkill)).toEqual(expectedTarget);
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
		expect(summary.skills).toBeGreaterThanOrEqual(8);
		expect(summary.errors).toEqual([]);

		const bundleManifest = JSON.parse(
			await readFile(
				join(projectRoot, "dist", "opencode", "bundle-manifest.json"),
				"utf-8",
			),
		);
		expect(bundleManifest.plugins.base).toBeDefined();
		expect(bundleManifest.plugins.dev).toBeDefined();
	});
});
