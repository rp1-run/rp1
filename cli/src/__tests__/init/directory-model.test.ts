import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
	detectReinitState,
	resolveInitDirectoryModel,
} from "../../init/directory-model.js";
import { cleanupTempDir, createTempDir } from "../helpers/index.js";

describe("init directory model", () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await createTempDir("init-directory-model-");
	});

	afterEach(async () => {
		await cleanupTempDir(tempDir);
	});

	test("resolves workDir to project-local .rp1/work", () => {
		const directories = resolveInitDirectoryModel(tempDir);

		expect(directories.rp1Dir).toBe(join(tempDir, ".rp1"));
		expect(directories.contextDir).toBe(join(tempDir, ".rp1", "context"));
		expect(directories.workDir).toBe(join(tempDir, ".rp1", "work"));
	});

	test("detects work content from .rp1/work directory", async () => {
		const workDir = join(tempDir, ".rp1", "work");

		await mkdir(join(tempDir, ".rp1"), { recursive: true });
		await mkdir(workDir, { recursive: true });
		await writeFile(join(workDir, "artifact.md"), "# artifact\n", "utf-8");

		const state = await detectReinitState(tempDir, null);

		expect(state.hasRp1Dir).toBe(true);
		expect(state.hasWorkContent).toBe(true);
	});
});
