import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ToolResult } from "../../../agent-tools/models.js";
import { closeWorkSearchDatabase } from "../../../agent-tools/work-search/database.js";
import {
	execute,
	normalizeWorkSearchInput,
} from "../../../agent-tools/work-search/index.js";
import { refreshWorkSearchIndex } from "../../../agent-tools/work-search/indexer.js";
import type {
	WorkSearchResult,
	WorkSearchToolResult,
} from "../../../agent-tools/work-search/models.js";
import { executeWorkSearch } from "../../../agent-tools/work-search/search.js";
import {
	cleanupTempDir,
	createTempDir,
	expectLeft,
	expectTaskRight,
	writeFixture,
} from "../../helpers/index.js";

interface TestProject {
	readonly root: string;
	readonly projectId: string;
	readonly workRoot: string;
}

const mainPath = join(import.meta.dir, "..", "..", "..", "main.ts");

let tempDir: string;
let restoreRp1Db: (() => void) | undefined;

const createProject = async (
	name: string,
	projectId: string,
): Promise<TestProject> => {
	const root = join(tempDir, name);
	await mkdir(join(root, ".rp1", "work"), { recursive: true });
	await writeFile(join(root, ".rp1", "project_id"), projectId, "utf-8");
	return {
		root,
		projectId,
		workRoot: join(root, ".rp1", "work"),
	};
};

const writeProjectFile = async (
	project: TestProject,
	relativePath: string,
	content: string,
): Promise<string> => writeFixture(project.workRoot, relativePath, content);

const search = async (
	project: TestProject,
	query: string,
	options: { readonly refresh?: boolean; readonly limit?: number } = {},
): Promise<WorkSearchToolResult> =>
	expectTaskRight(
		executeWorkSearch({
			query,
			project: project.root,
			limit: options.limit ?? 10,
			refresh: options.refresh ?? false,
			refreshOnly: false,
		}),
	);

const expectSearchPaths = async (
	project: TestProject,
	query: string,
	expectedPaths: readonly string[],
): Promise<WorkSearchToolResult> => {
	const result = await search(project, query);
	expect(result.success).toBe(true);
	expect(result.data?.results.map((hit) => hit.path)).toEqual([
		...expectedPaths,
	]);
	return result;
};

const expectWorkSearchError = (
	result: WorkSearchToolResult,
	code: string,
): void => {
	expect(result.success).toBe(false);
	expect(result.tool).toBe("work-search");
	expect(result.data).toBeNull();
	expect(result.errors?.[0]).toMatchObject({ code });
};

const parseCliOutput = <T>(output: string): ToolResult<T> =>
	JSON.parse(output) as ToolResult<T>;

const runCli = async (
	args: readonly string[],
	cwd: string,
): Promise<{
	readonly exitCode: number;
	readonly stdout: string;
	readonly stderr: string;
}> => {
	const proc = Bun.spawn([process.execPath, mainPath, "agent-tools", ...args], {
		cwd,
		stdout: "pipe",
		stderr: "pipe",
		env: {
			...process.env,
			RP1_DB: join(tempDir, "missing-rp1.db"),
		},
	});
	const [exitCode, stdout, stderr] = await Promise.all([
		proc.exited,
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
	]);
	return { exitCode, stdout, stderr };
};

beforeEach(async () => {
	tempDir = await createTempDir("work-search");
	const originalRp1Db = process.env.RP1_DB;
	process.env.RP1_DB = join(tempDir, "missing-rp1.db");
	restoreRp1Db = () => {
		if (originalRp1Db === undefined) {
			delete process.env.RP1_DB;
		} else {
			process.env.RP1_DB = originalRp1Db;
		}
	};
});

afterEach(async () => {
	closeWorkSearchDatabase();
	restoreRp1Db?.();
	restoreRp1Db = undefined;
	await cleanupTempDir(tempDir);
});

