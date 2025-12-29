/**
 * Tests for shared git utilities.
 */

import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import * as E from "fp-ts/lib/Either.js";
import { pipe } from "fp-ts/lib/function.js";
import {
	branchExists,
	deriveRepoRootFromGitDir,
	execGitCommand,
	execGitCommandMayFail,
	getCurrentBranch,
	getGitCommonDir,
	getGitDir,
	getHeadCommitSha,
	getMainRepoRoot,
	isInsideWorktree,
	withGitContext,
} from "../../agent-tools/git.js";

/** Normalize path to handle macOS /var -> /private/var symlinks */
const normalizePath = (p: string): string => {
	try {
		return realpathSync(p);
	} catch {
		return p;
	}
};

/** Helper to unwrap Right or fail test */
const expectRight = <E, A>(either: E.Either<E, A>): A =>
	pipe(
		either,
		E.match(
			(err) => {
				throw new Error(`Expected Right but got Left: ${JSON.stringify(err)}`);
			},
			(value) => value,
		),
	);

/** Helper to assert Left */
const expectLeft = <E, A>(either: E.Either<E, A>): E =>
	pipe(
		either,
		E.match(
			(err) => err,
			(value) => {
				throw new Error(
					`Expected Left but got Right: ${JSON.stringify(value)}`,
				);
			},
		),
	);

