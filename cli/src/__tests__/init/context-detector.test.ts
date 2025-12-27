/**
 * Unit tests for the project context detection module.
 * Tests greenfield/brownfield classification based on git presence and source files.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { detectProjectContext } from "../../init/context-detector.js";
import { expectTaskRight, writeFixture } from "../helpers/index.js";

describe("context-detector", () => {
	let tempBase: string;
	let emptyDir: string;
	let gitRepoWithTs: string;
	let gitRepoEmpty: string;
	let nonGitWithPy: string;

	beforeAll(async () => {
		// Create unique temp directory for this test run
		// Use realpath to resolve symlinks (macOS /var -> /private/var)
		const tempDir = join(tmpdir(), `rp1-context-detector-test-${Date.now()}`);
		await mkdir(tempDir, { recursive: true });
		tempBase = await realpath(tempDir);

		// CD-01: Empty directory with no git
		emptyDir = join(tempBase, "empty-dir");
		await mkdir(emptyDir, { recursive: true });

		// CD-02: Git repo with .ts files
		gitRepoWithTs = join(tempBase, "git-with-ts");
		await mkdir(gitRepoWithTs, { recursive: true });
		const initTsProc = Bun.spawn(["git", "init"], {
			cwd: gitRepoWithTs,
			stdout: "pipe",
			stderr: "pipe",
		});
		await initTsProc.exited;
		await writeFixture(gitRepoWithTs, "src/index.ts", "export const x = 1;");

		// CD-03: Git repo with only .git folder (no source files)
		gitRepoEmpty = join(tempBase, "git-only");
		await mkdir(gitRepoEmpty, { recursive: true });
		const initEmptyProc = Bun.spawn(["git", "init"], {
			cwd: gitRepoEmpty,
			stdout: "pipe",
			stderr: "pipe",
		});
		await initEmptyProc.exited;

		// CD-04: No git but has .py files
		nonGitWithPy = join(tempBase, "non-git-with-py");
		await mkdir(nonGitWithPy, { recursive: true });
		await writeFixture(nonGitWithPy, "app/main.py", "print('hello')");
	});

	afterAll(async () => {
		await rm(tempBase, { recursive: true, force: true });
	});

	describe("detectProjectContext", () => {
		test("CD-01: Empty directory, no git returns greenfield", async () => {
			const result = await expectTaskRight(detectProjectContext(emptyDir));

			expect(result.context).toBe("greenfield");
			expect(result.hasSourceFiles).toBe(false);
			expect(result.gitResult.isGitRepo).toBe(false);
			expect(result.reasoning).toContain("Empty");
		});

		test("CD-02: Git repo with .ts files returns brownfield", async () => {
			const result = await expectTaskRight(detectProjectContext(gitRepoWithTs));

			expect(result.context).toBe("brownfield");
			expect(result.hasSourceFiles).toBe(true);
			expect(result.gitResult.isGitRepo).toBe(true);
			expect(result.reasoning).toContain(
				"Git repository with existing source files",
			);
		});

		test("CD-03: Git repo with only .git folder returns greenfield", async () => {
			const result = await expectTaskRight(detectProjectContext(gitRepoEmpty));

			expect(result.context).toBe("greenfield");
			expect(result.hasSourceFiles).toBe(false);
			expect(result.gitResult.isGitRepo).toBe(true);
			expect(result.reasoning).toContain("Git repository without source files");
		});

		test("CD-04: No git but has .py files returns brownfield", async () => {
			const result = await expectTaskRight(detectProjectContext(nonGitWithPy));

			expect(result.context).toBe("brownfield");
			expect(result.hasSourceFiles).toBe(true);
			expect(result.gitResult.isGitRepo).toBe(false);
			expect(result.reasoning).toContain("Directory contains source files");
		});

		test("CD-05: Detection completes in under 1 second", async () => {
			const start = performance.now();
			await expectTaskRight(detectProjectContext(gitRepoWithTs));
			const elapsed = performance.now() - start;

			expect(elapsed).toBeLessThan(1000);
		});
	});

	describe("edge cases", () => {
		test("never throws - always returns result", async () => {
			const result = await expectTaskRight(
				detectProjectContext("/invalid/path/that/does/not/exist"),
			);

			expect(result.context).toBe("greenfield");
			expect(result.hasSourceFiles).toBe(false);
		});

		test("skips node_modules when checking for source files", async () => {
			const dirWithNodeModules = join(tempBase, "dir-with-node-modules");
			await mkdir(dirWithNodeModules, { recursive: true });
			await writeFixture(
				dirWithNodeModules,
				"node_modules/pkg/index.js",
				"module.exports = {}",
			);

			const result = await expectTaskRight(
				detectProjectContext(dirWithNodeModules),
			);

			expect(result.context).toBe("greenfield");
			expect(result.hasSourceFiles).toBe(false);
		});

		test("detects source files in nested directories", async () => {
			const nestedDir = join(tempBase, "nested-src");
			await mkdir(nestedDir, { recursive: true });
			await writeFixture(nestedDir, "src/lib/utils/helper.ts", "export {}");

			const result = await expectTaskRight(detectProjectContext(nestedDir));

			expect(result.context).toBe("brownfield");
			expect(result.hasSourceFiles).toBe(true);
		});
	});
});
