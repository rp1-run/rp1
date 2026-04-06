import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, readdir, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
	backupCopilotInstallation,
	copyCopilotAgents,
	copyCopilotSkills,
	uninstallCopilot,
	validateCopilotArtifacts,
} from "../../../install/copilot/installer.js";
import type { CopilotPaths } from "../../../install/copilot/models.js";
import {
	cleanupTempDir,
	createTempDir,
	expectTaskLeft,
	expectTaskRight,
	getErrorMessage,
	writeFixture,
} from "../../helpers/index.js";

describe("copilot installer", () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await createTempDir("copilot-installer-test");
	});

	afterEach(async () => {
		await cleanupTempDir(tempDir);
	});

	describe("validateCopilotArtifacts", () => {
		test("succeeds when all artifacts exist", async () => {
			const artifactsDir = join(tempDir, "artifacts");
			await writeFixture(
				join(artifactsDir, "base"),
				"skills/rp1-build/SKILL.md",
				"skill content",
			);
			await writeFixture(
				join(artifactsDir, "base"),
				"agents/rp1-base-task-builder.md",
				"agent content",
			);
			await writeFixture(
				join(artifactsDir, "dev"),
				"skills/rp1-review/SKILL.md",
				"skill content",
			);
			await writeFixture(
				join(artifactsDir, "dev"),
				"agents/rp1-dev-task-reviewer.md",
				"agent content",
			);

			const result = await expectTaskRight(
				validateCopilotArtifacts(artifactsDir),
			);
			expect(result).toHaveLength(2);
		});

		test("fails when plugin directory missing", async () => {
			const artifactsDir = join(tempDir, "artifacts");
			await mkdir(artifactsDir, { recursive: true });

			const error = await expectTaskLeft(
				validateCopilotArtifacts(artifactsDir),
			);
			expect(getErrorMessage(error)).toContain("not found");
			expect((error as { suggestion?: string }).suggestion).toContain(
				"rp1 build",
			);
		});

		test("fails when skills directory missing", async () => {
			const artifactsDir = join(tempDir, "artifacts");
			await writeFixture(
				join(artifactsDir, "base"),
				"agents/rp1-base-agent.md",
				"agent content",
			);

			const error = await expectTaskLeft(
				validateCopilotArtifacts(artifactsDir),
			);
			expect(getErrorMessage(error)).toContain("Skills directory not found");
		});
	});

	describe("copyCopilotSkills", () => {
		test("copies rp1- prefixed skill directories", async () => {
			const pluginDir = join(tempDir, "artifacts", "base");
			await writeFixture(pluginDir, "skills/rp1-build/SKILL.md", "build skill");
			await writeFixture(
				pluginDir,
				"skills/rp1-review/SKILL.md",
				"review skill",
			);

			const targetDir = join(tempDir, "target", "skills");
			const result = await expectTaskRight(
				copyCopilotSkills([pluginDir], targetDir),
			);

			expect(result).toBe(2);

			const entries = await readdir(targetDir);
			expect(entries).toContain("rp1-build");
			expect(entries).toContain("rp1-review");
		});

		test("skips non-rp1 directories", async () => {
			const pluginDir = join(tempDir, "artifacts", "base");
			await writeFixture(pluginDir, "skills/rp1-build/SKILL.md", "build skill");
			await writeFixture(
				pluginDir,
				"skills/other-skill/SKILL.md",
				"other skill",
			);

			const targetDir = join(tempDir, "target", "skills");
			await expectTaskRight(copyCopilotSkills([pluginDir], targetDir));

			const entries = await readdir(targetDir);
			expect(entries).toContain("rp1-build");
			expect(entries).not.toContain("other-skill");
		});
	});

	describe("copyCopilotAgents", () => {
		test("copies markdown agent files", async () => {
			const pluginDir = join(tempDir, "artifacts", "base");
			await writeFixture(
				pluginDir,
				"agents/rp1-base-task-builder.md",
				"agent content",
			);
			await writeFixture(
				pluginDir,
				"agents/rp1-base-task-reviewer.md",
				"agent content",
			);

			const targetDir = join(tempDir, "target", "agents");
			const result = await expectTaskRight(
				copyCopilotAgents([pluginDir], targetDir),
			);

			expect(result).toBe(2);

			const entries = await readdir(targetDir);
			expect(entries).toContain("rp1-base-task-builder.md");
			expect(entries).toContain("rp1-base-task-reviewer.md");
		});

		test("skips directories in agents source", async () => {
			const pluginDir = join(tempDir, "artifacts", "base");
			await writeFixture(
				pluginDir,
				"agents/rp1-base-agent.md",
				"agent content",
			);
			await mkdir(join(pluginDir, "agents", "subdir"), { recursive: true });
			await writeFile(
				join(pluginDir, "agents", "subdir", "nested.md"),
				"nested",
			);

			const targetDir = join(tempDir, "target", "agents");
			const result = await expectTaskRight(
				copyCopilotAgents([pluginDir], targetDir),
			);

			expect(result).toBe(1);
		});
	});

	describe("backupCopilotInstallation", () => {
		test("returns null when no rp1 content exists", async () => {
			const paths: CopilotPaths = {
				skillsDir: join(tempDir, "skills"),
				agentsDir: join(tempDir, "agents"),
				configDir: join(tempDir, "config"),
				backupDir: join(tempDir, "backups"),
			};

			await mkdir(paths.skillsDir, { recursive: true });
			await mkdir(paths.agentsDir, { recursive: true });

			const result = await expectTaskRight(backupCopilotInstallation(paths));
			expect(result).toBeNull();
		});

		test("backs up existing rp1 skills and agents", async () => {
			const paths: CopilotPaths = {
				skillsDir: join(tempDir, "skills"),
				agentsDir: join(tempDir, "agents"),
				configDir: join(tempDir, "config"),
				backupDir: join(tempDir, "backups"),
			};

			await writeFixture(paths.skillsDir, "rp1-build/SKILL.md", "build skill");
			await writeFixture(paths.agentsDir, "rp1-base-agent.md", "agent content");

			const result = await expectTaskRight(backupCopilotInstallation(paths));
			expect(result).not.toBeNull();
			expect(result).toContain("backups");

			const backupStat = await stat(result!);
			expect(backupStat.isDirectory()).toBe(true);
		});
	});

	describe("uninstallCopilot", () => {
		test("removes rp1-* skill directories and rp1 agent files", async () => {
			const paths: CopilotPaths = {
				skillsDir: join(tempDir, "skills"),
				agentsDir: join(tempDir, "agents"),
				configDir: join(tempDir, "config"),
				backupDir: join(tempDir, "backups"),
			};

			await writeFixture(paths.skillsDir, "rp1-build/SKILL.md", "build skill");
			await writeFixture(
				paths.skillsDir,
				"other-skill/SKILL.md",
				"other skill",
			);
			await writeFixture(paths.agentsDir, "rp1-base-agent.md", "agent");

			const result = await expectTaskRight(uninstallCopilot(paths, false));

			expect(result.skillsRemoved).toBe(1);
			expect(result.agentsRemoved).toBe(true);

			const remaining = await readdir(paths.skillsDir);
			expect(remaining).toContain("other-skill");
			expect(remaining).not.toContain("rp1-build");
		});

		test("dry run does not modify files", async () => {
			const paths: CopilotPaths = {
				skillsDir: join(tempDir, "skills"),
				agentsDir: join(tempDir, "agents"),
				configDir: join(tempDir, "config"),
				backupDir: join(tempDir, "backups"),
			};

			await writeFixture(paths.skillsDir, "rp1-build/SKILL.md", "build skill");

			const result = await expectTaskRight(uninstallCopilot(paths, true));

			expect(result.skillsRemoved).toBe(0);
			expect(result.agentsRemoved).toBe(false);

			const entries = await readdir(paths.skillsDir);
			expect(entries).toContain("rp1-build");
		});
	});
});
