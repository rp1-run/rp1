import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";

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
const COMPLETED_STATUS_REGEX = /\{"status":\s*"completed"/;
const FENCED_BLOCK_REGEX = /```[^\n]*\n([\s\S]*?)```/g;
// Literal terminal-step workflows with prompt-owned completion emits. Excludes
// custom lifecycle flows and parameterized terminal steps such as `{STATE}`.
const STANDARD_TERMINAL_WORKFLOW_CASES = [
	{
		path: "plugins/base/skills/deep-research/SKILL.md",
		terminalStep: "report",
	},
	{
		path: "plugins/base/skills/project-birds-eye-view/SKILL.md",
		terminalStep: "validate_diagrams",
	},
	{
		path: "plugins/dev/skills/address-pr-feedback/SKILL.md",
		terminalStep: "fixing",
	},
	{
		path: "plugins/dev/skills/blueprint/SKILL.md",
		terminalStep: "prd",
	},
	{
		path: "plugins/dev/skills/build-fast/SKILL.md",
		terminalStep: "review",
	},
	{
		path: "plugins/dev/skills/code-investigate/SKILL.md",
		terminalStep: "investigating",
	},
	{
		path: "plugins/dev/skills/pr-review/SKILL.md",
		terminalStep: "posting",
	},
	{
		path: "plugins/utils/skills/build-prompt/SKILL.md",
		terminalStep: "pipeline_complete",
	},
] as const;

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

const escapeRegExp = (value: string): string =>
	value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const extractFencedBlocks = (content: string): string[] =>
	[...content.matchAll(FENCED_BLOCK_REGEX)].map((match) => match[1] ?? "");

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

/**
 * Markdown companions under a skill's `references/` directory, sorted so the
 * traversal order — and therefore the deps hash — is stable.
 *
 * Mirrors `listSkillCompanions` in evals/src/attestation/deps-graph.ts. The
 * two live in separate packages, so the traversal is duplicated rather than
 * shared; keep them in step.
 */
const listSkillCompanions = async (
	filePath: string,
): Promise<readonly string[]> => {
	if (!filePath.endsWith("/SKILL.md")) {
		return [];
	}
	const relativeRefsDir = join(dirname(filePath), "references");
	try {
		const entries = await readdir(join(REPO_ROOT, relativeRefsDir));
		return entries
			.filter((entry) => entry.endsWith(".md"))
			.sort()
			.map((entry) => join(relativeRefsDir, entry));
	} catch {
		return [];
	}
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
			...(await listSkillCompanions(currentPath)),
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

		// Build emits waiting_for_user at interactive checkpoints (prose form)
		expect(content).toContain("waiting_for_user");
		// Stop paths emit waiting status for resumable gates — match the full
		// sentences so unrelated occurrences of "waiting" cannot satisfy this
		expect(content).toContain(
			"On Stop: emit `requirements` waiting per §PARENT-EMIT-DISCIPLINE table",
		);
		expect(content).toContain(
			"On Stop: emit `planning` waiting per §PARENT-EMIT-DISCIPLINE table",
		);
		expect(content).toContain("resume instruction");
	});

	test("closes standard terminal workflow completions", async () => {
		for (const { path, terminalStep } of STANDARD_TERMINAL_WORKFLOW_CASES) {
			const content = await readPrompt(path);
			const terminalGuidanceLine = content
				.split("\n")
				.find(
					(line) =>
						(line.includes("For terminal states") ||
							line.includes("Terminal state") ||
							line.includes("On completion")) &&
						line.includes("--close-run"),
				);

			expect(terminalGuidanceLine, path).toBeDefined();

			const stepPattern = new RegExp(
				`--step\\s+${escapeRegExp(terminalStep)}\\b`,
			);
			const terminalLines = content
				.split("\n")
				.filter(
					(line) => stepPattern.test(line) && COMPLETED_STATUS_REGEX.test(line),
				);
			const terminalBlocks = extractFencedBlocks(content).filter(
				(block) =>
					stepPattern.test(block) && COMPLETED_STATUS_REGEX.test(block),
			);
			const terminalCommands =
				terminalLines.length > 0 ? terminalLines : terminalBlocks;

			expect(terminalCommands.length, path).toBeGreaterThan(0);
			expect(
				terminalCommands.some((command) => command.includes("--close-run")),
				path,
			).toBe(true);
		}
	});

	test("keeps tracked Claude workflow bundle attestations exact", async () => {
		const manifest = JSON.parse(await readPrompt("evals/attestation.json")) as {
			skills?: Record<
				string,
				{
					prompt_hash: string;
					deps_hash: string;
				}
			>;
		};
		const trackedBundles = [
			{
				manifestKey: "rp1-dev:build@claude-code",
				skillPath: "dist/claude-code/dev/skills/build/SKILL.md",
			},
			{
				manifestKey: "rp1-dev:build-fast@claude-code",
				skillPath: "dist/claude-code/dev/skills/build-fast/SKILL.md",
			},
			{
				manifestKey: "rp1-dev:speedrun@claude-code",
				skillPath: "dist/claude-code/dev/skills/speedrun/SKILL.md",
			},
		] as const;

		const previousCwd = process.cwd();
		process.chdir(REPO_ROOT);
		try {
			for (const { manifestKey, skillPath } of trackedBundles) {
				const skillFullPath = join(REPO_ROOT, skillPath);
				const attestation = manifest.skills?.[manifestKey];

				expect(attestation).toBeDefined();
				if (!attestation) {
					throw new Error(`Missing attestation for ${manifestKey}`);
				}
				if (!existsSync(skillFullPath)) {
					continue;
				}

				const hashes = await computeAllHashes(skillPath);
				const skillHash = hashes.find((hash) => hash.path === skillPath);

				expect(skillHash).toBeDefined();
				if (!skillHash) {
					throw new Error(`Missing hash for ${skillPath}`);
				}

				expect(attestation.prompt_hash).toMatch(SHA256_REGEX);
				expect(attestation.deps_hash).toMatch(SHA256_REGEX);
				expect(skillHash.hash).toBe(attestation.prompt_hash);
				expect(computeDepsHash(hashes)).toBe(attestation.deps_hash);
			}
		} finally {
			process.chdir(previousCwd);
		}
	});
});
