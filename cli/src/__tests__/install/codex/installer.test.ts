import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";

import {
	backupCodexInstallation,
	copyCodexAgents,
	copyCodexSkills,
	uninstallCodex,
	validateCodexArtifacts,
} from "../../../install/codex/installer.js";
import type { CodexPaths } from "../../../install/codex/models.js";
import {
	cleanupTempDir,
	createTempDir,
	expectTaskLeft,
	expectTaskRight,
	getErrorMessage,
	writeFixture,
} from "../../helpers/index.js";

describe("codex installer", () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await createTempDir("codex-installer-test");
	});

	afterEach(async () => {
		await cleanupTempDir(tempDir);
	});

	describe("validateCodexArtifacts", () => {
		test("succeeds when all artifacts exist", async () => {
			const artifactsDir = join(tempDir, "artifacts");
			await writeFixture(
				join(artifactsDir, "base"),
				"skills/rp1-build/SKILL.md",
				"skill content",
			);
			await writeFixture(
				join(artifactsDir, "base"),
				"agents/task-builder.toml",
				'model = "o4-mini"',
			);
			await writeFixture(
				join(artifactsDir, "dev"),
				"skills/rp1-review/SKILL.md",
				"skill content",
			);
			await writeFixture(
				join(artifactsDir, "dev"),
				"agents/task-reviewer.toml",
				'model = "o4-mini"',
			);

			const result = await expectTaskRight(
				validateCodexArtifacts(artifactsDir),
			);
			expect(result).toHaveLength(2);
		});

		test("fails when plugin directory missing", async () => {
			const artifactsDir = join(tempDir, "artifacts");
			await mkdir(artifactsDir, { recursive: true });

			const error = await expectTaskLeft(validateCodexArtifacts(artifactsDir));
			expect(getErrorMessage(error)).toContain("not found");
			expect((error as { suggestion?: string }).suggestion).toContain(
				"rp1 build",
			);
		});

		test("fails when skills directory missing", async () => {
			const artifactsDir = join(tempDir, "artifacts");
			await writeFixture(
				join(artifactsDir, "base"),
				"agents/task-builder.toml",
				'model = "o4-mini"',
			);
			await writeFixture(
				join(artifactsDir, "dev"),
				"skills/rp1-review/SKILL.md",
				"content",
			);
			await writeFixture(
				join(artifactsDir, "dev"),
				"agents/task-reviewer.toml",
				'model = "o4-mini"',
			);

			const error = await expectTaskLeft(validateCodexArtifacts(artifactsDir));
			expect(getErrorMessage(error)).toContain("Skills directory not found");
		});

		test("fails when agents directory missing", async () => {
			const artifactsDir = join(tempDir, "artifacts");
			await writeFixture(
				join(artifactsDir, "base"),
				"skills/rp1-build/SKILL.md",
				"content",
			);
			await writeFixture(
				join(artifactsDir, "dev"),
				"skills/rp1-review/SKILL.md",
				"content",
			);
			await writeFixture(
				join(artifactsDir, "dev"),
				"agents/task-reviewer.toml",
				'model = "o4-mini"',
			);

			const error = await expectTaskLeft(validateCodexArtifacts(artifactsDir));
			expect(getErrorMessage(error)).toContain("Agents directory not found");
		});
	});

	describe("backupCodexInstallation", () => {
		test("returns null when no existing installation", async () => {
			const paths: CodexPaths = {
				skillsDir: join(tempDir, "skills"),
				configDir: join(tempDir, "codex"),
				configFile: join(tempDir, "codex", "config.toml"),
				backupDir: join(tempDir, "backups"),
				agentsDir: join(tempDir, "codex", "agents", "rp1"),
			};

			const result = await expectTaskRight(backupCodexInstallation(paths));
			expect(result).toBeNull();
		});

		test("creates backup when config.toml exists", async () => {
			const paths: CodexPaths = {
				skillsDir: join(tempDir, "skills"),
				configDir: join(tempDir, "codex"),
				configFile: join(tempDir, "codex", "config.toml"),
				backupDir: join(tempDir, "backups"),
				agentsDir: join(tempDir, "codex", "agents", "rp1"),
			};

			await writeFixture(tempDir, "codex/config.toml", "existing config");

			const result = await expectTaskRight(backupCodexInstallation(paths));
			expect(result).not.toBeNull();
			expect(result).toContain("backup_");

			const backupPath = result as string;
			const backupConfig = await readFile(
				join(backupPath, "config", "config.toml"),
				"utf-8",
			);
			expect(backupConfig).toBe("existing config");
		});

		test("creates backup when rp1 skill dirs exist", async () => {
			const paths: CodexPaths = {
				skillsDir: join(tempDir, "skills"),
				configDir: join(tempDir, "codex"),
				configFile: join(tempDir, "codex", "config.toml"),
				backupDir: join(tempDir, "backups"),
				agentsDir: join(tempDir, "codex", "agents", "rp1"),
			};

			await writeFixture(
				join(tempDir, "skills"),
				"rp1-build/SKILL.md",
				"skill content",
			);

			const result = await expectTaskRight(backupCodexInstallation(paths));
			expect(result).not.toBeNull();

			const backupPath = result as string;
			const backedUpSkill = await readFile(
				join(backupPath, "skills", "rp1-build", "SKILL.md"),
				"utf-8",
			);
			expect(backedUpSkill).toBe("skill content");
		});

		test("backup includes manifest.json", async () => {
			const paths: CodexPaths = {
				skillsDir: join(tempDir, "skills"),
				configDir: join(tempDir, "codex"),
				configFile: join(tempDir, "codex", "config.toml"),
				backupDir: join(tempDir, "backups"),
				agentsDir: join(tempDir, "codex", "agents", "rp1"),
			};

			await writeFixture(tempDir, "codex/config.toml", "content");

			const result = await expectTaskRight(backupCodexInstallation(paths));
			const backupPath = result as string;
			const manifest = JSON.parse(
				await readFile(join(backupPath, "manifest.json"), "utf-8"),
			);
			expect(manifest).toHaveProperty("timestamp");
			expect(manifest).toHaveProperty("backupPath");
		});
	});

	describe("copyCodexSkills", () => {
		test("copies rp1 skill directories to target", async () => {
			const pluginDir = join(tempDir, "artifacts", "base");
			const targetDir = join(tempDir, "skills");

			await writeFixture(pluginDir, "skills/rp1-build/SKILL.md", "build skill");
			await writeFixture(
				pluginDir,
				"skills/rp1-build/agents/openai.yaml",
				"agent def",
			);

			const result = await expectTaskRight(
				copyCodexSkills([pluginDir], targetDir),
			);
			expect(result).toBeGreaterThan(0);

			const skillContent = await readFile(
				join(targetDir, "rp1-build", "SKILL.md"),
				"utf-8",
			);
			expect(skillContent).toBe("build skill");

			const agentContent = await readFile(
				join(targetDir, "rp1-build", "agents", "openai.yaml"),
				"utf-8",
			);
			expect(agentContent).toBe("agent def");
		});

		test("overwrites existing rp1 skill directories", async () => {
			const pluginDir = join(tempDir, "artifacts", "base");
			const targetDir = join(tempDir, "skills");

			await writeFixture(join(targetDir), "rp1-build/SKILL.md", "old content");
			await writeFixture(pluginDir, "skills/rp1-build/SKILL.md", "new content");

			await expectTaskRight(copyCodexSkills([pluginDir], targetDir));

			const content = await readFile(
				join(targetDir, "rp1-build", "SKILL.md"),
				"utf-8",
			);
			expect(content).toBe("new content");
		});

		test("preserves non-rp1 skill directories", async () => {
			const pluginDir = join(tempDir, "artifacts", "base");
			const targetDir = join(tempDir, "skills");

			await writeFixture(
				join(targetDir),
				"user-skill/SKILL.md",
				"user content",
			);
			await writeFixture(pluginDir, "skills/rp1-build/SKILL.md", "rp1 content");

			await expectTaskRight(copyCodexSkills([pluginDir], targetDir));

			const userContent = await readFile(
				join(targetDir, "user-skill", "SKILL.md"),
				"utf-8",
			);
			expect(userContent).toBe("user content");
		});

		test("skips non-rp1 prefixed directories in artifacts", async () => {
			const pluginDir = join(tempDir, "artifacts", "base");
			const targetDir = join(tempDir, "skills");

			await writeFixture(pluginDir, "skills/rp1-build/SKILL.md", "rp1 content");
			await writeFixture(
				pluginDir,
				"skills/other-skill/SKILL.md",
				"other content",
			);

			await expectTaskRight(copyCodexSkills([pluginDir], targetDir));

			const entries = await readdir(targetDir);
			expect(entries).toContain("rp1-build");
			expect(entries).not.toContain("other-skill");
		});

		test("handles multiple plugin directories", async () => {
			const baseDir = join(tempDir, "artifacts", "base");
			const devDir = join(tempDir, "artifacts", "dev");
			const targetDir = join(tempDir, "skills");

			await writeFixture(baseDir, "skills/rp1-build/SKILL.md", "build");
			await writeFixture(devDir, "skills/rp1-review/SKILL.md", "review");

			const result = await expectTaskRight(
				copyCodexSkills([baseDir, devDir], targetDir),
			);
			expect(result).toBeGreaterThan(0);

			const entries = await readdir(targetDir);
			expect(entries).toContain("rp1-build");
			expect(entries).toContain("rp1-review");
		});

		test("creates target directory if missing", async () => {
			const pluginDir = join(tempDir, "artifacts", "base");
			const targetDir = join(tempDir, "nonexistent", "skills");

			await writeFixture(pluginDir, "skills/rp1-build/SKILL.md", "content");

			await expectTaskRight(copyCodexSkills([pluginDir], targetDir));

			const dirStat = await stat(targetDir);
			expect(dirStat.isDirectory()).toBe(true);
		});
	});

	describe("copyCodexAgents", () => {
		test("copies per-agent TOML files to target", async () => {
			const pluginDir = join(tempDir, "artifacts", "base");
			const targetDir = join(tempDir, "codex", "agents", "rp1");

			await writeFixture(
				pluginDir,
				"agents/task-builder.toml",
				'model = "o4-mini"\ndeveloper_instructions = """instructions"""',
			);
			await writeFixture(
				pluginDir,
				"agents/task-reviewer.toml",
				'model = "o4-mini"\ndeveloper_instructions = """review"""',
			);

			const result = await expectTaskRight(
				copyCodexAgents([pluginDir], targetDir),
			);
			expect(result).toBe(2);

			const content = await readFile(
				join(targetDir, "task-builder.toml"),
				"utf-8",
			);
			expect(content).toContain('model = "o4-mini"');
		});

		test("creates target directory if missing", async () => {
			const pluginDir = join(tempDir, "artifacts", "base");
			const targetDir = join(tempDir, "nonexistent", "agents", "rp1");

			await writeFixture(
				pluginDir,
				"agents/task-builder.toml",
				'model = "o4-mini"',
			);

			await expectTaskRight(copyCodexAgents([pluginDir], targetDir));

			const dirStat = await stat(targetDir);
			expect(dirStat.isDirectory()).toBe(true);
		});

		test("handles multiple plugin directories", async () => {
			const baseDir = join(tempDir, "artifacts", "base");
			const devDir = join(tempDir, "artifacts", "dev");
			const targetDir = join(tempDir, "codex", "agents", "rp1");

			await writeFixture(
				baseDir,
				"agents/kb-analyzer.toml",
				'model = "o4-mini"',
			);
			await writeFixture(
				devDir,
				"agents/task-builder.toml",
				'model = "o4-mini"',
			);

			const result = await expectTaskRight(
				copyCodexAgents([baseDir, devDir], targetDir),
			);
			expect(result).toBe(2);

			const entries = await readdir(targetDir);
			expect(entries).toContain("kb-analyzer.toml");
			expect(entries).toContain("task-builder.toml");
		});

		test("skips non-toml files", async () => {
			const pluginDir = join(tempDir, "artifacts", "base");
			const targetDir = join(tempDir, "codex", "agents", "rp1");

			await writeFixture(
				pluginDir,
				"agents/task-builder.toml",
				'model = "o4-mini"',
			);
			await writeFixture(pluginDir, "agents/README.md", "docs");

			const result = await expectTaskRight(
				copyCodexAgents([pluginDir], targetDir),
			);
			expect(result).toBe(1);

			const entries = await readdir(targetDir);
			expect(entries).toContain("task-builder.toml");
			expect(entries).not.toContain("README.md");
		});

		test("skips plugin dirs without agents directory", async () => {
			const pluginDir = join(tempDir, "artifacts", "base");
			const targetDir = join(tempDir, "codex", "agents", "rp1");

			await writeFixture(pluginDir, "skills/rp1-build/SKILL.md", "content");

			const result = await expectTaskRight(
				copyCodexAgents([pluginDir], targetDir),
			);
			expect(result).toBe(0);
		});
	});

	describe("uninstallCodex", () => {
		test("removes rp1 skill directories", async () => {
			const paths: CodexPaths = {
				skillsDir: join(tempDir, "skills"),
				configDir: join(tempDir, "codex"),
				configFile: join(tempDir, "codex", "config.toml"),
				backupDir: join(tempDir, "backups"),
				agentsDir: join(tempDir, "codex", "agents", "rp1"),
			};

			await writeFixture(
				join(tempDir, "skills"),
				"rp1-build/SKILL.md",
				"content",
			);
			await writeFixture(
				join(tempDir, "skills"),
				"rp1-review/SKILL.md",
				"content",
			);

			const result = await expectTaskRight(uninstallCodex(paths, false));
			expect(result.skillsRemoved).toBe(2);

			const entries = await readdir(paths.skillsDir);
			expect(entries).not.toContain("rp1-build");
			expect(entries).not.toContain("rp1-review");
		});

		test("preserves non-rp1 skill directories", async () => {
			const paths: CodexPaths = {
				skillsDir: join(tempDir, "skills"),
				configDir: join(tempDir, "codex"),
				configFile: join(tempDir, "codex", "config.toml"),
				backupDir: join(tempDir, "backups"),
				agentsDir: join(tempDir, "codex", "agents", "rp1"),
			};

			await writeFixture(join(tempDir, "skills"), "rp1-build/SKILL.md", "rp1");
			await writeFixture(
				join(tempDir, "skills"),
				"user-skill/SKILL.md",
				"user",
			);

			await expectTaskRight(uninstallCodex(paths, false));

			const entries = await readdir(paths.skillsDir);
			expect(entries).toContain("user-skill");
			expect(entries).not.toContain("rp1-build");
		});

		test("strips fenced content from config.toml", async () => {
			const paths: CodexPaths = {
				skillsDir: join(tempDir, "skills"),
				configDir: join(tempDir, "codex"),
				configFile: join(tempDir, "codex", "config.toml"),
				backupDir: join(tempDir, "backups"),
				agentsDir: join(tempDir, "codex", "agents", "rp1"),
			};

			await mkdir(join(tempDir, "skills"), { recursive: true });

			const configContent =
				'sandbox_mode = "full"\n\n# rp1:start\nmanaged content\n# rp1:end';
			await writeFixture(tempDir, "codex/config.toml", configContent);

			const result = await expectTaskRight(uninstallCodex(paths, false));
			expect(result.configCleaned).toBe(true);

			const cleaned = await readFile(paths.configFile, "utf-8");
			expect(cleaned).toContain("sandbox_mode");
			expect(cleaned).not.toContain("managed content");
		});

		test("dry run does not modify files", async () => {
			const paths: CodexPaths = {
				skillsDir: join(tempDir, "skills"),
				configDir: join(tempDir, "codex"),
				configFile: join(tempDir, "codex", "config.toml"),
				backupDir: join(tempDir, "backups"),
				agentsDir: join(tempDir, "codex", "agents", "rp1"),
			};

			await writeFixture(
				join(tempDir, "skills"),
				"rp1-build/SKILL.md",
				"content",
			);
			await writeFixture(
				tempDir,
				"codex/config.toml",
				"# rp1:start\nstuff\n# rp1:end",
			);

			const result = await expectTaskRight(uninstallCodex(paths, true));
			expect(result.skillsRemoved).toBe(0);
			expect(result.configCleaned).toBe(false);

			const entries = await readdir(paths.skillsDir);
			expect(entries).toContain("rp1-build");
		});

		test("handles no rp1 content gracefully", async () => {
			const paths: CodexPaths = {
				skillsDir: join(tempDir, "skills"),
				configDir: join(tempDir, "codex"),
				configFile: join(tempDir, "codex", "config.toml"),
				backupDir: join(tempDir, "backups"),
				agentsDir: join(tempDir, "codex", "agents", "rp1"),
			};

			await mkdir(join(tempDir, "skills"), { recursive: true });

			const result = await expectTaskRight(uninstallCodex(paths, false));
			expect(result.skillsRemoved).toBe(0);
			expect(result.configCleaned).toBe(false);
		});

		test("removes agents directory on uninstall", async () => {
			const paths: CodexPaths = {
				skillsDir: join(tempDir, "skills"),
				configDir: join(tempDir, "codex"),
				configFile: join(tempDir, "codex", "config.toml"),
				backupDir: join(tempDir, "backups"),
				agentsDir: join(tempDir, "codex", "agents", "rp1"),
			};

			await mkdir(join(tempDir, "skills"), { recursive: true });
			await writeFixture(
				paths.agentsDir,
				"task-builder.toml",
				'model = "o4-mini"',
			);
			await writeFixture(
				paths.agentsDir,
				"task-reviewer.toml",
				'model = "o4-mini"',
			);

			await expectTaskRight(uninstallCodex(paths, false));

			let agentsDirExists = true;
			try {
				await stat(paths.agentsDir);
			} catch {
				agentsDirExists = false;
			}
			expect(agentsDirExists).toBe(false);
		});

		test("does not error when agents directory does not exist", async () => {
			const paths: CodexPaths = {
				skillsDir: join(tempDir, "skills"),
				configDir: join(tempDir, "codex"),
				configFile: join(tempDir, "codex", "config.toml"),
				backupDir: join(tempDir, "backups"),
				agentsDir: join(tempDir, "codex", "agents", "rp1"),
			};

			await mkdir(join(tempDir, "skills"), { recursive: true });

			const result = await expectTaskRight(uninstallCodex(paths, false));
			expect(result.skillsRemoved).toBe(0);
			expect(result.configCleaned).toBe(false);
		});

		test("cleans config.toml when only rp1 content existed", async () => {
			const paths: CodexPaths = {
				skillsDir: join(tempDir, "skills"),
				configDir: join(tempDir, "codex"),
				configFile: join(tempDir, "codex", "config.toml"),
				backupDir: join(tempDir, "backups"),
				agentsDir: join(tempDir, "codex", "agents", "rp1"),
			};

			await mkdir(join(tempDir, "skills"), { recursive: true });
			await writeFixture(
				tempDir,
				"codex/config.toml",
				"# rp1:start\nonly rp1 content\n# rp1:end",
			);

			const result = await expectTaskRight(uninstallCodex(paths, false));
			expect(result.configCleaned).toBe(true);

			const cleaned = await readFile(paths.configFile, "utf-8");
			expect(cleaned).not.toContain("only rp1 content");
		});
	});
});
