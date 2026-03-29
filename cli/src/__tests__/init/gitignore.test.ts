import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Logger } from "../../../shared/logger.js";
import { buildManagedGitignoreContent } from "../../init/gitignore.js";
import { InitProgress } from "../../init/progress.js";
import { configureGitignore } from "../../init/steps/project-setup.js";
import { cleanupTempDir, createTempDir } from "../helpers/index.js";

const createMockLogger = (): Logger => ({
	trace: () => {},
	debug: () => {},
	info: () => {},
	warn: () => {},
	error: () => {},
	start: () => {},
	success: () => {},
	fail: () => {},
	box: () => {},
});

describe("init gitignore generation", () => {
	let tempDir: string;
	let originalHome: string | undefined;
	let originalRp1Root: string | undefined;

	beforeEach(async () => {
		tempDir = await createTempDir("init-gitignore-");
		originalHome = process.env.HOME;
		originalRp1Root = process.env.RP1_ROOT;
		process.env.HOME = tempDir;
		delete process.env.RP1_ROOT;
	});

	afterEach(async () => {
		await cleanupTempDir(tempDir);
		if (originalHome === undefined) {
			delete process.env.HOME;
		} else {
			process.env.HOME = originalHome;
		}
		if (originalRp1Root === undefined) {
			delete process.env.RP1_ROOT;
		} else {
			process.env.RP1_ROOT = originalRp1Root;
		}
	});

	test("recommended preset skips default external work_dir but keeps project settings fenced", () => {
		const result = buildManagedGitignoreContent(tempDir, "recommended");

		expect(result._tag).toBe("Right");
		if (result._tag !== "Right") return;

		expect(result.right).toContain("!.rp1/context/");
		expect(result.right).toContain(".rp1/settings.toml");
		expect(result.right).not.toContain(".rp1/work/");
	});

	test("recommended preset ignores a configured local work_dir instead of assuming .rp1/work", async () => {
		await mkdir(join(tempDir, ".rp1"), { recursive: true });
		await writeFile(
			join(tempDir, ".rp1", "settings.toml"),
			["[directories]", 'work_dir = "ops/work"'].join("\n"),
			"utf-8",
		);

		const result = buildManagedGitignoreContent(tempDir, "recommended");

		expect(result._tag).toBe("Right");
		if (result._tag !== "Right") return;

		expect(result.right).toContain("ops/work/");
		expect(result.right).not.toContain(".rp1/work/");
		expect(result.right).toContain(".rp1/settings.toml");
	});

	test("configureGitignore rewrites a single idempotent fenced section", async () => {
		await mkdir(join(tempDir, ".rp1"), { recursive: true });
		await writeFile(join(tempDir, ".rp1", "settings.toml"), "", "utf-8");
		await writeFile(
			join(tempDir, ".gitignore"),
			["node_modules/", "", "# rp1:start", ".rp1/work/", "# rp1:end", ""].join(
				"\n",
			),
			"utf-8",
		);

		const logger = createMockLogger();
		const progress = new InitProgress(false);

		await configureGitignore(tempDir, { isTTY: false }, logger, progress, true);
		const firstPass = await readFile(join(tempDir, ".gitignore"), "utf-8");

		await configureGitignore(tempDir, { isTTY: false }, logger, progress, true);
		const secondPass = await readFile(join(tempDir, ".gitignore"), "utf-8");

		expect(secondPass).toBe(firstPass);
		expect(secondPass.match(/# rp1:start/g)?.length).toBe(1);
		expect(secondPass.match(/# rp1:end/g)?.length).toBe(1);
		expect(secondPass).toContain(".rp1/settings.toml");
		expect(secondPass).not.toContain(".rp1/work/");
	});
});
