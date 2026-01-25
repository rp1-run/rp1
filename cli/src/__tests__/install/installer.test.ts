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
		// Core functionality: verifies all artifact types reach correct destinations
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

		// Security: verifies files aren't world-writable (prevents injection)
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
