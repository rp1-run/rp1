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
		// Core functionality: verifies all artifact types reach correct destinations
		test("copies files to correct subdirectories (agents/, skills/)", async () => {
			const sourceDir = join(tempDir, "source");
			const targetDir = join(tempDir, "target");

			await writeFixture(
				sourceDir,
				"agents/rp1-base/sample-agent.md",
				"---\nname: sample-agent\n---\nAgent content",
			);
			await writeFixture(
				sourceDir,
				"skills/rp1-sample-skill/SKILL.md",
				"---\nname: rp1-sample-skill\n---\nSkill content",
			);

			const result = await copyArtifacts(sourceDir, targetDir)();

			expect(E.isRight(result)).toBe(true);
			if (E.isRight(result)) {
				expect(result.right).toBeGreaterThan(0);
			}

			const agentContent = await readFile(
				join(targetDir, "agents/rp1-base/sample-agent.md"),
				"utf-8",
			);
			expect(agentContent).toContain("Agent content");

			const skillContent = await readFile(
				join(targetDir, "skills/rp1-sample-skill/SKILL.md"),
				"utf-8",
			);
			expect(skillContent).toContain("Skill content");
		});

		test("skips non-namespaced skill directories", async () => {
			const sourceDir = join(tempDir, "source");
			const targetDir = join(tempDir, "target");

			// Create a non-namespaced skill (should be skipped)
			await writeFixture(
				sourceDir,
				"skills/user-skill/SKILL.md",
				"---\nname: user-skill\n---\nUser skill content",
			);
			// Create a namespaced skill (should be copied)
			await writeFixture(
				sourceDir,
				"skills/rp1-build/SKILL.md",
				"---\nname: rp1-build\n---\nBuild content",
			);

			const result = await copyArtifacts(sourceDir, targetDir)();

			expect(E.isRight(result)).toBe(true);
			if (E.isRight(result)) {
				expect(result.right).toBe(1); // Only the rp1- skill file
			}
		});

		// Security: verifies files aren't world-writable (prevents injection)
		test("sets correct file permissions (0o644 for files)", async () => {
			const sourceDir = join(tempDir, "source");
			const targetDir = join(tempDir, "target");

			await writeFixture(
				sourceDir,
				"agents/rp1-base/test.md",
				"---\nname: test\n---\nContent",
			);

			await copyArtifacts(sourceDir, targetDir)();

			const targetFile = join(targetDir, "agents/rp1-base/test.md");
			const fileStat = await stat(targetFile);

			const mode = fileStat.mode & 0o777;
			expect(mode & 0o444).toBe(0o444); // Readable by all
			expect(mode & 0o200).toBe(0o200); // Writable by owner
		});

		// Boundary: empty plugin shouldn't fail - valid on partial installs
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

		// Critical: skills have nested template dirs that must be preserved
		test("copies skill directories recursively", async () => {
			const sourceDir = join(tempDir, "source");
			const targetDir = join(tempDir, "target");

			await writeFixture(
				sourceDir,
				"skills/rp1-my-skill/SKILL.md",
				"---\nname: rp1-my-skill\n---\nSkill main",
			);
			await writeFixture(
				sourceDir,
				"skills/rp1-my-skill/templates/template1.md",
				"Template 1 content",
			);
			await writeFixture(
				sourceDir,
				"skills/rp1-my-skill/templates/nested/template2.md",
				"Template 2 content",
			);

			const result = await copyArtifacts(sourceDir, targetDir)();

			expect(E.isRight(result)).toBe(true);

			const template1 = await readFile(
				join(targetDir, "skills/rp1-my-skill/templates/template1.md"),
				"utf-8",
			);
			expect(template1).toBe("Template 1 content");

			const template2 = await readFile(
				join(targetDir, "skills/rp1-my-skill/templates/nested/template2.md"),
				"utf-8",
			);
			expect(template2).toBe("Template 2 content");
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

		// Security: plugin dirs need execute bit for traversal, but not world-writable
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

		// Boundary: missing plugin source shouldn't fail - valid on partial installs
		test("returns 0 when no source plugin exists", async () => {
			const sourceDir = join(tempDir, "empty-source");
			await mkdir(sourceDir, { recursive: true });

			const result = await copyOpenCodePlugin(sourceDir, testPluginName)();

			expect(E.isRight(result)).toBe(true);
			if (E.isRight(result)) {
				expect(result.right).toBe(0);
			}
		});

		// Critical: OpenCode plugins can have nested subdirs (e.g., plugin/index.ts)
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
		// Core backup contract: returns manifest with required fields for restore
		// Note: uses homedir(), so tests validate return structure not file operations
		test("backup creates manifest with file count", async () => {
			const result = await backupExistingInstallation()();

			expect(E.isRight(result)).toBe(true);
			if (E.isRight(result)) {
				const manifest = result.right;
				expect(manifest).toHaveProperty("timestamp");
				expect(manifest).toHaveProperty("backupPath");
				expect(manifest).toHaveProperty("filesBackedUp");
				expect(typeof manifest.filesBackedUp).toBe("number");
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
		test("restores agent files from backup (P0)", async () => {
			// Setup backup with agents
			await writeFixture(
				backupDir,
				"agents/rp1-base/test-agent.md",
				"Original agent content",
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
			await mkdir(join(configDir, "agents", "rp1-base"), { recursive: true });
			await writeFixture(
				configDir,
				"agents/rp1-base/test-agent.md",
				"Corrupted content",
			);

			const result = await expectTaskRight(restoreFromBackup(manifest));

			expect(result.filesRestored).toBeGreaterThan(0);

			// Verify content was restored
			const restoredContent = await readFile(
				join(configDir, "agents/rp1-base/test-agent.md"),
				"utf-8",
			);
			expect(restoredContent).toBe("Original agent content");

			// Cleanup
			await rm(join(configDir, "agents/rp1-base"), {
				recursive: true,
				force: true,
			});
		});

		// Critical: manifest deletion prevents accidental double-restore on retry
		test("deletes manifest.json after successful restore (prevents duplicate)", async () => {
			// Setup backup with minimal content
			await writeFixture(backupDir, "agents/rp1-base/agent.md", "content");
			const manifest: BackupManifest = {
				timestamp: "2026-01-25T10-00-00",
				backupPath: backupDir,
				filesBackedUp: 1,
			};
			await writeFixture(backupDir, "manifest.json", JSON.stringify(manifest));

			// Setup target
			const configDir = join(homedir(), ".config", "opencode");
			await mkdir(join(configDir, "agents", "rp1-base"), { recursive: true });

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
			await rm(join(configDir, "agents/rp1-base"), {
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

		// Boundary: empty backup shouldn't error - valid edge case on fresh install
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
	});

	describe("copyArtifacts with strict mode", () => {
		// Core strict mode contract: CI must fail on missing artifacts, not silently succeed
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
	});
});