describe("work-search refresh and search", () => {
	test("indexes only regular markdown files under the project work root", async () => {
		const project = await createProject(
			"scope",
			"11111111-1111-4111-8111-111111111111",
		);
		await writeProjectFile(
			project,
			"features/alpha/design.md",
			"# Alpha\n\ninsideonly searchable content",
		);
		await writeProjectFile(
			project,
			"features/alpha/notes.txt",
			"nonmarkdownonly content",
		);
		await writeFixture(tempDir, "outside.md", "outsideonly content");
		const outsideLinkedFile = await writeFixture(
			tempDir,
			"linked-source.md",
			"linkedonly content",
		);
		const symlinkPath = join(project.workRoot, "linked.md");
		await symlink(outsideLinkedFile, symlinkPath);

		const refresh = await expectTaskRight(
			refreshWorkSearchIndex({ project: project.root }),
		);

		expect(refresh.refresh.scannedDocuments).toBe(1);
		expect(refresh.refresh.indexedDocuments).toBe(1);
		expect(refresh.refresh.failedDocuments).toBe(0);
		await expectSearchPaths(project, "insideonly", [
			"features/alpha/design.md",
		]);
		await expectSearchPaths(project, "nonmarkdownonly", []);
		await expectSearchPaths(project, "outsideonly", []);
		await expectSearchPaths(project, "linkedonly", []);
	});

	test("skips unchanged content and refreshes changed, new, and deleted artifacts", async () => {
		const project = await createProject(
			"refresh",
			"22222222-2222-4222-8222-222222222222",
		);
		const artifactPath = await writeProjectFile(
			project,
			"features/beta/design.md",
			"# Beta\n\noldtoken stable content",
		);

		const firstRefresh = await expectTaskRight(
			refreshWorkSearchIndex({ project: project.root }),
		);
		expect(firstRefresh.refresh.indexedDocuments).toBe(1);

		const secondRefresh = await expectTaskRight(
			refreshWorkSearchIndex({ project: project.root }),
		);
		expect(secondRefresh.refresh.indexedDocuments).toBe(0);
		expect(secondRefresh.refresh.skippedDocuments).toBe(1);

		await writeFile(
			artifactPath,
			"# Beta\n\nnewtoken updated content",
			"utf-8",
		);
		const changedRefresh = await expectTaskRight(
			refreshWorkSearchIndex({ project: project.root }),
		);
		expect(changedRefresh.refresh.indexedDocuments).toBe(1);
		await expectSearchPaths(project, "newtoken", ["features/beta/design.md"]);
		await expectSearchPaths(project, "oldtoken", []);

		await writeProjectFile(
			project,
			"features/beta/tasks.md",
			"# Beta Tasks\n\nnewartifacttoken content",
		);
		const newRefresh = await expectTaskRight(
			refreshWorkSearchIndex({ project: project.root }),
		);
		expect(newRefresh.refresh.indexedDocuments).toBe(1);
		expect(newRefresh.refresh.skippedDocuments).toBe(1);
		await expectSearchPaths(project, "newartifacttoken", [
			"features/beta/tasks.md",
		]);

		await rm(artifactPath);
		const deletedRefresh = await expectTaskRight(
			refreshWorkSearchIndex({ project: project.root }),
		);
		expect(deletedRefresh.refresh.deletedDocuments).toBe(1);
		await expectSearchPaths(project, "newtoken", []);
		await expectSearchPaths(project, "newartifacttoken", [
			"features/beta/tasks.md",
		]);
	});

	test("isolates searches across explicit projects with matching artifacts", async () => {
		const projectA = await createProject(
			"project-a",
			"33333333-3333-4333-8333-333333333333",
		);
		const projectB = await createProject(
			"project-b",
			"44444444-4444-4444-8444-444444444444",
		);
		await writeProjectFile(
			projectA,
			"features/shared/design.md",
			"# Shared\n\nsharedtoken alpha project content",
		);
		await writeProjectFile(
			projectB,
			"features/shared/design.md",
			"# Shared\n\nsharedtoken bravo project content",
		);

		await expectTaskRight(refreshWorkSearchIndex({ project: projectA.root }));
		await expectTaskRight(refreshWorkSearchIndex({ project: projectB.root }));

		const resultA = await search(projectA, "sharedtoken alpha");
		const resultB = await search(projectB, "sharedtoken bravo");

		expect(resultA.success).toBe(true);
		expect(resultA.data?.project.projectId).toBe(projectA.projectId);
		expect(resultA.data?.results).toHaveLength(1);
		expect(resultA.data?.results[0]).toMatchObject({
			projectId: projectA.projectId,
			path: "features/shared/design.md",
		});
		expect(resultA.data?.results[0].snippet).toContain("alpha");

		expect(resultB.success).toBe(true);
		expect(resultB.data?.project.projectId).toBe(projectB.projectId);
		expect(resultB.data?.results).toHaveLength(1);
		expect(resultB.data?.results[0]).toMatchObject({
			projectId: projectB.projectId,
			path: "features/shared/design.md",
		});
		expect(resultB.data?.results[0].snippet).toContain("bravo");
	});

	test("returns typed success output with metadata fallback when canonical DB is unavailable", async () => {
		const project = await createProject(
			"metadata",
			"55555555-5555-4555-8555-555555555555",
		);
		await writeProjectFile(
			project,
			"features/frontmatter/design.md",
			[
				"---",
				"rp1_doc_id: doc-frontmatter",
				"rp1_run_id: run-frontmatter",
				"workflow: build",
				"feature_id: frontmatter-feature",
				"step: design",
				"title: Frontmatter Title",
				"---",
				"# Ignored Heading",
				"",
				"frontmattertoken content",
			].join("\n"),
		);
		await writeProjectFile(
			project,
			"features/fallback-feature/tasks.md",
			"# Heading Fallback\n\nfallbacktoken content",
		);

		const frontmatterResult = await search(project, "frontmattertoken", {
			refresh: true,
		});
		expect(frontmatterResult.success).toBe(true);
		expect(frontmatterResult.data).toMatchObject({
			query: "frontmattertoken",
			project: {
				projectId: project.projectId,
				projectRoot: project.root,
				workRoot: project.workRoot,
			},
		});
		expect(frontmatterResult.data?.refresh).toMatchObject({
			scannedDocuments: 2,
			failedDocuments: 0,
		});
		expect(frontmatterResult.data?.results[0]).toMatchObject({
			rank: 1,
			path: "features/frontmatter/design.md",
			displayPath: ".rp1/work/features/frontmatter/design.md",
			storageRoot: "work_dir",
			projectId: project.projectId,
			metadata: {
				docId: "doc-frontmatter",
				runId: "run-frontmatter",
				workflow: "build",
				feature: "frontmatter-feature",
				step: "design",
				title: "Frontmatter Title",
			},
		});
		expect(typeof frontmatterResult.data?.results[0].score).toBe("number");
		expect(frontmatterResult.data?.results[0].snippet).toContain(
			"frontmattertoken",
		);
		expect(frontmatterResult.data?.results[0].chunk.startLine).toBeGreaterThan(
			0,
		);
		expect(frontmatterResult.data?.results[0].chunk.endLine).toBeGreaterThan(0);

		const fallbackResult = await search(project, "fallbacktoken");
		expect(fallbackResult.success).toBe(true);
		expect(fallbackResult.data?.results[0].metadata).toMatchObject({
			feature: "fallback-feature",
			step: "tasks",
			title: "Heading Fallback",
		});
	});
});

