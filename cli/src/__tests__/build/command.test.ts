/**
 * Unit tests for the build orchestrator (command.ts).
 * Validates skills-only processing pipeline.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Logger } from "../../../shared/logger.js";
import { buildPlugin } from "../../build/command.js";
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

describe("buildPlugin", () => {
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
			"plugins/dev/skills/worktree-workflow/SKILL.md",
			`---
name: worktree-workflow
description: "Manages git worktree workflows for parallel development branches"
---

Worktree workflow skill content.
`,
		);

		const out = join(outputDir, "dev-skills");
		const result = await buildPlugin("dev", projectRoot, out, noopLogger, true);

		expect(result.summary.skills).toBeGreaterThanOrEqual(1);
		expect(
			result.assets.skills.some((s) => s.name === "worktree-workflow"),
		).toBe(true);
	});

	test("skills produce output in skill/{name}/ directory", async () => {
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
		const result = await buildPlugin(
			"base",
			projectRoot,
			out,
			noopLogger,
			true,
		);

		expect(result.assets.skills.some((s) => s.name === "knowledge-load")).toBe(
			true,
		);
		expect(result.summary.skills).toBe(1);
		expect(result.summary.commands).toBe(0);

		// Verify the skill output file exists
		const skillOutputPath = join(
			out,
			"base",
			"skill",
			"knowledge-load",
			"SKILL.md",
		);
		const skillContent = await readFile(skillOutputPath, "utf-8");
		expect(skillContent).toContain("knowledge-load");
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
		const result = await buildPlugin(
			"base",
			projectRoot,
			out,
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
		expect(manifestContent.artifacts.skills).toEqual(["skill-a", "skill-b"]);
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
		const result = await buildPlugin(
			"utils",
			projectRoot,
			out,
			noopLogger,
			true,
		);

		expect(result.summary.skills).toBe(1);
		expect(result.assets.skills.some((s) => s.name === "prompt-writer")).toBe(
			true,
		);
	});
});
