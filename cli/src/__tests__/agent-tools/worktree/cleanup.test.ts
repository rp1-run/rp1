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
	assertTestIsolation,
	captureMainRepoState,
	createInitialCommit,
	expectTaskLeft,
	expectTaskRight,
	getErrorMessage,
	initTestRepo,
	spawnGit,
	verifyNoMainRepoContamination,
} from "../../helpers/index.js";

describe("worktree cleanup", () => {
	let tempBase: string;
	let repoRoot: string;
	let originalEnv: string | undefined;
	let mainRepoSnapshot: Awaited<ReturnType<typeof captureMainRepoState>>;

	beforeAll(async () => {
		mainRepoSnapshot = await captureMainRepoState();
		originalEnv = process.env.RP1_ROOT;
		delete process.env.RP1_ROOT;

		const tempDir = join(tmpdir(), `worktree-cleanup-test-${Date.now()}`);
		await mkdir(tempDir, { recursive: true });
		tempBase = await realpath(tempDir);

		await assertTestIsolation(tempBase);

		repoRoot = join(tempBase, "test-repo");
		await mkdir(repoRoot, { recursive: true });
		await initTestRepo(repoRoot);
		await createInitialCommit(repoRoot);
	});

	afterAll(async () => {
		if (originalEnv !== undefined) {
			process.env.RP1_ROOT = originalEnv;
		} else {
			delete process.env.RP1_ROOT;
		}

		await rm(tempBase, { recursive: true, force: true });
		await verifyNoMainRepoContamination(mainRepoSnapshot);
	});

	/**
	 * Helper to check if a branch exists locally.
	 */
	const branchExists = async (
		branchName: string,
		cwd: string,
	): Promise<boolean> => {
		const proc = spawnGit(
			["show-ref", "--verify", "--quiet", `refs/heads/${branchName}`],
			{ cwd },
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
			const createResult = await expectTaskRight(
				createWorktree({ slug: "cleanup-keep" }, repoRoot),
			);

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

			await Bun.write(
				join(createResult.path, "dirty-file.txt"),
				"uncommitted changes",
			);

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

	describe("cleanup works from any directory", () => {
		test("succeeds when cwd is the worktree directory", async () => {
			const createResult = await expectTaskRight(
				createWorktree({ slug: "cwd-inside" }, repoRoot),
			);

			const cleanupResult = await expectTaskRight(
				cleanupWorktree(
					{ path: createResult.path, keepBranch: false },
					createResult.path,
				),
			);

			expect(cleanupResult.removed).toBe(true);
		});

		test("succeeds when cwd is inside the worktree", async () => {
			const createResult = await expectTaskRight(
				createWorktree({ slug: "cwd-nested" }, repoRoot),
			);

			const subdir = join(createResult.path, "subdir");
			await mkdir(subdir, { recursive: true });

			const cleanupResult = await expectTaskRight(
				cleanupWorktree({ path: createResult.path, keepBranch: false }, subdir),
			);

			expect(cleanupResult.removed).toBe(true);
		});

		test("succeeds when cwd is outside the worktree", async () => {
			const createResult = await expectTaskRight(
				createWorktree({ slug: "cwd-outside" }, repoRoot),
			);

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
