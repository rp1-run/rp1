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
	captureMainRepoState,
	createInitialCommit,
	expectTaskLeft,
	expectTaskRight,
	initTestRepo,
	removeTestWorktree,
	spawnGit,
	verifyNoMainRepoContamination,
	withEnvOverride,
} from "../../helpers/index.js";

describe("worktree creation", () => {
	let tempBase: string;
	let repoRoot: string;
	let originalEnv: string | undefined;
	let createdWorktrees: string[] = [];
	let mainRepoSnapshot: Awaited<ReturnType<typeof captureMainRepoState>>;

	beforeAll(async () => {
		mainRepoSnapshot = await captureMainRepoState();
		originalEnv = process.env.RP1_ROOT;
		delete process.env.RP1_ROOT;

		const tempDir = join(tmpdir(), `worktree-create-test-${Date.now()}`);
		await mkdir(tempDir, { recursive: true });
		tempBase = await realpath(tempDir);

		await assertTestIsolation(tempBase);

		repoRoot = join(tempBase, "test-repo");
		await mkdir(repoRoot, { recursive: true });
		await initTestRepo(repoRoot);
		await createInitialCommit(repoRoot);
	});

	afterEach(async () => {
		for (const wtPath of createdWorktrees) {
			try {
				await removeTestWorktree(repoRoot, wtPath, true);
			} catch {
				// Intentionally ignored - cleanup is best-effort
			}
		}
		createdWorktrees = [];
		delete process.env.RP1_ROOT;
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
			const headProc = spawnGit(["rev-parse", "HEAD"], { cwd: repoRoot });
			await headProc.exited;
			const expectedSha = (
				await new Response(headProc.stdout as ReadableStream).text()
			).trim();

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

		test("sets core.hooksPath to /dev/null in created worktree", async () => {
			const result = await expectTaskRight(
				createWorktree({ slug: "hooks-test" }, repoRoot),
			);

			createdWorktrees.push(result.path);

			const proc = spawnGit(["config", "--worktree", "core.hooksPath"], {
				cwd: result.path,
			});
			await proc.exited;
			const hooksPath = (
				await new Response(proc.stdout as ReadableStream).text()
			).trim();

			expect(hooksPath).toBe("/dev/null");
		});
	});

	describe("branch collision handling", () => {
		test("appends -2 suffix when branch already exists", async () => {
			const first = await expectTaskRight(
				createWorktree({ slug: "collision" }, repoRoot),
			);
			createdWorktrees.push(first.path);
			expect(first.branch).toBe("quick-build-collision");

			const second = await expectTaskRight(
				createWorktree({ slug: "collision" }, repoRoot),
			);
			createdWorktrees.push(second.path);

			expect(second.branch).toBe("quick-build-collision-2");
		});

		test("appends -3 suffix when -2 branch also exists", async () => {
			const first = await expectTaskRight(
				createWorktree({ slug: "multi-collision" }, repoRoot),
			);
			createdWorktrees.push(first.path);

			const second = await expectTaskRight(
				createWorktree({ slug: "multi-collision" }, repoRoot),
			);
			createdWorktrees.push(second.path);

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

		test("can create worktree from inside another worktree", async () => {
			const first = await expectTaskRight(
				createWorktree({ slug: "outer" }, repoRoot),
			);
			createdWorktrees.push(first.path);

			const second = await expectTaskRight(
				createWorktree({ slug: "inner" }, first.path),
			);
			createdWorktrees.push(second.path);

			expect(second.path).toBeDefined();
			expect(second.branch).toBe("quick-build-inner");
		});
	});

	describe("gitignore validation", () => {
		test("returns error when worktrees directory is not gitignored", async () => {
			// Create a new repo without .gitignore
			const repoNoGitignore = join(tempBase, "repo-no-gitignore-2");
			await mkdir(repoNoGitignore, { recursive: true });
			await initTestRepo(repoNoGitignore);
			await createInitialCommit(repoNoGitignore);

			// Use a custom RP1_ROOT that won't be affected by global gitignore rules
			// (global gitignore typically ignores .rp1/ but not arbitrary paths)
			const customRp1Root = join(repoNoGitignore, "custom-rp1-root");
			await mkdir(join(customRp1Root, "work", "worktrees"), {
				recursive: true,
			});

			// Set RP1_ROOT to the custom path, capture restore function
			const restoreEnv = withEnvOverride("RP1_ROOT", customRp1Root);

			try {
				const error = await expectTaskLeft(
					createWorktree({ slug: "test" }, repoNoGitignore),
				);

				expect(error._tag).toBe("PrerequisiteError");
				if (error._tag === "PrerequisiteError") {
					expect(error.message).toContain("not gitignored");
				}
			} finally {
				restoreEnv();
			}
		});

		test("succeeds when worktrees directory is gitignored", async () => {
			// Create a new repo with proper .gitignore
			const repoWithGitignore = join(tempBase, "repo-with-gitignore");
			await mkdir(repoWithGitignore, { recursive: true });
			await initTestRepo(repoWithGitignore);

			// Use a custom RP1_ROOT and add it to gitignore
			const customRp1Root = join(repoWithGitignore, "custom-rp1-root");

			// Add .gitignore that ignores the custom path
			await Bun.write(
				join(repoWithGitignore, ".gitignore"),
				"custom-rp1-root/\n",
			);

			// Commit gitignore
			const addProc = spawnGit(["add", ".gitignore"], {
				cwd: repoWithGitignore,
			});
			await addProc.exited;
			const commitProc = spawnGit(["commit", "-m", "Add gitignore"], {
				cwd: repoWithGitignore,
			});
			await commitProc.exited;

			// Set RP1_ROOT to the custom path, capture restore function
			const restoreEnv = withEnvOverride("RP1_ROOT", customRp1Root);

			try {
				const result = await expectTaskRight(
					createWorktree({ slug: "test" }, repoWithGitignore),
				);
				createdWorktrees.push(result.path);

				expect(result.path).toContain("custom-rp1-root/work/worktrees");
				expect(result.branch).toBe("quick-build-test");
			} finally {
				restoreEnv();
			}
		});
	});
});
