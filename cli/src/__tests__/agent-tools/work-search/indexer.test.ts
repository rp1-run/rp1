import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
	computeDisplayPrefix,
	scanMarkdownWorkFiles,
} from "../../../agent-tools/work-search/indexer.js";
import { cleanupTempDir, createTempDir } from "../../helpers/index.js";

let tempDir: string;

beforeEach(async () => {
	tempDir = await createTempDir("indexer");
});

afterEach(async () => {
	await cleanupTempDir(tempDir);
});

describe("computeDisplayPrefix", () => {
	test("returns project-relative prefix when workRoot is inside projectRoot", () => {
		const projectRoot = "/home/dev/my-project";
		const workRoot = "/home/dev/my-project/.rp1/work";
		expect(computeDisplayPrefix(workRoot, projectRoot)).toBe(".rp1/work");
	});

	test("returns ~-prefixed path when workRoot is outside projectRoot and under homeDir", () => {
		const homeDir = "/home/dev";
		const projectRoot = "/home/dev/my-project";
		const workRoot = "/home/dev/.rp1/projects/abc-123/work";
		expect(computeDisplayPrefix(workRoot, projectRoot, homeDir)).toBe(
			"~/.rp1/projects/abc-123/work",
		);
	});

	test("returns absolute path when workRoot is outside projectRoot and not under homeDir", () => {
		const homeDir = "/home/dev";
		const projectRoot = "/home/dev/my-project";
		const workRoot = "/var/data/rp1/projects/abc-123/work";
		expect(computeDisplayPrefix(workRoot, projectRoot, homeDir)).toBe(
			"/var/data/rp1/projects/abc-123/work",
		);
	});

	test("handles nested project structures in local mode", () => {
		const projectRoot = "/home/dev/mono/packages/app";
		const workRoot = "/home/dev/mono/packages/app/.rp1/work";
		expect(computeDisplayPrefix(workRoot, projectRoot)).toBe(".rp1/work");
	});
});

describe("scanMarkdownWorkFiles with central-mode workRoot", () => {
	test("returns displayPath using central path format when workRoot is outside projectRoot", async () => {
		const mockHome = join(tempDir, "home");
		const projectId = "test-proj-id";
		const projectRoot = join(tempDir, "project");
		const centralWorkRoot = join(
			mockHome,
			".rp1",
			"projects",
			projectId,
			"work",
		);

		await mkdir(join(projectRoot, ".rp1"), { recursive: true });
		await mkdir(join(centralWorkRoot, "features", "alpha"), {
			recursive: true,
		});
		await writeFile(
			join(centralWorkRoot, "features", "alpha", "design.md"),
			"# Alpha Design\n\nContent here",
			"utf-8",
		);

		const files = await scanMarkdownWorkFiles(
			centralWorkRoot,
			projectRoot,
			mockHome,
		);

		expect(files).toHaveLength(1);
		expect(files[0].relativePath).toBe("features/alpha/design.md");
		expect(files[0].displayPath).toBe(
			`~/.rp1/projects/${projectId}/work/features/alpha/design.md`,
		);
	});

	test("returns displayPath using local format when workRoot is inside projectRoot", async () => {
		const projectRoot = join(tempDir, "local-project");
		const localWorkRoot = join(projectRoot, ".rp1", "work");

		await mkdir(join(localWorkRoot, "features", "beta"), { recursive: true });
		await writeFile(
			join(localWorkRoot, "features", "beta", "tasks.md"),
			"# Beta Tasks\n\nTask content",
			"utf-8",
		);

		const files = await scanMarkdownWorkFiles(localWorkRoot, projectRoot);

		expect(files).toHaveLength(1);
		expect(files[0].relativePath).toBe("features/beta/tasks.md");
		expect(files[0].displayPath).toBe(".rp1/work/features/beta/tasks.md");
	});

	test("falls back to .rp1/work prefix when projectRoot is not provided", async () => {
		const workRoot = join(tempDir, "standalone-work");
		await mkdir(join(workRoot, "notes"), { recursive: true });
		await writeFile(
			join(workRoot, "notes", "readme.md"),
			"# Notes\n\nFallback content",
			"utf-8",
		);

		const files = await scanMarkdownWorkFiles(workRoot);

		expect(files).toHaveLength(1);
		expect(files[0].displayPath).toBe(".rp1/work/notes/readme.md");
	});

	test("does not block indexing for central-mode paths with no symlinks", async () => {
		const centralWorkRoot = join(
			tempDir,
			"central",
			".rp1",
			"projects",
			"proj-1",
			"work",
		);
		const projectRoot = join(tempDir, "repo");

		await mkdir(join(projectRoot, ".rp1"), { recursive: true });
		await mkdir(join(centralWorkRoot, "features"), { recursive: true });
		await writeFile(
			join(centralWorkRoot, "features", "design.md"),
			"# Design\n\nCentral content",
			"utf-8",
		);

		const files = await scanMarkdownWorkFiles(
			centralWorkRoot,
			projectRoot,
			join(tempDir, "central"),
		);

		expect(files).toHaveLength(1);
		expect(files[0].absolutePath).toBe(
			join(centralWorkRoot, "features", "design.md"),
		);
	});
});
