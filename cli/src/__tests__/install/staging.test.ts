/**
 * Unit tests for staging operations in installer.ts
 * Tests: atomic installation via staging directory (copy -> verify -> commit/cleanup)
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, readFile, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import * as E from "fp-ts/lib/Either.js";
import {
	cleanupStaging,
	commitStaging,
	copyToStaging,
	getStagingPath,
	verifyStagingContents,
} from "../../install/installer.js";
import {
	cleanupTempDir,
	createTempDir,
	expectTaskRight,
	writeFixture,
} from "../helpers/index.js";

describe("staging", () => {
	let tempDir: string;
	let stagingPath: string;

	beforeEach(async () => {
		tempDir = await createTempDir("staging-test");
		stagingPath = getStagingPath();
		await rm(stagingPath, { recursive: true, force: true });
	});

	afterEach(async () => {
		await cleanupTempDir(tempDir);
		await rm(stagingPath, { recursive: true, force: true });
	});

	describe("getStagingPath", () => {
		// Documents expected staging location in user config
		test("returns path in user config directory", () => {
			const path = getStagingPath();
			expect(path).toContain(".config");
			expect(path).toContain(".rp1-staging");
		});
	});

	describe("copyToStaging", () => {
		// Core copy functionality - verifies artifacts reach staging with correct structure
		test("copies plugin artifacts preserving directory structure", async () => {
			const pluginDir = join(tempDir, "plugin");
			await writeFixture(
				pluginDir,
				"agents/rp1-test-test-agent.md",
				"Agent content",
			);
			await writeFixture(
				pluginDir,
				"skills/rp1-my-skill/SKILL.md",
				"Skill content",
			);

			const result = await expectTaskRight(copyToStaging([pluginDir]));

			expect(result.stagingPath).toBe(stagingPath);
			expect(result.filesCopied).toBeGreaterThan(0);

			// Verify nested structure preserved
			const agentContent = await readFile(
				join(stagingPath, "agents/rp1-test-test-agent.md"),
				"utf-8",
			);
			expect(agentContent).toContain("Agent content");
		});

		// Security requirement: staging dir must have restricted permissions
		test("creates staging with user-only permissions (0o700)", async () => {
			const pluginDir = join(tempDir, "plugin");
			await writeFixture(pluginDir, "agents/rp1-test-test.md", "content");

			await expectTaskRight(copyToStaging([pluginDir]));

			const stats = await stat(stagingPath);
			expect(stats.mode & 0o777).toBe(0o700);
		});

		// Boundary: empty source should not fail
		test("handles empty plugin directory gracefully", async () => {
			const pluginDir = join(tempDir, "empty-plugin");
			await mkdir(pluginDir, { recursive: true });

			const result = await expectTaskRight(copyToStaging([pluginDir]));
			expect(result.filesCopied).toBe(0);
		});
	});

	describe("verifyStagingContents", () => {
		// Core verification: expected plugins present
		test("validates expected plugins exist", async () => {
			await writeFixture(stagingPath, "agents/rp1-test-agent.md", "content");

			const result = await expectTaskRight(
				verifyStagingContents(stagingPath, ["test"]),
			);

			expect(result.valid).toBe(true);
			expect(result.missingPlugins.length).toBe(0);
		});

		// Error detection: missing plugins must be reported
		test("reports missing plugins", async () => {
			await mkdir(stagingPath, { recursive: true });

			const result = await expectTaskRight(
				verifyStagingContents(stagingPath, ["missing-plugin"]),
			);

			expect(result.valid).toBe(false);
			expect(result.missingPlugins).toContain("missing-plugin");
		});

		// File count verification for integrity check
		test("counts files and validates against expected count", async () => {
			await writeFixture(stagingPath, "file1.md", "1");
			await writeFixture(stagingPath, "file2.md", "2");

			// Verify actual count
			const result1 = await expectTaskRight(
				verifyStagingContents(stagingPath, []),
			);
			expect(result1.actualFiles).toBe(2);

			// Verify count mismatch detection
			const result2 = await expectTaskRight(
				verifyStagingContents(stagingPath, [], 10),
			);
			expect(result2.valid).toBe(false);
		});
	});

	describe("commitStaging", () => {
		// Core atomic move functionality
		test("moves staging contents to target directory", async () => {
			const targetDir = join(tempDir, "target");
			await mkdir(targetDir, { recursive: true });
			await writeFixture(stagingPath, "command/test.md", "Content");

			await expectTaskRight(commitStaging(stagingPath, targetDir));

			const content = await readFile(
				join(targetDir, "command/test.md"),
				"utf-8",
			);
			expect(content).toBe("Content");
		});

		// Boundary: target parent may not exist
		test("creates target parent directory if missing", async () => {
			const targetDir = join(tempDir, "nested", "deep", "target");
			await writeFixture(stagingPath, "command/file.md", "content");

			await expectTaskRight(commitStaging(stagingPath, targetDir));

			const stats = await stat(targetDir);
			expect(stats.isDirectory()).toBe(true);
		});

		// Critical: atomic replacement removes old content
		test("replaces existing target directories atomically", async () => {
			const targetDir = join(tempDir, "target");
			await writeFixture(targetDir, "command/old.md", "Old");
			await writeFixture(stagingPath, "command/new.md", "New");

			await expectTaskRight(commitStaging(stagingPath, targetDir));

			// New exists
			const newContent = await readFile(
				join(targetDir, "command/new.md"),
				"utf-8",
			);
			expect(newContent).toBe("New");

			// Old removed
			await expect(stat(join(targetDir, "command/old.md"))).rejects.toThrow();
		});
	});

	describe("cleanupStaging", () => {
		// Core cleanup: removes staging completely
		test("removes staging directory recursively", async () => {
			await writeFixture(stagingPath, "nested/deep/file.md", "content");

			await expectTaskRight(cleanupStaging(stagingPath));

			await expect(stat(stagingPath)).rejects.toThrow();
		});

		// Idempotency: safe to call when already cleaned
		test("handles already-removed staging directory", async () => {
			const result = await cleanupStaging(stagingPath)();
			expect(E.isRight(result)).toBe(true);
		});
	});
});
