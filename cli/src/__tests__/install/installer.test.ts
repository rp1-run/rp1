/**
 * Unit tests for installer.ts - File installation operations.
 * Tests rp1's artifact copying logic and backup creation.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, readFile, rm, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import * as E from "fp-ts/lib/Either.js";
import {
	backupExistingInstallation,
	copyArtifacts,
	copyOpenCodePlugin,
	restoreFromBackup,
} from "../../install/installer.js";
import type { BackupManifest } from "../../install/models.js";
import {
	cleanupTempDir,
	createTempDir,
	expectTaskLeft,
	expectTaskRight,
	writeFixture,
} from "../helpers/index.js";

describe("installer", () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await createTempDir("installer-test");
	});

	afterEach(async () => {
		await cleanupTempDir(tempDir);
	});

	describe("copyArtifacts", () => {
		test("copies files to correct subdirectories (command/, agent/, skill/)", async () => {
			const sourceDir = join(tempDir, "source");
			const targetDir = join(tempDir, "target");

			await writeFixture(
				sourceDir,
				"command/rp1-base/sample-command.md",
				"---\nname: sample-command\n---\nCommand content",
			);
			await writeFixture(
				sourceDir,
				"agent/rp1-base/sample-agent.md",
				"---\nname: sample-agent\n---\nAgent content",
			);
			await writeFixture(
				sourceDir,
				"skill/sample-skill/SKILL.md",
				"---\nname: sample-skill\n---\nSkill content",
			);

			const result = await copyArtifacts(sourceDir, targetDir)();

			expect(E.isRight(result)).toBe(true);
			if (E.isRight(result)) {
				expect(result.right).toBeGreaterThan(0);
			}

			const commandContent = await readFile(
				join(targetDir, "command/rp1-base/sample-command.md"),
				"utf-8",
			);
			expect(commandContent).toContain("Command content");

			const agentContent = await readFile(
				join(targetDir, "agent/rp1-base/sample-agent.md"),
				"utf-8",
			);
			expect(agentContent).toContain("Agent content");

			const skillContent = await readFile(
				join(targetDir, "skill/sample-skill/SKILL.md"),
				"utf-8",
			);
			expect(skillContent).toContain("Skill content");
		});

		test("calls onOverwrite callback for existing files", async () => {
			const sourceDir = join(tempDir, "source");
			const targetDir = join(tempDir, "target");

			await writeFixture(
				sourceDir,
				"command/rp1-base/existing.md",
				"---\nname: existing\n---\nNew content",
			);

			await writeFixture(
				targetDir,
				"command/rp1-base/existing.md",
				"---\nname: existing\n---\nOld content",
			);

			const overwrites: string[] = [];
			const result = await copyArtifacts(sourceDir, targetDir, (path) => {
				overwrites.push(path);
			})();

			expect(E.isRight(result)).toBe(true);
			expect(overwrites.length).toBeGreaterThan(0);
			expect(overwrites[0]).toContain("existing.md");
		});

		test("sets correct file permissions (0o644 for files)", async () => {
			const sourceDir = join(tempDir, "source");
			const targetDir = join(tempDir, "target");

			await writeFixture(
				sourceDir,
				"command/rp1-base/test.md",
				"---\nname: test\n---\nContent",
			);

			await copyArtifacts(sourceDir, targetDir)();

			const targetFile = join(targetDir, "command/rp1-base/test.md");
			const fileStat = await stat(targetFile);

			const mode = fileStat.mode & 0o777;
			expect(mode & 0o444).toBe(0o444); // Readable by all
			expect(mode & 0o200).toBe(0o200); // Writable by owner
		});

		test("handles missing source directories gracefully", async () => {
			const sourceDir = join(tempDir, "empty-source");
			const targetDir = join(tempDir, "target");
			await mkdir(sourceDir, { recursive: true });

			const result = await copyArtifacts(sourceDir, targetDir)();

			expect(E.isRight(result)).toBe(true);
			if (E.isRight(result)) {
				expect(result.right).toBe(0); // No files copied
			}
		});

		test("copies skill directories recursively", async () => {
			const sourceDir = join(tempDir, "source");
			const targetDir = join(tempDir, "target");

			await writeFixture(
				sourceDir,
				"skill/my-skill/SKILL.md",
				"---\nname: my-skill\n---\nSkill main",
			);
			await writeFixture(
				sourceDir,
				"skill/my-skill/templates/template1.md",
				"Template 1 content",
			);
			await writeFixture(
				sourceDir,
				"skill/my-skill/templates/nested/template2.md",
				"Template 2 content",
			);

			const result = await copyArtifacts(sourceDir, targetDir)();

			expect(E.isRight(result)).toBe(true);

			const template1 = await readFile(
				join(targetDir, "skill/my-skill/templates/template1.md"),
				"utf-8",
			);
			expect(template1).toBe("Template 1 content");

			const template2 = await readFile(
				join(targetDir, "skill/my-skill/templates/nested/template2.md"),
				"utf-8",
			);
			expect(template2).toBe("Template 2 content");
		});

		test("returns count of files copied", async () => {
			const sourceDir = join(tempDir, "source");
			const targetDir = join(tempDir, "target");

			await writeFixture(sourceDir, "command/rp1-base/cmd1.md", "content1");
			await writeFixture(sourceDir, "command/rp1-base/cmd2.md", "content2");
			await writeFixture(sourceDir, "agent/rp1-base/agent1.md", "content3");

			const result = await copyArtifacts(sourceDir, targetDir)();

			expect(E.isRight(result)).toBe(true);
			if (E.isRight(result)) {
				expect(result.right).toBe(3);
			}
		});
	});

	describe("copyOpenCodePlugin", () => {
		const testPluginName = "rp1-test-plugin";
		const testPluginDir = join(
			homedir(),
			".config",
			"opencode",
			"plugin",
			testPluginName,
		);

		afterEach(async () => {
			// Clean up test plugin directory
			try {
				await rm(testPluginDir, { recursive: true, force: true });
			} catch {
				// Directory may not exist
			}
		});

		test("creates target directory with correct permissions (0o755)", async () => {
			const sourceDir = join(tempDir, "source");

			await writeFixture(
				sourceDir,
				"platforms/opencode/opencode.json",
				JSON.stringify({ name: testPluginName, version: "1.0.0" }),
			);
			await writeFixture(
				sourceDir,
				"platforms/opencode/index.ts",
				"export default {};",
			);

			const result = await copyOpenCodePlugin(sourceDir, testPluginName)();

			expect(E.isRight(result)).toBe(true);

			const dirStat = await stat(testPluginDir);
			expect(dirStat.isDirectory()).toBe(true);

			const mode = dirStat.mode & 0o777;
			expect(mode & 0o755).toBe(0o755);
		});

		test("copies files with correct permissions (0o644)", async () => {
			const sourceDir = join(tempDir, "source");

			await writeFixture(
				sourceDir,
				"platforms/opencode/opencode.json",
				JSON.stringify({ name: testPluginName, version: "1.0.0" }),
			);
			await writeFixture(
				sourceDir,
				"platforms/opencode/index.ts",
				"export default {};",
			);

			await copyOpenCodePlugin(sourceDir, testPluginName)();

			const jsonFile = join(testPluginDir, "opencode.json");
			const jsonStat = await stat(jsonFile);
			const jsonMode = jsonStat.mode & 0o777;
			expect(jsonMode & 0o644).toBe(0o644);

			const tsFile = join(testPluginDir, "index.ts");
			const tsStat = await stat(tsFile);
			const tsMode = tsStat.mode & 0o777;
			expect(tsMode & 0o644).toBe(0o644);
		});

		test("returns 0 when no source plugin exists", async () => {
			const sourceDir = join(tempDir, "empty-source");
			await mkdir(sourceDir, { recursive: true });

			const result = await copyOpenCodePlugin(sourceDir, testPluginName)();

			expect(E.isRight(result)).toBe(true);
			if (E.isRight(result)) {
				expect(result.right).toBe(0);
			}
		});

		test("returns file count when successful", async () => {
			const sourceDir = join(tempDir, "source");

			await writeFixture(
				sourceDir,
				"platforms/opencode/opencode.json",
				JSON.stringify({ name: testPluginName, version: "1.0.0" }),
			);
			await writeFixture(
				sourceDir,
				"platforms/opencode/index.ts",
				"export default {};",
			);
			await writeFixture(
				sourceDir,
				"platforms/opencode/utils.ts",
				"export const helper = () => {};",
			);

			const result = await copyOpenCodePlugin(sourceDir, testPluginName)();

			expect(E.isRight(result)).toBe(true);
			if (E.isRight(result)) {
				expect(result.right).toBe(3); // 3 files copied
			}
		});

		test("invokes onProgress callback with installation message", async () => {
			const sourceDir = join(tempDir, "source");

			await writeFixture(
				sourceDir,
				"platforms/opencode/opencode.json",
				JSON.stringify({ name: testPluginName, version: "1.0.0" }),
			);
			await writeFixture(
				sourceDir,
				"platforms/opencode/index.ts",
				"export default {};",
			);

			const progressMessages: string[] = [];
			await copyOpenCodePlugin(sourceDir, testPluginName, (msg) => {
				progressMessages.push(msg);
			})();

			expect(progressMessages.length).toBe(1);
			expect(progressMessages[0]).toContain(testPluginName);
			expect(progressMessages[0]).toContain("plugin");
			expect(progressMessages[0]).toContain("files");
		});

		test("copies nested directory structure correctly", async () => {
			const sourceDir = join(tempDir, "source");

			await writeFixture(
				sourceDir,
				"platforms/opencode/opencode.json",
				JSON.stringify({ name: testPluginName, version: "1.0.0" }),
			);
			await writeFixture(
				sourceDir,
				"platforms/opencode/plugin/index.ts",
				"export default {};",
			);

			const result = await copyOpenCodePlugin(sourceDir, testPluginName)();

			expect(E.isRight(result)).toBe(true);

			const nestedFile = join(testPluginDir, "plugin/index.ts");
			const content = await readFile(nestedFile, "utf-8");
			expect(content).toBe("export default {};");
		});
	});

	describe("backupExistingInstallation", () => {
		// Note: backupExistingInstallation uses homedir(), making it harder to test
		// in isolation. These tests verify the behavior of the backup functions
		// with the understanding that they operate on ~/.config/opencode

		test("backup creates manifest with file count", async () => {
			// This test verifies the BackupManifest structure returned
			// We can't easily mock homedir(), so we test the return type
			const result = await backupExistingInstallation()();

			// Even if no files exist to backup, it should return successfully
			expect(E.isRight(result)).toBe(true);
			if (E.isRight(result)) {
				const manifest = result.right;
				expect(manifest).toHaveProperty("timestamp");
				expect(manifest).toHaveProperty("backupPath");
				expect(manifest).toHaveProperty("filesBackedUp");
				expect(typeof manifest.filesBackedUp).toBe("number");
			}
		});

		test("backup timestamp has correct format", async () => {
			const result = await backupExistingInstallation()();

			expect(E.isRight(result)).toBe(true);
			if (E.isRight(result)) {
				// Timestamp format: YYYY-MM-DDTHH-MM-SS
				const timestampPattern = /\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}/;
				expect(result.right.timestamp).toMatch(timestampPattern);
			}
		});

		test("backup path includes backup prefix", async () => {
			const result = await backupExistingInstallation()();

			expect(E.isRight(result)).toBe(true);
			if (E.isRight(result)) {
				expect(result.right.backupPath).toContain("backup_");
				expect(result.right.backupPath).toContain(".opencode-rp1-backups");
			}
		});
	});

	describe("restoreFromBackup", () => {
		let backupDir: string;
		let targetDir: string;

		beforeEach(async () => {
			backupDir = join(tempDir, "backup");
			targetDir = join(tempDir, "target");
			await mkdir(backupDir, { recursive: true });
			await mkdir(targetDir, { recursive: true });
		});

		// Core restore functionality - verifies backup data actually overwrites corrupted target
		test("restores command files from backup (P0)", async () => {
			// Setup backup with commands
			await writeFixture(
				backupDir,
				"command/rp1-base/test-cmd.md",
				"Original command content",
			);
			await writeFixture(join(backupDir, "manifest.json"), "", "");

			// Create manifest
			const manifest: BackupManifest = {
				timestamp: "2026-01-25T10-00-00",
				backupPath: backupDir,
				filesBackedUp: 1,
			};
			await writeFixture(backupDir, "manifest.json", JSON.stringify(manifest));

			// Simulate target with corrupted content
			const configDir = join(homedir(), ".config", "opencode");
			await mkdir(join(configDir, "command", "rp1-base"), { recursive: true });
			await writeFixture(
				configDir,
				"command/rp1-base/test-cmd.md",
				"Corrupted content",
			);

			const result = await expectTaskRight(restoreFromBackup(manifest));

			expect(result.filesRestored).toBeGreaterThan(0);

			// Verify content was restored
			const restoredContent = await readFile(
				join(configDir, "command/rp1-base/test-cmd.md"),
				"utf-8",
			);
			expect(restoredContent).toBe("Original command content");

			// Cleanup
			await rm(join(configDir, "command/rp1-base"), {
				recursive: true,
				force: true,
			});
		});

		// Critical: manifest deletion prevents accidental double-restore on retry
		test("deletes manifest.json after successful restore (prevents duplicate)", async () => {
			// Setup backup with minimal content
			await writeFixture(backupDir, "command/rp1-base/cmd.md", "content");
			const manifest: BackupManifest = {
				timestamp: "2026-01-25T10-00-00",
				backupPath: backupDir,
				filesBackedUp: 1,
			};
			await writeFixture(backupDir, "manifest.json", JSON.stringify(manifest));

			// Setup target
			const configDir = join(homedir(), ".config", "opencode");
			await mkdir(join(configDir, "command", "rp1-base"), { recursive: true });

			const result = await expectTaskRight(restoreFromBackup(manifest));

			expect(result.manifestDeleted).toBe(true);

			// Verify manifest.json was deleted
			let manifestExists = true;
			try {
				await stat(join(backupDir, "manifest.json"));
			} catch {
				manifestExists = false;
			}
			expect(manifestExists).toBe(false);

			// Cleanup
			await rm(join(configDir, "command/rp1-base"), {
				recursive: true,
				force: true,
			});
		});

		// Error path: missing backup must fail clearly, not silently corrupt
		test("returns error when backup path does not exist", async () => {
			const manifest: BackupManifest = {
				timestamp: "2026-01-25T10-00-00",
				backupPath: "/nonexistent/path/that/does/not/exist",
				filesBackedUp: 5,
			};

			const error = await expectTaskLeft(restoreFromBackup(manifest));

			expect(error._tag).toBe("BackupError");
			if (error._tag === "BackupError") {
				expect(error.message).toContain("does not exist");
			}
		});

		test("handles backup with no files gracefully", async () => {
			// Empty backup - just manifest
			const manifest: BackupManifest = {
				timestamp: "2026-01-25T10-00-00",
				backupPath: backupDir,
				filesBackedUp: 0,
			};
			await writeFixture(backupDir, "manifest.json", JSON.stringify(manifest));

			const result = await expectTaskRight(restoreFromBackup(manifest));

			expect(result.filesRestored).toBe(0);
		});

		test("restores skills from backup", async () => {
			// Setup backup with skill
			await writeFixture(
				backupDir,
				"skill/test-skill/SKILL.md",
				"Original skill",
			);
			await writeFixture(backupDir, "skill/test-skill/template.md", "Template");

			const manifest: BackupManifest = {
				timestamp: "2026-01-25T10-00-00",
				backupPath: backupDir,
				filesBackedUp: 2,
			};
			await writeFixture(backupDir, "manifest.json", JSON.stringify(manifest));

			// Setup target
			const configDir = join(homedir(), ".config", "opencode");
			await mkdir(join(configDir, "skill", "test-skill"), { recursive: true });
			await writeFixture(
				configDir,
				"skill/test-skill/SKILL.md",
				"Corrupted skill",
			);

			const result = await expectTaskRight(restoreFromBackup(manifest));

			expect(result.filesRestored).toBeGreaterThan(0);

			const restoredContent = await readFile(
				join(configDir, "skill/test-skill/SKILL.md"),
				"utf-8",
			);
			expect(restoredContent).toBe("Original skill");

			// Cleanup
			await rm(join(configDir, "skill/test-skill"), {
				recursive: true,
				force: true,
			});
		});
	});

	describe("copyArtifacts with strict mode", () => {
		test("fails when command directory missing and strict=true (P2)", async () => {
			const sourceDir = join(tempDir, "empty-source");
			const targetDir = join(tempDir, "target");
			await mkdir(sourceDir, { recursive: true });

			const result = await copyArtifacts(
				sourceDir,
				targetDir,
				undefined,
				undefined,
				true, // strict mode
			)();

			// When strict mode is enabled and directories are missing, it should fail
			expect(E.isLeft(result)).toBe(true);
			if (E.isLeft(result)) {
				// The error contains the strict mode failure
				// Note: The error message format depends on how tryCatch serializes the thrown error
				expect(result.left._tag).toBe("InstallError");
				if (result.left._tag === "InstallError") {
					expect(result.left.operation).toBe("copy-artifacts");
				}
			}
		});

		test("continues silently when directory missing and strict=false (default)", async () => {
			const sourceDir = join(tempDir, "empty-source");
			const targetDir = join(tempDir, "target");
			await mkdir(sourceDir, { recursive: true });

			const result = await copyArtifacts(sourceDir, targetDir)();

			expect(E.isRight(result)).toBe(true);
			if (E.isRight(result)) {
				expect(result.right).toBe(0); // No files copied, but no error
			}
		});

		test("logs debug message for missing directories", async () => {
			const sourceDir = join(tempDir, "empty-source");
			const targetDir = join(tempDir, "target");
			await mkdir(sourceDir, { recursive: true });

			const debugMessages: string[] = [];
			const logger = {
				debug: (msg: string) => debugMessages.push(msg),
			};

			await copyArtifacts(sourceDir, targetDir, undefined, logger, false)();

			expect(
				debugMessages.some(
					(msg) => msg.includes("not found") || msg.includes("directory"),
				),
			).toBe(true);
		});
	});
});
