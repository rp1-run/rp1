/**
 * Unit tests for the build orchestrator (command.ts).
 * Validates dual-source strategy: skills preferred, commands fallback with deduplication.
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

		// Set up a "dev" plugin with skills/ and commands/
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
		await writeFixture(
			projectRoot,
			"plugins/dev/commands/code-check.md",
			`---
name: code-check
version: 1.0.0
description: Fast hygiene validation
author: test
created: 2026-01-01
tags:
  - code
---

Code check command content.
`,
		);

		const out = join(outputDir, "dev-skills");
		const result = await buildPlugin("dev", projectRoot, out, noopLogger, true);

		expect(result.summary.skills).toBeGreaterThanOrEqual(1);
		expect(
			result.assets.skills.some((s) => s.name === "worktree-workflow"),
		).toBe(true);
		expect(result.summary.commands).toBeGreaterThanOrEqual(1);
		expect(result.assets.commands.some((c) => c.name === "code-check")).toBe(
			true,
		);
	});

	test("deduplicates: skill wins when skill and command share the same name", async () => {
		const projectRoot = join(tempDir, "project-dedup");

		await writeFixture(
			projectRoot,
			"plugins/base/.claude-plugin/plugin.json",
			JSON.stringify({ version: "1.0.0" }),
		);

		// Create a skill named "knowledge-load"
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

		// Create a command also named "knowledge-load"
		await writeFixture(
			projectRoot,
			"plugins/base/commands/knowledge-load.md",
			`---
name: knowledge-load
version: 1.0.0
description: Load knowledge base context
author: test
created: 2026-01-01
tags:
  - kb
---

Command version of knowledge-load content.
`,
		);

		const out = join(outputDir, "dedup");
		const result = await buildPlugin(
			"base",
			projectRoot,
			out,
			noopLogger,
			true,
		);

		// Skill should be present
		expect(result.assets.skills.some((s) => s.name === "knowledge-load")).toBe(
			true,
		);

		// Command should NOT be present (deduplicated by skill)
		expect(
			result.assets.commands.some((c) => c.name === "knowledge-load"),
		).toBe(false);

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

	test("falls back to command when no matching skill exists", async () => {
		const projectRoot = join(tempDir, "project-fallback");

		await writeFixture(
			projectRoot,
			"plugins/base/.claude-plugin/plugin.json",
			JSON.stringify({ version: "1.0.0" }),
		);

		// Only a command, no skill with this name
		await writeFixture(
			projectRoot,
			"plugins/base/commands/strategize.md",
			`---
name: strategize
version: 1.0.0
description: Holistic system analysis
author: test
created: 2026-01-01
tags:
  - strategy
---

Strategize command content.
`,
		);

		const out = join(outputDir, "fallback");
		const result = await buildPlugin(
			"base",
			projectRoot,
			out,
			noopLogger,
			true,
		);

		// Command should be present since no skill exists
		expect(result.assets.commands.some((c) => c.name === "strategize")).toBe(
			true,
		);
		expect(result.summary.commands).toBe(1);
		expect(result.summary.skills).toBe(0);

		// Verify the command output file exists
		const cmdOutputPath = join(
			out,
			"base",
			"command",
			"rp1-base",
			"strategize.md",
		);
		const cmdContent = await readFile(cmdOutputPath, "utf-8");
		expect(cmdContent).toContain("Holistic system analysis");
	});

	test("manifest reflects accurate skill and command counts during transition", async () => {
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

		// One command that overlaps with skill-a (should be deduped)
		await writeFixture(
			projectRoot,
			"plugins/base/commands/skill-a.md",
			`---
name: skill-a
version: 1.0.0
description: Command version of skill A
author: test
created: 2026-01-01
---

This should be skipped.
`,
		);

		// One command that does not overlap (should be kept)
		await writeFixture(
			projectRoot,
			"plugins/base/commands/cmd-only.md",
			`---
name: cmd-only
version: 1.0.0
description: A command-only artifact
author: test
created: 2026-01-01
---

Command only content.
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

		// 2 skills (skill-a, skill-b)
		expect(result.summary.skills).toBe(2);
		// 1 command (cmd-only; skill-a command was deduped)
		expect(result.summary.commands).toBe(1);

		// Verify manifest file was written with correct counts
		const manifestPath = join(out, "base", "manifest.json");
		const manifestContent = JSON.parse(await readFile(manifestPath, "utf-8"));
		expect(manifestContent.artifacts.skills).toEqual(["skill-a", "skill-b"]);
		expect(manifestContent.artifacts.commands).toEqual(["cmd-only"]);
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
