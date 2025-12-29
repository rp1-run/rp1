/**
 * Unit tests for rp1-root-dir resolver module.
 * Tests path resolution logic with worktree detection.
 */

import {
	afterAll,
	afterEach,
	beforeAll,
	describe,
	expect,
	test,
} from "bun:test";
import { mkdir, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveRp1Root } from "../../../agent-tools/rp1-root-dir/resolver.js";
import {
	expectTaskLeft,
	expectTaskRight,
	getErrorMessage,
} from "../../helpers/index.js";

describe("rp1-root-dir resolver", () => {
	let tempBase: string;
	let standardRepoRoot: string;
	let worktreeRepoRoot: string;
	let linkedWorktreePath: string;
	let nonGitDir: string;
	let originalEnv: string | undefined;

	beforeAll(async () => {
		// Save original RP1_ROOT env value
		originalEnv = process.env.RP1_ROOT;
		// Clear it for most tests
		delete process.env.RP1_ROOT;

		// Create unique temp directory for this test run
		// Use realpath to resolve symlinks (macOS /var -> /private/var)
		const tempDir = join(tmpdir(), `rp1-root-dir-test-${Date.now()}`);
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

		// Create an initial commit so we can create worktrees
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
			{ cwd: worktreeRepoRoot, stdout: "pipe", stderr: "pipe" },
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
			["git", "worktree", "add", "-b", "test-branch", linkedWorktreePath],
			{ cwd: worktreeRepoRoot, stdout: "pipe", stderr: "pipe" },
		);
		await worktreeAddProc.exited;

		// Create a non-git directory
		nonGitDir = join(tempBase, "not-a-repo");
		await mkdir(nonGitDir, { recursive: true });
	});

	afterAll(async () => {
		// Restore original RP1_ROOT
		if (originalEnv !== undefined) {
			process.env.RP1_ROOT = originalEnv;
		} else {
			delete process.env.RP1_ROOT;
		}

		// Remove linked worktree first (git cleanup)
		const worktreeRemoveProc = Bun.spawn(
			["git", "worktree", "remove", "--force", linkedWorktreePath],
			{ cwd: worktreeRepoRoot, stdout: "pipe", stderr: "pipe" },
		);
		await worktreeRemoveProc.exited;

		// Cleanup temp directories
		await rm(tempBase, { recursive: true, force: true });
	});

	afterEach(() => {
		// Ensure RP1_ROOT is cleared after each test
		delete process.env.RP1_ROOT;
	});

	describe("standard repo (non-worktree)", () => {
		test("returns isWorktree: false and source: 'cwd' for standard git repo", async () => {
			const result = await expectTaskRight(resolveRp1Root(standardRepoRoot));

			expect(result.isWorktree).toBe(false);
			expect(result.source).toBe("cwd");
			expect(result.root).toBe(join(standardRepoRoot, ".rp1"));
			expect(result.worktreeName).toBeUndefined();
		});

		test("returns correct root from subdirectory of standard repo", async () => {
			const subDir = join(standardRepoRoot, "src");
			await mkdir(subDir, { recursive: true });

			const result = await expectTaskRight(resolveRp1Root(subDir));

			expect(result.isWorktree).toBe(false);
			expect(result.source).toBe("cwd");
			expect(result.root).toBe(join(standardRepoRoot, ".rp1"));
		});
	});

	describe("linked worktree", () => {
		test("returns isWorktree: true and source: 'git-common-dir' when in linked worktree", async () => {
			const result = await expectTaskRight(resolveRp1Root(linkedWorktreePath));

			expect(result.isWorktree).toBe(true);
			expect(result.source).toBe("git-common-dir");
			expect(result.root).toBe(join(worktreeRepoRoot, ".rp1"));
			expect(result.worktreeName).toBe("test-branch");
		});

		test("returns main repo root path from linked worktree", async () => {
			const result = await expectTaskRight(resolveRp1Root(linkedWorktreePath));

			// The root should point to the main repo, not the worktree
			expect(result.root).not.toContain("linked-worktree");
			expect(result.root).toContain("worktree-main");
		});
	});

	describe("RP1_ROOT env override", () => {
		test("returns env value with source: 'env' when RP1_ROOT is set", async () => {
			const customRoot = join(tempBase, "custom-rp1-root");
			process.env.RP1_ROOT = customRoot;

			const result = await expectTaskRight(resolveRp1Root(standardRepoRoot));

			expect(result.source).toBe("env");
			expect(result.root).toBe(customRoot);
			expect(result.isWorktree).toBe(false);
		});

		test("env override takes precedence over git detection", async () => {
			const customRoot = join(tempBase, "env-override");
			process.env.RP1_ROOT = customRoot;

			// Even when in a worktree, env should win
			const result = await expectTaskRight(resolveRp1Root(linkedWorktreePath));

			expect(result.source).toBe("env");
			expect(result.root).toBe(customRoot);
			// isWorktree should be false when using env override
			expect(result.isWorktree).toBe(false);
		});

		test("env override resolves relative paths to absolute", async () => {
			process.env.RP1_ROOT = "./relative/.rp1";

			const result = await expectTaskRight(resolveRp1Root(standardRepoRoot));

			expect(result.source).toBe("env");
			// Should be absolute path
			expect(result.root.startsWith("/")).toBe(true);
		});
	});

	describe("not a git repo", () => {
		test("returns error when not in a git repository", async () => {
			const error = await expectTaskLeft(resolveRp1Root(nonGitDir));

			expect(error._tag).toBe("RuntimeError");
			expect(getErrorMessage(error)).toContain("Git command failed");
		});

		test("returns error for non-existent directory", async () => {
			const nonExistentPath = join(tempBase, "does-not-exist");

			const error = await expectTaskLeft(resolveRp1Root(nonExistentPath));

			expect(error._tag).toBe("RuntimeError");
		});
	});
});
