import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Logger } from "../../../shared/logger.js";
import { buildManagedGitignoreContent } from "../../init/gitignore.js";
import { InitProgress } from "../../init/progress.js";
import { configureGitignore } from "../../init/steps/project-setup.js";
import { LATEST_FENCE_VERSION } from "../../lib/fence-version.js";
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

	beforeEach(async () => {
		tempDir = await createTempDir("init-gitignore-");
		originalHome = process.env.HOME;
		process.env.HOME = tempDir;
	});

	afterEach(async () => {
		await cleanupTempDir(tempDir);
		if (originalHome === undefined) {
			delete process.env.HOME;
		} else {
			process.env.HOME = originalHome;
		}
	});

	test("recommended preset includes project_id un-ignore and covers work via .rp1/*", () => {
		const result = buildManagedGitignoreContent(tempDir, "recommended");

		expect(result._tag).toBe("Right");
		if (result._tag !== "Right") return;

		expect(result.right).toContain("!.rp1/project_id");
		expect(result.right).toContain("!.rp1/context/");
		expect(result.right).toContain("!.rp1/context/**");
		expect(result.right).toContain(".rp1/*");
		expect(result.right).toContain(".rp1/settings.toml");
		expect(result.right).not.toContain(".rp1/work/");
	});

	test("recommended preset uses fixed project-local paths regardless of settings", async () => {
		await mkdir(join(tempDir, ".rp1"), { recursive: true });
		await writeFile(
			join(tempDir, ".rp1", "settings.toml"),
			["[directories]", 'work_root = "ops/work"'].join("\n"),
			"utf-8",
		);

		const result = buildManagedGitignoreContent(tempDir, "recommended");

		expect(result._tag).toBe("Right");
		if (result._tag !== "Right") return;

		expect(result.right).not.toContain("ops/work/");
		expect(result.right).toContain("!.rp1/project_id");
		expect(result.right).toContain(".rp1/*");
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
		expect(secondPass.match(/# rp1:start:v/g)?.length).toBe(1);
		expect(secondPass.match(/# rp1:end:v/g)?.length).toBe(1);
		expect(secondPass).toContain(`# rp1:start:v${LATEST_FENCE_VERSION}`);
		expect(secondPass).toContain(`# rp1:end:v${LATEST_FENCE_VERSION}`);
		expect(secondPass).toContain("!.rp1/project_id");
		expect(secondPass).toContain(".rp1/settings.toml");
	});
});
