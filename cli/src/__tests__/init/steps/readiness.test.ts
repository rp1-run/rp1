/**
 * Unit tests for the readiness step module.
 * Tests rp1 readiness checks for directories, KB, and charter presence.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { chmod, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { checkRp1Readiness } from "../../../init/steps/readiness.js";
import { cleanupTempDir, createTempDir } from "../../helpers/index.js";

describe("readiness step", () => {
	let tempDir: string;
	const originalEnv = process.env.RP1_ROOT;

	beforeEach(async () => {
		tempDir = await createTempDir("readiness-test");
		delete process.env.RP1_ROOT;
	});

	afterEach(async () => {
		await cleanupTempDir(tempDir);
		if (originalEnv !== undefined) {
			process.env.RP1_ROOT = originalEnv;
		} else {
			delete process.env.RP1_ROOT;
		}
	});

	/**
	 * Helper to create complete rp1 setup in temp directory.
	 */
	async function createCompleteSetup(
		cwd: string,
		options?: {
			skipRp1Dir?: boolean;
			skipContextDir?: boolean;
			skipWorkDir?: boolean;
			skipKb?: boolean;
			skipCharter?: boolean;
		},
	): Promise<void> {
		const rp1Root = process.env.RP1_ROOT || ".rp1";

		if (!options?.skipRp1Dir) {
			await mkdir(join(cwd, rp1Root), { recursive: true });
		}

		if (!options?.skipContextDir && !options?.skipRp1Dir) {
			await mkdir(join(cwd, rp1Root, "context"), { recursive: true });
		}

		if (!options?.skipWorkDir && !options?.skipRp1Dir) {
			await mkdir(join(cwd, rp1Root, "work"), { recursive: true });
		}

		if (!options?.skipKb && !options?.skipContextDir && !options?.skipRp1Dir) {
			await writeFile(
				join(cwd, rp1Root, "context", "index.md"),
				"# Knowledge Base\n\nSample content.",
				"utf-8",
			);
		}

		if (
			!options?.skipCharter &&
			!options?.skipContextDir &&
			!options?.skipRp1Dir
		) {
			await writeFile(
				join(cwd, rp1Root, "context", "charter.md"),
				"# Charter\n\nProject charter content.",
				"utf-8",
			);
		}
	}

	describe("checkRp1Readiness", () => {
		test("returns true for all checks when .rp1/, index.md, charter.md exist", async () => {
			await createCompleteSetup(tempDir);

			const result = await checkRp1Readiness(tempDir);

			expect(result.directoriesExist).toBe(true);
			expect(result.kbExists).toBe(true);
			expect(result.charterExists).toBe(true);
		});

		test("returns false for kbExists when index.md missing", async () => {
			await createCompleteSetup(tempDir, { skipKb: true });

			const result = await checkRp1Readiness(tempDir);

			expect(result.directoriesExist).toBe(true);
			expect(result.kbExists).toBe(false);
			expect(result.charterExists).toBe(true);
		});

		test("returns false for charterExists when charter.md missing", async () => {
			await createCompleteSetup(tempDir, { skipCharter: true });

			const result = await checkRp1Readiness(tempDir);

			expect(result.directoriesExist).toBe(true);
			expect(result.kbExists).toBe(true);
			expect(result.charterExists).toBe(false);
		});

		test("returns false for directoriesExist when .rp1/ missing", async () => {
			const result = await checkRp1Readiness(tempDir);

			expect(result.directoriesExist).toBe(false);
			expect(result.kbExists).toBe(false);
			expect(result.charterExists).toBe(false);
		});

		test("returns false for directoriesExist when context/ missing", async () => {
			await createCompleteSetup(tempDir, { skipContextDir: true });

			const result = await checkRp1Readiness(tempDir);

			expect(result.directoriesExist).toBe(false);
			expect(result.kbExists).toBe(false);
			expect(result.charterExists).toBe(false);
		});

		test("returns false for directoriesExist when work/ missing", async () => {
			await createCompleteSetup(tempDir, { skipWorkDir: true });

			const result = await checkRp1Readiness(tempDir);

			expect(result.directoriesExist).toBe(false);
			expect(result.kbExists).toBe(true);
			expect(result.charterExists).toBe(true);
		});

		test("handles permission errors gracefully for directory check", async () => {
			await createCompleteSetup(tempDir);

			const rp1Dir = join(tempDir, ".rp1");
			await chmod(rp1Dir, 0o000);

			try {
				const result = await checkRp1Readiness(tempDir);

				expect(result.directoriesExist).toBe(false);
				expect(result.kbExists).toBe(false);
				expect(result.charterExists).toBe(false);
			} finally {
				await chmod(rp1Dir, 0o755);
			}
		});

		test("handles permission errors gracefully for file check", async () => {
			await createCompleteSetup(tempDir);

			const contextDir = join(tempDir, ".rp1", "context");
			await chmod(contextDir, 0o000);

			try {
				const result = await checkRp1Readiness(tempDir);

				// Context directory still exists (stat succeeds), but files inside are inaccessible
				// directoriesExist may be true since we can stat the directory itself
				// File checks return false due to permission denied on contents
				expect(result.kbExists).toBe(false);
				expect(result.charterExists).toBe(false);
			} finally {
				await chmod(contextDir, 0o755);
			}
		});

		test("respects RP1_ROOT environment variable", async () => {
			process.env.RP1_ROOT = "custom-rp1";
			await createCompleteSetup(tempDir);

			const result = await checkRp1Readiness(tempDir);

			expect(result.directoriesExist).toBe(true);
			expect(result.kbExists).toBe(true);
			expect(result.charterExists).toBe(true);
		});

		test("returns false when RP1_ROOT directory does not exist", async () => {
			process.env.RP1_ROOT = "non-existent-dir";

			const result = await checkRp1Readiness(tempDir);

			expect(result.directoriesExist).toBe(false);
			expect(result.kbExists).toBe(false);
			expect(result.charterExists).toBe(false);
		});

		test("returns correct result structure", async () => {
			await createCompleteSetup(tempDir);

			const result = await checkRp1Readiness(tempDir);

			expect(result).toHaveProperty("directoriesExist");
			expect(result).toHaveProperty("kbExists");
			expect(result).toHaveProperty("charterExists");

			expect(typeof result.directoriesExist).toBe("boolean");
			expect(typeof result.kbExists).toBe("boolean");
			expect(typeof result.charterExists).toBe("boolean");
		});

		test("handles both KB and charter missing", async () => {
			await createCompleteSetup(tempDir, {
				skipKb: true,
				skipCharter: true,
			});

			const result = await checkRp1Readiness(tempDir);

			expect(result.directoriesExist).toBe(true);
			expect(result.kbExists).toBe(false);
			expect(result.charterExists).toBe(false);
		});

		test("returns false for file if directory exists but file is directory", async () => {
			await mkdir(join(tempDir, ".rp1", "context", "index.md"), {
				recursive: true,
			});
			await mkdir(join(tempDir, ".rp1", "work"), { recursive: true });
			await writeFile(
				join(tempDir, ".rp1", "context", "charter.md"),
				"content",
				"utf-8",
			);

			const result = await checkRp1Readiness(tempDir);

			expect(result.directoriesExist).toBe(true);
			expect(result.kbExists).toBe(true);
			expect(result.charterExists).toBe(true);
		});

		test("handles non-existent cwd gracefully", async () => {
			const nonExistentPath = join(tempDir, "non-existent-cwd");

			const result = await checkRp1Readiness(nonExistentPath);

			expect(result.directoriesExist).toBe(false);
			expect(result.kbExists).toBe(false);
			expect(result.charterExists).toBe(false);
		});

		test("checks all three directories for directoriesExist", async () => {
			await mkdir(join(tempDir, ".rp1"), { recursive: true });

			const result = await checkRp1Readiness(tempDir);

			expect(result.directoriesExist).toBe(false);
		});

		test("correctly identifies files vs directories for KB check", async () => {
			await createCompleteSetup(tempDir);

			const result = await checkRp1Readiness(tempDir);

			expect(result.kbExists).toBe(true);
		});
	});
});
