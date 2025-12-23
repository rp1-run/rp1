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
} from "../../install/installer.js";
import {
	cleanupTempDir,
	createTempDir,
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
		test("copies files to correct subdirectories (command/, agent/, skills/)", async () => {
			// Set up source directory structure
			const sourceDir = join(tempDir, "source");
			const targetDir = join(tempDir, "target");

			// Create source artifacts
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
				"skills/sample-skill/SKILL.md",
				"---\nname: sample-skill\n---\nSkill content",
			);

			const result = await copyArtifacts(sourceDir, targetDir)();

			expect(E.isRight(result)).toBe(true);
			if (E.isRight(result)) {
				expect(result.right).toBeGreaterThan(0);
			}

			// Verify files exist in target
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
				join(targetDir, "skills/sample-skill/SKILL.md"),
				"utf-8",
			);
			expect(skillContent).toContain("Skill content");
		});

		test("calls onOverwrite callback for existing files", async () => {
			const sourceDir = join(tempDir, "source");
			const targetDir = join(tempDir, "target");

			// Create source artifact
			await writeFixture(
				sourceDir,
				"command/rp1-base/existing.md",
				"---\nname: existing\n---\nNew content",
			);

			// Create existing file in target
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

			// Check that file is readable (0o644 = rw-r--r--)
			// Note: On some systems, umask may affect permissions
			const mode = fileStat.mode & 0o777;
			expect(mode & 0o444).toBe(0o444); // Readable by all
			expect(mode & 0o200).toBe(0o200); // Writable by owner
		});

		test("handles missing source directories gracefully", async () => {
			const sourceDir = join(tempDir, "empty-source");
			const targetDir = join(tempDir, "target");
			await mkdir(sourceDir, { recursive: true });

			// Source exists but has no command/agent/skills dirs
			const result = await copyArtifacts(sourceDir, targetDir)();

			expect(E.isRight(result)).toBe(true);
			if (E.isRight(result)) {
				expect(result.right).toBe(0); // No files copied
			}
		});

		test("copies skill directories recursively", async () => {
			const sourceDir = join(tempDir, "source");
			const targetDir = join(tempDir, "target");

			// Create skill with nested structure
			await writeFixture(
				sourceDir,
				"skills/my-skill/SKILL.md",
				"---\nname: my-skill\n---\nSkill main",
			);
			await writeFixture(
				sourceDir,
				"skills/my-skill/templates/template1.md",
				"Template 1 content",
			);
			await writeFixture(
				sourceDir,
				"skills/my-skill/templates/nested/template2.md",
				"Template 2 content",
			);

			const result = await copyArtifacts(sourceDir, targetDir)();

			expect(E.isRight(result)).toBe(true);

			// Verify nested files were copied
			const template1 = await readFile(
				join(targetDir, "skills/my-skill/templates/template1.md"),
				"utf-8",
			);
			expect(template1).toBe("Template 1 content");

			const template2 = await readFile(
				join(targetDir, "skills/my-skill/templates/nested/template2.md"),
				"utf-8",
			);
			expect(template2).toBe("Template 2 content");
		});

		test("returns count of files copied", async () => {
			const sourceDir = join(tempDir, "source");
			const targetDir = join(tempDir, "target");

			// Create multiple artifacts
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

			// Create source plugin structure
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

			// Verify target directory was created with correct permissions
			const dirStat = await stat(testPluginDir);
			expect(dirStat.isDirectory()).toBe(true);

			// Check directory permissions (0o755 = rwxr-xr-x)
			const mode = dirStat.mode & 0o777;
			expect(mode & 0o755).toBe(0o755);
		});

		test("copies files with correct permissions (0o644)", async () => {
			const sourceDir = join(tempDir, "source");

			// Create source plugin structure
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

			// Verify file permissions
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

			// Source exists but has no platforms/opencode/ dir
			const result = await copyOpenCodePlugin(sourceDir, testPluginName)();

			expect(E.isRight(result)).toBe(true);
			if (E.isRight(result)) {
				expect(result.right).toBe(0);
			}
		});

		test("returns file count when successful", async () => {
			const sourceDir = join(tempDir, "source");

			// Create source plugin with multiple files
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

			// Create nested plugin structure
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

			// Verify nested file was copied
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
});
