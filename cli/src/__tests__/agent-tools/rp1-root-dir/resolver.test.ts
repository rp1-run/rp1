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
			expect(result.worktreeName).toBeUndefined();
		});

		test("returns correct projectRoot from subdirectory of standard repo", async () => {
			const subDir = join(standardRepoRoot, "src");
			await mkdir(subDir, { recursive: true });

			const result = await expectTaskRight(resolveRp1Root(subDir));

			expect(result.isWorktree).toBe(false);
			expect(result.projectRoot).toBe(standardRepoRoot);
		});
	});

	describe("linked worktree", () => {
		test("returns isWorktree: true when in linked worktree", async () => {
			const result = await expectTaskRight(resolveRp1Root(linkedWorktreePath));

			expect(result.isWorktree).toBe(true);
			expect(result.projectRoot).toBe(worktreeRepoRoot);
			expect(result.worktreeName).toBe("test-branch");
			expect(result.projectId).toBe("bbb00000-0000-0000-0000-000000000002");
		});

		test("returns main repo projectRoot from linked worktree", async () => {
			const result = await expectTaskRight(resolveRp1Root(linkedWorktreePath));

			expect(result.projectRoot).not.toContain("linked-worktree");
			expect(result.projectRoot).toContain("worktree-main");
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
	});
});
