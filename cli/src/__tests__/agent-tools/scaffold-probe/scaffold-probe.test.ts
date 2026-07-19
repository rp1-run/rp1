import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ProbePoint } from "../../../agent-tools/scaffold-probe/models.js";
import { probeScaffold } from "../../../agent-tools/scaffold-probe/probe.js";
import {
	commitAll,
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
		await writeFile(join(dir, "package.json"), '{"name": "test-project"}');
		await mkdir(join(dir, "src"), { recursive: true });
		await writeFile(join(dir, "src", "index.ts"), "export {};");
		await mkdir(join(dir, "__tests__"), { recursive: true });
		await writeFile(
			join(dir, "__tests__", "app.test.ts"),
			'import { test } from "bun:test";',
		);
		// Commit the scaffold last so HEAD actually tracks these files and the
		// working tree is clean (review DEFERRED-FROM-H2).
		await createInitialCommit(dir);
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

		test("reports git-commit as failed when scaffold files are uncommitted against an unrelated HEAD", async () => {
			const dir = await makeDir("git-uncommitted-scaffold");
			await initTestRepo(dir);
			// An unrelated prior commit (README only) — a HEAD exists...
			await createInitialCommit(dir);
			// ...but the scaffold files are written afterward and never committed.
			await writeFile(join(dir, "package.json"), '{"name": "uncommitted"}');
			await mkdir(join(dir, "src"), { recursive: true });
			await writeFile(join(dir, "src", "index.ts"), "export {};");
			await mkdir(join(dir, "__tests__"), { recursive: true });
			await writeFile(join(dir, "__tests__", "a.test.ts"), "");

			const result = await expectTaskRight(probeScaffold(dir));

			// git-commit must reject the dirty tree even though a HEAD exists...
			expect(pointByName(result.points, "git-commit").pass).toBe(false);
			// ...while the other points still detect the on-disk files.
			expect(pointByName(result.points, "package-manifest").pass).toBe(true);
			expect(pointByName(result.points, "source-entry").pass).toBe(true);
			expect(pointByName(result.points, "test-file").pass).toBe(true);
		});
	});

	describe("missing package manifest fails that point only", () => {
		test("reports package-manifest as failed when no manifest exists", async () => {
			const dir = await makeDir("no-manifest");
			await initTestRepo(dir);
			await mkdir(join(dir, "src"), { recursive: true });
			await writeFile(join(dir, "src", "index.ts"), "export {};");
			await mkdir(join(dir, "__tests__"), { recursive: true });
			await writeFile(join(dir, "__tests__", "a.test.ts"), "");
			await commitAll(dir);

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
			await writeFile(join(dir, "package.json"), '{"name": "test"}');
			await mkdir(join(dir, "__tests__"), { recursive: true });
			await writeFile(join(dir, "__tests__", "a.test.ts"), "");
			await commitAll(dir);

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
			await writeFile(join(dir, "package.json"), '{"name": "test"}');
			await mkdir(join(dir, "src"), { recursive: true });
			await writeFile(join(dir, "src", "index.ts"), "export {};");
			await commitAll(dir);

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
			await writeFile(join(dir, "Cargo.toml"), '[package]\nname = "test"');
			await mkdir(join(dir, "src"), { recursive: true });
			await writeFile(join(dir, "src", "main.rs"), "fn main() {}");
			await mkdir(join(dir, "tests"), { recursive: true });
			await writeFile(join(dir, "tests", "integration.rs"), "");
			await commitAll(dir);

			const result = await expectTaskRight(probeScaffold(dir));

			expect(result.pass).toBe(true);
			expect(pointByName(result.points, "package-manifest").pass).toBe(true);
		});

		test("detects go.mod as a valid package manifest", async () => {
			const dir = await makeDir("go-manifest");
			await initTestRepo(dir);
			await writeFile(join(dir, "go.mod"), "module example.com/test");
			await writeFile(join(dir, "main.go"), "package main\nfunc main(){}");
			await mkdir(join(dir, "tests"), { recursive: true });
			await writeFile(join(dir, "tests", "main_test.go"), "package tests");
			await commitAll(dir);

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

		test("detects a real test file inside a tests/ directory", async () => {
			const dir = await makeDir("test-dir-detection");
			await initTestRepo(dir);
			await createInitialCommit(dir);
			await writeFile(join(dir, "package.json"), '{"name": "test"}');
			await mkdir(join(dir, "src"), { recursive: true });
			await writeFile(join(dir, "src", "index.ts"), "export {};");
			await mkdir(join(dir, "tests"), { recursive: true });
			// A file matching the JS/TS test naming convention — not a bare helper.
			await writeFile(join(dir, "tests", "example.test.ts"), "");

			const result = await expectTaskRight(probeScaffold(dir));

			expect(pointByName(result.points, "test-file").pass).toBe(true);
		});

		test("accepts a Rust integration test (any .rs under tests/) — language-aware", async () => {
			const dir = await makeDir("rust-integration-test");
			await initTestRepo(dir);
			await writeFile(join(dir, "Cargo.toml"), '[package]\nname = "test"');
			await mkdir(join(dir, "src"), { recursive: true });
			await writeFile(join(dir, "src", "main.rs"), "fn main() {}");
			await mkdir(join(dir, "tests"), { recursive: true });
			// Rust integration tests carry arbitrary names; membership in tests/
			// makes them tests, so this must pass for a Cargo project even though
			// the filename matches no JS-style pattern (review H2).
			await writeFile(join(dir, "tests", "integration.rs"), "#[test] fn t(){}");
			await commitAll(dir);

			const result = await expectTaskRight(probeScaffold(dir));

			expect(pointByName(result.points, "test-file").pass).toBe(true);
		});

		test("rejects a non-test .rs helper in a non-Rust (JS) project", async () => {
			const dir = await makeDir("js-rs-helper");
			await initTestRepo(dir);
			await createInitialCommit(dir);
			await writeFile(join(dir, "package.json"), '{"name": "test"}');
			await mkdir(join(dir, "src"), { recursive: true });
			await writeFile(join(dir, "src", "index.ts"), "export {};");
			await mkdir(join(dir, "tests"), { recursive: true });
			// The `.rs` allowance is scoped to Rust projects only; in a JS project
			// a stray `.rs` file must not count as a test (review H2).
			await writeFile(join(dir, "tests", "notes.rs"), "// not a test");

			const result = await expectTaskRight(probeScaffold(dir));

			expect(pointByName(result.points, "test-file").pass).toBe(false);
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

	describe("adversarial completeness (review H2)", () => {
		test("empty source and test directories are not a complete scaffold", async () => {
			const dir = await makeDir("h2-empty-dirs");
			await initTestRepo(dir);
			await createInitialCommit(dir);
			await writeFile(join(dir, "package.json"), '{"name": "partial"}');
			await mkdir(join(dir, "src"), { recursive: true });
			await mkdir(join(dir, "tests"), { recursive: true });

			const result = await expectTaskRight(probeScaffold(dir));

			expect(result.pass).toBe(false);
			expect(pointByName(result.points, "source-entry").pass).toBe(false);
			expect(pointByName(result.points, "test-file").pass).toBe(false);
		});

		test("a directory masquerading as a manifest file does not pass package-manifest", async () => {
			const dir = await makeDir("h2-dir-manifest");
			await initTestRepo(dir);
			await createInitialCommit(dir);
			await mkdir(join(dir, "package.json"), { recursive: true });
			await mkdir(join(dir, "src"), { recursive: true });
			await writeFile(join(dir, "src", "index.ts"), "export {};");
			await mkdir(join(dir, "tests"), { recursive: true });
			await writeFile(join(dir, "tests", "a.test.ts"), "");

			const result = await expectTaskRight(probeScaffold(dir));

			expect(pointByName(result.points, "package-manifest").pass).toBe(false);
		});

		test("a symlinked source directory does not pass source-entry", async () => {
			const dir = await makeDir("h2-symlink-src");
			await initTestRepo(dir);
			await createInitialCommit(dir);
			await writeFile(join(dir, "package.json"), '{"name": "x"}');
			const realSrc = join(dir, "real-src");
			await mkdir(realSrc, { recursive: true });
			await writeFile(join(realSrc, "index.ts"), "export {};");
			await symlink(realSrc, join(dir, "src"));
			await mkdir(join(dir, "tests"), { recursive: true });
			await writeFile(join(dir, "tests", "a.test.ts"), "");

			const result = await expectTaskRight(probeScaffold(dir));

			expect(pointByName(result.points, "source-entry").pass).toBe(false);
		});

		test("a test directory populated only via nested files still passes (recursive)", async () => {
			const dir = await makeDir("h2-nested-test");
			await initTestRepo(dir);
			await createInitialCommit(dir);
			await writeFile(join(dir, "package.json"), '{"name": "x"}');
			await mkdir(join(dir, "src"), { recursive: true });
			await writeFile(join(dir, "src", "index.ts"), "export {};");
			await mkdir(join(dir, "tests", "unit"), { recursive: true });
			await writeFile(join(dir, "tests", "unit", "a.test.ts"), "");

			const result = await expectTaskRight(probeScaffold(dir));

			expect(pointByName(result.points, "test-file").pass).toBe(true);
		});

		// Reviewer reproduction #1: a committed scaffold whose only "source" is a
		// doc (src/README.md) and whose only "test-dir" file is a non-test helper
		// (tests/helper.ts). Any-regular-file detection accepted both; semantic
		// recognition must reject them so an incomplete scaffold does not report
		// complete (review H2).
		test("committed docs-as-source and helper-as-test do not complete the scaffold (review H2 repro #1)", async () => {
			const dir = await makeDir("h2-repro-doc-source-helper-test");
			await initTestRepo(dir);
			await writeFile(join(dir, "package.json"), '{"name": "x"}');
			await mkdir(join(dir, "src"), { recursive: true });
			await writeFile(join(dir, "src", "README.md"), "# not source code");
			await mkdir(join(dir, "tests"), { recursive: true });
			await writeFile(join(dir, "tests", "helper.ts"), "export const h = 1;");
			await commitAll(dir);

			const result = await expectTaskRight(probeScaffold(dir));

			expect(result.pass).toBe(false);
			// Manifest and git are genuinely satisfied; the incompleteness is
			// isolated to the source and test points.
			expect(pointByName(result.points, "package-manifest").pass).toBe(true);
			expect(pointByName(result.points, "git-commit").pass).toBe(true);
			expect(pointByName(result.points, "source-entry").pass).toBe(false);
			expect(pointByName(result.points, "test-file").pass).toBe(false);
		});

		// Reviewer reproduction #2: real source and test files exist on disk but
		// are gitignored, so only .gitignore + package.json are committed. Because
		// ignored files are invisible to `git status --porcelain`, the tree looks
		// clean — yet the scaffold is not actually committed. The git-commit point
		// must verify HEAD membership, not merely a clean tree (review H2).
		test("gitignored source and test files are absent from HEAD despite a clean tree (review H2 repro #2)", async () => {
			const dir = await makeDir("h2-repro-gitignored-scaffold");
			await initTestRepo(dir);
			// initTestRepo writes a .gitignore containing ".rp1/"; also ignore the
			// scaffold dirs so they never enter the commit.
			await writeFile(join(dir, ".gitignore"), ".rp1/\nsrc/\ntests/\n");
			await writeFile(join(dir, "package.json"), '{"name": "x"}');
			await mkdir(join(dir, "src"), { recursive: true });
			await writeFile(join(dir, "src", "main.ts"), "console.log(1);");
			await mkdir(join(dir, "tests"), { recursive: true });
			await writeFile(
				join(dir, "tests", "app.test.ts"),
				"test('x', () => {});",
			);
			await commitAll(dir);

			const result = await expectTaskRight(probeScaffold(dir));

			// The files exist on disk, so the presence checks pass...
			expect(pointByName(result.points, "package-manifest").pass).toBe(true);
			expect(pointByName(result.points, "source-entry").pass).toBe(true);
			expect(pointByName(result.points, "test-file").pass).toBe(true);
			// ...but git-commit must fail: the accepted files are not in HEAD even
			// though the working tree is clean.
			expect(pointByName(result.points, "git-commit").pass).toBe(false);
			expect(result.pass).toBe(false);
		});
	});

	describe("input guards", () => {
		test("returns a NotFoundError for a blank target-dir", async () => {
			const error = await expectTaskLeft(probeScaffold(""));

			expect(error._tag).toBe("NotFoundError");
		});

		test("returns a RuntimeError when target-dir points to a file", async () => {
			const filePath = join(tempBase, "not-a-directory.txt");
			await writeFile(filePath, "not a directory");

			const error = await expectTaskLeft(probeScaffold(filePath));

			expect(error._tag).toBe("RuntimeError");
		});
	});
});
