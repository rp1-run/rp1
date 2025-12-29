/**
 * Unit tests for worktree cleanup.
 * Tests success cleanup with branch kept and cleanup with branch deleted.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cleanupWorktree } from "../../../agent-tools/worktree/cleanup.js";
import { createWorktree } from "../../../agent-tools/worktree/create.js";
import {
	expectTaskLeft,
	expectTaskRight,
	getErrorMessage,
} from "../../helpers/index.js";

describe("worktree cleanup", () => {
	let tempBase: string;
	let repoRoot: string;
	let originalEnv: string | undefined;

	beforeAll(async () => {
		// Save original RP1_ROOT env value
		originalEnv = process.env.RP1_ROOT;
		delete process.env.RP1_ROOT;

		// Create unique temp directory for this test run
		const tempDir = join(tmpdir(), `worktree-cleanup-test-${Date.now()}`);
		await mkdir(tempDir, { recursive: true });
		tempBase = await realpath(tempDir);

		// Create a git repo for testing
		repoRoot = join(tempBase, "test-repo");
		await mkdir(repoRoot, { recursive: true });
		const initProc = Bun.spawn(["git", "init"], {
			cwd: repoRoot,
			stdout: "pipe",
			stderr: "pipe",
		});
		await initProc.exited;

		// Configure git user
		const configEmail = Bun.spawn(
			["git", "config", "user.email", "test@test.com"],
			{ cwd: repoRoot, stdout: "pipe", stderr: "pipe" },
		);
		await configEmail.exited;
		const configName = Bun.spawn(["git", "config", "user.name", "Test User"], {
			cwd: repoRoot,
			stdout: "pipe",
			stderr: "pipe",
		});
		await configName.exited;

		// Create initial commit
		await Bun.write(join(repoRoot, "README.md"), "# Test Repo");
		const addProc = Bun.spawn(["git", "add", "."], {
			cwd: repoRoot,
			stdout: "pipe",
			stderr: "pipe",
		});
		await addProc.exited;
		const commitProc = Bun.spawn(["git", "commit", "-m", "Initial commit"], {
			cwd: repoRoot,
			stdout: "pipe",
			stderr: "pipe",
		});
		await commitProc.exited;
	});

	afterAll(async () => {
		// Restore original RP1_ROOT
		if (originalEnv !== undefined) {
			process.env.RP1_ROOT = originalEnv;
		} else {
			delete process.env.RP1_ROOT;
		}

		// Cleanup temp directories
		await rm(tempBase, { recursive: true, force: true });
	});

	/**
	 * Helper to check if a branch exists locally.
	 */
	const branchExists = async (
		branchName: string,
		cwd: string,
	): Promise<boolean> => {
		const proc = Bun.spawn(
			["git", "show-ref", "--verify", "--quiet", `refs/heads/${branchName}`],
			{ cwd, stdout: "pipe", stderr: "pipe" },
		);
		const exitCode = await proc.exited;
		return exitCode === 0;
	};

	/**
	 * Helper to check if a path exists.
	 */
	const pathExists = async (path: string): Promise<boolean> => {
		const file = Bun.file(path);
		try {
			return await file.exists();
		} catch {
			return false;
		}
	};

	describe("success cleanup with branch kept (default)", () => {
		test("removes worktree directory", async () => {
			// Create a worktree first
			const createResult = await expectTaskRight(
				createWorktree({ slug: "cleanup-keep" }, repoRoot),
			);

			// Cleanup with default keepBranch=true
			const cleanupResult = await expectTaskRight(
				cleanupWorktree({ path: createResult.path }, repoRoot),
			);

			expect(cleanupResult.removed).toBe(true);
			expect(await pathExists(createResult.path)).toBe(false);
		});

		test("preserves branch when keepBranch is true", async () => {
			const createResult = await expectTaskRight(
				createWorktree({ slug: "keep-branch" }, repoRoot),
			);

			const cleanupResult = await expectTaskRight(
				cleanupWorktree(
					{ path: createResult.path, keepBranch: true },
					repoRoot,
				),
			);

			expect(cleanupResult.branchDeleted).toBe(false);
			expect(await branchExists(createResult.branch, repoRoot)).toBe(true);
		});

		test("returns correct path in result", async () => {
			const createResult = await expectTaskRight(
				createWorktree({ slug: "result-path" }, repoRoot),
			);

			const cleanupResult = await expectTaskRight(
				cleanupWorktree({ path: createResult.path }, repoRoot),
			);

			expect(cleanupResult.path).toBe(createResult.path);
		});
	});

	describe("cleanup with branch deleted", () => {
		test("removes worktree and deletes branch when keepBranch is false", async () => {
			const createResult = await expectTaskRight(
				createWorktree({ slug: "delete-branch" }, repoRoot),
			);

			const cleanupResult = await expectTaskRight(
				cleanupWorktree(
					{ path: createResult.path, keepBranch: false },
					repoRoot,
				),
			);

			expect(cleanupResult.removed).toBe(true);
			expect(cleanupResult.branchDeleted).toBe(true);
			expect(await branchExists(createResult.branch, repoRoot)).toBe(false);
		});

		test("returns branchDeleted: true when branch is deleted", async () => {
			const createResult = await expectTaskRight(
				createWorktree({ slug: "branch-deleted-flag" }, repoRoot),
			);

			const cleanupResult = await expectTaskRight(
				cleanupWorktree(
					{ path: createResult.path, keepBranch: false },
					repoRoot,
				),
			);

			expect(cleanupResult.branchDeleted).toBe(true);
		});
	});

	describe("force cleanup", () => {
		test("force removes worktree with uncommitted changes", async () => {
			const createResult = await expectTaskRight(
				createWorktree({ slug: "dirty-worktree" }, repoRoot),
			);

			// Make uncommitted changes in the worktree
			await Bun.write(
				join(createResult.path, "dirty-file.txt"),
				"uncommitted changes",
			);

			// Cleanup with force
			const cleanupResult = await expectTaskRight(
				cleanupWorktree(
					{ path: createResult.path, force: true, keepBranch: false },
					repoRoot,
				),
			);

			expect(cleanupResult.removed).toBe(true);
			expect(await pathExists(createResult.path)).toBe(false);
		});
	});

	describe("error cases", () => {
		test("returns error for invalid worktree path", async () => {
			const invalidPath = join(repoRoot, "not-a-worktree");

			const error = await expectTaskLeft(
				cleanupWorktree({ path: invalidPath }, repoRoot),
			);

			expect(error._tag).toBe("UsageError");
			expect(getErrorMessage(error)).toContain("not a valid worktree");
		});

		test("returns error for non-existent path", async () => {
			const nonExistent = join(tempBase, "does-not-exist-worktree");

			const error = await expectTaskLeft(
				cleanupWorktree({ path: nonExistent }, repoRoot),
			);

			expect(error._tag).toBe("UsageError");
		});
	});

	describe("safety check: cwd inside worktree", () => {
		test("returns error when cwd is the worktree directory", async () => {
			const createResult = await expectTaskRight(
				createWorktree({ slug: "cwd-safety" }, repoRoot),
			);

			// Try to cleanup with cwd set to the worktree itself
			const error = await expectTaskLeft(
				cleanupWorktree({ path: createResult.path }, createResult.path),
			);

			expect(error._tag).toBe("UsageError");
			expect(getErrorMessage(error)).toContain("current directory is inside");

			// Cleanup properly from repo root
			await expectTaskRight(
				cleanupWorktree(
					{ path: createResult.path, keepBranch: false },
					repoRoot,
				),
			);
		});

		test("returns error when cwd is inside the worktree", async () => {
			const createResult = await expectTaskRight(
				createWorktree({ slug: "cwd-nested-safety" }, repoRoot),
			);

			// Create a subdirectory inside the worktree
			const subdir = join(createResult.path, "subdir");
			await mkdir(subdir, { recursive: true });

			// Try to cleanup with cwd set to a subdirectory of the worktree
			const error = await expectTaskLeft(
				cleanupWorktree({ path: createResult.path }, subdir),
			);

			expect(error._tag).toBe("UsageError");
			expect(getErrorMessage(error)).toContain("current directory is inside");

			// Cleanup properly from repo root
			await expectTaskRight(
				cleanupWorktree(
					{ path: createResult.path, keepBranch: false },
					repoRoot,
				),
			);
		});

		test("succeeds when cwd is outside the worktree", async () => {
			const createResult = await expectTaskRight(
				createWorktree({ slug: "cwd-outside" }, repoRoot),
			);

			// Cleanup from repo root (outside the worktree)
			const cleanupResult = await expectTaskRight(
				cleanupWorktree(
					{ path: createResult.path, keepBranch: false },
					repoRoot,
				),
			);

			expect(cleanupResult.removed).toBe(true);
		});
	});
});
