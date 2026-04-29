import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import {
	createBaselineSnapshot,
	generateChangeManifest,
} from "../../../agent-tools/change-manifest/index.js";
import {
	captureMainRepoState,
	cleanupTempDir,
	createInitialCommit,
	createTempDir,
	expectRight,
	initTestRepo,
	spawnGit,
	verifyNoMainRepoContamination,
	writeFixture,
} from "../../helpers/index.js";

const fixedNow = (): Date => new Date("2026-04-28T00:00:00.000Z");

const readJson = async <T>(filePath: string): Promise<T> =>
	JSON.parse(await Bun.file(filePath).text()) as T;

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

const git = async (repoRoot: string, args: string[]): Promise<void> => {
	const proc = spawnGit(args, { cwd: repoRoot });
	const exitCode = await proc.exited;
	if (exitCode !== 0) {
		const stderr = await new Response(proc.stderr as ReadableStream).text();
		throw new Error(`git ${args.join(" ")} failed: ${stderr}`);
	}
};

describe("change-manifest generator", () => {
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

	test("captures baseline HEAD and dirty paths", async () => {
		const repo = await createRepo("change-manifest-snapshot");
		cleanups.push(repo.cleanup);
		await writeFixture(repo.root, "src/dirty.ts", "const before = 1;\n");
		await git(repo.root, ["add", "src/dirty.ts"]);
		await git(repo.root, ["commit", "-m", "Add tracked file"]);
		await writeFixture(repo.root, "src/dirty.ts", "const after = 2;\n");

		const snapshotPath = path.join(repo.root, ".rp1", "baseline.json");
		const result = await createBaselineSnapshot({
			codeRoot: repo.root,
			out: snapshotPath,
			now: fixedNow,
		})();
		const output = expectRight(result);
		const snapshot = await readJson<{
			dirtyPaths: string[];
			generatedAt: string;
		}>(snapshotPath);

		expect(output.snapshotPath).toBe(snapshotPath);
		expect(output.dirtyPaths).toEqual(["src/dirty.ts"]);
		expect(snapshot.dirtyPaths).toEqual(["src/dirty.ts"]);
		expect(snapshot.generatedAt).toBe("2026-04-28T00:00:00.000Z");
	});

	test("combines committed, staged, unstaged, and untracked source hunks", async () => {
		const repo = await createRepo("change-manifest-build");
		cleanups.push(repo.cleanup);
		await writeFixture(repo.root, "src/tracked.ts", "const before = 1;\n");
		await git(repo.root, ["add", "src/tracked.ts"]);
		await git(repo.root, ["commit", "-m", "Add tracked source"]);

		const baselinePath = path.join(repo.root, ".rp1", "baseline.json");
		await expectRight(
			await createBaselineSnapshot({
				codeRoot: repo.root,
				out: baselinePath,
				now: fixedNow,
			})(),
		);

		await writeFixture(
			repo.root,
			"src/committed.ts",
			"const a = 1;\nconst b = 2;\n",
		);
		await git(repo.root, ["add", "src/committed.ts"]);
		await git(repo.root, ["commit", "-m", "Add committed source"]);

		await writeFixture(
			repo.root,
			"src/staged.ts",
			"const c = 3;\nconst d = 4;\n",
		);
		await git(repo.root, ["add", "src/staged.ts"]);

		await writeFixture(
			repo.root,
			"src/tracked.ts",
			"const before = 1;\nconst after = 2;\n",
		);
		await writeFixture(
			repo.root,
			"scripts/untracked.py",
			"print('a')\nprint('b')\n",
		);
		await writeFixture(repo.root, "notes.md", "# Unsupported\n");
		await writeFixture(
			repo.root,
			"catalog/agents.yaml",
			"agents:\n  - name: generated\n",
		);
		await writeFixture(
			repo.root,
			"cli/src/init/templates/generated.ts",
			"export const generated = true;\n",
		);

		const manifestPath = path.join(
			repo.root,
			".rp1",
			"change-manifest-001.json",
		);
		const statusPath = path.join(
			repo.root,
			".rp1",
			"change-manifest-status.json",
		);
		const result = await generateChangeManifest({
			codeRoot: repo.root,
			out: manifestPath,
			statusOut: statusPath,
			source: "build",
			baseline: baselinePath,
			now: fixedNow,
		})();
		const output = expectRight(result);
		const manifest = await readJson<{
			files: Array<{
				path: string;
				ownedHunks: Array<{ startLine: number; endLine: number }>;
				allowedOperations: string[];
			}>;
		}>(manifestPath);

		expect(output.status).toBe("created");
		expect(output.files).toBe(4);
		expect(output.ownedLineCount).toBe(7);
		expect(manifest.files.map((file) => file.path)).toEqual([
			"scripts/untracked.py",
			"src/committed.ts",
			"src/staged.ts",
			"src/tracked.ts",
		]);
		expect(
			manifest.files.find((file) => file.path === "src/tracked.ts")?.ownedHunks,
		).toEqual([{ startLine: 2, endLine: 2 }]);
	});

	test("skips when baseline dirty paths overlap generated candidates", async () => {
		const repo = await createRepo("change-manifest-dirty-overlap");
		cleanups.push(repo.cleanup);
		await writeFixture(repo.root, "src/dirty.ts", "const before = 1;\n");
		await git(repo.root, ["add", "src/dirty.ts"]);
		await git(repo.root, ["commit", "-m", "Add dirty source"]);
		await writeFixture(repo.root, "src/dirty.ts", "const dirty = 1;\n");

		const baselinePath = path.join(repo.root, ".rp1", "baseline.json");
		await expectRight(
			await createBaselineSnapshot({
				codeRoot: repo.root,
				out: baselinePath,
				now: fixedNow,
			})(),
		);
		await writeFixture(
			repo.root,
			"src/dirty.ts",
			"const dirty = 1;\nconst build = 2;\n",
		);

		const manifestPath = path.join(
			repo.root,
			".rp1",
			"change-manifest-001.json",
		);
		const statusPath = path.join(
			repo.root,
			".rp1",
			"change-manifest-status.json",
		);
		const result = await generateChangeManifest({
			codeRoot: repo.root,
			out: manifestPath,
			statusOut: statusPath,
			source: "build",
			baseline: baselinePath,
			now: fixedNow,
		})();
		const output = expectRight(result);
		const status = await readJson<{
			skipReason: string;
			overlappedDirtyPaths: string[];
		}>(statusPath);

		expect(output.status).toBe("skipped");
		expect(output.skipReason).toBe("pre_existing_dirty_paths_overlap");
		expect(status.overlappedDirtyPaths).toEqual(["src/dirty.ts"]);
		expect(await Bun.file(manifestPath).exists()).toBe(false);
	});

	test("skips when a baseline untracked directory contains generated candidates", async () => {
		const repo = await createRepo("change-manifest-untracked-dir-overlap");
		cleanups.push(repo.cleanup);
		await writeFixture(
			repo.root,
			"src/preexisting.ts",
			"const preexisting = 1;\n",
		);

		const baselinePath = path.join(repo.root, ".rp1", "baseline.json");
		const snapshot = expectRight(
			await createBaselineSnapshot({
				codeRoot: repo.root,
				out: baselinePath,
				now: fixedNow,
			})(),
		);

		const manifestPath = path.join(
			repo.root,
			".rp1",
			"change-manifest-001.json",
		);
		const statusPath = path.join(
			repo.root,
			".rp1",
			"change-manifest-status.json",
		);
		const result = await generateChangeManifest({
			codeRoot: repo.root,
			out: manifestPath,
			statusOut: statusPath,
			source: "build",
			baseline: baselinePath,
			now: fixedNow,
		})();
		const output = expectRight(result);
		const status = await readJson<{
			skipReason: string;
			dirtyPaths: string[];
			overlappedDirtyPaths: string[];
		}>(statusPath);

		expect(snapshot.dirtyPaths).toEqual(["src/"]);
		expect(output.status).toBe("skipped");
		expect(output.skipReason).toBe("pre_existing_dirty_paths_overlap");
		expect(status.dirtyPaths).toEqual(["src/"]);
		expect(status.overlappedDirtyPaths).toEqual(["src/"]);
		expect(await Bun.file(manifestPath).exists()).toBe(false);
	});

	test("writes skipped status for empty and invalid baselines", async () => {
		const repo = await createRepo("change-manifest-baseline-skip");
		cleanups.push(repo.cleanup);
		const manifestPath = path.join(repo.root, ".rp1", "manifest.json");
		const statusPath = path.join(repo.root, ".rp1", "status.json");

		const missing = expectRight(
			await generateChangeManifest({
				codeRoot: repo.root,
				out: manifestPath,
				statusOut: statusPath,
				source: "build",
				baseline: path.join(repo.root, ".rp1", "missing.json"),
				now: fixedNow,
			})(),
		);
		expect(missing.skipReason).toBe("missing_baseline");

		const malformedPath = await writeFixture(
			repo.root,
			".rp1/malformed.json",
			"{",
		);
		const malformed = expectRight(
			await generateChangeManifest({
				codeRoot: repo.root,
				out: manifestPath,
				statusOut: statusPath,
				source: "build",
				baseline: malformedPath,
				now: fixedNow,
			})(),
		);
		expect(malformed.skipReason).toBe("invalid_baseline");

		const wrongRootPath = await writeFixture(
			repo.root,
			".rp1/wrong-root.json",
			JSON.stringify({
				version: 1,
				codeRoot: path.dirname(repo.root),
				head: "1234567",
				dirtyPaths: [],
				generatedAt: "2026-04-28T00:00:00.000Z",
			}),
		);
		const wrongRoot = expectRight(
			await generateChangeManifest({
				codeRoot: repo.root,
				out: manifestPath,
				statusOut: statusPath,
				source: "build",
				baseline: wrongRootPath,
				now: fixedNow,
			})(),
		);
		expect(wrongRoot.skipReason).toBe("baseline_code_root_mismatch");
	});

	test("skips when no supported source hunks exist", async () => {
		const repo = await createRepo("change-manifest-empty");
		cleanups.push(repo.cleanup);
		const baselinePath = path.join(repo.root, ".rp1", "baseline.json");
		await expectRight(
			await createBaselineSnapshot({
				codeRoot: repo.root,
				out: baselinePath,
				now: fixedNow,
			})(),
		);

		const result = expectRight(
			await generateChangeManifest({
				codeRoot: repo.root,
				out: path.join(repo.root, ".rp1", "manifest.json"),
				statusOut: path.join(repo.root, ".rp1", "status.json"),
				source: "build",
				baseline: baselinePath,
				now: fixedNow,
			})(),
		);

		expect(result.status).toBe("skipped");
		expect(result.skipReason).toBe("no_supported_source_hunks");
	});

	test("scope mode includes supported files when scope is the code root", async () => {
		const repo = await createRepo("change-manifest-root-scope");
		cleanups.push(repo.cleanup);
		await writeFixture(repo.root, "src/owned.ts", "const a = 1;\n");
		await writeFixture(repo.root, "scripts/owned.py", "print('a')\n");
		await writeFixture(
			repo.root,
			"node_modules/pkg/ignored.ts",
			"ignored();\n",
		);
		await writeFixture(
			repo.root,
			"catalog/agents.yaml",
			"agents:\n  - name: generated\n",
		);
		await writeFixture(
			repo.root,
			"cli/src/init/templates/generated.ts",
			"export const generated = true;\n",
		);
		await writeFixture(repo.root, "README.md", "# Unsupported\n");

		const manifestPath = path.join(repo.root, ".rp1", "manifest.json");
		const result = expectRight(
			await generateChangeManifest({
				codeRoot: repo.root,
				out: manifestPath,
				statusOut: path.join(repo.root, ".rp1", "status.json"),
				source: "code-clean-comments",
				scope: ".",
				now: fixedNow,
			})(),
		);
		const manifest = await readJson<{
			files: Array<{
				path: string;
				ownedHunks: Array<{ startLine: number; endLine: number }>;
				allowedOperations: string[];
			}>;
		}>(manifestPath);

		expect(result.status).toBe("created");
		expect(manifest.files).toEqual([
			{
				path: "scripts/owned.py",
				ownedHunks: [{ startLine: 1, endLine: 1 }],
				allowedOperations: ["remove_comments"],
			},
			{
				path: "src/owned.ts",
				ownedHunks: [{ startLine: 1, endLine: 1 }],
				allowedOperations: ["remove_comments"],
			},
		]);
	});

	test("scope mode fails closed for outside-root files", async () => {
		const repo = await createRepo("change-manifest-outside-scope");
		cleanups.push(repo.cleanup);
		const outside = await writeFixture(
			path.dirname(repo.root),
			"outside.ts",
			"const x = 1;\n",
		);

		const result = expectRight(
			await generateChangeManifest({
				codeRoot: repo.root,
				out: path.join(repo.root, ".rp1", "manifest.json"),
				statusOut: path.join(repo.root, ".rp1", "status.json"),
				source: "code-clean-comments",
				scope: outside,
				now: fixedNow,
			})(),
		);

		expect(result.status).toBe("skipped");
		expect(result.skipReason).toBe("scope_outside_code_root");
	});
});
