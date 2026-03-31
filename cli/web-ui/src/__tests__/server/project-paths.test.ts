import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import {
	getRunDirectories,
	type ProjectDirectories,
	parseProjectSectionPath,
	resolveArtifactAbsolutePath,
	resolveProjectDirectories,
	resolveProjectSectionFilePath,
	toArtifactDisplayPath,
	toArtifactDisplayPathFromAbsolute,
} from "../../server/project-paths";

describe("project-paths", () => {
	let tmpProjectDir: string;
	let directories: ProjectDirectories;
	let originalProjectRoot: string | undefined;
	let originalKbRoot: string | undefined;
	let originalWorkRoot: string | undefined;

	beforeAll(async () => {
		originalProjectRoot = process.env.RP1_PROJECT_ROOT;
		originalKbRoot = process.env.RP1_KB_ROOT;
		originalWorkRoot = process.env.RP1_WORK_ROOT;
		tmpProjectDir = await mkdtemp(join(tmpdir(), "rp1-project-paths-"));
		directories = {
			projectRoot: tmpProjectDir,
			kbRoot: join(tmpProjectDir, "external-context"),
			workRoot: join(tmpProjectDir, "external-work"),
		};
		await mkdir(join(tmpProjectDir, ".rp1"), { recursive: true });
		await Bun.write(
			join(tmpProjectDir, ".rp1", "settings.toml"),
			[
				"[directories]",
				'kb_root = "external-context"',
				'work_root = "external-work"',
			].join("\n"),
		);

		await mkdir(join(directories.workRoot, "archives", "features", "feat-1"), {
			recursive: true,
		});
		await Bun.write(
			join(directories.workRoot, "archives", "features", "feat-1", "tasks.md"),
			"# archived task",
		);
	});

	afterAll(async () => {
		if (originalProjectRoot === undefined) {
			delete process.env.RP1_PROJECT_ROOT;
		} else {
			process.env.RP1_PROJECT_ROOT = originalProjectRoot;
		}
		if (originalKbRoot === undefined) {
			delete process.env.RP1_KB_ROOT;
		} else {
			process.env.RP1_KB_ROOT = originalKbRoot;
		}
		if (originalWorkRoot === undefined) {
			delete process.env.RP1_WORK_ROOT;
		} else {
			process.env.RP1_WORK_ROOT = originalWorkRoot;
		}
		if (tmpProjectDir) {
			await rm(tmpProjectDir, { recursive: true, force: true });
		}
	});

	test("resolves work/ archive fallback against the configured work directory", async () => {
		const resolved = await resolveProjectSectionFilePath(
			directories,
			"work/features/feat-1/tasks.md",
		);
		expect(resolved).toBe(
			join(directories.workRoot, "archives", "features", "feat-1", "tasks.md"),
		);
	});

	test("formats work_dir artifacts with a stable work/ display prefix", () => {
		expect(
			toArtifactDisplayPath(directories, {
				path: "features/feat-1/tasks.md",
				storageRoot: "work_dir",
			}),
		).toBe("work/features/feat-1/tasks.md");
	});

	test("normalizes legacy repo-local work_dir artifact paths with a stable work/ prefix", () => {
		expect(
			toArtifactDisplayPath(directories, {
				path: ".rp1/work/archives/features/feat-1/tasks.md",
				storageRoot: "work_dir",
			}),
		).toBe("work/archives/features/feat-1/tasks.md");
	});

	test("maps absolute paths under the resolved work directory back to work/ paths", () => {
		expect(
			toArtifactDisplayPathFromAbsolute(
				directories,
				join(
					directories.workRoot,
					"archives",
					"features",
					"feat-1",
					"tasks.md",
				),
			),
		).toBe("work/archives/features/feat-1/tasks.md");
	});

	test("resolves legacy repo-local work_dir artifact paths against the effective work root", () => {
		expect(
			resolveArtifactAbsolutePath(directories, {
				path: ".rp1/work/archives/features/feat-1/tasks.md",
				storageRoot: "work_dir",
			}),
		).toBe(
			join(directories.workRoot, "archives", "features", "feat-1", "tasks.md"),
		);
	});

	test("falls back to repo-local legacy work dir when the stored run work root is stale", async () => {
		const legacyWorkRoot = join(tmpProjectDir, ".rp1", "work");
		await mkdir(join(legacyWorkRoot, "features"), { recursive: true });

		expect(
			getRunDirectories({
				projectPath: tmpProjectDir,
				rp1ProjectRoot: tmpProjectDir,
				rp1KbRoot: directories.kbRoot,
				rp1WorkRoot: join(tmpProjectDir, "missing-work-root"),
			}).workRoot,
		).toBe(legacyWorkRoot);
	});

	test("ignores process-wide RP1_* env overrides when resolving an arbitrary project path", () => {
		process.env.RP1_PROJECT_ROOT = "/env/project";
		process.env.RP1_KB_ROOT = "/env/kb";
		process.env.RP1_WORK_ROOT = "/env/work";

		const resolved = resolveProjectDirectories(tmpProjectDir);

		expect(resolved.projectRoot).toBe(tmpProjectDir);
		expect(resolved.kbRoot).toBe(directories.kbRoot);
		expect(resolved.workRoot).toBe(directories.workRoot);
	});

	test("uses the shared ~/.rp1/work default when no project work_root is configured", async () => {
		const defaultProjectDir = await mkdtemp(
			join(tmpdir(), "rp1-project-paths-default-"),
		);

		try {
			await mkdir(join(defaultProjectDir, ".rp1"), { recursive: true });

			const resolved = resolveProjectDirectories(defaultProjectDir);

			expect(resolved.projectRoot).toBe(defaultProjectDir);
			expect(resolved.kbRoot).toBe(join(defaultProjectDir, ".rp1", "context"));
			expect(
				resolved.workRoot.startsWith(join(homedir(), ".rp1", "work")),
			).toBe(true);
		} finally {
			await rm(defaultProjectDir, { recursive: true, force: true });
		}
	});

	describe("parseProjectSectionPath backward compatibility", () => {
		test("parses kb/ prefix and returns kb section", () => {
			const result = parseProjectSectionPath("kb/index.md");
			expect(result).not.toBeNull();
			expect(result!.section).toBe("kb");
			expect(result!.relativePath).toBe("index.md");
		});

		test("parses context/ prefix and normalizes to kb section", () => {
			const result = parseProjectSectionPath("context/index.md");
			expect(result).not.toBeNull();
			expect(result!.section).toBe("kb");
			expect(result!.relativePath).toBe("index.md");
		});

		test("parses work/ prefix and returns work section", () => {
			const result = parseProjectSectionPath("work/features/feat-1/tasks.md");
			expect(result).not.toBeNull();
			expect(result!.section).toBe("work");
			expect(result!.relativePath).toBe("features/feat-1/tasks.md");
		});
	});
});
