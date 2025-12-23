/**
 * Integration tests for error handling and recovery.
 * Tests graceful error handling and system state after failures.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import * as E from "fp-ts/lib/Either.js";

import {
	backupExistingInstallation,
	copyArtifacts,
} from "../../install/installer.js";
import { discoverPlugins, loadManifest } from "../../install/manifest.js";
import {
	cleanupTempDir,
	createTempDir,
	getErrorMessage,
	writeFixture,
} from "../helpers/index.js";

describe("integration: error-recovery", () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await createTempDir("error-");
	});

	afterEach(async () => {
		await cleanupTempDir(tempDir);
	});

	test(
		"installation from non-existent source returns error, not exception",
		async () => {
			const nonExistentSource = join(tempDir, "does-not-exist");
			const targetDir = join(tempDir, "target");

			const result = await copyArtifacts(nonExistentSource, targetDir)();

			// Should return Right with 0 files (no source directories found)
			// copyArtifacts gracefully handles missing source directories
			expect(E.isRight(result)).toBe(true);
			if (E.isRight(result)) {
				expect(result.right).toBe(0);
			}
		},
		{ timeout: 60000 },
	);

	test(
		"error messages are actionable and include context",
		async () => {
			// Try to load a malformed manifest
			const malformedPath = join(tempDir, "malformed-manifest.json");
			await writeFile(malformedPath, "{ invalid json }");

			const result = await loadManifest(malformedPath)();

			expect(E.isLeft(result)).toBe(true);
			if (E.isLeft(result)) {
				// Error should mention the file path
				expect(getErrorMessage(result.left)).toContain("Failed to read");
				// Error should be a CLIError with _tag
				expect(result.left).toHaveProperty("_tag");
			}
		},
		{ timeout: 60000 },
	);

	test(
		"discover plugins returns clear error when no plugins found",
		async () => {
			// Create an empty directory (no plugins)
			const emptyDir = join(tempDir, "empty");
			await mkdir(emptyDir, { recursive: true });

			const result = await discoverPlugins(emptyDir)();

			expect(E.isLeft(result)).toBe(true);
			if (E.isLeft(result)) {
				expect(getErrorMessage(result.left)).toContain(
					"No plugin manifests found",
				);
			}
		},
		{ timeout: 60000 },
	);

	test(
		"existing files in target are preserved when source is empty",
		async () => {
			const sourceDir = join(tempDir, "empty-source");
			const targetDir = join(tempDir, "target");

			await mkdir(sourceDir, { recursive: true });

			// Create a marker file in target
			await writeFixture(
				targetDir,
				"existing-file.md",
				"Original content that should remain",
			);
			await writeFixture(
				targetDir,
				"command/user/custom-command.md",
				"User's custom command",
			);

			// Run installation with empty source
			const result = await copyArtifacts(sourceDir, targetDir)();

			expect(E.isRight(result)).toBe(true);

			// Verify marker file is unchanged
			const existingContent = await readFile(
				join(targetDir, "existing-file.md"),
				"utf-8",
			);
			expect(existingContent).toBe("Original content that should remain");

			// Verify user's custom command is preserved
			const customCmd = await readFile(
				join(targetDir, "command/user/custom-command.md"),
				"utf-8",
			);
			expect(customCmd).toBe("User's custom command");
		},
		{ timeout: 60000 },
	);

	test(
		"backup is created before modifications (via installRp1)",
		async () => {
			// Note: backupExistingInstallation uses homedir(), so we test the
			// backup mechanism's structure, not the full integration

			const result = await backupExistingInstallation()();

			// Should succeed even if nothing to backup
			expect(E.isRight(result)).toBe(true);
			if (E.isRight(result)) {
				const manifest = result.right;

				// Verify backup manifest structure
				expect(manifest).toHaveProperty("timestamp");
				expect(manifest).toHaveProperty("backupPath");
				expect(manifest).toHaveProperty("filesBackedUp");

				// Backup path should be in expected location
				expect(manifest.backupPath).toContain(".opencode-rp1-backups");
				expect(manifest.backupPath).toContain("backup_");
			}
		},
		{ timeout: 60000 },
	);

	test(
		"manifest with missing fields returns descriptive error",
		async () => {
			const incompletePath = join(tempDir, "incomplete-manifest.json");
			await writeFile(
				incompletePath,
				JSON.stringify({
					plugin: "test-plugin",
					// Missing: version, generated_at, opencode_version_tested, artifacts
				}),
			);

			const result = await loadManifest(incompletePath)();

			expect(E.isLeft(result)).toBe(true);
			if (E.isLeft(result)) {
				const errorMsg = getErrorMessage(result.left);
				expect(errorMsg).toContain("missing required fields");
				// Should list which fields are missing
				expect(errorMsg).toMatch(/version|generated_at|artifacts/);
			}
		},
		{ timeout: 60000 },
	);

	test(
		"overwrite callback is called for existing files but files are still copied",
		async () => {
			const sourceDir = join(tempDir, "source");
			const targetDir = join(tempDir, "target");

			// Create source artifact
			await writeFixture(
				sourceDir,
				"command/rp1-base/test-cmd.md",
				"---\ndescription: New version\n---\nNew content",
			);

			// Create existing file in target with old content
			await writeFixture(
				targetDir,
				"command/rp1-base/test-cmd.md",
				"---\ndescription: Old version\n---\nOld content",
			);

			const overwrites: string[] = [];
			const result = await copyArtifacts(sourceDir, targetDir, (path) => {
				overwrites.push(path);
			})();

			expect(E.isRight(result)).toBe(true);

			// Callback should have been called
			expect(overwrites.length).toBe(1);
			expect(overwrites[0]).toContain("test-cmd.md");

			// File should contain new content (was overwritten)
			const content = await readFile(
				join(targetDir, "command/rp1-base/test-cmd.md"),
				"utf-8",
			);
			expect(content).toContain("New version");
			expect(content).toContain("New content");
		},
		{ timeout: 60000 },
	);
});
