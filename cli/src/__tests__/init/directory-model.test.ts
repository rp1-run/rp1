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
	const originalEnv = process.env.RP1_ROOT;

	beforeEach(async () => {
		tempDir = await createTempDir("init-directory-model-");
		delete process.env.RP1_ROOT;
	});

	afterEach(async () => {
		await cleanupTempDir(tempDir);
		if (originalEnv !== undefined) {
			process.env.RP1_ROOT = originalEnv;
		} else {
			delete process.env.RP1_ROOT;
		}
	});

	test("resolves the default work directory outside the project-local .rp1 tree", () => {
		const directories = resolveInitDirectoryModel(tempDir);

		expect(directories.rp1Dir).toBe(join(tempDir, ".rp1"));
		expect(directories.contextDir).toBe(join(tempDir, ".rp1", "context"));
		expect(directories.workDir).not.toBe(join(tempDir, ".rp1", "work"));
	});

	test("detects work content from the resolved external work directory", async () => {
		const externalWorkDir = join(tempDir, "external-work");

		await mkdir(join(tempDir, ".rp1"), { recursive: true });
		await writeFile(
			join(tempDir, ".rp1", "settings.toml"),
			`[directories]
work_root = "./external-work"
`,
			"utf-8",
		);
		await mkdir(externalWorkDir, { recursive: true });
		await writeFile(
			join(externalWorkDir, "artifact.md"),
			"# artifact\n",
			"utf-8",
		);

		const state = await detectReinitState(tempDir, null);

		expect(state.hasRp1Dir).toBe(true);
		expect(state.hasWorkContent).toBe(true);
	});
});
