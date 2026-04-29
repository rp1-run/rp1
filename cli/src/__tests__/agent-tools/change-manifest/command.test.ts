import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import type {
	GenerateChangeManifestResult,
	SnapshotResult,
} from "../../../agent-tools/change-manifest/index.js";
import type { ToolResult } from "../../../agent-tools/models.js";
import {
	captureMainRepoState,
	cleanupTempDir,
	createInitialCommit,
	createTempDir,
	initTestRepo,
	spawnGit,
	verifyNoMainRepoContamination,
	writeFixture,
} from "../../helpers/index.js";

const mainPath = path.join(import.meta.dir, "..", "..", "..", "main.ts");

const readJson = async <T>(filePath: string): Promise<T> =>
	JSON.parse(await Bun.file(filePath).text()) as T;

const parseCliOutput = <T>(output: string): ToolResult<T> =>
	JSON.parse(output) as ToolResult<T>;

const createRepo = async (
	name: string,
): Promise<{ root: string; cleanup: () => Promise<void> }> => {
	const tempDir = await createTempDir(name);
	const repoRoot = path.join(tempDir, "repo");
	await mkdir(repoRoot, { recursive: true });
	await initTestRepo(repoRoot);
	await createInitialCommit(repoRoot);
	return {
		root: repoRoot,
		cleanup: () => cleanupTempDir(tempDir),
	};
};

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
			RP1_DB: path.join(cwd, ".rp1", "test-rp1.db"),
		},
	});
	const [exitCode, stdout, stderr] = await Promise.all([
		proc.exited,
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
	]);
	return { exitCode, stdout, stderr };
};

const git = async (repoRoot: string, args: string[]): Promise<string> => {
	const proc = spawnGit(args, { cwd: repoRoot });
	const [exitCode, stdout, stderr] = await Promise.all([
		proc.exited,
		new Response(proc.stdout as ReadableStream).text(),
		new Response(proc.stderr as ReadableStream).text(),
	]);
	if (exitCode !== 0) {
		throw new Error(`git ${args.join(" ")} failed: ${stderr}`);
	}
	return stdout.trim();
};

