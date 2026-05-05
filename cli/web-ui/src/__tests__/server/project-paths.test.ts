import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	findArtifactByRequestedPath,
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

	beforeAll(async () => {
		tmpProjectDir = await mkdtemp(join(tmpdir(), "rp1-project-paths-"));
		directories = {
			projectRoot: tmpProjectDir,
			kbRoot: join(tmpProjectDir, ".rp1", "context"),
			workRoot: join(tmpProjectDir, ".rp1", "work"),
		};
		await mkdir(join(tmpProjectDir, ".rp1"), { recursive: true });

		await mkdir(join(directories.workRoot, "archives", "features", "feat-1"), {
			recursive: true,
		});
		await Bun.write(
			join(directories.workRoot, "archives", "features", "feat-1", "tasks.md"),
			"# archived task",
		);
	});

	afterAll(async () => {
		if (tmpProjectDir) {
			await rm(tmpProjectDir, { recursive: true, force: true });
		}
	});

	test("resolves work/ archive fallback against the project-local work directory", async () => {
		const resolved = await resolveProjectSectionFilePath(
			directories,
			"work/features/feat-1/tasks.md",
		);
		expect(resolved).toBe(
			join(directories.workRoot, "archives", "features", "feat-1", "tasks.md"),
		);
	});

	test("formats work_dir artifacts with a canonical .rp1/work display prefix", () => {
		expect(
			toArtifactDisplayPath(directories, {
				path: "features/feat-1/tasks.md",
				storageRoot: "work_dir",
			}),
		).toBe(".rp1/work/features/feat-1/tasks.md");
	});

	test("normalizes legacy repo-local work_dir artifact paths to .rp1/work", () => {
		expect(
			toArtifactDisplayPath(directories, {
				path: ".rp1/work/archives/features/feat-1/tasks.md",
				storageRoot: "work_dir",
			}),
		).toBe(".rp1/work/archives/features/feat-1/tasks.md");
	});

	test("maps absolute paths under the resolved work directory back to .rp1/work paths", () => {
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
		).toBe(".rp1/work/archives/features/feat-1/tasks.md");
	});

	test("canonicalizes absolute work-root artifacts to stable .rp1/work display paths", () => {
		expect(
			toArtifactDisplayPath(directories, {
				path: join(
					directories.workRoot,
					"archives",
					"features",
					"feat-1",
					"tasks.md",
				),
				storageRoot: "absolute",
			}),
		).toBe(".rp1/work/archives/features/feat-1/tasks.md");
	});

	test("canonicalizes absolute kb-root artifacts to stable .rp1/context display paths", async () => {
		await mkdir(directories.kbRoot, { recursive: true });
		await Bun.write(join(directories.kbRoot, "index.md"), "# kb");

		expect(
			toArtifactDisplayPath(directories, {
				path: join(directories.kbRoot, "index.md"),
				storageRoot: "absolute",
			}),
		).toBe(".rp1/context/index.md");
	});

	test("keeps project work/ directories distinct from .rp1/work artifacts", () => {
		expect(
			toArtifactDisplayPath(directories, {
				path: "work/features/feat-1/tasks.md",
				storageRoot: "project",
			}),
		).toBe("work/features/feat-1/tasks.md");

		expect(
			toArtifactDisplayPath(directories, {
				path: "features/feat-1/tasks.md",
				storageRoot: "work_dir",
			}),
		).toBe(".rp1/work/features/feat-1/tasks.md");
	});

	test("prefers an exact project artifact path over the legacy work/ alias", () => {
		const projectArtifact = {
			path: "work/features/feat-1/tasks.md",
			storageRoot: "project",
		} as const;
		const workArtifact = {
			path: "features/feat-1/tasks.md",
			storageRoot: "work_dir",
		} as const;

		expect(
			findArtifactByRequestedPath(
				directories,
				[workArtifact, projectArtifact],
				"work/features/feat-1/tasks.md",
			),
		).toBe(projectArtifact);
		expect(
			findArtifactByRequestedPath(
				directories,
				[projectArtifact, workArtifact],
				".rp1/work/features/feat-1/tasks.md",
			),
		).toBe(workArtifact);
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

	test("treats URL artifacts as external locations instead of filesystem paths", () => {
		const urlArtifact = {
			locationKind: "url",
			path: "https://github.com/example/repo/pull/123",
			storageRoot: "work_dir",
			url: "https://github.com/example/repo/pull/123",
		} as const;

		expect(resolveArtifactAbsolutePath(directories, urlArtifact)).toBe(
			"https://github.com/example/repo/pull/123",
		);
		expect(toArtifactDisplayPath(directories, urlArtifact)).toBe(
			"https://github.com/example/repo/pull/123",
		);
		expect(
			findArtifactByRequestedPath(
				directories,
				[urlArtifact],
				"https://github.com/example/repo/pull/123",
			),
		).toBe(urlArtifact);
		expect(
			findArtifactByRequestedPath(
				directories,
				[urlArtifact],
				".rp1/work/https://github.com/example/repo/pull/123",
			),
		).toBeNull();
	});

	test("getRunDirectories derives project-local work root", () => {
		expect(
			getRunDirectories({
				projectPath: tmpProjectDir,
				rp1ProjectRoot: tmpProjectDir,
			}).workRoot,
		).toBe(join(tmpProjectDir, ".rp1", "work"));
	});

	test("getRunDirectories preserves persisted run roots while keeping canonical display paths", () => {
		const externalKbRoot = join(tmpProjectDir, "external-context");
		const externalWorkRoot = join(tmpProjectDir, "external-work");
		const runDirectories = getRunDirectories({
			projectPath: tmpProjectDir,
			rp1ProjectRoot: tmpProjectDir,
			rp1KbRoot: externalKbRoot,
			rp1WorkRoot: externalWorkRoot,
		});

		expect(runDirectories.kbRoot).toBe(externalKbRoot);
		expect(runDirectories.workRoot).toBe(externalWorkRoot);
		expect(
			toArtifactDisplayPathFromAbsolute(
				runDirectories,
				join(externalWorkRoot, "features", "feat-1", "tasks.md"),
			),
		).toBe(".rp1/work/features/feat-1/tasks.md");
		expect(
			toArtifactDisplayPathFromAbsolute(
				runDirectories,
				join(externalKbRoot, "index.md"),
			),
		).toBe(".rp1/context/index.md");
	});

	test("ignores process-wide RP1_* env overrides when resolving project path", () => {
		const origPR = process.env.RP1_PROJECT_ROOT;
		const origKB = process.env.RP1_KB_ROOT;
		const origWR = process.env.RP1_WORK_ROOT;
		process.env.RP1_PROJECT_ROOT = "/env/project";
		process.env.RP1_KB_ROOT = "/env/kb";
		process.env.RP1_WORK_ROOT = "/env/work";

		try {
			const resolved = resolveProjectDirectories(tmpProjectDir);

			expect(resolved.projectRoot).toBe(tmpProjectDir);
			expect(resolved.kbRoot).toBe(join(tmpProjectDir, ".rp1", "context"));
			expect(resolved.workRoot).toBe(join(tmpProjectDir, ".rp1", "work"));
		} finally {
			if (origPR === undefined) delete process.env.RP1_PROJECT_ROOT;
			else process.env.RP1_PROJECT_ROOT = origPR;
			if (origKB === undefined) delete process.env.RP1_KB_ROOT;
			else process.env.RP1_KB_ROOT = origKB;
			if (origWR === undefined) delete process.env.RP1_WORK_ROOT;
			else process.env.RP1_WORK_ROOT = origWR;
		}
	});

	test("resolveProjectDirectories always uses project-local .rp1/work", async () => {
		const defaultProjectDir = await mkdtemp(
			join(tmpdir(), "rp1-project-paths-default-"),
		);

		try {
			await mkdir(join(defaultProjectDir, ".rp1"), { recursive: true });

			const resolved = resolveProjectDirectories(defaultProjectDir);

			expect(resolved.projectRoot).toBe(defaultProjectDir);
			expect(resolved.kbRoot).toBe(join(defaultProjectDir, ".rp1", "context"));
			expect(resolved.workRoot).toBe(join(defaultProjectDir, ".rp1", "work"));
		} finally {
			await rm(defaultProjectDir, { recursive: true, force: true });
		}
	});

	describe("parseProjectSectionPath backward compatibility", () => {
		test("parses the canonical .rp1/context prefix", () => {
			const result = parseProjectSectionPath(".rp1/context/index.md");
			expect(result).not.toBeNull();
			expect(result!.section).toBe("kb");
			expect(result!.relativePath).toBe("index.md");
		});

		test("parses the canonical .rp1/work prefix", () => {
			const result = parseProjectSectionPath(
				".rp1/work/features/feat-1/tasks.md",
			);
			expect(result).not.toBeNull();
			expect(result!.section).toBe("work");
			expect(result!.relativePath).toBe("features/feat-1/tasks.md");
		});

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
