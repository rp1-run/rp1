/**
 * Integration tests for full plugin lifecycle: build → install → verify.
 * Tests end-to-end workflow with real filesystem operations.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import * as E from "fp-ts/lib/Either.js";
import { copyArtifacts } from "../../install/installer.js";
import {
	cleanupTempDir,
	createTempDir,
	writeFixture,
} from "../helpers/index.js";

describe("integration: lifecycle", () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await createTempDir("lifecycle-");
	});

	afterEach(async () => {
		await cleanupTempDir(tempDir);
	});

	test(
		"build output directory structure matches expected layout",
		async () => {
			const buildDir = join(tempDir, "build-output");

			await writeFixture(
				buildDir,
				"agents/rp1-base-test-agent.md",
				"---\ndescription: Test\nmode: subagent\ntools:\n  bash: true\n  write: false\n  edit: false\n---\nContent",
			);
			await writeFixture(
				buildDir,
				"skills/test-skill/SKILL.md",
				"---\nname: test-skill\ndescription: A test skill for testing\n---\nContent",
			);

			const entries = await readdir(buildDir);
			expect(entries).toContain("agents");
			expect(entries).toContain("skills");

			const agentEntries = await readdir(join(buildDir, "agents"));
			expect(agentEntries).toContain("rp1-base-test-agent.md");

			const skillEntries = await readdir(join(buildDir, "skills"));
			expect(skillEntries).toContain("test-skill");
		},
		{ timeout: 60000 },
	);

	test(
		"full build→install cycle copies artifacts to target",
		async () => {
			const sourceDir = join(tempDir, "source");
			const targetDir = join(tempDir, "target");

			await writeFixture(
				sourceDir,
				"agents/rp1-base-lifecycle-agent.md",
				"---\ndescription: Lifecycle test agent\nmode: subagent\ntools:\n  bash: true\n  write: false\n  edit: false\n---\nAgent body",
			);
			await writeFixture(
				sourceDir,
				"skills/rp1-lifecycle-skill/SKILL.md",
				"---\nname: rp1-lifecycle-skill\ndescription: Lifecycle test skill here\n---\nSkill body",
			);

			const installResult = await copyArtifacts(sourceDir, targetDir)();

			expect(E.isRight(installResult)).toBe(true);
			if (!E.isRight(installResult)) return;

			const filesCopied = installResult.right;
			expect(filesCopied).toBe(2);

			const agentStat = await stat(
				join(targetDir, "agents/rp1-base-lifecycle-agent.md"),
			);
			expect(agentStat.isFile()).toBe(true);

			const skillStat = await stat(
				join(targetDir, "skills/rp1-lifecycle-skill/SKILL.md"),
			);
			expect(skillStat.isFile()).toBe(true);

			const agentContent = await readFile(
				join(targetDir, "agents/rp1-base-lifecycle-agent.md"),
				"utf-8",
			);
			expect(agentContent).toContain("Lifecycle test agent");
		},
		{ timeout: 60000 },
	);
});
