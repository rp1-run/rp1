import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { updateGitignore } from "../../migrate/gitignore-update.js";
import { executeMigrate, formatMigrateSummary } from "../../migrate/index.js";
import {
	findLegacyWorkDir,
	moveLegacyWork,
} from "../../migrate/legacy-work.js";
import {
	createInitialCommit,
	createTestWorktree,
	initTestRepo,
} from "../helpers/index.js";

describe("migrate", () => {
	let tempDir: string;
	let originalRp1Db: string | undefined;

	beforeEach(async () => {
		tempDir = join(tmpdir(), `rp1-migrate-test-${Date.now()}`);
		await mkdir(tempDir, { recursive: true });
		originalRp1Db = process.env.RP1_DB;
		process.env.RP1_DB = join(tempDir, "test-rp1.db");
	});

	afterEach(async () => {
		if (originalRp1Db === undefined) {
			delete process.env.RP1_DB;
		} else {
			process.env.RP1_DB = originalRp1Db;
		}
		await rm(tempDir, { recursive: true, force: true });
	});

	describe("executeMigrate", () => {
		test("creates .rp1/project_id when missing", async () => {
			await mkdir(join(tempDir, ".rp1"), { recursive: true });

			const result = await executeMigrate(tempDir);

			expect(result.projectIdCreated).toBe(true);
			expect(result.projectId).toMatch(
				/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
			);
			expect(existsSync(join(tempDir, ".rp1", "project_id"))).toBe(true);
		});

		test("creates .rp1/work/ when missing", async () => {
			await mkdir(join(tempDir, ".rp1"), { recursive: true });

			const result = await executeMigrate(tempDir);

			expect(result.workDirCreated).toBe(true);
			expect(existsSync(join(tempDir, ".rp1", "work"))).toBe(true);
		});

		test("is idempotent -- second run produces no changes", async () => {
			await mkdir(join(tempDir, ".rp1"), { recursive: true });

			const first = await executeMigrate(tempDir);
			const second = await executeMigrate(tempDir);

			expect(second.projectIdCreated).toBe(false);
			expect(second.projectId).toBe(first.projectId);
			expect(second.workDirCreated).toBe(false);
		});

		test("throws when no .rp1/ directory exists", async () => {
			const noRp1Dir = join(tmpdir(), `rp1-no-rp1-${Date.now()}`);
			await mkdir(noRp1Dir, { recursive: true });

			try {
				await expect(executeMigrate(noRp1Dir)).rejects.toThrow(
					"No .rp1/ directory found",
				);
			} finally {
				await rm(noRp1Dir, { recursive: true, force: true });
			}
		});

		test("updates .gitignore with required rules", async () => {
			await mkdir(join(tempDir, ".rp1"), { recursive: true });

			const result = await executeMigrate(tempDir);

			expect(result.gitignore.updated).toBe(true);
			const gitignore = readFileSync(join(tempDir, ".gitignore"), "utf-8");
			expect(gitignore).toContain("!.rp1/");
			expect(gitignore).toContain(".rp1/*");
			expect(gitignore).toContain("!.rp1/project_id");
		});

		test("uses the canonical git common-dir project root when run from a worktree", async () => {
			const repoDir = join(tempDir, "repo");
			const worktreeDir = join(tempDir, "repo-worktree");
			await mkdir(repoDir, { recursive: true });
			await initTestRepo(repoDir);
			await createInitialCommit(repoDir);
			await mkdir(join(repoDir, ".rp1"), { recursive: true });
			await createTestWorktree(repoDir, worktreeDir, "feature/worktree");

			const result = await executeMigrate(worktreeDir);

			expect(result.projectRoot).toBe(realpathSync(repoDir));
			expect(existsSync(join(repoDir, ".rp1", "project_id"))).toBe(true);
			expect(existsSync(join(repoDir, ".rp1", "work"))).toBe(true);
			expect(existsSync(join(worktreeDir, ".rp1"))).toBe(false);
		});
	});

	describe("formatMigrateSummary", () => {
		test("formats a summary with all sections", () => {
			const summary = formatMigrateSummary({
				projectRoot: tempDir,
				projectId: "test-uuid",
				projectIdCreated: true,
				workDirCreated: true,
				legacyWork: { legacyPath: "/old/path", filesMoved: 3, filesSkipped: 1 },
				gitignore: { updated: true, rulesAdded: ["!.rp1/", ".rp1/*"] },
				dbBackfill: { runsUpdated: 2, artifactsUpdated: 1, tasksUpdated: 0 },
			});

			expect(summary).toContain("Created .rp1/project_id");
			expect(summary).toContain("Created .rp1/work/");
			expect(summary).toContain("Moved 3 file(s)");
			expect(summary).toContain("Updated .gitignore");
			expect(summary).toContain("Backfilled project_id");
		});
	});

	describe("gitignore-update", () => {
		test("adds all required rules to empty .gitignore", () => {
			const result = updateGitignore(tempDir);

			expect(result.updated).toBe(true);
			expect(result.rulesAdded).toContain("!.rp1/");
			expect(result.rulesAdded).toContain(".rp1/*");
			expect(result.rulesAdded).toContain("!.rp1/project_id");
		});

		test("is idempotent when rules already present", () => {
			updateGitignore(tempDir);
			const second = updateGitignore(tempDir);

			expect(second.updated).toBe(false);
			expect(second.rulesAdded).toHaveLength(0);
		});

		test("creates .gitignore when none exists", () => {
			const result = updateGitignore(tempDir);

			expect(result.updated).toBe(true);
			expect(existsSync(join(tempDir, ".gitignore"))).toBe(true);
		});
	});

	describe("legacy-work", () => {
		test("findLegacyWorkDir returns undefined when no legacy work exists", () => {
			const result = findLegacyWorkDir(tempDir);
			expect(result).toBeUndefined();
		});

		test("moveLegacyWork moves files without overwriting existing ones", async () => {
			const legacyDir = join(tmpdir(), `rp1-legacy-${Date.now()}`);
			const destDir = join(tempDir, ".rp1", "work");
			await mkdir(legacyDir, { recursive: true });
			await mkdir(destDir, { recursive: true });

			await writeFile(join(legacyDir, "new-file.md"), "new content");
			await writeFile(join(destDir, "existing.md"), "existing content");
			await writeFile(join(legacyDir, "existing.md"), "overwrite attempt");

			try {
				const result = moveLegacyWork(tempDir, legacyDir);

				expect(result.filesMoved).toBe(1);
				expect(result.filesSkipped).toBe(1);
				expect(readFileSync(join(destDir, "existing.md"), "utf-8")).toBe(
					"existing content",
				);
				expect(readFileSync(join(destDir, "new-file.md"), "utf-8")).toBe(
					"new content",
				);
			} finally {
				await rm(legacyDir, { recursive: true, force: true });
			}
		});

		test("moveLegacyWork only moves known work artifact entries at top level", async () => {
			const legacyDir = join(tmpdir(), `rp1-legacy-known-${Date.now()}`);
			const destDir = join(tempDir, ".rp1", "work");
			await mkdir(legacyDir, { recursive: true });
			await mkdir(destDir, { recursive: true });

			// Known work entries
			await mkdir(join(legacyDir, "features", "my-feat"), { recursive: true });
			await writeFile(
				join(legacyDir, "features", "my-feat", "design.md"),
				"design",
			);
			await writeFile(join(legacyDir, "pr-review-checkpoint.json"), "{}");

			// Unknown entry (e.g. a stray checkout)
			await mkdir(join(legacyDir, "some-random-dir"), { recursive: true });
			await writeFile(
				join(legacyDir, "some-random-dir", "big-file.bin"),
				"data",
			);

			try {
				const result = moveLegacyWork(tempDir, legacyDir);

				expect(result.filesMoved).toBe(2);
				expect(result.filesSkipped).toBe(1);
				expect(
					existsSync(join(destDir, "features", "my-feat", "design.md")),
				).toBe(true);
				expect(existsSync(join(destDir, "pr-review-checkpoint.json"))).toBe(
					true,
				);
				expect(existsSync(join(destDir, "some-random-dir"))).toBe(false);
			} finally {
				await rm(legacyDir, { recursive: true, force: true });
			}
		});

		test("moveLegacyWork skips directories containing .git", async () => {
			const legacyDir = join(tmpdir(), `rp1-legacy-git-${Date.now()}`);
			const destDir = join(tempDir, ".rp1", "work");
			await mkdir(legacyDir, { recursive: true });
			await mkdir(destDir, { recursive: true });

			// pr-reviews with a worktree checkout nested inside
			await mkdir(join(legacyDir, "pr-reviews", "worktrees", "pr-123"), {
				recursive: true,
			});
			await writeFile(
				join(legacyDir, "pr-reviews", "worktrees", "pr-123", ".git"),
				"gitdir: /somewhere",
			);
			await writeFile(
				join(legacyDir, "pr-reviews", "worktrees", "pr-123", "big-file.bin"),
				"data",
			);
			await writeFile(
				join(legacyDir, "pr-reviews", "summary.md"),
				"review summary",
			);

			try {
				const result = moveLegacyWork(tempDir, legacyDir);

				// summary.md moved, pr-123 dir skipped (has .git)
				expect(result.filesMoved).toBe(1);
				expect(result.filesSkipped).toBe(1);
				expect(existsSync(join(destDir, "pr-reviews", "summary.md"))).toBe(
					true,
				);
				expect(
					existsSync(
						join(destDir, "pr-reviews", "worktrees", "pr-123", "big-file.bin"),
					),
				).toBe(false);
			} finally {
				await rm(legacyDir, { recursive: true, force: true });
			}
		});
	});
});
