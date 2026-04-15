import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";

const REPO_ROOT = join(import.meta.dir, "..", "..", "..", "..");
const PLUGINS_ROOT = join(REPO_ROOT, "plugins");
const DIST_CLAUDE_ROOT = join(REPO_ROOT, "dist", "claude-code");
const FRONTMATTER_REGEX = /^---\r?\n[\s\S]*?\r?\n---\r?\n/;
const TASK_PATTERN = /(?:Task|subagent_type):\s*(\w+-\w+):(\w[\w-]*)/g;
const SKILL_PATTERN = /[Ss]kill[:\s]+`?(\w+-\w+):(\w[\w-]*)`?/g;
const PLUGIN_PATHS: Record<string, string> = {
	"rp1-base": "base",
	"rp1-dev": "dev",
	"rp1-utils": "utils",
};
const SHA256_REGEX = /^sha256:[0-9a-f]{64}$/;

interface HashResult {
	readonly path: string;
	readonly hash: string;
}

const stripFrontmatter = (content: string): string =>
	content.replace(FRONTMATTER_REGEX, "");

const computePromptHash = async (filePath: string): Promise<HashResult> => {
	const content = await readPrompt(filePath);
	const body = stripFrontmatter(content);
	const hash = createHash("sha256").update(body).digest("hex");
	return {
		path: filePath,
		hash: `sha256:${hash}`,
	};
};

const computeDepsHash = (fileHashes: readonly HashResult[]): string => {
	const combined = [...fileHashes]
		.sort((a, b) => a.path.localeCompare(b.path))
		.map((hash) => hash.hash)
		.join("|");
	return `sha256:${createHash("sha256").update(combined).digest("hex")}`;
};

const parseAgentRefs = (content: string): string[] => {
	const refs = new Set<string>();

	for (const match of content.matchAll(TASK_PATTERN)) {
		const [, plugin, agent] = match;
		const pluginDir = PLUGIN_PATHS[plugin];
		if (pluginDir) {
			refs.add(`dist/claude-code/${pluginDir}/agents/${agent}.md`);
		}
	}

	return [...refs];
};

const parseSkillRefs = (content: string): string[] => {
	const refs = new Set<string>();

	for (const match of content.matchAll(SKILL_PATTERN)) {
		const [, plugin, skill] = match;
		const pluginDir = PLUGIN_PATHS[plugin];
		if (pluginDir) {
			refs.add(`dist/claude-code/${pluginDir}/skills/${skill}/SKILL.md`);
		}
	}

	return [...refs];
};

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

const collectDependencyPaths = async (skillPath: string): Promise<string[]> => {
	const visited = new Set<string>();
	const hashes: string[] = [];
	const queue = [skillPath];

	while (queue.length > 0) {
		const currentPath = queue.shift();
		if (!currentPath || visited.has(currentPath)) {
			continue;
		}

		visited.add(currentPath);
		hashes.push(currentPath);

		const content = await readPrompt(currentPath);
		for (const ref of [
			...parseAgentRefs(content),
			...parseSkillRefs(content),
		]) {
			if (!visited.has(ref)) {
				queue.push(ref);
			}
		}
	}

	return hashes;
};

const computeAllHashes = async (skillPath: string): Promise<HashResult[]> => {
	const dependencyPaths = await collectDependencyPaths(skillPath);
	return Promise.all(dependencyPaths.map((path) => computePromptHash(path)));
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

	test("keeps the build-fast Claude bundle attestation metadata valid", async () => {
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
		const skillFullPath = join(REPO_ROOT, skillPath);
		const attestation = manifest.skills?.["rp1-dev:build-fast@claude-code"];

		expect(attestation).toBeDefined();
		if (!attestation) {
			throw new Error("Missing attestation for rp1-dev:build-fast@claude-code");
		}
		if (!existsSync(skillFullPath)) {
			return;
		}

		const previousCwd = process.cwd();
		process.chdir(REPO_ROOT);
		try {
			const hashes = await computeAllHashes(skillPath);
			const skillHash = hashes.find((hash) => hash.path === skillPath);

			expect(skillHash).toBeDefined();
			if (!skillHash) {
				throw new Error(`Missing hash for ${skillPath}`);
			}

			expect(attestation.prompt_hash).toMatch(SHA256_REGEX);
			expect(attestation.deps_hash).toMatch(SHA256_REGEX);
			expect(skillHash.hash).toMatch(SHA256_REGEX);
			expect(computeDepsHash(hashes)).toMatch(SHA256_REGEX);
		} finally {
			process.chdir(previousCwd);
		}
	});
});
