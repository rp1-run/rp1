import {
	afterAll,
	afterEach,
	beforeAll,
	describe,
	expect,
	test,
} from "bun:test";
import { writeFileSync } from "node:fs";
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
		mainRepoSnapshot = await captureMainRepoState();

		originalProjectRootEnv = process.env.RP1_PROJECT_ROOT;
		delete process.env.RP1_PROJECT_ROOT;

		const tempDir = join(tmpdir(), `rp1-root-dir-test-${Date.now()}`);
		await mkdir(tempDir, { recursive: true });
		tempBase = await realpath(tempDir);

		standardRepoRoot = join(tempBase, "standard-repo");
		await mkdir(join(standardRepoRoot, ".rp1"), { recursive: true });
		writeFileSync(
			join(standardRepoRoot, ".rp1", "project_id"),
			"aaa00000-0000-0000-0000-000000000001",
		);
		await initTestRepo(standardRepoRoot);
		await createInitialCommit(standardRepoRoot);

		worktreeRepoRoot = join(tempBase, "worktree-main");
		await mkdir(join(worktreeRepoRoot, ".rp1"), { recursive: true });
		writeFileSync(
			join(worktreeRepoRoot, ".rp1", "project_id"),
			"bbb00000-0000-0000-0000-000000000002",
		);
		await initTestRepo(worktreeRepoRoot);

		await Bun.write(join(worktreeRepoRoot, "README.md"), "# Worktree Main");
		await createInitialCommit(worktreeRepoRoot);

		linkedWorktreePath = join(tempBase, "linked-worktree");
		await createTestWorktree(
			worktreeRepoRoot,
			linkedWorktreePath,
			"test-branch",
		);

		nonGitDir = join(tempBase, "not-a-repo");
		await mkdir(nonGitDir, { recursive: true });
	});

	afterAll(async () => {
		if (originalProjectRootEnv !== undefined) {
			process.env.RP1_PROJECT_ROOT = originalProjectRootEnv;
		} else {
			delete process.env.RP1_PROJECT_ROOT;
		}

		await removeTestWorktree(worktreeRepoRoot, linkedWorktreePath, true);

		await rm(tempBase, { recursive: true, force: true });

		await verifyNoMainRepoContamination(mainRepoSnapshot);
	});

	afterEach(() => {
		delete process.env.RP1_PROJECT_ROOT;
	});

	describe("standard repo (non-worktree)", () => {
		test("returns resolved directory metadata for standard git repo with .rp1/project_id", async () => {
			const result = await expectTaskRight(resolveRp1Root(standardRepoRoot));

			expect(result.isWorktree).toBe(false);
			expect(result.projectRoot).toBe(standardRepoRoot);
			expect(result.projectId).toBe("aaa00000-0000-0000-0000-000000000001");
			expect(result.kbRoot).toBe(join(standardRepoRoot, ".rp1", "context"));
			expect(result.workRoot).toBe(join(standardRepoRoot, ".rp1", "work"));
			expect(result.codeRoot).toBe(standardRepoRoot);
			expect(result.worktreeName).toBeUndefined();
			expect(result.storageMode).toBe("local");
		});

		test("reports kbInitialized: false with a next-step hint when kbRoot is absent", async () => {
			const result = await expectTaskRight(resolveRp1Root(standardRepoRoot));

			expect(result.kbInitialized).toBe(false);
			expect(result.kbNextStepHint).toBeDefined();
			expect(result.projectId).toBe("aaa00000-0000-0000-0000-000000000001");
		});

		test("reports kbInitialized: false with a hint when kbRoot exists but is empty (no index.md)", async () => {
			await mkdir(join(standardRepoRoot, ".rp1", "context"), {
				recursive: true,
			});

			try {
				const result = await expectTaskRight(resolveRp1Root(standardRepoRoot));

				expect(result.kbInitialized).toBe(false);
				expect(result.kbNextStepHint).toBeDefined();
				expect(result.projectId).toBe("aaa00000-0000-0000-0000-000000000001");
			} finally {
				await rm(join(standardRepoRoot, ".rp1", "context"), {
					recursive: true,
					force: true,
				});
			}
		});

		test("reports kbInitialized: true with no hint when kbRoot has index.md content", async () => {
			await mkdir(join(standardRepoRoot, ".rp1", "context"), {
				recursive: true,
			});
			await Bun.write(
				join(standardRepoRoot, ".rp1", "context", "index.md"),
				"# KB\n",
			);

			try {
				const result = await expectTaskRight(resolveRp1Root(standardRepoRoot));

				expect(result.kbInitialized).toBe(true);
				expect(result.kbNextStepHint).toBeUndefined();
				expect(result.projectId).toBe("aaa00000-0000-0000-0000-000000000001");
			} finally {
				await rm(join(standardRepoRoot, ".rp1", "context"), {
					recursive: true,
					force: true,
				});
			}
		});

		test("includes storageMode in output for agent and bootstrap consumers", async () => {
			const result = await expectTaskRight(resolveRp1Root(standardRepoRoot));

			expect(result.storageMode).toBeDefined();
			expect(typeof result.storageMode).toBe("string");
			expect(["local", "central"]).toContain(result.storageMode);
		});

		test("returns correct projectRoot from subdirectory of standard repo", async () => {
			const subDir = join(standardRepoRoot, "src");
			await mkdir(subDir, { recursive: true });

			const result = await expectTaskRight(resolveRp1Root(subDir));

			expect(result.isWorktree).toBe(false);
			expect(result.projectRoot).toBe(standardRepoRoot);
			expect(result.codeRoot).toBe(standardRepoRoot);
		});
	});

	describe("linked worktree", () => {
		test("returns isWorktree: true when in linked worktree", async () => {
			const result = await expectTaskRight(resolveRp1Root(linkedWorktreePath));

			expect(result.isWorktree).toBe(true);
			expect(result.projectRoot).toBe(worktreeRepoRoot);
			expect(result.worktreeName).toBe("test-branch");
			expect(result.projectId).toBe("bbb00000-0000-0000-0000-000000000002");
			expect(result.codeRoot).toBe(linkedWorktreePath);
		});

		test("returns main repo projectRoot from linked worktree", async () => {
			const result = await expectTaskRight(resolveRp1Root(linkedWorktreePath));

			expect(result.projectRoot).not.toContain("linked-worktree");
			expect(result.projectRoot).toContain("worktree-main");
			expect(result.codeRoot).toContain("linked-worktree");
		});
	});

	describe("RP1_PROJECT_ROOT env override is ignored", () => {
		test("env var does not affect resolution when .rp1/project_id exists", async () => {
			process.env.RP1_PROJECT_ROOT = join(tempBase, "custom-project");

			const result = await expectTaskRight(resolveRp1Root(standardRepoRoot));

			expect(result.projectRoot).toBe(standardRepoRoot);
			expect(result.projectId).toBe("aaa00000-0000-0000-0000-000000000001");
		});
	});

	describe("not a git repo", () => {
		test("returns error when not in a git repository without .rp1", async () => {
			const result = resolveRp1Root(nonGitDir);
			const resolved = await result();

			expect(resolved._tag).toBe("Left");
		});

		test("does not treat HOME as the active project root", async () => {
			const fakeHome = join(tempBase, "fake-home");
			const nestedPathUnderHome = join(fakeHome, "scratch", "app");
			await mkdir(join(fakeHome, ".rp1"), { recursive: true });
			writeFileSync(
				join(fakeHome, ".rp1", "project_id"),
				"990e8400-e29b-41d4-a716-446655440000",
			);
			await mkdir(nestedPathUnderHome, { recursive: true });

			const result = resolveRp1Root(nestedPathUnderHome, {
				homeDir: fakeHome,
			});
			const resolved = await result();

			expect(resolved._tag).toBe("Left");
		});
	});

	describe("strict project identity mode", () => {
		test("suggests rp1 init when no rp1 project exists", async () => {
			const result = resolveRp1Root(nonGitDir, { requireProjectId: true });
			const resolved = await result();

			expect(resolved._tag).toBe("Left");
			if (resolved._tag !== "Left") return;

			expect(resolved.left._tag).toBe("NotFoundError");
			if (resolved.left._tag !== "NotFoundError") return;

			expect(resolved.left.suggestion).toContain("rp1 init");
		});

		test("suggests rp1 migrate for legacy .rp1 directories without project_id", async () => {
			const legacyProjectRoot = join(tempBase, "legacy-project");
			await mkdir(join(legacyProjectRoot, ".rp1"), { recursive: true });

			const result = resolveRp1Root(legacyProjectRoot, {
				requireProjectId: true,
			});
			const resolved = await result();

			expect(resolved._tag).toBe("Left");
			if (resolved._tag !== "Left") return;

			expect(resolved.left._tag).toBe("NotFoundError");
			if (resolved.left._tag !== "NotFoundError") return;

			expect(resolved.left.suggestion).toContain("rp1 migrate");
			expect(resolved.left.suggestion).toContain(legacyProjectRoot);
		});
	});
});
