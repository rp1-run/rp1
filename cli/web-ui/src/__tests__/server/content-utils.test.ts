import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	createInitialCommit,
	createTestWorktree,
	initTestRepo,
	removeTestWorktree,
} from "../../../../src/__tests__/helpers/git-helpers";
import {
	buildFileTree,
	resolveWithArchiveFallback,
	validateFilePath,
} from "../../server/routes/content-utils";

describe("content-utils", () => {
	describe("validateFilePath", () => {
		test("accepts canonical project section paths", () => {
			expect(validateFilePath(".rp1/context/index.md")).toBeNull();
			expect(validateFilePath(".rp1/work/features/feat-1/tasks.md")).toBeNull();
		});

		test("rejects legacy aliases for project content access", () => {
			expect(validateFilePath("context/index.md")).toBe(
				"Access denied: path outside allowed directories",
			);
			expect(validateFilePath("kb/index.md")).toBe(
				"Access denied: path outside allowed directories",
			);
			expect(validateFilePath("work/features/feat-1/tasks.md")).toBe(
				"Access denied: path outside allowed directories",
			);
		});
	});

	describe("resolveWithArchiveFallback", () => {
		test("rejects paths that resolve outside the rp1 directory", async () => {
			const tempDir = await mkdtemp(join(tmpdir(), "rp1-content-utils-"));
			const rp1Path = join(tempDir, ".rp1");

			try {
				await mkdir(rp1Path, { recursive: true });
				await Bun.write(join(tempDir, "outside.md"), "# outside");

				await expect(
					resolveWithArchiveFallback(rp1Path, "../outside.md"),
				).resolves.toBeNull();
			} finally {
				await rm(tempDir, { recursive: true, force: true });
			}
		});
	});

	describe("buildFileTree", () => {
		test("skips nested git worktree directories", async () => {
			const tempDir = await mkdtemp(join(tmpdir(), "rp1-content-utils-"));
			const treeRoot = join(tempDir, "tree-root");
			const repoRoot = join(tempDir, "repo-root");
			const worktreePath = join(treeRoot, "pr-123");

			try {
				await mkdir(join(treeRoot, "visible"), { recursive: true });
				await Bun.write(join(treeRoot, "visible", "notes.md"), "# visible");
				await Bun.write(join(treeRoot, "top-level.md"), "# top-level");

				await mkdir(repoRoot, { recursive: true });
				await initTestRepo(repoRoot);
				await createInitialCommit(repoRoot);
				await createTestWorktree(repoRoot, worktreePath, "test-worktree");
				await Bun.write(join(worktreePath, "worktree-only.md"), "# hidden");

				const tree = await buildFileTree(treeRoot, ".rp1/work");

				expect(tree).not.toBeNull();
				expect(tree?.children?.map((child) => child.name)).toEqual([
					"visible",
					"top-level.md",
				]);
			} finally {
				await removeTestWorktree(repoRoot, worktreePath, true).catch(() => {});
				await rm(tempDir, { recursive: true, force: true });
			}
		});
	});
});
