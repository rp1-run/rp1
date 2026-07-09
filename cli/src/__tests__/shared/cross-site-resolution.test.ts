import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { computeDirectoryPaths } from "../../../shared/storage-mode.js";
import { resolveDirectories } from "../../agent-tools/resolve-args/resolver.js";
import { cleanupTempDir, createTempDir } from "../helpers/index.js";

let tempDir: string;

beforeEach(async () => {
	tempDir = await createTempDir("cross-site-resolution");
});

afterEach(async () => {
	await cleanupTempDir(tempDir);
});

describe("cross-site path consistency", () => {
	test("resolve-args fallback produces same paths as computeDirectoryPaths in local mode", () => {
		const fallback = resolveDirectories(tempDir);
		const shared = computeDirectoryPaths(
			fallback.projectRoot,
			undefined,
			"local",
		);

		expect(fallback.kbRoot).toBe(shared.kbRoot);
		expect(fallback.workRoot).toBe(shared.workRoot);
	});

	test("emit defaultKbRoot/defaultWorkRoot delegate to computeDirectoryPaths (structural)", () => {
		const projectRoot = join(tempDir, "some-project");
		const expected = computeDirectoryPaths(projectRoot, undefined, "local");

		expect(expected.kbRoot).toBe(join(projectRoot, ".rp1", "context"));
		expect(expected.workRoot).toBe(join(projectRoot, ".rp1", "work"));
	});

	test("all resolution sites agree on local-mode paths for any project root", () => {
		const projectRoot = join(tempDir, "test-project");

		const shared = computeDirectoryPaths(projectRoot, undefined, "local");
		const fallback = resolveDirectories(projectRoot);

		expect(fallback.kbRoot).toBe(shared.kbRoot);
		expect(fallback.workRoot).toBe(shared.workRoot);
		expect(fallback.kbRoot).toBe(join(projectRoot, ".rp1", "context"));
		expect(fallback.workRoot).toBe(join(projectRoot, ".rp1", "work"));
	});
});
