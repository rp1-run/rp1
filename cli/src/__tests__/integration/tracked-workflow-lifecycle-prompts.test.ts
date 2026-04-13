import { describe, expect, test } from "bun:test";
import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";

const REPO_ROOT = join(import.meta.dir, "..", "..", "..", "..");
const PLUGINS_ROOT = join(REPO_ROOT, "plugins");

const readPrompt = (relativePath: string): Promise<string> =>
	readFile(join(REPO_ROOT, relativePath), "utf-8");

const collectSkillFiles = async (dir: string): Promise<string[]> => {
	const entries = await readdir(dir, { withFileTypes: true });
	const nested = await Promise.all(
		entries.map(async (entry) => {
			const fullPath = join(dir, entry.name);
			if (entry.isDirectory()) {
				return collectSkillFiles(fullPath);
			}
			if (entry.isFile() && entry.name === "SKILL.md") {
				return [fullPath];
			}
			return [];
		}),
	);

	return nested.flat();
};

const listTrackedWorkflowSkills = async (): Promise<string[]> => {
	const skillFiles = await collectSkillFiles(PLUGINS_ROOT);
	const trackedSkills: string[] = [];

	for (const skillFile of skillFiles) {
		const content = await readFile(skillFile, "utf-8");
		if (/is_workflow:\s*true/.test(content)) {
			trackedSkills.push(relative(REPO_ROOT, skillFile));
		}
	}

	return trackedSkills.sort();
};

describe("tracked workflow lifecycle prompts", () => {
	test("do not pair cancelled guidance with skipped status payloads", async () => {
		const trackedSkills = await listTrackedWorkflowSkills();

		for (const path of trackedSkills) {
			const content = await readPrompt(path);
			expect(content).not.toMatch(
				/cancel(?:led|lation)?[\s\S]{0,200}\{"status":\s*"skipped"\}/i,
			);
			expect(content).not.toMatch(
				/\{"status":\s*"skipped"\}[\s\S]{0,200}cancel(?:led|lation)?/i,
			);
		}
	});

	test("uses end-run for intentional terminal stop paths", async () => {
		const cases = [
			{
				path: "plugins/base/skills/generate-user-docs/SKILL.md",
				snippets: [
					"rp1 agent-tools emit end-run",
					"--outcome cancelled",
					"--type waiting_for_user",
				],
			},
			{
				path: "plugins/dev/skills/build-fast/SKILL.md",
				snippets: [
					"rp1 agent-tools emit end-run",
					"--outcome cancelled",
					"--type waiting_for_user",
				],
			},
			{
				path: "plugins/dev/skills/pr-review/SKILL.md",
				snippets: [
					"rp1 agent-tools emit end-run",
					"--outcome cancelled",
					"--type waiting_for_user",
				],
			},
		] as const;

		for (const { path, snippets } of cases) {
			const content = await readPrompt(path);
			for (const snippet of snippets) {
				expect(content).toContain(snippet);
			}
		}
	});

	test("keeps build stop checkpoints as waiting-based resume gates", async () => {
		const content = await readPrompt("plugins/dev/skills/build/SKILL.md");

		expect(content).toContain("--type waiting_for_user");
		expect(content).toContain("On Stop: emit waiting status");
		expect(content).toContain("resume instruction");
	});
});
