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

		expect(taskBuilder).toContain("## Implementation Commandments");
		expect(taskBuilder).toContain(
			"Write for humans first: optimize for maintainers reading, reviewing, debugging, and modifying code under time pressure.",
		);
		expect(taskBuilder).toContain(
			"Complexity is the enemy; prefer deep modules with simple interfaces and real behavior behind them.",
		);
		expect(taskBuilder).toContain(
			"Model the data and domain well; make illegal states unrepresentable or fail closed at boundaries.",
		);
		expect(taskBuilder).toContain("High cohesion, low coupling.");
		expect(taskBuilder).toContain(
			"YAGNI: code is cost, not asset; avoid speculative hooks, layers, parameters, and features.",
		);
		expect(taskBuilder).toContain(
			"Prefer duplication to the wrong abstraction.",
		);
		expect(taskBuilder).toContain(
			"Make the change easy, then make the easy change.",
		);
		expect(taskBuilder).toContain("Listen to test pain as design feedback.");
		expect(taskBuilder).toContain(
			"Test behavior through public seams, not implementation internals.",
		);
		expect(taskBuilder).toContain("Measure before optimizing; cut surgically.");
		expect(taskBuilder).toContain(
			"Task builders MUST NOT calculate, merge, create, or hand off comment cleanup manifests or cleanup-owned hunks.",
		);
		expect(taskBuilder).toContain("rp1 agent-tools change-manifest");
	});
});
