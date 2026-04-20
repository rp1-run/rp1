import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
	defaultInitDirectoryModel,
	detectAncestorProject,
	detectReinitState,
	resolveInitDirectoryModel,
} from "../../init/directory-model.js";
import { cleanupTempDir, createTempDir } from "../helpers/index.js";

describe("init directory model", () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await createTempDir("init-directory-model-");
	});

	afterEach(async () => {
		await cleanupTempDir(tempDir);
	});

	test("resolves workDir to project-local .rp1/work", () => {
		const directories = resolveInitDirectoryModel(tempDir);

		expect(directories.projectRoot).toBe(tempDir);
		expect(directories.rp1Dir).toBe(join(tempDir, ".rp1"));
		expect(directories.contextDir).toBe(join(tempDir, ".rp1", "context"));
		expect(directories.workDir).toBe(join(tempDir, ".rp1", "work"));
	});

	test("reuses the existing project root when invoked from a nested directory", async () => {
		const nestedDir = join(tempDir, "packages", "app");
		await mkdir(join(tempDir, ".rp1"), { recursive: true });
		await writeFile(join(tempDir, ".rp1", "project_id"), "project-123");
		await mkdir(nestedDir, { recursive: true });

		const directories = resolveInitDirectoryModel(nestedDir);

		expect(directories.projectRoot).toBe(tempDir);
		expect(directories.rp1Dir).toBe(join(tempDir, ".rp1"));
		expect(directories.contextDir).toBe(join(tempDir, ".rp1", "context"));
		expect(directories.workDir).toBe(join(tempDir, ".rp1", "work"));
	});

	test("ignores a home-level project marker when initializing a nested directory", async () => {
		const nestedDir = join(tempDir, "scratch", "app");
		const originalHome = process.env.HOME;

		await mkdir(join(tempDir, ".rp1"), { recursive: true });
		await writeFile(join(tempDir, ".rp1", "project_id"), "project-123");
		await mkdir(nestedDir, { recursive: true });

		process.env.HOME = tempDir;

		try {
			const directories = resolveInitDirectoryModel(nestedDir);

			expect(directories.projectRoot).toBe(nestedDir);
			expect(directories.rp1Dir).toBe(join(nestedDir, ".rp1"));
			expect(directories.contextDir).toBe(join(nestedDir, ".rp1", "context"));
			expect(directories.workDir).toBe(join(nestedDir, ".rp1", "work"));
		} finally {
			if (originalHome === undefined) {
				delete process.env.HOME;
			} else {
				process.env.HOME = originalHome;
			}
		}
	});

	test("detectAncestorProject returns isAncestor when parent has project_id", async () => {
		const nestedDir = join(tempDir, "packages", "app");
		await mkdir(join(tempDir, ".rp1"), { recursive: true });
		await writeFile(join(tempDir, ".rp1", "project_id"), "project-123");
		await mkdir(nestedDir, { recursive: true });

		const result = detectAncestorProject(nestedDir);

		expect(result.isAncestor).toBe(true);
		expect(result.ancestorRoot).toBe(tempDir);
	});

	test("detectAncestorProject returns false when cwd is the project root", async () => {
		await mkdir(join(tempDir, ".rp1"), { recursive: true });
		await writeFile(join(tempDir, ".rp1", "project_id"), "project-123");

		const result = detectAncestorProject(tempDir);

		expect(result.isAncestor).toBe(false);
		expect(result.ancestorRoot).toBeUndefined();
	});

	test("detectAncestorProject returns false when no ancestor project exists", () => {
		const result = detectAncestorProject(tempDir);

		expect(result.isAncestor).toBe(false);
		expect(result.ancestorRoot).toBeUndefined();
	});

	test("detectAncestorProject ignores ancestor with .rp1 dir but no project_id", async () => {
		const nestedDir = join(tempDir, "packages", "app");
		// Create .rp1/ directory without project_id (stale/legacy)
		await mkdir(join(tempDir, ".rp1"), { recursive: true });
		await mkdir(nestedDir, { recursive: true });

		const result = detectAncestorProject(nestedDir);

		// A stale .rp1/ dir without project_id should NOT trigger the ancestor prompt
		expect(result.isAncestor).toBe(false);
		expect(result.ancestorRoot).toBeUndefined();
	});

	test("detectAncestorProject does not flag a linked git worktree as an ancestor", async () => {
		// Set up a main repo with a project_id, then create a linked worktree
		// whose main repo is a *sibling* path rather than an ancestor. The
		// resolver maps the worktree back to the main repo, but that is not a
		// real ancestor of the worktree cwd, so the prompt must not fire.
		const mainRepo = join(tempDir, "main-repo");
		await mkdir(mainRepo, { recursive: true });
		const gitEnv = {
			...process.env,
			GIT_AUTHOR_NAME: "rp1-test",
			GIT_AUTHOR_EMAIL: "rp1-test@example.com",
			GIT_COMMITTER_NAME: "rp1-test",
			GIT_COMMITTER_EMAIL: "rp1-test@example.com",
		};
		const runGit = (cwd: string, args: string[]): void => {
			execFileSync("git", args, { cwd, env: gitEnv, stdio: "ignore" });
		};

		runGit(mainRepo, ["init", "-q", "-b", "main"]);
		await writeFile(join(mainRepo, "README.md"), "# main\n", "utf-8");
		runGit(mainRepo, ["add", "README.md"]);
		runGit(mainRepo, ["commit", "-q", "-m", "initial"]);

		await mkdir(join(mainRepo, ".rp1"), { recursive: true });
		await writeFile(join(mainRepo, ".rp1", "project_id"), "main-project-id");

		const worktreePath = join(tempDir, "worktrees", "feature-x");
		runGit(mainRepo, [
			"worktree",
			"add",
			"-b",
			"feature-x",
			worktreePath,
			"main",
		]);

		try {
			const result = detectAncestorProject(worktreePath);
			expect(result.isAncestor).toBe(false);
			expect(result.ancestorRoot).toBeUndefined();
		} finally {
			// Best-effort cleanup of the linked worktree before the temp dir rm
			try {
				runGit(mainRepo, ["worktree", "remove", "--force", worktreePath]);
			} catch {
				// ignore
			}
		}
	});

	test("defaultInitDirectoryModel always targets cwd even inside a nested project", async () => {
		const nestedDir = join(tempDir, "packages", "app");
		await mkdir(join(tempDir, ".rp1"), { recursive: true });
		await writeFile(join(tempDir, ".rp1", "project_id"), "project-123");
		await mkdir(nestedDir, { recursive: true });

		const directories = defaultInitDirectoryModel(nestedDir);

		expect(directories.projectRoot).toBe(nestedDir);
		expect(directories.rp1Dir).toBe(join(nestedDir, ".rp1"));
	});

	test("detectReinitState honors a forced-local directory model", async () => {
		const nestedDir = join(tempDir, "packages", "app");
		// Parent has an rp1 project, but the nested dir is empty.
		await mkdir(join(tempDir, ".rp1"), { recursive: true });
		await writeFile(join(tempDir, ".rp1", "project_id"), "project-123");
		await mkdir(nestedDir, { recursive: true });

		// Without override: climbs to parent and reports existing rp1 dir.
		const climbed = await detectReinitState(nestedDir, null);
		expect(climbed.hasRp1Dir).toBe(true);

		// With forced-local override: must only look at the nested dir.
		const local = await detectReinitState(
			nestedDir,
			null,
			defaultInitDirectoryModel(nestedDir),
		);
		expect(local.hasRp1Dir).toBe(false);
		expect(local.hasKBContent).toBe(false);
		expect(local.hasWorkContent).toBe(false);
	});

	test("detects work content from .rp1/work directory", async () => {
		const workDir = join(tempDir, ".rp1", "work");

		await mkdir(join(tempDir, ".rp1"), { recursive: true });
		await mkdir(workDir, { recursive: true });
		await writeFile(join(workDir, "artifact.md"), "# artifact\n", "utf-8");

		const state = await detectReinitState(tempDir, null);

		expect(state.hasRp1Dir).toBe(true);
		expect(state.hasWorkContent).toBe(true);
	});
});
