import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const projectRoot = join(import.meta.dir, "..", "..", "..", "..");

const readProjectFile = async (relativePath: string): Promise<string> =>
	readFile(join(projectRoot, relativePath), "utf-8");

describe("comment cleanup manifest prompt contracts", () => {
	test("build snapshots and gates comment-cleaner on a generated non-empty manifest", async () => {
		const buildSkill = await readProjectFile(
			"plugins/dev/skills/build/SKILL.md",
		);

		expect(buildSkill).toContain("change-manifest snapshot");
		expect(buildSkill).toContain("change-manifest-baseline.json");
		expect(buildSkill).toContain("change-manifest generate");
		expect(buildSkill).toContain("--source build");
		expect(buildSkill).toContain("change-manifest-001.json");
		expect(buildSkill).toContain("change-manifest-status.json");
		expect(buildSkill).toContain('data.status == "created"');
		expect(buildSkill).toContain("data.files > 0");
		expect(buildSkill).toContain("data.ownedLineCount > 0");
		expect(buildSkill).toContain(
			"Do not dispatch `comment-cleaner` later unless",
		);
		expect(buildSkill).toContain("Include `comment-cleaner` only when");
		expect(buildSkill).toContain('"files_checked": 0');
		expect(buildSkill).toContain('"manifest_status_path"');
		expect(buildSkill).toContain('"skip_reason"');
		expect(buildSkill).toContain(
			"Do not dispatch comment-cleaner with branch, unstaged, commit-range, base-branch, mode, or commit parameters",
		);
	});

	test("build-fast snapshots and gates comment-cleaner on a generated non-empty manifest", async () => {
		const buildFastSkill = await readProjectFile(
			"plugins/dev/skills/build-fast/SKILL.md",
		);

		expect(buildFastSkill).toContain("change-manifest snapshot");
		expect(buildFastSkill).toContain("{RUN_ID}-change-manifest-baseline.json");
		expect(buildFastSkill).toContain("change-manifest generate");
		expect(buildFastSkill).toContain("--source build-fast");
		expect(buildFastSkill).toContain("{RUN_ID}-change-manifest-001.json");
		expect(buildFastSkill).toContain("{RUN_ID}-change-manifest-status.json");
		expect(buildFastSkill).toContain('data.status == "created"');
		expect(buildFastSkill).toContain("data.files > 0");
		expect(buildFastSkill).toContain("data.ownedLineCount > 0");
		expect(buildFastSkill).toContain(
			"CHANGE_MANIFEST={cleanup_manifest_result.data.manifestPath}, CODE_ROOT={codeRoot}",
		);
		expect(buildFastSkill).toContain('"files_checked": 0');
		expect(buildFastSkill).toContain('"manifest_status_path"');
		expect(buildFastSkill).toContain('"skip_reason"');
		expect(buildFastSkill).toContain("**Comment Cleanup**");
		expect(buildFastSkill).toContain("**Cleanup Manifest**");
		expect(buildFastSkill).toContain("**Cleanup Status**");
		expect(buildFastSkill).toContain("**Cleanup Skip Reason**");
		expect(buildFastSkill).toContain(
			"Do not dispatch comment-cleaner with branch, unstaged, commit-range, base-branch, mode, or commit parameters",
		);
	});

	test("code-clean-comments delegates scope resolution to change-manifest", async () => {
		const cleanupSkill = await readProjectFile(
			"plugins/dev/skills/code-clean-comments/SKILL.md",
		);

		expect(cleanupSkill).toContain("change-manifest generate");
		expect(cleanupSkill).toContain("--source code-clean-comments");
		expect(cleanupSkill).toContain('--scope "{SCOPE}"');
		expect(cleanupSkill).toContain(
			"The generator is responsible for existing manifest JSON, file, directory, git ref, and git range scopes.",
		);
		expect(cleanupSkill).toContain(
			"Do not inspect files, walk directories, parse git diffs, validate existing manifest JSON, or write manifest JSON yourself.",
		);
		expect(cleanupSkill).toContain('data.status != "created"');
		expect(cleanupSkill).toContain("data.files == 0");
		expect(cleanupSkill).toContain("data.ownedLineCount == 0");
		expect(cleanupSkill).toContain(
			"CHANGE_MANIFEST={cleanup_manifest_result.data.manifestPath}, CODE_ROOT={resolved_code_root}",
		);
		expect(cleanupSkill).not.toContain(
			"create one manifest file entry with a full-file owned hunk",
		);
		expect(cleanupSkill).not.toContain("git diff -U0 --no-color {SCOPE}");
		expect(cleanupSkill).not.toContain("Write durable JSON");
	});

	test("task-builder keeps cleanup ownership outside its responsibility", async () => {
		const taskBuilder = await readProjectFile(
			"plugins/dev/agents/task-builder.md",
		);

		expect(taskBuilder).toContain("## Engineering Discipline");
		expect(taskBuilder).toContain(
			"Write for the next reader under pressure: names/structure/control flow show intent.",
		);
		expect(taskBuilder).toContain(
			"Minimize complexity, not lines: simple paths, narrow APIs, deep modules.",
		);
		expect(taskBuilder).toContain(
			"Model domain invariants; make wrong states hard to express.",
		);
		expect(taskBuilder).toContain(
			"Fail loud near cause; never hide impossible state, corrupt data, or unexpected errors.",
		);
		expect(taskBuilder).toContain(
			"Co-locate code that changes together; organize by behavior/ownership.",
		);
		expect(taskBuilder).toContain(
			"Treat code as liability: no speculative hooks/layers/options/deps/features.",
		);
		expect(taskBuilder).toContain("Prefer duplication over wrong abstraction.");
		expect(taskBuilder).toContain(
			"Make effects/boundaries/failures explicit: IO, time, random, concurrency, retries, external deps.",
		);
		expect(taskBuilder).toContain(
			"Make prod diagnosable: structured errors/logs/metrics/traces/correlation IDs/breadcrumbs.",
		);
		expect(taskBuilder).toContain(
			"Make change easy, then make easy change: refactor small before behavior when shape fights goal.",
		);
		expect(taskBuilder).toContain(
			"Task builders MUST NOT calculate, merge, create, or hand off comment cleanup manifests or cleanup-owned hunks.",
		);
		expect(taskBuilder).toContain("rp1 agent-tools change-manifest");
	});
});
