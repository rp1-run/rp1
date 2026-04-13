import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import * as A from "fp-ts/Array";
import { pipe } from "fp-ts/function";
import * as TE from "fp-ts/TaskEither";
import { buildDependencyGraph } from "../../../../evals/src/attestation/deps-graph.ts";
import {
	computeDepsHash,
	computePromptHash,
} from "../../../../evals/src/attestation/prompt-hash.ts";
import { expectTaskRight } from "../helpers/index.js";

const REPO_ROOT = join(import.meta.dir, "..", "..", "..", "..");
const PLUGINS_ROOT = join(REPO_ROOT, "plugins");
const DIST_CLAUDE_ROOT = join(REPO_ROOT, "dist", "claude-code");

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

const listTrackedWorkflowSkills = async (
	root = PLUGINS_ROOT,
): Promise<string[]> => {
	if (!existsSync(root)) {
		return [];
	}

	const skillFiles = await collectSkillFiles(root);
	const trackedSkills: string[] = [];
	for (const skillFile of skillFiles) {
		const content = await readFile(skillFile, "utf-8");
		if (/is_workflow:\s*true/.test(content)) {
			trackedSkills.push(relative(REPO_ROOT, skillFile));
		}
	}

	return trackedSkills.sort();
};

const computeAllHashes = async (skillPath: string) => {
	const graph = await expectTaskRight(
		buildDependencyGraph(skillPath, "claude-code"),
	);

	return expectTaskRight(
		pipe(
			[graph.skillPath, ...graph.agents, ...graph.skills],
			A.map(computePromptHash),
			A.sequence(TE.ApplicativePar),
		),
	);
};

describe("tracked workflow lifecycle prompts", () => {
	test("do not pair cancelled guidance with skipped status payloads", async () => {
		const trackedSkills = [
			...(await listTrackedWorkflowSkills(PLUGINS_ROOT)),
			...(await listTrackedWorkflowSkills(DIST_CLAUDE_ROOT)),
		];

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

	test("keeps the build-fast Claude bundle attestation current", async () => {
		const manifest = JSON.parse(await readPrompt("evals/attestation.json")) as {
			skills?: Record<
				string,
				{
					prompt_hash: string;
					deps_hash: string;
				}
			>;
		};
		const skillPath = "dist/claude-code/dev/skills/build-fast/SKILL.md";
		const attestation = manifest.skills?.["rp1-dev:build-fast@claude-code"];

		expect(attestation).toBeDefined();

		const hashes = await computeAllHashes(skillPath);
		expect(hashes.find((hash) => hash.path === skillPath)?.hash).toBe(
			attestation?.prompt_hash,
		);
		expect(computeDepsHash(hashes)).toBe(attestation?.deps_hash);
	});
});
