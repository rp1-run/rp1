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
	writeFixture,
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
	let originalRp1KbRoot: string | undefined;
	let originalRp1WorkRoot: string | undefined;

	beforeAll(async () => {
		originalRp1ProjectRoot = process.env.RP1_PROJECT_ROOT;
		originalRp1Root = process.env.RP1_ROOT;
		originalRp1KbRoot = process.env.RP1_KB_ROOT;
		originalRp1WorkRoot = process.env.RP1_WORK_ROOT;
		delete process.env.RP1_PROJECT_ROOT;
		delete process.env.RP1_ROOT;
		delete process.env.RP1_KB_ROOT;
		delete process.env.RP1_WORK_ROOT;

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
		if (originalRp1KbRoot === undefined) {
			delete process.env.RP1_KB_ROOT;
		} else {
			process.env.RP1_KB_ROOT = originalRp1KbRoot;
		}
		if (originalRp1WorkRoot === undefined) {
			delete process.env.RP1_WORK_ROOT;
		} else {
			process.env.RP1_WORK_ROOT = originalRp1WorkRoot;
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
		expect(result.right.kbRoot).toBe(join(projectRoot, ".rp1", "context"));
		expect(result.right.sources.projectRoot).toBe("walk_up");
		expect(result.right.workRoot.startsWith(join(homedir(), ".rp1"))).toBe(
			true,
		);
		expect(result.right.workRoot.endsWith("project-with-rp1")).toBe(true);
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
		const restoreKbRoot = withEnvOverride(
			"RP1_KB_ROOT",
			join(tempBase, "env-kb"),
		);
		const restoreWorkRoot = withEnvOverride(
			"RP1_WORK_ROOT",
			join(tempBase, "env-work"),
		);

		try {
			const result = resolveDirectorySet(plainDirectory);
			expect(E.isRight(result)).toBe(true);
			if (E.isLeft(result)) {
				return;
			}

			expect(result.right.projectRoot).toBe(join(tempBase, "env-project"));
			expect(result.right.kbRoot).toBe(join(tempBase, "env-kb"));
			expect(result.right.workRoot).toBe(join(tempBase, "env-work"));
			expect(result.right.sources.projectRoot).toBe("env");
			expect(result.right.sources.kbRoot).toBe("env");
			expect(result.right.sources.workRoot).toBe("env");
		} finally {
			restoreWorkRoot();
			restoreKbRoot();
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
			expect(result.right.kbRoot).toBe(
				join(tempBase, "custom-root", ".rp1", "context"),
			);
			expect(result.right.sources.projectRoot).toBe("env");
		} finally {
			restore();
		}
	});

	test("loads kb and work directories from project settings", async () => {
		await writeFixture(
			projectRoot,
			".rp1/settings.toml",
			[
				"[directories]",
				'kb_root = "custom/context"',
				'work_root = "custom/work"',
			].join("\n"),
		);

		const result = resolveDirectorySet(nestedPath);
		expect(E.isRight(result)).toBe(true);
		if (E.isLeft(result)) {
			return;
		}

		expect(result.right.kbRoot).toBe(join(projectRoot, "custom", "context"));
		expect(result.right.workRoot).toBe(join(projectRoot, "custom", "work"));
		expect(result.right.sources.kbRoot).toBe("project_settings");
		expect(result.right.sources.workRoot).toBe("project_settings");
	});

	test("applies project settings project_root as the effective runtime project root", async () => {
		await writeFixture(
			projectRoot,
			".rp1/settings.toml",
			[
				"[directories]",
				'project_root = "workspace"',
				'kb_root = "docs/context"',
				'work_root = "ops/work"',
			].join("\n"),
		);

		const result = resolveDirectorySet(nestedPath);
		expect(E.isRight(result)).toBe(true);
		if (E.isLeft(result)) {
			return;
		}

		expect(result.right.projectRoot).toBe(join(projectRoot, "workspace"));
		expect(result.right.kbRoot).toBe(
			join(projectRoot, "workspace", "docs", "context"),
		);
		expect(result.right.workRoot).toBe(
			join(projectRoot, "workspace", "ops", "work"),
		);
		expect(result.right.sources.projectRoot).toBe("project_settings");
		expect(result.right.sources.kbRoot).toBe("project_settings");
		expect(result.right.sources.workRoot).toBe("project_settings");
	});

	test("applies user settings project_root when no project override exists", async () => {
		const userHomeDir = join(tempBase, "user-home");
		const globalSettingsPath = join(
			userHomeDir,
			".config",
			"rp1",
			"settings.toml",
		);
		await writeFixture(
			userHomeDir,
			".config/rp1/settings.toml",
			[
				"[directories]",
				'project_root = "user-project"',
				'kb_root = "shared/kb"',
				'work_root = "shared/work"',
			].join("\n"),
		);

		const result = resolveDirectorySet(plainDirectory, {
			globalSettingsPath,
			userHomeDir,
		});
		expect(E.isRight(result)).toBe(true);
		if (E.isLeft(result)) {
			return;
		}

		expect(result.right.projectRoot).toBe(join(userHomeDir, "user-project"));
		expect(result.right.kbRoot).toBe(join(userHomeDir, "shared", "kb"));
		expect(result.right.workRoot).toBe(join(userHomeDir, "shared", "work"));
		expect(result.right.sources.projectRoot).toBe("user_settings");
		expect(result.right.sources.kbRoot).toBe("user_settings");
		expect(result.right.sources.workRoot).toBe("user_settings");
	});

	test("uses effective-project local directory overrides after a user project_root redirect", async () => {
		const userHomeDir = join(tempBase, "redirect-user-home");
		const redirectedProjectRoot = join(tempBase, "redirected-project");
		const globalSettingsPath = join(
			userHomeDir,
			".config",
			"rp1",
			"settings.toml",
		);
		await writeFixture(
			userHomeDir,
			".config/rp1/settings.toml",
			[
				"[directories]",
				`project_root = "${redirectedProjectRoot}"`,
				'kb_root = "user/kb"',
				'work_root = "user/work"',
			].join("\n"),
		);
		await writeFixture(
			redirectedProjectRoot,
			".rp1/settings.toml",
			[
				"[directories]",
				'kb_root = "project/context"',
				'work_root = "project/work"',
			].join("\n"),
		);

		const result = resolveDirectorySet(plainDirectory, {
			globalSettingsPath,
			userHomeDir,
		});
		expect(E.isRight(result)).toBe(true);
		if (E.isLeft(result)) {
			return;
		}

		expect(result.right.projectRoot).toBe(redirectedProjectRoot);
		expect(result.right.kbRoot).toBe(
			join(redirectedProjectRoot, "project", "context"),
		);
		expect(result.right.workRoot).toBe(
			join(redirectedProjectRoot, "project", "work"),
		);
		expect(result.right.sources.projectRoot).toBe("user_settings");
		expect(result.right.sources.kbRoot).toBe("project_settings");
		expect(result.right.sources.workRoot).toBe("project_settings");
	});

	test("env overrides take precedence over configured directory settings", async () => {
		await writeFixture(
			projectRoot,
			".rp1/settings.toml",
			[
				"[directories]",
				'kb_root = "custom/context"',
				'work_root = "custom/work"',
			].join("\n"),
		);
		const restoreKbRoot = withEnvOverride(
			"RP1_KB_ROOT",
			join(tempBase, "env-kb-override"),
		);
		const restoreWorkRoot = withEnvOverride(
			"RP1_WORK_ROOT",
			join(tempBase, "env-work-override"),
		);

		try {
			const result = resolveDirectorySet(nestedPath);
			expect(E.isRight(result)).toBe(true);
			if (E.isLeft(result)) {
				return;
			}

			expect(result.right.kbRoot).toBe(join(tempBase, "env-kb-override"));
			expect(result.right.workRoot).toBe(join(tempBase, "env-work-override"));
			expect(result.right.sources.kbRoot).toBe("env");
			expect(result.right.sources.workRoot).toBe("env");
		} finally {
			restoreWorkRoot();
			restoreKbRoot();
		}
	});

	test("returns a validation error when configured directory settings are invalid", async () => {
		await writeFixture(
			projectRoot,
			".rp1/settings.toml",
			"[directories]\nwork_root = 42\n",
		);

		const result = resolveDirectorySet(nestedPath);
		expect(E.isLeft(result)).toBe(true);
		if (E.isRight(result)) {
			return;
		}

		expect(result.left._tag).toBe("ValidationError");
		if (result.left._tag !== "ValidationError") {
			return;
		}
		expect(result.left.file).toContain(".rp1/settings.toml");
		expect(result.left.message).toContain("[directories].work_root");
	});
});
