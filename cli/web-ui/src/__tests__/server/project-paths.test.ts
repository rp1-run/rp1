import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	type ProjectDirectories,
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
			rp1Root: join(tmpProjectDir, ".rp1"),
			kbDir: join(tmpProjectDir, "external-context"),
			workDir: join(tmpProjectDir, "external-work"),
		};

		await mkdir(join(directories.workDir, "archives", "features", "feat-1"), {
			recursive: true,
		});
		await Bun.write(
			join(directories.workDir, "archives", "features", "feat-1", "tasks.md"),
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
			join(directories.workDir, "archives", "features", "feat-1", "tasks.md"),
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

	test("maps absolute paths under the resolved work directory back to work/ paths", () => {
		expect(
			toArtifactDisplayPathFromAbsolute(
				directories,
				join(directories.workDir, "archives", "features", "feat-1", "tasks.md"),
			),
		).toBe("work/archives/features/feat-1/tasks.md");
	});
});
