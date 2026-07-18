import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ProbePoint } from "../../../agent-tools/scaffold-probe/models.js";
import { probeScaffold } from "../../../agent-tools/scaffold-probe/probe.js";
import {
	createInitialCommit,
	initTestRepo,
} from "../../helpers/git-helpers.js";
import { expectTaskLeft, expectTaskRight } from "../../helpers/index.js";

describe("scaffold-probe operations", () => {
	let tempBase: string;

	beforeAll(async () => {
		const tempDir = join(tmpdir(), `scaffold-probe-test-${Date.now()}`);
		await mkdir(tempDir, { recursive: true });
		tempBase = await realpath(tempDir);
	});

	afterAll(async () => {
		await rm(tempBase, { recursive: true, force: true });
	});

	const makeDir = async (name: string): Promise<string> => {
		const dir = join(tempBase, name);
		await mkdir(dir, { recursive: true });
		return dir;
	};

	const setupFullScaffold = async (dir: string): Promise<void> => {
		await initTestRepo(dir);
		await createInitialCommit(dir);
		await writeFile(join(dir, "package.json"), '{"name": "test-project"}');
		await mkdir(join(dir, "src"), { recursive: true });
		await writeFile(join(dir, "src", "index.ts"), "export {};");
		await mkdir(join(dir, "__tests__"), { recursive: true });
		await writeFile(
			join(dir, "__tests__", "app.test.ts"),
			'import { test } from "bun:test";',
		);
	};

	const pointByName = (
		points: readonly ProbePoint[],
		name: string,
	): ProbePoint => {
		const found = points.find((p) => p.name === name);
		if (!found) throw new Error(`Point '${name}' not found in results`);
		return found;
	};

	describe("complete scaffold passes all points", () => {
		test("returns pass=true when all four probe points are satisfied", async () => {
			const dir = await makeDir("full-scaffold");
			await setupFullScaffold(dir);

			const result = await expectTaskRight(probeScaffold(dir));

			expect(result.pass).toBe(true);
			expect(result.points).toHaveLength(4);
			for (const point of result.points) {
				expect(point.pass).toBe(true);
			}
		});

		test("returns all four named probe points in consistent order", async () => {
			const dir = await makeDir("point-names");
			await setupFullScaffold(dir);

			const result = await expectTaskRight(probeScaffold(dir));

			const names = result.points.map((p) => p.name);
			expect(names).toEqual([
				"git-commit",
				"package-manifest",
				"source-entry",
				"test-file",
			]);
		});

		test("each passing point includes a descriptive detail", async () => {
			const dir = await makeDir("passing-details");
			await setupFullScaffold(dir);

			const result = await expectTaskRight(probeScaffold(dir));

			for (const point of result.points) {
				expect(point.detail.length).toBeGreaterThan(0);
			}
		});
	});

	describe("missing git commit fails that point only", () => {
		test("reports git-commit as failed when no git repo exists", async () => {
			const dir = await makeDir("no-git");
			await writeFile(join(dir, "package.json"), '{"name": "test"}');
			await mkdir(join(dir, "src"), { recursive: true });
			await writeFile(join(dir, "src", "index.ts"), "export {};");
			await mkdir(join(dir, "__tests__"), { recursive: true });
			await writeFile(join(dir, "__tests__", "a.test.ts"), "");

			const result = await expectTaskRight(probeScaffold(dir));

			expect(result.pass).toBe(false);
			const gitPoint = pointByName(result.points, "git-commit");
			expect(gitPoint.pass).toBe(false);
			expect(pointByName(result.points, "package-manifest").pass).toBe(true);
			expect(pointByName(result.points, "source-entry").pass).toBe(true);
			expect(pointByName(result.points, "test-file").pass).toBe(true);
		});

		test("reports git-commit as failed when repo has no commits", async () => {
			const dir = await makeDir("empty-git");
			await initTestRepo(dir);
			await writeFile(join(dir, "package.json"), '{"name": "test"}');
			await mkdir(join(dir, "src"), { recursive: true });
			await writeFile(join(dir, "src", "index.ts"), "export {};");
			await mkdir(join(dir, "__tests__"), { recursive: true });
			await writeFile(join(dir, "__tests__", "a.test.ts"), "");

			const result = await expectTaskRight(probeScaffold(dir));

			expect(result.pass).toBe(false);
			const gitPoint = pointByName(result.points, "git-commit");
			expect(gitPoint.pass).toBe(false);
		});
	});

	describe("missing package manifest fails that point only", () => {
		test("reports package-manifest as failed when no manifest exists", async () => {
			const dir = await makeDir("no-manifest");
			await initTestRepo(dir);
			await createInitialCommit(dir);
			await mkdir(join(dir, "src"), { recursive: true });
			await writeFile(join(dir, "src", "index.ts"), "export {};");
			await mkdir(join(dir, "__tests__"), { recursive: true });
			await writeFile(join(dir, "__tests__", "a.test.ts"), "");

			const result = await expectTaskRight(probeScaffold(dir));

			expect(result.pass).toBe(false);
			const manifestPoint = pointByName(result.points, "package-manifest");
			expect(manifestPoint.pass).toBe(false);
			expect(pointByName(result.points, "git-commit").pass).toBe(true);
			expect(pointByName(result.points, "source-entry").pass).toBe(true);
			expect(pointByName(result.points, "test-file").pass).toBe(true);
		});
	});

	describe("missing source entry point fails that point only", () => {
		test("reports source-entry as failed when no source dir or entry file exists", async () => {
			const dir = await makeDir("no-source");
			await initTestRepo(dir);
			await createInitialCommit(dir);
			await writeFile(join(dir, "package.json"), '{"name": "test"}');
			await mkdir(join(dir, "__tests__"), { recursive: true });
			await writeFile(join(dir, "__tests__", "a.test.ts"), "");

			const result = await expectTaskRight(probeScaffold(dir));

			expect(result.pass).toBe(false);
			const sourcePoint = pointByName(result.points, "source-entry");
			expect(sourcePoint.pass).toBe(false);
			expect(pointByName(result.points, "git-commit").pass).toBe(true);
			expect(pointByName(result.points, "package-manifest").pass).toBe(true);
			expect(pointByName(result.points, "test-file").pass).toBe(true);
		});
	});

	describe("missing test file fails that point only", () => {
		test("reports test-file as failed when no test file or dir exists", async () => {
			const dir = await makeDir("no-tests");
			await initTestRepo(dir);
			await createInitialCommit(dir);
			await writeFile(join(dir, "package.json"), '{"name": "test"}');
			await mkdir(join(dir, "src"), { recursive: true });
			await writeFile(join(dir, "src", "index.ts"), "export {};");

			const result = await expectTaskRight(probeScaffold(dir));

			expect(result.pass).toBe(false);
			const testPoint = pointByName(result.points, "test-file");
			expect(testPoint.pass).toBe(false);
			expect(pointByName(result.points, "git-commit").pass).toBe(true);
			expect(pointByName(result.points, "package-manifest").pass).toBe(true);
			expect(pointByName(result.points, "source-entry").pass).toBe(true);
		});
	});

	describe("nonexistent target directory", () => {
		test("returns a CLIError for a nonexistent path", async () => {
			const badDir = join(tempBase, "does-not-exist");

			const error = await expectTaskLeft(probeScaffold(badDir));

			expect(error._tag).toBe("NotFoundError");
		});
	});

	describe("alternative manifests and entry points", () => {
		test("detects Cargo.toml as a valid package manifest", async () => {
			const dir = await makeDir("cargo-manifest");
			await initTestRepo(dir);
			await createInitialCommit(dir);
			await writeFile(join(dir, "Cargo.toml"), '[package]\nname = "test"');
			await mkdir(join(dir, "src"), { recursive: true });
			await writeFile(join(dir, "src", "main.rs"), "fn main() {}");
			await mkdir(join(dir, "tests"), { recursive: true });
			await writeFile(join(dir, "tests", "integration.rs"), "");

			const result = await expectTaskRight(probeScaffold(dir));

			expect(result.pass).toBe(true);
			expect(pointByName(result.points, "package-manifest").pass).toBe(true);
		});

		test("detects go.mod as a valid package manifest", async () => {
			const dir = await makeDir("go-manifest");
			await initTestRepo(dir);
			await createInitialCommit(dir);
			await writeFile(join(dir, "go.mod"), "module example.com/test");
			await writeFile(join(dir, "main.go"), "package main\nfunc main(){}");
			await mkdir(join(dir, "tests"), { recursive: true });
			await writeFile(join(dir, "tests", "main_test.go"), "package tests");

			const result = await expectTaskRight(probeScaffold(dir));

			expect(result.pass).toBe(true);
		});

		test("detects source-entry file at root level (main.ts)", async () => {
			const dir = await makeDir("root-entry");
			await initTestRepo(dir);
			await createInitialCommit(dir);
			await writeFile(join(dir, "package.json"), '{"name": "test"}');
			await writeFile(join(dir, "main.ts"), "console.log('hi');");
			await mkdir(join(dir, "__tests__"), { recursive: true });
			await writeFile(join(dir, "__tests__", "a.test.ts"), "");

			const result = await expectTaskRight(probeScaffold(dir));

			expect(pointByName(result.points, "source-entry").pass).toBe(true);
		});

		test("detects test file by naming pattern at root level", async () => {
			const dir = await makeDir("root-test-file");
			await initTestRepo(dir);
			await createInitialCommit(dir);
			await writeFile(join(dir, "package.json"), '{"name": "test"}');
			await mkdir(join(dir, "src"), { recursive: true });
			await writeFile(join(dir, "src", "index.ts"), "export {};");
			await writeFile(join(dir, "app.spec.ts"), "");

			const result = await expectTaskRight(probeScaffold(dir));

			expect(pointByName(result.points, "test-file").pass).toBe(true);
		});

		test("detects test directory (tests/) as passing test-file point", async () => {
			const dir = await makeDir("test-dir-detection");
			await initTestRepo(dir);
			await createInitialCommit(dir);
			await writeFile(join(dir, "package.json"), '{"name": "test"}');
			await mkdir(join(dir, "src"), { recursive: true });
			await writeFile(join(dir, "src", "index.ts"), "export {};");
			await mkdir(join(dir, "tests"), { recursive: true });
			await writeFile(join(dir, "tests", "helper.ts"), "");

			const result = await expectTaskRight(probeScaffold(dir));

			expect(pointByName(result.points, "test-file").pass).toBe(true);
		});
	});

	describe("structured output shape", () => {
		test("result matches the ToolResult contract shape", async () => {
			const dir = await makeDir("output-shape");
			await setupFullScaffold(dir);

			const result = await expectTaskRight(probeScaffold(dir));

			expect(typeof result.pass).toBe("boolean");
			expect(Array.isArray(result.points)).toBe(true);
			for (const point of result.points) {
				expect(typeof point.name).toBe("string");
				expect(typeof point.pass).toBe("boolean");
				expect(typeof point.detail).toBe("string");
			}
		});

		test("failed points include descriptive detail about what is missing", async () => {
			const dir = await makeDir("fail-details");

			const result = await expectTaskRight(probeScaffold(dir));

			for (const point of result.points) {
				if (!point.pass) {
					expect(point.detail.length).toBeGreaterThan(0);
				}
			}
		});
	});

	describe("empty directory (all points fail)", () => {
		test("reports all four points as failed for an empty directory", async () => {
			const dir = await makeDir("empty-dir");

			const result = await expectTaskRight(probeScaffold(dir));

			expect(result.pass).toBe(false);
			for (const point of result.points) {
				expect(point.pass).toBe(false);
			}
		});
	});
});
