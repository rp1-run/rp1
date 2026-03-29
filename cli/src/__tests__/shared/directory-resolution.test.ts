import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, realpath, rm } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import * as E from "fp-ts/lib/Either.js";
import { resolveDirectorySet } from "../../../shared/directory-resolution.js";
import {
	createInitialCommit,
	createTestWorktree,
	initTestRepo,
	removeTestWorktree,
	withEnvOverride,
} from "../helpers/index.js";

describe("directory resolution", () => {
	let tempBase: string;
	let projectRoot: string;
	let nestedPath: string;
	let worktreeMainRoot: string;
	let linkedWorktreePath: string;
	let gitRepoWithoutRp1: string;
	let plainDirectory: string;
	let originalRp1ProjectRoot: string | undefined;
	let originalRp1Root: string | undefined;
	let originalRp1KbDir: string | undefined;
	let originalRp1WorkDir: string | undefined;

	beforeAll(async () => {
		originalRp1ProjectRoot = process.env.RP1_PROJECT_ROOT;
		originalRp1Root = process.env.RP1_ROOT;
		originalRp1KbDir = process.env.RP1_KB_DIR;
		originalRp1WorkDir = process.env.RP1_WORK_DIR;
		delete process.env.RP1_PROJECT_ROOT;
		delete process.env.RP1_ROOT;
		delete process.env.RP1_KB_DIR;
		delete process.env.RP1_WORK_DIR;

		const tempDir = join(tmpdir(), `rp1-directory-resolution-${Date.now()}`);
		await mkdir(tempDir, { recursive: true });
		tempBase = await realpath(tempDir);

		projectRoot = join(tempBase, "project-with-rp1");
		nestedPath = join(projectRoot, "packages", "app", "src");
		await mkdir(join(projectRoot, ".rp1"), { recursive: true });
		await mkdir(nestedPath, { recursive: true });

		worktreeMainRoot = join(tempBase, "worktree-main");
		await mkdir(join(worktreeMainRoot, ".rp1"), { recursive: true });
		await initTestRepo(worktreeMainRoot);
		await createInitialCommit(worktreeMainRoot);

		linkedWorktreePath = join(tempBase, "linked-worktree");
		await createTestWorktree(
			worktreeMainRoot,
			linkedWorktreePath,
			"test-branch",
		);

		gitRepoWithoutRp1 = join(tempBase, "plain-git-repo");
		await mkdir(gitRepoWithoutRp1, { recursive: true });
		await initTestRepo(gitRepoWithoutRp1);
		await createInitialCommit(gitRepoWithoutRp1);

		plainDirectory = join(tempBase, "plain-directory");
		await mkdir(plainDirectory, { recursive: true });
	});

	afterAll(async () => {
		if (originalRp1ProjectRoot === undefined) {
			delete process.env.RP1_PROJECT_ROOT;
		} else {
			process.env.RP1_PROJECT_ROOT = originalRp1ProjectRoot;
		}
		if (originalRp1Root === undefined) {
			delete process.env.RP1_ROOT;
		} else {
			process.env.RP1_ROOT = originalRp1Root;
		}
		if (originalRp1KbDir === undefined) {
			delete process.env.RP1_KB_DIR;
		} else {
			process.env.RP1_KB_DIR = originalRp1KbDir;
		}
		if (originalRp1WorkDir === undefined) {
			delete process.env.RP1_WORK_DIR;
		} else {
			process.env.RP1_WORK_DIR = originalRp1WorkDir;
		}

		await removeTestWorktree(worktreeMainRoot, linkedWorktreePath, true);
		await rm(tempBase, { recursive: true, force: true });
	});

	test("walks up to the nearest directory containing .rp1", () => {
		const result = resolveDirectorySet(nestedPath);
		expect(E.isRight(result)).toBe(true);
		if (E.isLeft(result)) {
			return;
		}

		expect(result.right.projectRoot).toBe(projectRoot);
		expect(result.right.rp1Root).toBe(join(projectRoot, ".rp1"));
		expect(result.right.kbDir).toBe(join(projectRoot, ".rp1", "context"));
		expect(result.right.sources.projectRoot).toBe("walk_up");
		expect(result.right.workDir.startsWith(join(homedir(), ".rp1"))).toBe(true);
		expect(result.right.workDir.endsWith("project-with-rp1")).toBe(true);
	});

	test("uses the main repo .rp1 directory when running inside a linked worktree", () => {
		const result = resolveDirectorySet(linkedWorktreePath);
		expect(E.isRight(result)).toBe(true);
		if (E.isLeft(result)) {
			return;
		}

		expect(result.right.projectRoot).toBe(worktreeMainRoot);
		expect(result.right.sources.projectRoot).toBe("git_common_dir");
		expect(result.right.isWorktree).toBe(true);
		expect(result.right.worktreeName).toBe("test-branch");
	});

	test("falls back to the git repo root when no .rp1 directory exists", () => {
		const result = resolveDirectorySet(gitRepoWithoutRp1);
		expect(E.isRight(result)).toBe(true);
		if (E.isLeft(result)) {
			return;
		}

		expect(result.right.projectRoot).toBe(gitRepoWithoutRp1);
		expect(result.right.sources.projectRoot).toBe("git_repo_root");
		expect(result.right.rp1Root).toBe(join(gitRepoWithoutRp1, ".rp1"));
	});

	test("falls back to cwd outside git repositories", () => {
		const result = resolveDirectorySet(plainDirectory);
		expect(E.isRight(result)).toBe(true);
		if (E.isLeft(result)) {
			return;
		}

		expect(result.right.projectRoot).toBe(plainDirectory);
		expect(result.right.sources.projectRoot).toBe("cwd_fallback");
		expect(result.right.isWorktree).toBe(false);
	});

	test("honors env overrides for project, kb, and work directories", () => {
		const restoreProjectRoot = withEnvOverride(
			"RP1_PROJECT_ROOT",
			join(tempBase, "env-project"),
		);
		const restoreKbDir = withEnvOverride(
			"RP1_KB_DIR",
			join(tempBase, "env-kb"),
		);
		const restoreWorkDir = withEnvOverride(
			"RP1_WORK_DIR",
			join(tempBase, "env-work"),
		);

		try {
			const result = resolveDirectorySet(plainDirectory);
			expect(E.isRight(result)).toBe(true);
			if (E.isLeft(result)) {
				return;
			}

			expect(result.right.projectRoot).toBe(join(tempBase, "env-project"));
			expect(result.right.rp1Root).toBe(join(tempBase, "env-project", ".rp1"));
			expect(result.right.kbDir).toBe(join(tempBase, "env-kb"));
			expect(result.right.workDir).toBe(join(tempBase, "env-work"));
			expect(result.right.sources.projectRoot).toBe("env");
			expect(result.right.sources.kbDir).toBe("env");
			expect(result.right.sources.workDir).toBe("env");
		} finally {
			restoreWorkDir();
			restoreKbDir();
			restoreProjectRoot();
		}
	});

	test("uses RP1_ROOT as a backward-compatible root override", () => {
		const restore = withEnvOverride(
			"RP1_ROOT",
			join(tempBase, "custom-root", ".rp1"),
		);

		try {
			const result = resolveDirectorySet(plainDirectory);
			expect(E.isRight(result)).toBe(true);
			if (E.isLeft(result)) {
				return;
			}

			expect(result.right.projectRoot).toBe(join(tempBase, "custom-root"));
			expect(result.right.rp1Root).toBe(join(tempBase, "custom-root", ".rp1"));
			expect(result.right.kbDir).toBe(
				join(tempBase, "custom-root", ".rp1", "context"),
			);
			expect(result.right.sources.projectRoot).toBe("env");
		} finally {
			restore();
		}
	});
});
