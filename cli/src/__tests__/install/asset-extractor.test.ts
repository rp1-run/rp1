/**
 * Unit tests for install/asset-extractor.ts - Platform-generic asset extraction.
 * Tests extraction logic: correct file placement, plugin filtering, dev-mode fallback.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import * as E from "fp-ts/lib/Either.js";
import type { BundledAssets } from "../../assets/reader.js";
import { extractPlatformAssetsFromManifest } from "../../install/asset-extractor.js";
import {
	cleanupTempDir,
	createTempDir,
	expectTaskRight,
} from "../helpers/index.js";

/**
 * The asset extractor uses hasBundledAssets() to decide the code path.
 * In test environment IS_BUNDLED is false, so extractPlatformAssets falls
 * back to the dist/ copy path. We test the embedded path indirectly via
 * the internal helper by constructing a mock manifest and calling the
 * extraction logic with prepared blob files.
 */

describe("asset-extractor", () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await createTempDir("asset-extractor-test");
	});

	afterEach(async () => {
		await cleanupTempDir(tempDir);
	});

	describe("dev-mode fallback (dist/ copy)", () => {
		test("copies plugin directories from dist to target preserving structure", async () => {
			// Set up a mock dist directory
			const distDir = join(tempDir, "dist", "claude-code");
			const baseAgentsDir = join(distDir, "base", "agents");
			const baseSkillsDir = join(distDir, "base", "skills", "my-skill");
			const basePluginMetaDir = join(distDir, "base", ".claude-plugin");
			const baseHooksDir = join(distDir, "base", "hooks");
			const devAgentsDir = join(distDir, "dev", "agents");

			await mkdir(baseAgentsDir, { recursive: true });
			await mkdir(baseSkillsDir, { recursive: true });
			await mkdir(basePluginMetaDir, { recursive: true });
			await mkdir(baseHooksDir, { recursive: true });
			await mkdir(devAgentsDir, { recursive: true });

			await writeFile(join(baseAgentsDir, "test-agent.md"), "# Test Agent");
			await writeFile(join(baseSkillsDir, "SKILL.md"), "# Test Skill");
			await writeFile(
				join(basePluginMetaDir, "plugin.json"),
				'{"name":"rp1-base","version":"0.1.0"}',
			);
			await writeFile(
				join(baseHooksDir, "hooks.json"),
				'{"hooks":{"SessionStart":[]}}',
			);
			await writeFile(join(devAgentsDir, "dev-agent.md"), "# Dev Agent");

			const targetDir = join(tempDir, "output");

			// Import dynamically to avoid module-level side effects
			const { extractPlatformAssets } = await import(
				"../../install/asset-extractor.js"
			);

			const result = await expectTaskRight(
				extractPlatformAssets({
					platform: "claude-code",
					targetDir,
					distDir,
				}),
			);

			expect(result.filesExtracted).toBe(5);
			expect(result.pluginsExtracted).toContain("rp1-base");
			expect(result.pluginsExtracted).toContain("rp1-dev");
			expect(result.targetDir).toBe(targetDir);

			// Verify file structure
			const agentContent = await readFile(
				join(targetDir, "base", "agents", "test-agent.md"),
				"utf-8",
			);
			expect(agentContent).toBe("# Test Agent");

			const skillContent = await readFile(
				join(targetDir, "base", "skills", "my-skill", "SKILL.md"),
				"utf-8",
			);
			expect(skillContent).toBe("# Test Skill");

			const pluginJson = await readFile(
				join(targetDir, "base", ".claude-plugin", "plugin.json"),
				"utf-8",
			);
			expect(pluginJson).toContain('"name":"rp1-base"');

			const hooksJson = await readFile(
				join(targetDir, "base", "hooks", "hooks.json"),
				"utf-8",
			);
			expect(hooksJson).toContain('"SessionStart"');
		});

		test("filters plugins when plugins option is provided", async () => {
			const distDir = join(tempDir, "dist", "claude-code");
			await mkdir(join(distDir, "base", "agents"), { recursive: true });
			await mkdir(join(distDir, "dev", "agents"), { recursive: true });

			await writeFile(
				join(distDir, "base", "agents", "agent.md"),
				"# Base Agent",
			);
			await writeFile(
				join(distDir, "dev", "agents", "agent.md"),
				"# Dev Agent",
			);

			const targetDir = join(tempDir, "output");

			const { extractPlatformAssets } = await import(
				"../../install/asset-extractor.js"
			);

			const result = await expectTaskRight(
				extractPlatformAssets({
					platform: "claude-code",
					targetDir,
					plugins: ["base"],
					distDir,
				}),
			);

			expect(result.pluginsExtracted).toEqual(["rp1-base"]);
			expect(result.filesExtracted).toBe(1);

			// Verify dev was not extracted
			const outputEntries = await readdir(targetDir);
			expect(outputEntries).toContain("base");
			expect(outputEntries).not.toContain("dev");
		});

		test("accepts rp1-prefixed plugin names in filter", async () => {
			const distDir = join(tempDir, "dist", "opencode");
			await mkdir(join(distDir, "base", "skills"), { recursive: true });
			await writeFile(join(distDir, "base", "skills", "SKILL.md"), "# Skill");
			await mkdir(join(distDir, "dev", "skills"), { recursive: true });
			await writeFile(
				join(distDir, "dev", "skills", "SKILL.md"),
				"# Dev Skill",
			);

			const targetDir = join(tempDir, "output");

			const { extractPlatformAssets } = await import(
				"../../install/asset-extractor.js"
			);

			const result = await expectTaskRight(
				extractPlatformAssets({
					platform: "opencode",
					targetDir,
					plugins: ["rp1-base"],
					distDir,
				}),
			);

			expect(result.pluginsExtracted).toEqual(["rp1-base"]);
		});

		test("returns error when dist directory does not exist", async () => {
			const targetDir = join(tempDir, "output");
			const emptyDir = join(tempDir, "empty");
			await mkdir(emptyDir, { recursive: true });

			const { extractPlatformAssets } = await import(
				"../../install/asset-extractor.js"
			);

			const result = await extractPlatformAssets({
				platform: "codex",
				targetDir,
				distDir: join(emptyDir, "dist", "codex"),
			})();

			expect(E.isLeft(result)).toBe(true);
			if (E.isLeft(result)) {
				expect(result.left._tag).toBe("InstallError");
			}
		});
	});

	describe("bundled extraction", () => {
		test("preserves Copilot .agent.md filenames from embedded assets", async () => {
			const targetDir = join(tempDir, "output");
			const bundledAssets: BundledAssets = {
				platforms: {
					copilot: {
						plugins: {
							base: {
								name: "rp1-base",
								commands: [
									{
										name: "rp1-base:knowledge-build",
										path: "/tmp/bun-embedded-command-12345",
										content: 'prompt = "Run rp1"',
										fileName: "rp1-base/knowledge-build.toml",
									},
								],
								agents: [
									{
										name: "rp1-base-task-builder",
										path: "/tmp/bun-embedded-blob-12345",
										content: "# bundled agent",
										fileName: "rp1-base-task-builder.agent.md",
									},
								],
								skills: [],
								stateMachines: [],
								verbatimFiles: [],
							},
							dev: {
								name: "rp1-dev",
								commands: [],
								agents: [],
								skills: [],
								stateMachines: [],
								verbatimFiles: [],
							},
						},
					},
				},
				webui: [],
				version: "0.0.0-test",
				buildTimestamp: "2026-04-07T00:00:00Z",
			};

			const result = await expectTaskRight(
				extractPlatformAssetsFromManifest(
					{
						platform: "copilot",
						targetDir,
						plugins: ["base"],
					},
					bundledAssets,
				),
			);

			expect(result.pluginsExtracted).toEqual(["rp1-base"]);

			const commandContent = await readFile(
				join(targetDir, "base", "commands", "rp1-base", "knowledge-build.toml"),
				"utf-8",
			);
			expect(commandContent).toBe('prompt = "Run rp1"');

			const agentContent = await readFile(
				join(targetDir, "base", "agents", "rp1-base-task-builder.agent.md"),
				"utf-8",
			);
			expect(agentContent).toBe("# bundled agent");
		});
	});
});
