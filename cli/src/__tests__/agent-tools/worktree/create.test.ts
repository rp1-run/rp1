/**
 * Unit tests for worktree creation.
 * Tests clean creation and branch collision handling.
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
import {
	createWorktree,
	DEFAULT_PREFIX,
} from "../../../agent-tools/worktree/create.js";
import {
	assertTestIsolation,
	expectTaskLeft,
	expectTaskRight,
	getErrorMessage,
} from "../../helpers/index.js";

describe("worktree creation", () => {
	let tempBase: string;
	let repoRoot: string;
	let originalEnv: string | undefined;
	let createdWorktrees: string[] = [];

	beforeAll(async () => {
		// Save original RP1_ROOT env value
		originalEnv = process.env.RP1_ROOT;
		delete process.env.RP1_ROOT;

		// Create unique temp directory for this test run
		const tempDir = join(tmpdir(), `worktree-create-test-${Date.now()}`);
		await mkdir(tempDir, { recursive: true });
		tempBase = await realpath(tempDir);

		// CRITICAL: Verify test isolation to prevent main repo contamination
		await assertTestIsolation(tempBase);

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

	afterEach(async () => {
		// Cleanup any created worktrees
		for (const wtPath of createdWorktrees) {
			try {
				const removeProc = Bun.spawn(
					["git", "worktree", "remove", "--force", wtPath],
					{ cwd: repoRoot, stdout: "pipe", stderr: "pipe" },
				);
				await removeProc.exited;
			} catch {
				// Ignore errors during cleanup
			}
		}
		createdWorktrees = [];

		// Ensure RP1_ROOT is cleared
		delete process.env.RP1_ROOT;
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

	describe("clean creation", () => {
		test("creates worktree at expected path", async () => {
			const result = await expectTaskRight(
				createWorktree({ slug: "test-feature" }, repoRoot),
			);

			createdWorktrees.push(result.path);

			expect(result.path).toContain(".rp1/work/worktrees");
			expect(result.path).toContain("quick-build-test-feature");
		});

		test("returns branch name with default prefix", async () => {
			const result = await expectTaskRight(
				createWorktree({ slug: "new-feature" }, repoRoot),
			);

			createdWorktrees.push(result.path);

			expect(result.branch).toBe(`${DEFAULT_PREFIX}-new-feature`);
		});

		test("returns custom prefix when specified", async () => {
			const result = await expectTaskRight(
				createWorktree({ slug: "feature", prefix: "custom" }, repoRoot),
			);

			createdWorktrees.push(result.path);

			expect(result.branch).toBe("custom-feature");
		});

		test("returns HEAD commit SHA as basedOn", async () => {
			// Get current HEAD
			const headProc = Bun.spawn(["git", "rev-parse", "HEAD"], {
				cwd: repoRoot,
				stdout: "pipe",
				stderr: "pipe",
			});
			await headProc.exited;
			const expectedSha = (await new Response(headProc.stdout).text()).trim();

			const result = await expectTaskRight(
				createWorktree({ slug: "sha-test" }, repoRoot),
			);

			createdWorktrees.push(result.path);

			expect(result.basedOn).toBe(expectedSha);
		});

		test("created worktree directory exists", async () => {
			const result = await expectTaskRight(
				createWorktree({ slug: "dir-test" }, repoRoot),
			);

			createdWorktrees.push(result.path);

			const file = Bun.file(join(result.path, "README.md"));
			expect(await file.exists()).toBe(true);
		});
	});

	describe("branch collision handling", () => {
		test("appends -2 suffix when branch already exists", async () => {
			// Create first worktree
			const first = await expectTaskRight(
				createWorktree({ slug: "collision" }, repoRoot),
			);
			createdWorktrees.push(first.path);
			expect(first.branch).toBe("quick-build-collision");

			// Create second worktree with same slug
			const second = await expectTaskRight(
				createWorktree({ slug: "collision" }, repoRoot),
			);
			createdWorktrees.push(second.path);

			expect(second.branch).toBe("quick-build-collision-2");
		});

		test("appends -3 suffix when -2 branch also exists", async () => {
			// Create first two worktrees
			const first = await expectTaskRight(
				createWorktree({ slug: "multi-collision" }, repoRoot),
			);
			createdWorktrees.push(first.path);

			const second = await expectTaskRight(
				createWorktree({ slug: "multi-collision" }, repoRoot),
			);
			createdWorktrees.push(second.path);

			// Create third worktree with same slug
			const third = await expectTaskRight(
				createWorktree({ slug: "multi-collision" }, repoRoot),
			);
			createdWorktrees.push(third.path);

			expect(third.branch).toBe("quick-build-multi-collision-3");
		});

		test("each collision creates unique worktree path", async () => {
			const first = await expectTaskRight(
				createWorktree({ slug: "unique-paths" }, repoRoot),
			);
			createdWorktrees.push(first.path);

			const second = await expectTaskRight(
				createWorktree({ slug: "unique-paths" }, repoRoot),
			);
			createdWorktrees.push(second.path);

			expect(first.path).not.toBe(second.path);
		});
	});

	describe("error cases", () => {
		test("returns error for non-git directory", async () => {
			const nonGitDir = join(tempBase, "not-a-repo");
			await mkdir(nonGitDir, { recursive: true });

			const error = await expectTaskLeft(
				createWorktree({ slug: "test" }, nonGitDir),
			);

			expect(error._tag).toBe("RuntimeError");
		});

		test("returns error for non-existent directory", async () => {
			const nonExistent = join(tempBase, "does-not-exist");

			const error = await expectTaskLeft(
				createWorktree({ slug: "test" }, nonExistent),
			);

			expect(error._tag).toBe("RuntimeError");
		});

		test("returns error when running from inside a worktree", async () => {
			// Create an actual git worktree to test nesting prevention
			const existingWorktreePath = join(tempBase, "existing-worktree");
			const createWtProc = Bun.spawn(
				[
					"git",
					"worktree",
					"add",
					"-b",
					"existing-branch",
					existingWorktreePath,
				],
				{ cwd: repoRoot, stdout: "pipe", stderr: "pipe" },
			);
			await createWtProc.exited;

			// Try to create a new worktree from inside the existing one
			const error = await expectTaskLeft(
				createWorktree({ slug: "nested" }, existingWorktreePath),
			);

			expect(error._tag).toBe("UsageError");
			expect(getErrorMessage(error)).toContain("inside another worktree");

			// Cleanup
			const removeWtProc = Bun.spawn(
				["git", "worktree", "remove", "--force", existingWorktreePath],
				{ cwd: repoRoot, stdout: "pipe", stderr: "pipe" },
			);
			await removeWtProc.exited;
		});
	});
});
