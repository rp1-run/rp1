/**
 * Unit tests for worktree status detection.
 * Tests detection of worktree vs non-worktree context.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getWorktreeStatus } from "../../../agent-tools/worktree/status.js";
import { expectTaskLeft, expectTaskRight } from "../../helpers/index.js";

describe("worktree status detection", () => {
	let tempBase: string;
	let standardRepoRoot: string;
	let worktreeRepoRoot: string;
	let linkedWorktreePath: string;
	let nonGitDir: string;

	beforeAll(async () => {
		// Create unique temp directory for this test run
		// Use realpath to resolve symlinks (macOS /var -> /private/var)
		const tempDir = join(tmpdir(), `worktree-status-test-${Date.now()}`);
		await mkdir(tempDir, { recursive: true });
		tempBase = await realpath(tempDir);

		// Create a standard git repo (non-worktree)
		standardRepoRoot = join(tempBase, "standard-repo");
		await mkdir(standardRepoRoot, { recursive: true });
		const initStandard = Bun.spawn(["git", "init"], {
			cwd: standardRepoRoot,
			stdout: "pipe",
			stderr: "pipe",
		});
		await initStandard.exited;

		// Configure git user
		const configEmail = Bun.spawn(
			["git", "config", "user.email", "test@test.com"],
			{ cwd: standardRepoRoot, stdout: "pipe", stderr: "pipe" },
		);
		await configEmail.exited;
		const configName = Bun.spawn(["git", "config", "user.name", "Test User"], {
			cwd: standardRepoRoot,
			stdout: "pipe",
			stderr: "pipe",
		});
		await configName.exited;

		// Create a file and commit
		await Bun.write(join(standardRepoRoot, "README.md"), "# Test Repo");
		const addProc = Bun.spawn(["git", "add", "."], {
			cwd: standardRepoRoot,
			stdout: "pipe",
			stderr: "pipe",
		});
		await addProc.exited;
		const commitProc = Bun.spawn(["git", "commit", "-m", "Initial commit"], {
			cwd: standardRepoRoot,
			stdout: "pipe",
			stderr: "pipe",
		});
		await commitProc.exited;

		// Create a repo with a linked worktree
		worktreeRepoRoot = join(tempBase, "worktree-main");
		await mkdir(worktreeRepoRoot, { recursive: true });
		const initWorktree = Bun.spawn(["git", "init"], {
			cwd: worktreeRepoRoot,
			stdout: "pipe",
			stderr: "pipe",
		});
		await initWorktree.exited;

		// Configure git user for worktree repo
		const wtConfigEmail = Bun.spawn(
			["git", "config", "user.email", "test@test.com"],
			{ cwd: worktreeRepoRoot, stdout: "pipe", stderr: "pipe" },
		);
		await wtConfigEmail.exited;
		const wtConfigName = Bun.spawn(
			["git", "config", "user.name", "Test User"],
			{
				cwd: worktreeRepoRoot,
				stdout: "pipe",
				stderr: "pipe",
			},
		);
		await wtConfigName.exited;

		// Create initial commit in worktree repo
		await Bun.write(join(worktreeRepoRoot, "README.md"), "# Worktree Main");
		const wtAddProc = Bun.spawn(["git", "add", "."], {
			cwd: worktreeRepoRoot,
			stdout: "pipe",
			stderr: "pipe",
		});
		await wtAddProc.exited;
		const wtCommitProc = Bun.spawn(["git", "commit", "-m", "Initial commit"], {
			cwd: worktreeRepoRoot,
			stdout: "pipe",
			stderr: "pipe",
		});
		await wtCommitProc.exited;

		// Create a linked worktree
		linkedWorktreePath = join(tempBase, "linked-worktree");
		const worktreeAddProc = Bun.spawn(
			["git", "worktree", "add", "-b", "feature-branch", linkedWorktreePath],
			{ cwd: worktreeRepoRoot, stdout: "pipe", stderr: "pipe" },
		);
		await worktreeAddProc.exited;

		// Create a non-git directory
		nonGitDir = join(tempBase, "not-a-repo");
		await mkdir(nonGitDir, { recursive: true });
	});

	afterAll(async () => {
		// Remove linked worktree first (git cleanup)
		const worktreeRemoveProc = Bun.spawn(
			["git", "worktree", "remove", "--force", linkedWorktreePath],
			{ cwd: worktreeRepoRoot, stdout: "pipe", stderr: "pipe" },
		);
		await worktreeRemoveProc.exited;

		// Cleanup temp directories
		await rm(tempBase, { recursive: true, force: true });
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