describe("work-search typed errors and CLI wiring", () => {
	test("returns typed errors for invalid input and unavailable project/index states", async () => {
		const project = await createProject(
			"errors",
			"66666666-6666-4666-8666-666666666666",
		);
		const missingProjectRoot = join(tempDir, "missing-project");
		await mkdir(missingProjectRoot, { recursive: true });

		const invalidLimit = normalizeWorkSearchInput({
			query: "valid",
			limit: "0",
		});
		expect(expectLeft(invalidLimit)).toMatchObject({
			code: "invalid_limit",
		});

		const invalidQuery = await expectTaskRight(
			execute(JSON.stringify({ query: "!!!", project: project.root }), {
				inputSource: "stdin",
			}),
		);
		expectWorkSearchError(invalidQuery, "invalid_query");

		const unavailableIndex = await expectTaskRight(
			executeWorkSearch({
				query: "valid",
				project: project.root,
				limit: 10,
				refresh: false,
				refreshOnly: false,
			}),
		);
		expectWorkSearchError(unavailableIndex, "unavailable_index");

		const unresolvedProject = await expectTaskRight(
			executeWorkSearch({
				query: "valid",
				project: missingProjectRoot,
				limit: 10,
				refresh: true,
				refreshOnly: false,
			}),
		);
		expectWorkSearchError(unresolvedProject, "unresolved_project");
	});

	test("wires CLI options to refresh-only, no-refresh search, and typed errors", async () => {
		const project = await createProject(
			"cli",
			"77777777-7777-4777-8777-777777777777",
		);
		await writeProjectFile(
			project,
			"features/cli/design.md",
			"# CLI\n\nclitoken result content",
		);

		const refreshOnly = await runCli(
			["work-search", "--refresh-only"],
			project.root,
		);
		expect(refreshOnly.stderr).toBe("");
		expect(refreshOnly.exitCode).toBe(0);
		const refreshResult = parseCliOutput<WorkSearchResult | null>(
			refreshOnly.stdout,
		);
		expect(refreshResult.success).toBe(true);
		expect(refreshResult.tool).toBe("work-search");
		expect(refreshResult.data).toMatchObject({
			query: null,
			project: { projectId: project.projectId },
			results: [],
		});
		expect(refreshResult.data?.refresh).toMatchObject({
			scannedDocuments: 1,
			indexedDocuments: 1,
		});

		const searchResult = await runCli(
			["work-search", "clitoken", "--limit", "1", "--no-refresh"],
			project.root,
		);
		expect(searchResult.stderr).toBe("");
		expect(searchResult.exitCode).toBe(0);
		const parsedSearch = parseCliOutput<WorkSearchResult | null>(
			searchResult.stdout,
		);
		expect(parsedSearch.success).toBe(true);
		expect(parsedSearch.data?.refresh).toBeNull();
		expect(parsedSearch.data?.results).toHaveLength(1);
		expect(parsedSearch.data?.results[0]).toMatchObject({
			rank: 1,
			path: "features/cli/design.md",
			projectId: project.projectId,
		});

		const invalidLimit = await runCli(
			["work-search", "clitoken", "--limit", "0"],
			project.root,
		);
		expect(invalidLimit.stderr).toBe("");
		expect(invalidLimit.exitCode).toBe(1);
		const parsedError = parseCliOutput<WorkSearchResult | null>(
			invalidLimit.stdout,
		);
		expect(parsedError.success).toBe(false);
		expect(parsedError.tool).toBe("work-search");
		expect(parsedError.data).toBeNull();
		expect(parsedError.errors?.[0]).toMatchObject({
			code: "invalid_limit",
		});
	});

	test("wires CLI project option to an explicit project from another cwd", async () => {
		const explicitProject = await createProject(
			"cli-explicit",
			"88888888-8888-4888-8888-888888888888",
		);
		const cwdProject = await createProject(
			"cli-cwd",
			"99999999-9999-4999-8999-999999999999",
		);
		await writeProjectFile(
			explicitProject,
			"features/explicit/design.md",
			"# Explicit\n\nprojectoptiontoken explicit project content",
		);
		await writeProjectFile(
			cwdProject,
			"features/cwd/design.md",
			"# Current\n\nprojectoptiontoken cwd project content",
		);

		const explicitSearch = await runCli(
			[
				"work-search",
				"projectoptiontoken",
				"--project",
				explicitProject.root,
				"--limit",
				"1",
			],
			cwdProject.root,
		);

		expect(explicitSearch.stderr).toBe("");
		expect(explicitSearch.exitCode).toBe(0);
		const parsedSearch = parseCliOutput<WorkSearchResult | null>(
			explicitSearch.stdout,
		);
		expect(parsedSearch.success).toBe(true);
		expect(parsedSearch.data?.project.projectId).toBe(
			explicitProject.projectId,
		);
		expect(parsedSearch.data?.project.projectRoot).toBe(explicitProject.root);
		expect(parsedSearch.data?.results).toHaveLength(1);
		expect(parsedSearch.data?.results[0]).toMatchObject({
			path: "features/explicit/design.md",
			projectId: explicitProject.projectId,
		});
		expect(parsedSearch.data?.results[0].snippet).toContain("explicit");
	});
});
