/**
 * Unit tests for comment-extract git-ops module.
 * Tests git operations for changed file detection and line ranges.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
	getChangedFiles,
	getChangedLineRanges,
	getLinesAdded,
	isGitRepo,
} from "../../../agent-tools/comment-extract/git-ops.js";
import {
	captureMainRepoState,
	createInitialCommit,
	expectRight,
	initTestRepo,
	spawnGit,
	verifyNoMainRepoContamination,
} from "../../helpers/index.js";

/** Get the default branch name (master or main) */
async function getDefaultBranch(repoPath: string): Promise<string> {
	const proc = spawnGit(["rev-parse", "--abbrev-ref", "HEAD"], {
		cwd: repoPath,
	});
	await proc.exited;
	return (await new Response(proc.stdout as ReadableStream).text()).trim();
}

describe("comment-extract git-ops", () => {
	let testDir: string;
	let repoRoot: string;
	let defaultBranch: string;
	let mainRepoSnapshot: Awaited<ReturnType<typeof captureMainRepoState>>;

	beforeAll(async () => {
		mainRepoSnapshot = await captureMainRepoState();

		testDir = path.join(tmpdir(), `comment-extract-git-test-${Date.now()}`);
		mkdirSync(testDir, { recursive: true });

		repoRoot = path.join(testDir, "test-repo");
		mkdirSync(repoRoot, { recursive: true });

		await initTestRepo(repoRoot);
		await createInitialCommit(repoRoot);

		defaultBranch = await getDefaultBranch(repoRoot);
	});

	afterAll(async () => {
		if (testDir) {
			rmSync(testDir, { recursive: true, force: true });
		}
		await verifyNoMainRepoContamination(mainRepoSnapshot);
	});

	describe("isGitRepo", () => {
		test("returns true for git repository", async () => {
			const result = await isGitRepo(repoRoot)();
			const isRepo = expectRight(result);
			expect(isRepo).toBe(true);
		});

		test("returns false for non-git directory", async () => {
			const nonGitDir = path.join(testDir, "not-a-repo");
			mkdirSync(nonGitDir, { recursive: true });

			const result = await isGitRepo(nonGitDir)();
			const isRepo = expectRight(result);
			expect(isRepo).toBe(false);
		});
	});

	describe("getChangedFiles", () => {
		test("returns empty array when no unstaged changes", async () => {
			const result = await getChangedFiles(
				"unstaged",
				defaultBranch,
				repoRoot,
			)();
			const { files, scopeType } = expectRight(result);

			expect(scopeType).toBe("unstaged");
			expect(files).toHaveLength(0);
		});

		test("detects modified tracked file", async () => {
			// Modify the existing README.md
			await Bun.write(path.join(repoRoot, "README.md"), "# Modified content");

			const result = await getChangedFiles(
				"unstaged",
				defaultBranch,
				repoRoot,
			)();
			const { files, scopeType } = expectRight(result);

			expect(scopeType).toBe("unstaged");
			expect(files).toContain("README.md");

			// Reset
			await Bun.write(path.join(repoRoot, "README.md"), "# Test Repo");
		});

		test("returns branch changes compared to base", async () => {
			// Create a feature branch with changes
			const branchProc = spawnGit(["checkout", "-b", "feature-test"], {
				cwd: repoRoot,
			});
			await branchProc.exited;

			// Add a new file
			await Bun.write(path.join(repoRoot, "feature.txt"), "feature content");
			const addProc = spawnGit(["add", "feature.txt"], { cwd: repoRoot });
			await addProc.exited;

			const commitProc = spawnGit(["commit", "-m", "Add feature"], {
				cwd: repoRoot,
			});
			await commitProc.exited;

			const result = await getChangedFiles("branch", defaultBranch, repoRoot)();
			const { files, scopeType, diffArg } = expectRight(result);

			expect(scopeType).toBe("branch");
			expect(diffArg).toBeTruthy();
			expect(files).toContain("feature.txt");

			// Cleanup: go back to default branch
			const checkoutProc = spawnGit(["checkout", defaultBranch], {
				cwd: repoRoot,
			});
			await checkoutProc.exited;

			const deleteProc = spawnGit(["branch", "-D", "feature-test"], {
				cwd: repoRoot,
			});
			await deleteProc.exited;
		});

		test("returns files for commit range scope", async () => {
			// Get current HEAD sha
			const headProc = spawnGit(["rev-parse", "HEAD"], { cwd: repoRoot });
			await headProc.exited;
			const headSha = (
				await new Response(headProc.stdout as ReadableStream).text()
			).trim();

			// Make a commit
			await Bun.write(path.join(repoRoot, "range-test.txt"), "range content");
			const addProc = spawnGit(["add", "range-test.txt"], { cwd: repoRoot });
			await addProc.exited;

			const commitProc = spawnGit(["commit", "-m", "Range test commit"], {
				cwd: repoRoot,
			});
			await commitProc.exited;

			// Get range diff
			const result = await getChangedFiles(
				`${headSha}..HEAD`,
				defaultBranch,
				repoRoot,
			)();
			const { files, scopeType } = expectRight(result);

			expect(scopeType).toBe("range");
			expect(files).toContain("range-test.txt");
		});
	});

	describe("getLinesAdded", () => {
		test("returns 0 for no changes", async () => {
			const result = await getLinesAdded("unstaged", null, repoRoot)();
			const lines = expectRight(result);
			expect(lines).toBe(0);
		});

		test("returns line count for unstaged changes", async () => {
			// Modify README with multiple lines
			await Bun.write(
				path.join(repoRoot, "README.md"),
				"# Test\nLine 1\nLine 2\nLine 3\n",
			);

			const result = await getLinesAdded("unstaged", null, repoRoot)();
			const lines = expectRight(result);
			expect(lines).toBeGreaterThan(0);

			// Reset
			await Bun.write(path.join(repoRoot, "README.md"), "# Test Repo");
		});
	});

	describe("getChangedLineRanges", () => {
		test("returns empty map for no changes", async () => {
			// Use a range that has no changes
			const headProc = spawnGit(["rev-parse", "HEAD"], { cwd: repoRoot });
			await headProc.exited;
			const headSha = (
				await new Response(headProc.stdout as ReadableStream).text()
			).trim();

			const result = await getChangedLineRanges(
				`${headSha}..${headSha}`,
				repoRoot,
			)();
			const ranges = expectRight(result);
			expect(ranges.size).toBe(0);
		});

		test("parses diff hunks to line numbers", async () => {
			// Get current HEAD
			const headProc = spawnGit(["rev-parse", "HEAD"], { cwd: repoRoot });
			await headProc.exited;
			const baseSha = (
				await new Response(headProc.stdout as ReadableStream).text()
			).trim();

			// Create a file with specific content
			await Bun.write(
				path.join(repoRoot, "lines.txt"),
				"line1\nline2\nline3\nline4\nline5\n",
			);
			const addProc = spawnGit(["add", "lines.txt"], { cwd: repoRoot });
			await addProc.exited;
			const commitProc = spawnGit(["commit", "-m", "Add lines"], {
				cwd: repoRoot,
			});
			await commitProc.exited;

			const result = await getChangedLineRanges(`${baseSha}..HEAD`, repoRoot)();
			const ranges = expectRight(result);

			expect(ranges.has("lines.txt")).toBe(true);
			const lineSet = ranges.get("lines.txt");
			expect(lineSet).toBeDefined();
			// New file should have lines 1-5
			expect(lineSet?.has(1)).toBe(true);
			expect(lineSet?.has(5)).toBe(true);
		});

		test("handles file modifications correctly", async () => {
			// Get current HEAD
			const headProc = spawnGit(["rev-parse", "HEAD"], { cwd: repoRoot });
			await headProc.exited;
			const baseSha = (
				await new Response(headProc.stdout as ReadableStream).text()
			).trim();

			// Modify lines.txt - add a line at end
			await Bun.write(
				path.join(repoRoot, "lines.txt"),
				"line1\nline2\nline3\nline4\nline5\nnewline6\n",
			);
			const addProc = spawnGit(["add", "lines.txt"], { cwd: repoRoot });
			await addProc.exited;
			const commitProc = spawnGit(["commit", "-m", "Modify lines"], {
				cwd: repoRoot,
			});
			await commitProc.exited;

			const result = await getChangedLineRanges(`${baseSha}..HEAD`, repoRoot)();
			const ranges = expectRight(result);

			expect(ranges.has("lines.txt")).toBe(true);
			const lineSet = ranges.get("lines.txt");
			expect(lineSet?.has(6)).toBe(true); // New line 6
		});

		test("handles deleted files (returns no lines)", async () => {
			// Create and commit a file to delete
			await Bun.write(path.join(repoRoot, "to-delete.txt"), "content\n");
			let addProc = spawnGit(["add", "to-delete.txt"], { cwd: repoRoot });
			await addProc.exited;
			let commitProc = spawnGit(["commit", "-m", "Add to-delete"], {
				cwd: repoRoot,
			});
			await commitProc.exited;

			// Get SHA after adding file
			const afterAddProc = spawnGit(["rev-parse", "HEAD"], { cwd: repoRoot });
			await afterAddProc.exited;
			const afterAddSha = (
				await new Response(afterAddProc.stdout as ReadableStream).text()
			).trim();

			// Delete the file
			rmSync(path.join(repoRoot, "to-delete.txt"));
			addProc = spawnGit(["add", "to-delete.txt"], { cwd: repoRoot });
			await addProc.exited;
			commitProc = spawnGit(["commit", "-m", "Delete file"], { cwd: repoRoot });
			await commitProc.exited;

			const result = await getChangedLineRanges(
				`${afterAddSha}..HEAD`,
				repoRoot,
			)();
			const ranges = expectRight(result);

			// Deleted file should not appear or have empty set
			const lineSet = ranges.get("to-delete.txt");
			expect(lineSet === undefined || lineSet.size === 0).toBe(true);
		});
	});
});
