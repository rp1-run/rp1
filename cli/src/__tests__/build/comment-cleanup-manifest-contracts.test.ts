import { describe, expect, test } from "bun:test";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const projectRoot = join(import.meta.dir, "..", "..", "..", "..");

const readProjectFile = async (relativePath: string): Promise<string> =>
	readFile(join(projectRoot, relativePath), "utf-8");

/**
 * Read a skill's full prompt surface: SKILL.md plus every file under its
 * references/ directory. Progressive disclosure splits one skill's
 * instructions across several files, so a contract about what the skill
 * specifies holds over the whole surface, not SKILL.md alone.
 */
const readSkillSurface = async (skillRelativeDir: string): Promise<string> => {
	const dir = join(projectRoot, skillRelativeDir);
	const parts = [await readFile(join(dir, "SKILL.md"), "utf-8")];
	const refsDir = join(dir, "references");
	try {
		for (const entry of (await readdir(refsDir)).sort()) {
			if (entry.endsWith(".md")) {
				parts.push(await readFile(join(refsDir, entry), "utf-8"));
			}
		}
	} catch {
		// No references/ directory for this skill.
	}
	return parts.join("\n");
};

describe("comment cleanup manifest prompt contracts", () => {
	test("build snapshots and gates comment-cleaner on a generated non-empty manifest", async () => {
		const buildSkill = await readSkillSurface("plugins/dev/skills/build");

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
		// Cleanup-skip synthetic result fields (backtick-code format in compressed text)
		expect(buildSkill).toContain("files_checked: 0");
		expect(buildSkill).toContain("manifest_status_path");
		expect(buildSkill).toContain("skip_reason");
		expect(buildSkill).toContain(
			"Do not dispatch comment-cleaner with branch, unstaged, commit-range, base-branch, mode, or commit parameters",
		);
	});

	test("build-fast snapshots and gates comment-cleaner on a generated non-empty manifest", async () => {
		const buildFastSkill = await readSkillSurface(
			"plugins/dev/skills/build-fast",
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
		const engineeringDiscipline = await readProjectFile(
			"plugins/shared/engineering-discipline.md",
		);

		// task-builder includes the shared engineering discipline via include_shared
		expect(taskBuilder).toContain('include_shared "engineering-discipline.md"');

		// The shared file carries the full engineering discipline invariants
		expect(engineeringDiscipline).toContain("## Engineering Discipline");
		expect(engineeringDiscipline).toContain(
			"Write for the next reader under pressure: names/structure/control flow show intent.",
		);
		expect(engineeringDiscipline).toContain(
			"Minimize complexity, not lines: simple paths, narrow APIs, deep modules.",
		);
		expect(engineeringDiscipline).toContain(
			"Model domain invariants; make wrong states hard to express.",
		);
		expect(engineeringDiscipline).toContain(
			"Fail loud near cause; never hide impossible state, corrupt data, or unexpected errors.",
		);
		expect(engineeringDiscipline).toContain(
			"Co-locate code that changes together; organize by behavior/ownership.",
		);
		expect(engineeringDiscipline).toContain(
			"Treat code as liability: no speculative hooks/layers/options/deps/features.",
		);
		expect(engineeringDiscipline).toContain(
			"Prefer duplication over wrong abstraction.",
		);
		expect(engineeringDiscipline).toContain(
			"Make effects/boundaries/failures explicit: IO, time, random, concurrency, retries, external deps.",
		);
		expect(engineeringDiscipline).toContain(
			"Make prod diagnosable: structured errors/logs/metrics/traces/correlation IDs/breadcrumbs.",
		);
		expect(engineeringDiscipline).toContain(
			"Make change easy, then make easy change: refactor small before behavior when shape fights goal.",
		);

		// Cleanup-ownership invariant stays in task-builder itself
		expect(taskBuilder).toContain(
			"Task builders MUST NOT calculate, merge, create, or hand off comment cleanup manifests or cleanup-owned hunks.",
		);
		expect(taskBuilder).toContain("rp1 agent-tools change-manifest");
	});
});