describe("git utilities", () => {
	let testDir: string;
	let repoRoot: string;
	let worktreePath: string;

	beforeAll(async () => {
		testDir = path.join(tmpdir(), `git-utils-test-${Date.now()}`);
		mkdirSync(testDir, { recursive: true });

		repoRoot = path.join(testDir, "test-repo");
		mkdirSync(repoRoot, { recursive: true });

		await Bun.spawn(["git", "init"], { cwd: repoRoot }).exited;
		await Bun.spawn(["git", "config", "user.email", "test@test.com"], {
			cwd: repoRoot,
		}).exited;
		await Bun.spawn(["git", "config", "user.name", "Test User"], {
			cwd: repoRoot,
		}).exited;

		await Bun.write(path.join(repoRoot, "README.md"), "# Test");
		await Bun.spawn(["git", "add", "."], { cwd: repoRoot }).exited;
		await Bun.spawn(["git", "commit", "-m", "Initial commit"], {
			cwd: repoRoot,
		}).exited;

		worktreePath = path.join(testDir, "test-worktree");
		await Bun.spawn(
			["git", "worktree", "add", "-b", "test-branch", worktreePath],
			{ cwd: repoRoot },
		).exited;
	});

	afterAll(() => {
		if (existsSync(testDir)) {
			rmSync(testDir, { recursive: true, force: true });
		}
	});

	describe("execGitCommand", () => {
		it("returns stdout for successful commands", async () => {
			const result = await execGitCommand(["--version"], repoRoot)();
			const output = expectRight(result);
			expect(output).toContain("git version");
		});

		it("returns error for failed commands", async () => {
			const result = await execGitCommand(
				["rev-parse", "nonexistent-ref"],
				repoRoot,
			)();
			expectLeft(result);
		});
	});

	describe("execGitCommandMayFail", () => {
		it("returns success: true for successful commands", async () => {
			const result = await execGitCommandMayFail(["--version"], repoRoot)();
			const { success } = expectRight(result);
			expect(success).toBe(true);
		});

		it("returns success: false for failing commands (not error)", async () => {
			const result = await execGitCommandMayFail(
				["show-ref", "--verify", "--quiet", "refs/heads/nonexistent"],
				repoRoot,
			)();
			const { success } = expectRight(result);
			expect(success).toBe(false);
		});
	});

	describe("getMainRepoRoot", () => {
		it("returns repo root from main repo", async () => {
			const result = await getMainRepoRoot(repoRoot)();
			const root = expectRight(result);
			expect(root).toBe(repoRoot);
		});

		it("returns main repo root from worktree", async () => {
			const result = await getMainRepoRoot(worktreePath)();
			const root = expectRight(result);
			expect(normalizePath(root)).toBe(normalizePath(repoRoot));
		});
	});

	describe("isInsideWorktree", () => {
		it("returns false for main repo", async () => {
			const result = await isInsideWorktree(repoRoot)();
			const isWorktree = expectRight(result);
			expect(isWorktree).toBe(false);
		});

		it("returns true for worktree", async () => {
			const result = await isInsideWorktree(worktreePath)();
			const isWorktree = expectRight(result);
			expect(isWorktree).toBe(true);
		});
	});

	describe("withGitContext", () => {
		it("creates context from main repo", async () => {
			const result = await withGitContext(repoRoot)();
			const ctx = expectRight(result);
			expect(ctx.repoRoot).toBe(repoRoot);
			expect(ctx.cwd).toBe(repoRoot);
			expect(ctx.isWorktree).toBe(false);
		});

		it("creates context from worktree with main repo root", async () => {
			const result = await withGitContext(worktreePath)();
			const ctx = expectRight(result);
			expect(normalizePath(ctx.repoRoot)).toBe(normalizePath(repoRoot));
			expect(ctx.cwd).toBe(worktreePath);
			expect(ctx.isWorktree).toBe(true);
		});
	});

	describe("getCurrentBranch", () => {
		it("returns branch name from main repo", async () => {
			const result = await getCurrentBranch(repoRoot)();
			const branch = expectRight(result);
			expect(branch).toBeDefined();
			expect(["master", "main"]).toContain(branch as string);
		});

		it("returns branch name from worktree", async () => {
			const result = await getCurrentBranch(worktreePath)();
			const branch = expectRight(result);
			expect(branch).toBe("test-branch");
		});
	});

	describe("getHeadCommitSha", () => {
		it("returns 40-character SHA from main repo", async () => {
			const result = await getHeadCommitSha(repoRoot)();
			const sha = expectRight(result);
			expect(sha).toMatch(/^[a-f0-9]{40}$/);
		});

		it("returns same SHA from worktree (based on same commit)", async () => {
			const mainResult = await getHeadCommitSha(repoRoot)();
			const worktreeResult = await getHeadCommitSha(worktreePath)();

			const mainSha = expectRight(mainResult);
			const worktreeSha = expectRight(worktreeResult);
			expect(worktreeSha).toBe(mainSha);
		});
	});

	describe("branchExists", () => {
		it("returns true for existing branch", async () => {
			const result = await branchExists("test-branch", repoRoot)();
			const exists = expectRight(result);
			expect(exists).toBe(true);
		});

		it("returns false for non-existing branch", async () => {
			const result = await branchExists("nonexistent-branch", repoRoot)();
			const exists = expectRight(result);
			expect(exists).toBe(false);
		});
	});

	describe("deriveRepoRootFromGitDir", () => {
		it("derives root from .git path", () => {
			expect(deriveRepoRootFromGitDir("/path/to/repo/.git")).toBe(
				"/path/to/repo",
			);
		});

		it("derives root from .git/worktrees path", () => {
			expect(
				deriveRepoRootFromGitDir("/path/to/repo/.git/worktrees/branch"),
			).toBe("/path/to/repo");
		});
	});

	describe("getGitDir and getGitCommonDir", () => {
		it("returns same path for main repo", async () => {
			const gitDirResult = await getGitDir(repoRoot)();
			const commonDirResult = await getGitCommonDir(repoRoot)();

			const gitDir = path.resolve(repoRoot, expectRight(gitDirResult));
			const commonDir = path.resolve(repoRoot, expectRight(commonDirResult));
			expect(gitDir).toBe(commonDir);
		});

		it("returns different paths for worktree", async () => {
			const gitDirResult = await getGitDir(worktreePath)();
			const commonDirResult = await getGitCommonDir(worktreePath)();

			const gitDir = path.resolve(worktreePath, expectRight(gitDirResult));
			const commonDir = path.resolve(
				worktreePath,
				expectRight(commonDirResult),
			);
			expect(gitDir).not.toBe(commonDir);
		});
	});
});
