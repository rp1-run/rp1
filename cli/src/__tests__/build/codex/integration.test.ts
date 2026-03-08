/**
 * Integration tests for the Codex build pipeline.
 * Tests end-to-end buildCodexPlugin with fixture data and output verification.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { parse as parseToml } from "smol-toml";
import { createLogger } from "../../../../shared/logger.js";
import { buildCodexPlugin } from "../../../build/command.js";
import { cleanupTempDir, createTempDir } from "../../helpers/index.js";

const projectRoot = join(import.meta.dir, "..", "..", "..", "..", "..");
const logger = createLogger({ level: "error", color: false });

describe("buildCodexPlugin integration", () => {
	let tempDir: string;

	beforeAll(async () => {
		tempDir = await createTempDir("codex-integration-");
	});

	afterAll(async () => {
		await cleanupTempDir(tempDir);
	});

	test("builds base plugin with skills and agents", async () => {
		const outputPath = join(tempDir, "base-output");
		const result = await buildCodexPlugin(
			"base",
			projectRoot,
			outputPath,
			logger,
			true,
		);

		expect(result.plugin).toBe("base");
		expect(result.skills).toBeGreaterThan(0);
		expect(result.agents).toBeGreaterThan(0);
		expect(result.errors).toHaveLength(0);
	}, 30000);

	test("produces skill directories with SKILL.md and agents/openai.yaml", async () => {
		const outputPath = join(tempDir, "structure-output");
		await buildCodexPlugin("base", projectRoot, outputPath, logger, true);

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

	test("produces rp1-agents.toml with valid TOML", async () => {
		const outputPath = join(tempDir, "toml-output");
		await buildCodexPlugin("base", projectRoot, outputPath, logger, true);

		const tomlPath = join(outputPath, "base", "rp1-agents.toml");
		const tomlContent = await readFile(tomlPath, "utf-8");
		const parsed = parseToml(tomlContent) as Record<string, unknown>;

		expect(parsed).toHaveProperty("agents");
		const agents = parsed.agents as Record<string, unknown>;
		const agentNames = Object.keys(agents);
		expect(agentNames.length).toBeGreaterThan(0);

		for (const name of agentNames) {
			const section = agents[name] as Record<string, unknown>;
			expect(section).toHaveProperty("model");
			expect(section).toHaveProperty("role");
			expect(section).toHaveProperty("developer_instructions");
		}
	}, 30000);

	test("produces manifest.json with correct structure", async () => {
		const outputPath = join(tempDir, "manifest-output");
		const result = await buildCodexPlugin(
			"base",
			projectRoot,
			outputPath,
			logger,
			true,
		);

		const manifestPath = join(outputPath, "base", "manifest.json");
		const manifestContent = await readFile(manifestPath, "utf-8");
		const manifest = JSON.parse(manifestContent);

		expect(manifest.plugin).toBe("rp1-base");
		expect(manifest.artifacts.skills.length).toBe(result.skills);
		expect(manifest.artifacts.agents.length).toBe(result.agents);
		expect(manifest.installation.skillsDir).toBe(".agents/skills/");
		expect(manifest.installation.configFile).toBe("codex.toml");
	}, 30000);

	test("transforms namespace references in skill content outside code blocks", async () => {
		const outputPath = join(tempDir, "namespace-output");
		await buildCodexPlugin("dev", projectRoot, outputPath, logger, true);

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

	test("builds dev plugin without errors", async () => {
		const outputPath = join(tempDir, "dev-output");
		const result = await buildCodexPlugin(
			"dev",
			projectRoot,
			outputPath,
			logger,
			true,
		);

		expect(result.plugin).toBe("dev");
		expect(result.skills).toBeGreaterThan(0);
		expect(result.agents).toBeGreaterThan(0);
		expect(result.errors).toHaveLength(0);
	}, 30000);

	test("builds utils plugin without errors", async () => {
		const outputPath = join(tempDir, "utils-output");
		const result = await buildCodexPlugin(
			"utils",
			projectRoot,
			outputPath,
			logger,
			true,
		);

		expect(result.plugin).toBe("utils");
		expect(result.skills).toBeGreaterThan(0);
		expect(result.agents).toBeGreaterThan(0);
		expect(result.errors).toHaveLength(0);
	}, 30000);
});
