/**
 * Integration tests for the Codex build pipeline.
 * Tests end-to-end buildPlatformPlugin (codex) with fixture data and output verification.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { parse as parseToml } from "smol-toml";
import { createLogger } from "../../../../shared/logger.js";
import { buildPlatformPlugin } from "../../../build/command.js";
import { PLATFORM_DEFINITIONS } from "../../../build/platform-definitions.js";
import { cleanupTempDir, createTempDir } from "../../helpers/index.js";

const projectRoot = join(import.meta.dir, "..", "..", "..", "..", "..");
const logger = createLogger({ level: "error", color: false });
const codexDef = PLATFORM_DEFINITIONS.get("codex")!;

describe("buildPlatformPlugin (codex) integration", () => {
	let tempDir: string;

	beforeAll(async () => {
		tempDir = await createTempDir("codex-integration-");
	});

	afterAll(async () => {
		await cleanupTempDir(tempDir);
	});

	test("builds base plugin with skills and agents", async () => {
		const outputPath = join(tempDir, "base-output");
		const result = await buildPlatformPlugin(
			"base",
			projectRoot,
			outputPath,
			codexDef,
			logger,
			true,
		);

		expect(result.summary.plugin).toBe("base");
		expect(result.summary.skills).toBeGreaterThan(0);
		expect(result.summary.agents).toBeGreaterThan(0);
		expect(result.summary.errors).toHaveLength(0);
	}, 30000);

	test("produces skill directories with SKILL.md and agents/openai.yaml", async () => {
		const outputPath = join(tempDir, "structure-output");
		await buildPlatformPlugin(
			"base",
			projectRoot,
			outputPath,
			codexDef,
			logger,
			true,
		);

		const skillsDir = join(outputPath, "base", "skills");
		const skillDirs = await readdir(skillsDir);
		expect(skillDirs.length).toBeGreaterThan(0);

		const firstSkill = skillDirs[0];
		const skillMd = join(skillsDir, firstSkill, "SKILL.md");
		const skillStat = await stat(skillMd);
		expect(skillStat.isFile()).toBe(true);

		const openaiYaml = join(skillsDir, firstSkill, "agents", "openai.yaml");
		const yamlStat = await stat(openaiYaml);
		expect(yamlStat.isFile()).toBe(true);

		const yamlContent = await readFile(openaiYaml, "utf-8");
		expect(yamlContent).toContain("allow_implicit_invocation: false");
	}, 30000);

	test("produces rp1-agents.toml with slim config entries", async () => {
		const outputPath = join(tempDir, "toml-output");
		await buildPlatformPlugin(
			"base",
			projectRoot,
			outputPath,
			codexDef,
			logger,
			true,
		);

		const tomlPath = join(outputPath, "base", "rp1-agents.toml");
		const tomlContent = await readFile(tomlPath, "utf-8");
		const parsed = parseToml(tomlContent) as Record<string, unknown>;

		expect(parsed).toHaveProperty("agents");
		const agents = parsed.agents as Record<string, unknown>;
		const agentNames = Object.keys(agents);
		expect(agentNames.length).toBeGreaterThan(0);

		for (const name of agentNames) {
			const section = agents[name] as Record<string, unknown>;
			expect(section).toHaveProperty("description");
			expect(section).toHaveProperty("config_file");
			expect(section).not.toHaveProperty("role");
			expect(section).not.toHaveProperty("developer_instructions");
			expect(section).not.toHaveProperty("tools");
		}
	}, 30000);

	test("produces per-agent TOML files with model and developer_instructions", async () => {
		const outputPath = join(tempDir, "per-agent-output");
		await buildPlatformPlugin(
			"base",
			projectRoot,
			outputPath,
			codexDef,
			logger,
			true,
		);

		const agentsDir = join(outputPath, "base", "agents");
		const agentsStat = await stat(agentsDir);
		expect(agentsStat.isDirectory()).toBe(true);

		const agentFiles = await readdir(agentsDir);
		expect(agentFiles.length).toBeGreaterThan(0);

		for (const file of agentFiles) {
			expect(file).toMatch(/\.toml$/);
			const content = await readFile(join(agentsDir, file), "utf-8");
			expect(content).not.toContain("model =");
			expect(content).toContain("developer_instructions = '''");
		}
	}, 30000);

	test("produces manifest.json with correct structure", async () => {
		const outputPath = join(tempDir, "manifest-output");
		const result = await buildPlatformPlugin(
			"base",
			projectRoot,
			outputPath,
			codexDef,
			logger,
			true,
		);

		const manifestPath = join(outputPath, "base", "manifest.json");
		const manifestContent = await readFile(manifestPath, "utf-8");
		const manifest = JSON.parse(manifestContent);

		expect(manifest.plugin).toBe("rp1-base");
		expect(manifest.artifacts.skills.length).toBe(result.summary.skills);
		expect(manifest.artifacts.agents.length).toBe(result.summary.agents);
		expect(manifest.installation.skillsDir).toBe("~/.codex/skills/");
		expect(manifest.installation.configFile).toBe("~/.codex/config.toml");
	}, 30000);

	test("copies codex-hooks.json with user-facing SessionStart messages only", async () => {
		const outputPath = join(tempDir, "hooks-output");
		await buildPlatformPlugin(
			"base",
			projectRoot,
			outputPath,
			codexDef,
			logger,
			true,
		);

		const hooksPath = join(outputPath, "base", "codex-hooks.json");
		const hooksContent = await readFile(hooksPath, "utf-8");
		const parsed = JSON.parse(hooksContent) as {
			hooks?: {
				SessionStart?: Array<{
					hooks?: Array<{
						command?: string;
					}>;
				}>;
			};
		};

		const sessionStartHooks = parsed.hooks?.SessionStart ?? [];
		expect(sessionStartHooks.length).toBeGreaterThan(0);

		for (const entry of sessionStartHooks) {
			for (const hook of entry.hooks ?? []) {
				const command = hook.command ?? "";
				expect(command).toContain('\\"systemMessage\\":');
				expect(command).not.toContain("hookSpecificOutput");
				expect(command).not.toContain("additionalContext");
			}
		}
	}, 30000);

	test("transforms namespace references in skill content outside code blocks", async () => {
		const outputPath = join(tempDir, "namespace-output");
		await buildPlatformPlugin(
			"dev",
			projectRoot,
			outputPath,
			codexDef,
			logger,
			true,
		);

		const skillsDir = join(outputPath, "dev", "skills");
		const skillDirs = await readdir(skillsDir);

		let foundTransformedRef = false;
		for (const dir of skillDirs) {
			const content = await readFile(join(skillsDir, dir, "SKILL.md"), "utf-8");
			if (content.includes("$rp1-")) {
				foundTransformedRef = true;

				const lines = content.split("\n");
				let inCodeBlock = false;
				for (const line of lines) {
					if (line.startsWith("```")) {
						inCodeBlock = !inCodeBlock;
						continue;
					}
					if (!inCodeBlock && /\/rp1-(base|dev|utils):[a-z]/.test(line)) {
						throw new Error(
							`Found untransformed reference outside code block: ${line}`,
						);
					}
				}
				break;
			}
		}

		expect(foundTransformedRef).toBe(true);
	}, 30000);

	test("built Codex skills do not contain raw $1 or $ARGUMENTS markers", async () => {
		const outputPath = join(tempDir, "param-check-output");
		await buildPlatformPlugin(
			"dev",
			projectRoot,
			outputPath,
			codexDef,
			logger,
			true,
		);

		const skillsDir = join(outputPath, "dev", "skills");
		const skillDirs = await readdir(skillsDir);

		for (const dir of skillDirs) {
			const content = await readFile(join(skillsDir, dir, "SKILL.md"), "utf-8");
			const lines = content.split("\n");
			let inCodeBlock = false;
			for (const line of lines) {
				if (line.startsWith("```")) {
					inCodeBlock = !inCodeBlock;
					continue;
				}
				if (!inCodeBlock) {
					expect(line).not.toMatch(/\$\d+\b/);
					expect(line).not.toMatch(/\$ARGUMENTS/);
				}
			}
		}
	}, 30000);

	test("AGENTS.md does not contain Claude-specific syntax", async () => {
		const outputPath = join(tempDir, "agentsmd-syntax-output");
		await buildPlatformPlugin(
			"base",
			projectRoot,
			outputPath,
			codexDef,
			logger,
			true,
		);

		const agentsMdPath = join(outputPath, "base", "AGENTS.md");
		const agentsMdContent = await readFile(agentsMdPath, "utf-8");

		expect(agentsMdContent).not.toContain("CLAUDE.md");
		expect(agentsMdContent).not.toContain("@path");
		expect(agentsMdContent).not.toContain("claude-code");
	}, 30000);

	test("produces AGENTS.md listing all agents", async () => {
		const outputPath = join(tempDir, "agentsmd-output");
		await buildPlatformPlugin(
			"base",
			projectRoot,
			outputPath,
			codexDef,
			logger,
			true,
		);

		const agentsMdPath = join(outputPath, "base", "AGENTS.md");
		const agentsMdContent = await readFile(agentsMdPath, "utf-8");

		expect(agentsMdContent).toContain("# rp1-base Agents");
		expect(agentsMdContent).toContain("| Agent | Role | Description |");

		const lines = agentsMdContent
			.split("\n")
			.filter(
				(l) =>
					l.startsWith("| ") &&
					!l.startsWith("| Agent") &&
					!l.startsWith("|---"),
			);
		expect(lines.length).toBeGreaterThan(0);
	}, 30000);

	test("slim config entries do not include tools, role, or inline developer_instructions", async () => {
		const outputPath = join(tempDir, "no-tools-output");
		await buildPlatformPlugin(
			"base",
			projectRoot,
			outputPath,
			codexDef,
			logger,
			true,
		);

		const tomlPath = join(outputPath, "base", "rp1-agents.toml");
		const tomlContent = await readFile(tomlPath, "utf-8");
		const parsed = parseToml(tomlContent) as Record<string, unknown>;
		const agents = parsed.agents as Record<string, unknown>;

		for (const name of Object.keys(agents)) {
			const section = agents[name] as Record<string, unknown>;
			expect(section).not.toHaveProperty("tools");
			expect(section).not.toHaveProperty("role");
			expect(section).not.toHaveProperty("developer_instructions");
		}
	}, 30000);

	test("builds dev plugin without errors", async () => {
		const outputPath = join(tempDir, "dev-output");
		const result = await buildPlatformPlugin(
			"dev",
			projectRoot,
			outputPath,
			codexDef,
			logger,
			true,
		);

		expect(result.summary.plugin).toBe("dev");
		expect(result.summary.skills).toBeGreaterThan(0);
		expect(result.summary.agents).toBeGreaterThan(0);
		expect(result.summary.errors).toHaveLength(0);
	}, 30000);

	test("builds utils plugin without errors", async () => {
		const outputPath = join(tempDir, "utils-output");
		const result = await buildPlatformPlugin(
			"utils",
			projectRoot,
			outputPath,
			codexDef,
			logger,
			true,
		);

		expect(result.summary.plugin).toBe("utils");
		expect(result.summary.skills).toBeGreaterThan(0);
		expect(result.summary.agents).toBeGreaterThan(0);
		expect(result.summary.errors).toHaveLength(0);
	}, 30000);
});
