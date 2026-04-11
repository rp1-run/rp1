/**
 * Unit tests for the build orchestrator (command.ts).
 * Validates skills-only processing pipeline.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Logger } from "../../../shared/logger.js";
import { buildPlatformPlugin } from "../../build/command.js";
import { PLATFORM_DEFINITIONS } from "../../build/platform-definitions.js";
import {
	assertTestIsolation,
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

const opencodeDef = PLATFORM_DEFINITIONS.get("opencode")!;
const claudeCodeDef = PLATFORM_DEFINITIONS.get("claude-code")!;
const codexDef = PLATFORM_DEFINITIONS.get("codex")!;

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

		// Set up a "dev" plugin with skills/
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

		// Verify the skill output file exists (namespaced with rp1- prefix)
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

		// Two skills
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

		// 2 skills
		expect(result.summary.skills).toBe(2);
		// 0 commands (no command fallback)
		expect(result.summary.commands).toBe(0);

		// Verify manifest file was written with correct counts
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
