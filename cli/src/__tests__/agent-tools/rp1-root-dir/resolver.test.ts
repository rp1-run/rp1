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
	captureMainRepoState,
	createInitialCommit,
	createTestWorktree,
	expectTaskRight,
	initTestRepo,
	removeTestWorktree,
	verifyNoMainRepoContamination,
} from "../../helpers/index.js";

describe("rp1-root-dir resolver", () => {
	let tempBase: string;
	let standardRepoRoot: string;
	let worktreeRepoRoot: string;
	let linkedWorktreePath: string;
	let nonGitDir: string;
	let originalProjectRootEnv: string | undefined;
	let mainRepoSnapshot: Awaited<ReturnType<typeof captureMainRepoState>>;

	beforeAll(async () => {
		// Capture main repo state before tests for contamination detection
		mainRepoSnapshot = await captureMainRepoState();

		// Save original RP1_PROJECT_ROOT env value
		originalProjectRootEnv = process.env.RP1_PROJECT_ROOT;
		// Clear it for most tests
		delete process.env.RP1_PROJECT_ROOT;

		// Create unique temp directory for this test run
		// Use realpath to resolve symlinks (macOS /var -> /private/var)
		const tempDir = join(tmpdir(), `rp1-root-dir-test-${Date.now()}`);
		await mkdir(tempDir, { recursive: true });
		tempBase = await realpath(tempDir);

		// Create a standard git repo (non-worktree) using isolated git
		standardRepoRoot = join(tempBase, "standard-repo");
		await mkdir(standardRepoRoot, { recursive: true });
		await initTestRepo(standardRepoRoot);
		await createInitialCommit(standardRepoRoot);

		// Create a repo with a linked worktree using isolated git
		worktreeRepoRoot = join(tempBase, "worktree-main");
		await mkdir(worktreeRepoRoot, { recursive: true });
		await mkdir(join(worktreeRepoRoot, ".rp1"), { recursive: true });
		await initTestRepo(worktreeRepoRoot);

		// Create initial commit with different content
		await Bun.write(join(worktreeRepoRoot, "README.md"), "# Worktree Main");
		await createInitialCommit(worktreeRepoRoot);

		// Create a linked worktree using isolated git
		linkedWorktreePath = join(tempBase, "linked-worktree");
		await createTestWorktree(
			worktreeRepoRoot,
			linkedWorktreePath,
			"test-branch",
		);

		// Create a non-git directory
		nonGitDir = join(tempBase, "not-a-repo");
		await mkdir(nonGitDir, { recursive: true });
	});

	afterAll(async () => {
		// Restore original RP1_PROJECT_ROOT
		if (originalProjectRootEnv !== undefined) {
			process.env.RP1_PROJECT_ROOT = originalProjectRootEnv;
		} else {
			delete process.env.RP1_PROJECT_ROOT;
		}

		// Remove linked worktree first using isolated git
		await removeTestWorktree(worktreeRepoRoot, linkedWorktreePath, true);

		// Cleanup temp directories
		await rm(tempBase, { recursive: true, force: true });

		// Verify main repo wasn't contaminated
		await verifyNoMainRepoContamination(mainRepoSnapshot);
	});

	afterEach(() => {
		// Ensure RP1_PROJECT_ROOT is cleared after each test
		delete process.env.RP1_PROJECT_ROOT;
	});

	describe("standard repo (non-worktree)", () => {
		test("returns resolved directory metadata for standard git repo", async () => {
			const result = await expectTaskRight(resolveRp1Root(standardRepoRoot));

			expect(result.isWorktree).toBe(false);
			expect(result.source).toBe("cwd");
			expect(result.projectRoot).toBe(standardRepoRoot);
			expect(result.kbRoot).toBe(join(standardRepoRoot, ".rp1", "context"));
			expect(result.workRoot).toContain(".rp1");
			expect(result.worktreeName).toBeUndefined();
			expect(result.sources).toEqual({
				projectRoot: "git_repo_root",
				kbRoot: "default",
				workRoot: "default",
			});
		});

		test("returns correct projectRoot from subdirectory of standard repo", async () => {
			const subDir = join(standardRepoRoot, "src");
			await mkdir(subDir, { recursive: true });

			const result = await expectTaskRight(resolveRp1Root(subDir));

			expect(result.isWorktree).toBe(false);
			expect(result.source).toBe("cwd");
			expect(result.projectRoot).toBe(standardRepoRoot);
		});
	});

	describe("linked worktree", () => {
		test("returns isWorktree: true and source: 'git-common-dir' when in linked worktree", async () => {
			const result = await expectTaskRight(resolveRp1Root(linkedWorktreePath));

			expect(result.isWorktree).toBe(true);
			expect(result.source).toBe("git-common-dir");
			expect(result.projectRoot).toBe(worktreeRepoRoot);
			expect(result.worktreeName).toBe("test-branch");
		});

		test("returns main repo projectRoot from linked worktree", async () => {
			const result = await expectTaskRight(resolveRp1Root(linkedWorktreePath));

			// The projectRoot should point to the main repo, not the worktree
			expect(result.projectRoot).not.toContain("linked-worktree");
			expect(result.projectRoot).toContain("worktree-main");
		});
	});

	describe("RP1_PROJECT_ROOT env override", () => {
		test("returns env value with source metadata when RP1_PROJECT_ROOT is set", async () => {
			const customProjectRoot = join(tempBase, "custom-project");
			process.env.RP1_PROJECT_ROOT = customProjectRoot;

			const result = await expectTaskRight(resolveRp1Root(standardRepoRoot));

			expect(result.source).toBe("env");
			expect(result.projectRoot).toBe(customProjectRoot);
			expect(result.kbRoot).toBe(join(customProjectRoot, ".rp1", "context"));
			expect(result.sources.projectRoot).toBe("env");
			expect(result.sources.kbRoot).toBe("default");
			expect(result.sources.workRoot).toBe("default");
			expect(result.isWorktree).toBe(false);
		});

		test("env override takes precedence over git detection", async () => {
			const customProjectRoot = join(tempBase, "env-override");
			process.env.RP1_PROJECT_ROOT = customProjectRoot;

			// Even when in a worktree, env should win
			const result = await expectTaskRight(resolveRp1Root(linkedWorktreePath));

			expect(result.source).toBe("env");
			expect(result.projectRoot).toBe(customProjectRoot);
			// isWorktree should be false when using env override
			expect(result.isWorktree).toBe(false);
		});

		test("env override resolves relative paths to absolute", async () => {
			process.env.RP1_PROJECT_ROOT = "./relative/project";

			const result = await expectTaskRight(resolveRp1Root(standardRepoRoot));

			expect(result.source).toBe("env");
			// projectRoot should be absolute path
			expect(result.projectRoot.startsWith("/")).toBe(true);
		});
	});

	describe("not a git repo", () => {
		test("falls back to cwd when not in a git repository", async () => {
			const result = await expectTaskRight(resolveRp1Root(nonGitDir));

			expect(result.projectRoot).toBe(nonGitDir);
			expect(result.source).toBe("cwd");
			expect(result.isWorktree).toBe(false);
		});

		test("falls back to cwd for non-existent directories", async () => {
			const nonExistentPath = join(tempBase, "does-not-exist");
			const result = await expectTaskRight(resolveRp1Root(nonExistentPath));

			expect(result.projectRoot).toBe(nonExistentPath);
			expect(result.source).toBe("cwd");
		});
	});
});
