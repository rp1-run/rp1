import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	getRunDirectories,
	type ProjectDirectories,
	parseProjectSectionPath,
	resolveArtifactAbsolutePath,
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
			kbRoot: join(tmpProjectDir, "external-context"),
			workRoot: join(tmpProjectDir, "external-work"),
		};

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
