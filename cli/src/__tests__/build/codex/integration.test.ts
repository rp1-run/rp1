/**
 * Integration tests for the Codex build pipeline.
 * Tests end-to-end buildPlatformPlugin (codex) with fixture data and output verification.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
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

	test("copies codex-hooks.json with hook-safe SessionStart commands", async () => {
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

		let sawArcadeHook = false;
		for (const entry of sessionStartHooks) {
			for (const hook of entry.hooks ?? []) {
				const command = hook.command ?? "";
				if (command.includes("arcade")) {
					sawArcadeHook = true;
					expect(command).toContain("--format hook-json");
					expect(command).not.toContain('printf "{\\"systemMessage\\"');
					continue;
				}

				expect(command).toContain('\\"systemMessage\\":');
				expect(command).not.toContain("hookSpecificOutput");
				expect(command).not.toContain("additionalContext");
			}
		}

		expect(sawArcadeHook).toBe(true);
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