describe("change-manifest command", () => {
	let mainRepoSnapshot: Awaited<ReturnType<typeof captureMainRepoState>>;
	const cleanups: Array<() => Promise<void>> = [];

	beforeAll(async () => {
		mainRepoSnapshot = await captureMainRepoState();
	});

	afterAll(async () => {
		for (const cleanup of cleanups.reverse()) {
			await cleanup();
		}
		await verifyNoMainRepoContamination(mainRepoSnapshot);
	});

	test("snapshots and generates a build manifest through the agent-tool CLI", async () => {
		const repo = await createRepo("change-manifest-command-build");
		cleanups.push(repo.cleanup);

		const baselinePath = path.join(repo.root, ".rp1", "baseline.json");
		const snapshot = await runCli(
			[
				"change-manifest",
				"snapshot",
				"--code-root",
				repo.root,
				"--out",
				baselinePath,
			],
			repo.root,
		);
		const snapshotOutput = parseCliOutput<SnapshotResult>(snapshot.stdout);

		expect(snapshot.exitCode).toBe(0);
		expect(snapshot.stderr).toBe("");
		expect(snapshotOutput.success).toBe(true);
		expect(snapshotOutput.tool).toBe("change-manifest");
		expect(snapshotOutput.data.snapshotPath).toBe(baselinePath);
		expect(snapshotOutput.data.dirtyPaths).toEqual([]);

		await writeFixture(repo.root, "src/owned.ts", "const owned = true;\n");

		const manifestPath = path.join(repo.root, ".rp1", "manifest.json");
		const statusPath = path.join(repo.root, ".rp1", "status.json");
		const generate = await runCli(
			[
				"change-manifest",
				"generate",
				"--code-root",
				repo.root,
				"--out",
				manifestPath,
				"--status-out",
				statusPath,
				"--source",
				"build",
				"--baseline",
				baselinePath,
			],
			repo.root,
		);
		const generateOutput = parseCliOutput<GenerateChangeManifestResult>(
			generate.stdout,
		);
		const manifest = await readJson<{
			files: Array<{
				path: string;
				ownedHunks: unknown[];
				allowedOperations: string[];
			}>;
		}>(manifestPath);
		const status = await readJson<{ status: string; manifestPath: string }>(
			statusPath,
		);

		expect(generate.exitCode).toBe(0);
		expect(generate.stderr).toBe("");
		expect(generateOutput.success).toBe(true);
		expect(generateOutput.tool).toBe("change-manifest");
		expect(generateOutput.data).toMatchObject({
			status: "created",
			manifestPath,
			statusPath,
			files: 1,
			ownedLineCount: 1,
			skipReason: null,
		});
		expect(manifest.files).toEqual([
			{
				path: "src/owned.ts",
				ownedHunks: [{ startLine: 1, endLine: 1 }],
				allowedOperations: ["remove_comments"],
			},
		]);
		expect(status).toMatchObject({ status: "created", manifestPath });
	});

	test("returns a skipped envelope and writes status for outside-root scope", async () => {
		const repo = await createRepo("change-manifest-command-scope");
		cleanups.push(repo.cleanup);
		const outside = await writeFixture(
			path.dirname(repo.root),
			"outside.ts",
			"const outside = true;\n",
		);
		const manifestPath = path.join(repo.root, ".rp1", "manifest.json");
		const statusPath = path.join(repo.root, ".rp1", "status.json");

		const result = await runCli(
			[
				"change-manifest",
				"generate",
				"--code-root",
				repo.root,
				"--out",
				manifestPath,
				"--status-out",
				statusPath,
				"--source",
				"code-clean-comments",
				"--scope",
				outside,
			],
			repo.root,
		);
		const output = parseCliOutput<GenerateChangeManifestResult>(result.stdout);
		const status = await readJson<{ status: string; skipReason: string }>(
			statusPath,
		);

		expect(result.exitCode).toBe(0);
		expect(output.success).toBe(true);
		expect(output.data).toMatchObject({
			status: "skipped",
			manifestPath: null,
			statusPath,
			files: 0,
			ownedLineCount: 0,
			skipReason: "scope_outside_code_root",
		});
		expect(status).toMatchObject({
			status: "skipped",
			skipReason: "scope_outside_code_root",
		});
		expect(await Bun.file(manifestPath).exists()).toBe(false);
	});

	test("generates code-clean-comments manifests for supported scope forms", async () => {
		const repo = await createRepo("change-manifest-command-scope-forms");
		cleanups.push(repo.cleanup);

		await writeFixture(
			repo.root,
			"src/from-manifest.ts",
			"const first = 1;\nconst second = 2;\n",
		);
		const existingManifestPath = await writeFixture(
			repo.root,
			".rp1/existing-manifest.json",
			JSON.stringify({
				version: 1,
				source: "code-clean-comments",
				codeRoot: repo.root,
				files: [
					{
						path: "src/from-manifest.ts",
						ownedHunks: [{ startLine: 2, endLine: 2 }],
						allowedOperations: ["remove_comments"],
					},
				],
			}),
		);
		await writeFixture(
			repo.root,
			"src/file-scope.ts",
			"const one = 1;\nconst two = 2;\n",
		);
		await writeFixture(
			repo.root,
			"packages/pkg/dir-scope.ts",
			"const dir = true;\n",
		);
		await writeFixture(repo.root, "packages/pkg/ignore.md", "# Unsupported\n");

		await writeFixture(repo.root, "src/git-scope.ts", "const before = 1;\n");
		await git(repo.root, ["add", "src/git-scope.ts"]);
		await git(repo.root, ["commit", "-m", "Add git scope source"]);
		const baseRef = await git(repo.root, ["rev-parse", "HEAD"]);
		await writeFixture(
			repo.root,
			"src/git-scope.ts",
			"const before = 1;\nconst after = 2;\n",
		);
		await git(repo.root, ["add", "src/git-scope.ts"]);
		await git(repo.root, ["commit", "-m", "Update git scope source"]);

		const generateScope = async (
			name: string,
			scope: string,
		): Promise<{
			readonly output: ToolResult<GenerateChangeManifestResult>;
			readonly manifest: {
				readonly files: ReadonlyArray<{
					readonly path: string;
					readonly ownedHunks: ReadonlyArray<{
						readonly startLine: number;
						readonly endLine: number;
					}>;
					readonly allowedOperations: readonly string[];
				}>;
			};
		}> => {
			const manifestPath = path.join(repo.root, ".rp1", `${name}.json`);
			const statusPath = path.join(repo.root, ".rp1", `${name}-status.json`);
			const result = await runCli(
				[
					"change-manifest",
					"generate",
					"--code-root",
					repo.root,
					"--out",
					manifestPath,
					"--status-out",
					statusPath,
					"--source",
					"code-clean-comments",
					"--scope",
					scope,
				],
				repo.root,
			);
			const output = parseCliOutput<GenerateChangeManifestResult>(
				result.stdout,
			);

			expect(result.exitCode).toBe(0);
			expect(result.stderr).toBe("");
			expect(output.success).toBe(true);
			expect(output.data).toMatchObject({
				status: "created",
				manifestPath,
				statusPath,
				skipReason: null,
			});

			return {
				output,
				manifest: await readJson<{
					files: Array<{
						path: string;
						ownedHunks: Array<{ startLine: number; endLine: number }>;
						allowedOperations: string[];
					}>;
				}>(manifestPath),
			};
		};

		const existingManifest = await generateScope(
			"existing-manifest-scope",
			existingManifestPath,
		);
		expect(existingManifest.output.data?.files).toBe(1);
		expect(existingManifest.manifest.files).toEqual([
			{
				path: "src/from-manifest.ts",
				ownedHunks: [{ startLine: 2, endLine: 2 }],
				allowedOperations: ["remove_comments"],
			},
		]);

		const fileScope = await generateScope(
			"file-scope",
			path.join(repo.root, "src/file-scope.ts"),
		);
		expect(fileScope.manifest.files).toEqual([
			{
				path: "src/file-scope.ts",
				ownedHunks: [{ startLine: 1, endLine: 2 }],
				allowedOperations: ["remove_comments"],
			},
		]);

		const directoryScope = await generateScope(
			"directory-scope",
			"packages/pkg",
		);
		expect(directoryScope.manifest.files).toEqual([
			{
				path: "packages/pkg/dir-scope.ts",
				ownedHunks: [{ startLine: 1, endLine: 1 }],
				allowedOperations: ["remove_comments"],
			},
		]);

		const gitRefScope = await generateScope("git-ref-scope", baseRef);
		expect(gitRefScope.manifest.files).toEqual([
			{
				path: "src/git-scope.ts",
				ownedHunks: [{ startLine: 2, endLine: 2 }],
				allowedOperations: ["remove_comments"],
			},
		]);

		const gitRangeScope = await generateScope(
			"git-range-scope",
			`${baseRef}..HEAD`,
		);
		expect(gitRangeScope.manifest.files).toEqual([
			{
				path: "src/git-scope.ts",
				ownedHunks: [{ startLine: 2, endLine: 2 }],
				allowedOperations: ["remove_comments"],
			},
		]);
	});

	test("rejects invalid source and ambiguous mode selection", async () => {
		const repo = await createRepo("change-manifest-command-invalid");
		cleanups.push(repo.cleanup);
		const baselinePath = path.join(repo.root, ".rp1", "baseline.json");

		const invalidSource = await runCli(
			[
				"change-manifest",
				"generate",
				"--code-root",
				repo.root,
				"--out",
				path.join(repo.root, ".rp1", "manifest.json"),
				"--status-out",
				path.join(repo.root, ".rp1", "status.json"),
				"--source",
				"unknown",
				"--baseline",
				baselinePath,
			],
			repo.root,
		);
		const invalidSourceOutput = parseCliOutput<null>(invalidSource.stdout);

		expect(invalidSource.exitCode).toBe(1);
		expect(invalidSourceOutput.success).toBe(false);
		expect(invalidSourceOutput.errors?.[0]?.message).toContain(
			"--source must be one of",
		);

		const ambiguousMode = await runCli(
			[
				"change-manifest",
				"generate",
				"--code-root",
				repo.root,
				"--out",
				path.join(repo.root, ".rp1", "manifest.json"),
				"--status-out",
				path.join(repo.root, ".rp1", "status.json"),
				"--source",
				"build",
				"--baseline",
				baselinePath,
				"--scope",
				"src",
			],
			repo.root,
		);
		const ambiguousModeOutput = parseCliOutput<null>(ambiguousMode.stdout);

		expect(ambiguousMode.exitCode).toBe(1);
		expect(ambiguousModeOutput.success).toBe(false);
		expect(ambiguousModeOutput.errors?.[0]?.message).toContain(
			"Use exactly one of --baseline or --scope",
		);
	});
});
