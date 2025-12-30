/**
 * Unit tests for worktree status detection.
 * Tests detection of worktree vs non-worktree context.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getWorktreeStatus } from "../../../agent-tools/worktree/status.js";
import {
	captureMainRepoState,
	createInitialCommit,
	createTestWorktree,
	expectTaskLeft,
	expectTaskRight,
	initTestRepo,
	removeTestWorktree,
	verifyNoMainRepoContamination,
} from "../../helpers/index.js";

describe("worktree status detection", () => {
	let tempBase: string;
	let standardRepoRoot: string;
	let worktreeRepoRoot: string;
	let linkedWorktreePath: string;
	let nonGitDir: string;
	let mainRepoSnapshot: Awaited<ReturnType<typeof captureMainRepoState>>;

	beforeAll(async () => {
		// Capture main repo state before tests for contamination detection
		mainRepoSnapshot = await captureMainRepoState();

		// Create unique temp directory for this test run
		// Use realpath to resolve symlinks (macOS /var -> /private/var)
		const tempDir = join(tmpdir(), `worktree-status-test-${Date.now()}`);
		await mkdir(tempDir, { recursive: true });
		tempBase = await realpath(tempDir);

		// Create a standard git repo (non-worktree) with isolated git
		standardRepoRoot = join(tempBase, "standard-repo");
		await mkdir(standardRepoRoot, { recursive: true });
		await initTestRepo(standardRepoRoot);
		await createInitialCommit(standardRepoRoot);

		// Create a repo with a linked worktree using isolated git
		worktreeRepoRoot = join(tempBase, "worktree-main");
		await mkdir(worktreeRepoRoot, { recursive: true });
		await initTestRepo(worktreeRepoRoot);

		// Create initial commit with different content
		await Bun.write(join(worktreeRepoRoot, "README.md"), "# Worktree Main");
		await createInitialCommit(worktreeRepoRoot);

		// Create a linked worktree using isolated git
		linkedWorktreePath = join(tempBase, "linked-worktree");
		await createTestWorktree(
			worktreeRepoRoot,
			linkedWorktreePath,
			"feature-branch",
		);

		// Create a non-git directory
		nonGitDir = join(tempBase, "not-a-repo");
		await mkdir(nonGitDir, { recursive: true });
	});

	afterAll(async () => {
		// Remove linked worktree first using isolated git
		await removeTestWorktree(worktreeRepoRoot, linkedWorktreePath, true);

		// Cleanup temp directories
		await rm(tempBase, { recursive: true, force: true });

		// Verify main repo wasn't contaminated
		await verifyNoMainRepoContamination(mainRepoSnapshot);
	});

	describe("non-worktree context", () => {
		test("returns isWorktree: false for standard git repo", async () => {
			const result = await expectTaskRight(getWorktreeStatus(standardRepoRoot));

			expect(result.isWorktree).toBe(false);
			expect(result.path).toBeUndefined();
			expect(result.branch).toBeUndefined();
			expect(result.mainRepoPath).toBeUndefined();
		});

		test("returns isWorktree: false for main repo with worktrees", async () => {
			const result = await expectTaskRight(getWorktreeStatus(worktreeRepoRoot));

			expect(result.isWorktree).toBe(false);
		});
	});

	describe("worktree context", () => {
		test("returns isWorktree: true when in linked worktree", async () => {
			const result = await expectTaskRight(
				getWorktreeStatus(linkedWorktreePath),
			);

			expect(result.isWorktree).toBe(true);
		});

		test("returns worktree path when in linked worktree", async () => {
			const result = await expectTaskRight(
				getWorktreeStatus(linkedWorktreePath),
			);

			expect(result.path).toBe(linkedWorktreePath);
		});

		test("returns branch name when in linked worktree", async () => {
			const result = await expectTaskRight(
				getWorktreeStatus(linkedWorktreePath),
			);

			expect(result.branch).toBe("feature-branch");
		});

		test("returns main repo path when in linked worktree", async () => {
			const result = await expectTaskRight(
				getWorktreeStatus(linkedWorktreePath),
			);

			expect(result.mainRepoPath).toBe(worktreeRepoRoot);
		});

		test("main repo path does not contain worktree directory", async () => {
			const result = await expectTaskRight(
				getWorktreeStatus(linkedWorktreePath),
			);

			expect(result.mainRepoPath).not.toContain("linked-worktree");
		});
	});

	describe("error cases", () => {
		test("returns error for non-git directory", async () => {
			const error = await expectTaskLeft(getWorktreeStatus(nonGitDir));

			expect(error._tag).toBe("RuntimeError");
		});

		test("returns error for non-existent directory", async () => {
			const nonExistent = join(tempBase, "does-not-exist");

			const error = await expectTaskLeft(getWorktreeStatus(nonExistent));

			expect(error._tag).toBe("RuntimeError");
		});
	});
});
