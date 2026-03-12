/**
 * Integration tests for cross-plugin dependencies.
 * Tests rp1-dev's dependency on rp1-base during installation.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import * as E from "fp-ts/lib/Either.js";

import { copyArtifacts } from "../../install/installer.js";
import { discoverPlugins } from "../../install/manifest.js";
import {
	cleanupTempDir,
	createTempDir,
	writeFixture,
} from "../helpers/index.js";

describe("integration: dependencies", () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await createTempDir("deps-");
	});

	afterEach(async () => {
		await cleanupTempDir(tempDir);
	});

	/**
	 * Helper to create a mock base plugin structure.
	 */
	async function setupMockBasePlugin(rootDir: string): Promise<string> {
		const baseDir = join(rootDir, "rp1-base");

		await writeFixture(
			baseDir,
			"manifest.json",
			JSON.stringify({
				plugin: "rp1-base",
				version: "1.0.0",
				generated_at: new Date().toISOString(),
				opencode_version_tested: "0.9.0",
				artifacts: {
					commands: [],
					agents: ["kb-spatial-analyzer"],
					skills: ["mermaid"],
				},
			}),
		);

		await writeFixture(
			baseDir,
			"agents/rp1-base-kb-spatial-analyzer.md",
			"---\ndescription: Spatial analyzer\nmode: subagent\ntools:\n  bash: true\n  write: false\n  edit: false\n---\nAgent content",
		);
		await writeFixture(
			baseDir,
			"skills/mermaid/SKILL.md",
			"---\nname: mermaid\ndescription: Mermaid diagram validation and generation\n---\nMermaid skill content",
		);

		return baseDir;
	}

	/**
	 * Helper to create a mock dev plugin structure.
	 */
	async function setupMockDevPlugin(rootDir: string): Promise<string> {
		const devDir = join(rootDir, "rp1-dev");

		await writeFixture(
			devDir,
			"manifest.json",
			JSON.stringify({
				plugin: "rp1-dev",
				version: "1.0.0",
				generated_at: new Date().toISOString(),
				opencode_version_tested: "0.9.0",
				artifacts: {
					commands: [],
					agents: ["feature-builder"],
					skills: [],
				},
			}),
		);

		await writeFixture(
			devDir,
			"agents/rp1-dev-feature-builder.md",
			"---\ndescription: Feature builder agent\nmode: subagent\ntools:\n  bash: true\n  write: true\n  edit: true\n---\nRun /rp1-base/knowledge-load first\nAgent content",
		);

		return devDir;
	}

	test(
		"installing plugin with base dependency works when base is installed first",
		async () => {
			const artifactsDir = join(tempDir, "artifacts");
			const targetDir = join(tempDir, "target");

			const baseDir = await setupMockBasePlugin(artifactsDir);
			const devDir = await setupMockDevPlugin(artifactsDir);

			const baseResult = await copyArtifacts(baseDir, targetDir)();
			expect(E.isRight(baseResult)).toBe(true);
			if (E.isRight(baseResult)) {
				expect(baseResult.right).toBeGreaterThan(0);
			}

			const baseAgentStat = await stat(
				join(targetDir, "agents/rp1-base-kb-spatial-analyzer.md"),
			);
			expect(baseAgentStat.isFile()).toBe(true);

			const devResult = await copyArtifacts(devDir, targetDir)();
			expect(E.isRight(devResult)).toBe(true);
			if (E.isRight(devResult)) {
				expect(devResult.right).toBeGreaterThan(0);
			}

			const devAgentStat = await stat(
				join(targetDir, "agents/rp1-dev-feature-builder.md"),
			);
			expect(devAgentStat.isFile()).toBe(true);

			const baseAgentExists = await stat(
				join(targetDir, "agents/rp1-base-kb-spatial-analyzer.md"),
			)
				.then(() => true)
				.catch(() => false);
			const devAgentExists = await stat(
				join(targetDir, "agents/rp1-dev-feature-builder.md"),
			)
				.then(() => true)
				.catch(() => false);

			expect(baseAgentExists).toBe(true);
			expect(devAgentExists).toBe(true);
		},
		{ timeout: 60000 },
	);

	test(
		"cross-plugin references resolve correctly after installation",
		async () => {
			const artifactsDir = join(tempDir, "artifacts");
			const targetDir = join(tempDir, "target");

			const baseDir = await setupMockBasePlugin(artifactsDir);
			const devDir = await setupMockDevPlugin(artifactsDir);

			await copyArtifacts(baseDir, targetDir)();
			await copyArtifacts(devDir, targetDir)();

			const featureBuilderContent = await readFile(
				join(targetDir, "agents/rp1-dev-feature-builder.md"),
				"utf-8",
			);

			expect(featureBuilderContent).toContain("rp1-base/knowledge-load");

			const baseAgentExists = await stat(
				join(targetDir, "agents/rp1-base-kb-spatial-analyzer.md"),
			)
				.then(() => true)
				.catch(() => false);

			expect(baseAgentExists).toBe(true);
		},
		{ timeout: 60000 },
	);

	test(
		"plugin discovery finds all plugins in artifacts directory",
		async () => {
			const artifactsDir = join(tempDir, "artifacts");

			await setupMockBasePlugin(artifactsDir);
			await setupMockDevPlugin(artifactsDir);

			const discoverResult = await discoverPlugins(artifactsDir)();

			expect(E.isRight(discoverResult)).toBe(true);
			if (E.isRight(discoverResult)) {
				const plugins = discoverResult.right;
				expect(plugins.length).toBe(2);

				const pluginNames = plugins.map((p) => p.plugin);
				expect(pluginNames).toContain("rp1-base");
				expect(pluginNames).toContain("rp1-dev");

				// Verify artifact counts
				const basePlugin = plugins.find((p) => p.plugin === "rp1-base");
				expect(basePlugin?.commands.length).toBe(0);
				expect(basePlugin?.skills.length).toBe(1);

				const devPlugin = plugins.find((p) => p.plugin === "rp1-dev");
				expect(devPlugin?.commands.length).toBe(0);
				expect(devPlugin?.skills.length).toBe(0);
			}
		},
		{ timeout: 60000 },
	);
});
