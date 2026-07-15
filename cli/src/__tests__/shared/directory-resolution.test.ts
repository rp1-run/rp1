import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { mkdir, realpath, rm, symlink } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import * as E from "fp-ts/lib/Either.js";
import { resolveDirectorySet } from "../../../shared/directory-resolution.js";
import { resetContainerDetectionCache } from "../../../shared/storage-mode.js";
import {
	createInitialCommit,
	createTestWorktree,
	initTestRepo,
	removeTestWorktree,
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
	let centralProject: string;
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
		writeFileSync(
			join(projectRoot, ".rp1", "project_id"),
			"550e8400-e29b-41d4-a716-446655440000",
		);
		await mkdir(nestedPath, { recursive: true });

		worktreeMainRoot = join(tempBase, "worktree-main");
		await mkdir(join(worktreeMainRoot, ".rp1"), { recursive: true });
		writeFileSync(
			join(worktreeMainRoot, ".rp1", "project_id"),
			"660e8400-e29b-41d4-a716-446655440000",
		);
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

		centralProject = join(tempBase, "project-central");
		await mkdir(join(centralProject, ".rp1"), { recursive: true });
		writeFileSync(
			join(centralProject, ".rp1", "project_id"),
			"cc0e8400-e29b-41d4-a716-446655440000",
		);
		await writeFixture(
			centralProject,
			".rp1/settings.toml",
			'[storage]\nmode = "central"',
		);
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

		resetContainerDetectionCache();
		await removeTestWorktree(worktreeMainRoot, linkedWorktreePath, true);
		await rm(tempBase, { recursive: true, force: true });
	});

	test("walks up to the nearest directory containing .rp1/project_id", () => {
		const result = resolveDirectorySet(nestedPath);
		expect(E.isRight(result)).toBe(true);
		if (E.isLeft(result)) return;

		expect(result.right.projectRoot).toBe(projectRoot);
		expect(result.right.projectId).toBe("550e8400-e29b-41d4-a716-446655440000");
		expect(result.right.kbRoot).toBe(join(projectRoot, ".rp1", "context"));
		expect(result.right.workRoot).toBe(join(projectRoot, ".rp1", "work"));
		expect(result.right.codeRoot).toBe(projectRoot);
	});

	test("kbRoot is always projectRoot/.rp1/context", () => {
		const result = resolveDirectorySet(nestedPath);
		expect(E.isRight(result)).toBe(true);
		if (E.isLeft(result)) return;

		expect(result.right.kbRoot).toBe(join(projectRoot, ".rp1", "context"));
	});

	test("workRoot is always projectRoot/.rp1/work", () => {
		const result = resolveDirectorySet(nestedPath);
		expect(E.isRight(result)).toBe(true);
		if (E.isLeft(result)) return;

		expect(result.right.workRoot).toBe(join(projectRoot, ".rp1", "work"));
	});

	test("uses the main repo .rp1 directory when running inside a linked worktree", () => {
		const result = resolveDirectorySet(linkedWorktreePath);
		expect(E.isRight(result)).toBe(true);
		if (E.isLeft(result)) return;

		expect(result.right.projectRoot).toBe(worktreeMainRoot);
		expect(result.right.projectId).toBe("660e8400-e29b-41d4-a716-446655440000");
		expect(result.right.isWorktree).toBe(true);
		expect(result.right.worktreeName).toBe("test-branch");
		expect(result.right.codeRoot).toBe(linkedWorktreePath);
	});

	test("returns error when no .rp1 directory exists in git repo", () => {
		const result = resolveDirectorySet(gitRepoWithoutRp1);
		expect(E.isLeft(result)).toBe(true);
		if (E.isRight(result)) return;

		expect(result.left._tag).toBe("NotFoundError");
	});

	test("returns error outside git repositories without .rp1", () => {
		const result = resolveDirectorySet(plainDirectory);
		expect(E.isLeft(result)).toBe(true);
		if (E.isRight(result)) return;

		expect(result.left._tag).toBe("NotFoundError");
	});

	test("does not auto-discover the home directory as a project root", async () => {
		const fakeHome = join(tempBase, "fake-home");
		const nestedPathUnderHome = join(fakeHome, "scratch", "app");

		await mkdir(join(fakeHome, ".rp1"), { recursive: true });
		writeFileSync(
			join(fakeHome, ".rp1", "project_id"),
			"880e8400-e29b-41d4-a716-446655440000",
		);
		await mkdir(nestedPathUnderHome, { recursive: true });

		const result = resolveDirectorySet(nestedPathUnderHome, {
			homeDir: fakeHome,
		});
		expect(E.isLeft(result)).toBe(true);
		if (E.isRight(result)) return;

		expect(result.left._tag).toBe("NotFoundError");
	});

	test("does not auto-discover the home directory when HOME is a symlink alias", async () => {
		const fakeHome = join(tempBase, "real-home");
		const aliasedHome = join(tempBase, "alias-home");
		const nestedPathUnderHome = join(fakeHome, "scratch", "app");
		await mkdir(join(fakeHome, ".rp1"), { recursive: true });
		writeFileSync(
			join(fakeHome, ".rp1", "project_id"),
			"890e8400-e29b-41d4-a716-446655440000",
		);
		await mkdir(nestedPathUnderHome, { recursive: true });
		await symlink(fakeHome, aliasedHome);

		const result = resolveDirectorySet(nestedPathUnderHome, {
			homeDir: aliasedHome,
		});
		expect(E.isLeft(result)).toBe(true);
		if (E.isRight(result)) return;

		expect(result.left._tag).toBe("NotFoundError");
	});

	test("RP1_PROJECT_ROOT env var is ignored", () => {
		const origVal = process.env.RP1_PROJECT_ROOT;
		process.env.RP1_PROJECT_ROOT = join(tempBase, "env-project");

		try {
			const result = resolveDirectorySet(plainDirectory);
			expect(E.isLeft(result)).toBe(true);
		} finally {
			if (origVal === undefined) {
				delete process.env.RP1_PROJECT_ROOT;
			} else {
				process.env.RP1_PROJECT_ROOT = origVal;
			}
		}
	});

	test("RP1_KB_ROOT env var is ignored", () => {
		const origVal = process.env.RP1_KB_ROOT;
		process.env.RP1_KB_ROOT = join(tempBase, "env-kb");

		try {
			const result = resolveDirectorySet(nestedPath);
			expect(E.isRight(result)).toBe(true);
			if (E.isLeft(result)) return;

			expect(result.right.kbRoot).toBe(join(projectRoot, ".rp1", "context"));
		} finally {
			if (origVal === undefined) {
				delete process.env.RP1_KB_ROOT;
			} else {
				process.env.RP1_KB_ROOT = origVal;
			}
		}
	});

	test("RP1_WORK_ROOT env var is ignored", () => {
		const origVal = process.env.RP1_WORK_ROOT;
		process.env.RP1_WORK_ROOT = join(tempBase, "env-work");

		try {
			const result = resolveDirectorySet(nestedPath);
			expect(E.isRight(result)).toBe(true);
			if (E.isLeft(result)) return;

			expect(result.right.workRoot).toBe(join(projectRoot, ".rp1", "work"));
		} finally {
			if (origVal === undefined) {
				delete process.env.RP1_WORK_ROOT;
			} else {
				process.env.RP1_WORK_ROOT = origVal;
			}
		}
	});

	test("backward compat: .rp1/ without project_id returns projectRoot with projectId undefined", async () => {
		const backcompatProject = join(tempBase, "backcompat-project");
		await mkdir(join(backcompatProject, ".rp1"), { recursive: true });

		const consoleSpy = { warned: false };
		const origWarn = console.warn;
		console.warn = (...args: unknown[]) => {
			if (String(args[0]).includes("without project_id")) {
				consoleSpy.warned = true;
			}
		};

		try {
			const result = resolveDirectorySet(backcompatProject);
			expect(E.isRight(result)).toBe(true);
			if (E.isLeft(result)) return;

			expect(result.right.projectRoot).toBe(backcompatProject);
			expect(result.right.projectId).toBeUndefined();
			expect(result.right.codeRoot).toBe(backcompatProject);
			expect(consoleSpy.warned).toBe(true);
		} finally {
			console.warn = origWarn;
		}
	});

	test("worktree with its own .rp1/project_id still resolves to main repo", async () => {
		// Simulate a worktree that has .rp1/ checked into the repo (or created locally)
		const worktreeRp1Dir = join(linkedWorktreePath, ".rp1");
		await mkdir(worktreeRp1Dir, { recursive: true });
		writeFileSync(
			join(worktreeRp1Dir, "project_id"),
			"770e8400-e29b-41d4-a716-446655440000",
		);

		try {
			const result = resolveDirectorySet(linkedWorktreePath);
			expect(E.isRight(result)).toBe(true);
			if (E.isLeft(result)) return;

			// Should resolve to main repo, NOT the worktree's local .rp1
			expect(result.right.projectRoot).toBe(worktreeMainRoot);
			expect(result.right.projectId).toBe(
				"660e8400-e29b-41d4-a716-446655440000",
			);
			expect(result.right.isWorktree).toBe(true);
			expect(result.right.worktreeName).toBe("test-branch");
			expect(result.right.codeRoot).toBe(linkedWorktreePath);
		} finally {
			// Clean up the worktree-local .rp1 directory
			await rm(worktreeRp1Dir, { recursive: true, force: true });
		}
	});

	test("codeRoot is always an absolute path", () => {
		const result = resolveDirectorySet(nestedPath);
		expect(E.isRight(result)).toBe(true);
		if (E.isLeft(result)) return;

		expect(result.right.codeRoot).toMatch(/^\//);
		expect(result.right.codeRoot).not.toContain("..");

		const worktreeResult = resolveDirectorySet(linkedWorktreePath);
		expect(E.isRight(worktreeResult)).toBe(true);
		if (E.isLeft(worktreeResult)) return;

		expect(worktreeResult.right.codeRoot).toMatch(/^\//);
		expect(worktreeResult.right.codeRoot).not.toContain("..");
	});

	test("detached HEAD produces undefined worktreeName", async () => {
		const detachedRepo = join(tempBase, "detached-head-repo");
		await mkdir(join(detachedRepo, ".rp1"), { recursive: true });
		writeFileSync(
			join(detachedRepo, ".rp1", "project_id"),
			"aa0e8400-e29b-41d4-a716-446655440000",
		);
		await initTestRepo(detachedRepo);
		await createInitialCommit(detachedRepo);

		const revParseProc = Bun.spawn(["git", "rev-parse", "HEAD"], {
			cwd: detachedRepo,
			stdout: "pipe",
			env: { ...process.env, GIT_DIR: undefined },
		});
		const sha = (await new Response(revParseProc.stdout).text()).trim();
		await revParseProc.exited;

		const checkoutProc = Bun.spawn(["git", "checkout", sha], {
			cwd: detachedRepo,
			stdout: "pipe",
			stderr: "pipe",
			env: { ...process.env, GIT_DIR: undefined },
		});
		await checkoutProc.exited;

		const result = resolveDirectorySet(detachedRepo);
		expect(E.isRight(result)).toBe(true);
		if (E.isLeft(result)) return;

		expect(result.right.projectRoot).toBe(detachedRepo);
		expect(result.right.isWorktree).toBe(false);
		expect(result.right.worktreeName).toBeUndefined();
	});

	test("settings.toml directory overrides are ignored", async () => {
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
		if (E.isLeft(result)) return;

		expect(result.right.kbRoot).toBe(join(projectRoot, ".rp1", "context"));
		expect(result.right.workRoot).toBe(join(projectRoot, ".rp1", "work"));
	});

	describe("storage mode resolution", () => {
		test("resolves central-mode paths when storage mode is central", () => {
			resetContainerDetectionCache();
			const result = resolveDirectorySet(centralProject);
			expect(E.isRight(result)).toBe(true);
			if (E.isLeft(result)) return;

			const home = homedir();
			expect(result.right.kbRoot).toBe(
				join(
					home,
					".rp1",
					"projects",
					"cc0e8400-e29b-41d4-a716-446655440000",
					"context",
				),
			);
			expect(result.right.workRoot).toBe(
				join(
					home,
					".rp1",
					"projects",
					"cc0e8400-e29b-41d4-a716-446655440000",
					"work",
				),
			);
			expect(result.right.storageMode).toBe("central");
			expect(result.right.projectRoot).toBe(centralProject);
		});

		test("container environment overrides central to local silently", () => {
			resetContainerDetectionCache();
			const origCodespaces = process.env.CODESPACES;
			process.env.CODESPACES = "true";

			const origWarn = console.warn;
			const warnings: string[] = [];
			console.warn = (...args: unknown[]) => {
				warnings.push(String(args[0]));
			};

			try {
				const result = resolveDirectorySet(centralProject);
				expect(E.isRight(result)).toBe(true);
				if (E.isLeft(result)) return;

				expect(result.right.kbRoot).toBe(
					join(centralProject, ".rp1", "context"),
				);
				expect(result.right.workRoot).toBe(
					join(centralProject, ".rp1", "work"),
				);
				expect(result.right.storageMode).toBe("local");
				expect(warnings.filter((w) => w.includes("container"))).toHaveLength(0);
			} finally {
				console.warn = origWarn;
				if (origCodespaces === undefined) {
					delete process.env.CODESPACES;
				} else {
					process.env.CODESPACES = origCodespaces;
				}
				resetContainerDetectionCache();
			}
		});

		test("includes storageMode: local for default projects", () => {
			resetContainerDetectionCache();
			const result = resolveDirectorySet(nestedPath);
			expect(E.isRight(result)).toBe(true);
			if (E.isLeft(result)) return;

			expect(result.right.storageMode).toBe("local");
		});

		test("central mode degrades to local when project_id is missing", async () => {
			resetContainerDetectionCache();
			const noIdProject = join(centralProject, "..", "project-central-no-id");
			await mkdir(join(noIdProject, ".rp1"), { recursive: true });
			await writeFixture(
				noIdProject,
				".rp1/settings.toml",
				'[storage]\nmode = "central"',
			);

			const origWarn = console.warn;
			console.warn = () => {};

			try {
				const result = resolveDirectorySet(noIdProject);
				expect(E.isRight(result)).toBe(true);
				if (E.isLeft(result)) return;

				expect(result.right.kbRoot).toBe(join(noIdProject, ".rp1", "context"));
				expect(result.right.workRoot).toBe(join(noIdProject, ".rp1", "work"));
				expect(result.right.storageMode).toBe("local");
			} finally {
				console.warn = origWarn;
			}
		});
	});
});
