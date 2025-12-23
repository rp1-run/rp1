/**
 * Unit tests for the git root detection module.
 * Tests detection of git repository root location.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { detectGitRoot } from "../../init/git-root.js";
import { expectTaskRight } from "../helpers/index.js";

describe("git-root", () => {
	// Create temp directories for testing
	let tempBase: string;
	let gitRepoRoot: string;
	let gitSubdir: string;
	let nonGitDir: string;

	beforeAll(async () => {
		// Create unique temp directory for this test run
		// Use realpath to resolve symlinks (macOS /var -> /private/var)
		const tempDir = join(tmpdir(), `rp1-git-root-test-${Date.now()}`);
		await mkdir(tempDir, { recursive: true });
		tempBase = await realpath(tempDir);

		// Create a git repo
		gitRepoRoot = join(tempBase, "my-repo");
		await mkdir(gitRepoRoot, { recursive: true });

		// Initialize git repo
		const initProc = Bun.spawn(["git", "init"], {
			cwd: gitRepoRoot,
			stdout: "pipe",
			stderr: "pipe",
		});
		await initProc.exited;

		// Create a subdirectory inside the repo
		gitSubdir = join(gitRepoRoot, "src", "lib");
		await mkdir(gitSubdir, { recursive: true });

		// Create a non-git directory
		nonGitDir = join(tempBase, "not-a-repo");
		await mkdir(nonGitDir, { recursive: true });
	});

	afterAll(async () => {
		// Cleanup temp directories
		await rm(tempBase, { recursive: true, force: true });
	});

	describe("detectGitRoot", () => {
		test("returns isAtRoot=true when at git root", async () => {
			const result = await expectTaskRight(detectGitRoot(gitRepoRoot));

			expect(result.isGitRepo).toBe(true);
			expect(result.isAtRoot).toBe(true);
			expect(result.gitRoot).toBe(gitRepoRoot);
			expect(result.currentDir).toBe(gitRepoRoot);
		});

		test("returns isAtRoot=false when in subdirectory", async () => {
			const result = await expectTaskRight(detectGitRoot(gitSubdir));

			expect(result.isGitRepo).toBe(true);
			expect(result.isAtRoot).toBe(false);
			expect(result.gitRoot).toBe(gitRepoRoot);
			expect(result.currentDir).toBe(gitSubdir);
		});

		test("returns isGitRepo=false when not in a git repo", async () => {
			const result = await expectTaskRight(detectGitRoot(nonGitDir));

			expect(result.isGitRepo).toBe(false);
			expect(result.isAtRoot).toBe(false);
			expect(result.gitRoot).toBeNull();
			expect(result.currentDir).toBe(nonGitDir);
		});

		test("handles trailing slashes in path", async () => {
			const pathWithSlash = `${gitRepoRoot}/`;
			const result = await expectTaskRight(detectGitRoot(pathWithSlash));

			expect(result.isGitRepo).toBe(true);
			// Should still match after normalization
			expect(result.isAtRoot).toBe(true);
		});

		test("handles non-existent directory gracefully", async () => {
			const nonExistentPath = join(tempBase, "does-not-exist");
			const result = await expectTaskRight(detectGitRoot(nonExistentPath));

			expect(result.isGitRepo).toBe(false);
			expect(result.isAtRoot).toBe(false);
			expect(result.gitRoot).toBeNull();
		});

		test("never throws - always returns result", async () => {
			// Even with an invalid path, should not throw
			const result = await expectTaskRight(
				detectGitRoot("/invalid/path/that/does/not/exist"),
			);

			expect(result.isGitRepo).toBe(false);
			expect(result.isAtRoot).toBe(false);
		});
	});

	describe("edge cases", () => {
		test("detects git root from deeply nested subdirectory", async () => {
			const deepPath = join(gitRepoRoot, "a", "b", "c", "d");
			await mkdir(deepPath, { recursive: true });

			const result = await expectTaskRight(detectGitRoot(deepPath));

			expect(result.isGitRepo).toBe(true);
			expect(result.isAtRoot).toBe(false);
			expect(result.gitRoot).toBe(gitRepoRoot);
		});

		test("currentDir always reflects input path", async () => {
			const paths = [gitRepoRoot, gitSubdir, nonGitDir];

			for (const path of paths) {
				const result = await expectTaskRight(detectGitRoot(path));
				expect(result.currentDir).toBe(path);
			}
		});
	});
});
