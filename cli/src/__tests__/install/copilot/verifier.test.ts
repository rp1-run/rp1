import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { MARKETPLACE_NAME } from "../../../install/copilot/marketplace.js";
import type { CopilotPaths } from "../../../install/copilot/models.js";
import {
	summarizeCopilotVerification,
	verifyCopilotInstallation,
} from "../../../install/copilot/verifier.js";
import {
	cleanupTempDir,
	createTempDir,
	writeFixture,
} from "../../helpers/index.js";

const createCopilotPaths = (rootDir: string): CopilotPaths => {
	const marketplaceDir = join(rootDir, ".rp1", "copilot", "marketplace");
	const legacyConfigDir = join(rootDir, ".config", "github-copilot");
	const legacySkillsDir = join(legacyConfigDir, "skills");
	const legacyAgentsDir = join(legacyConfigDir, "agents");
	const nativeInstalledPluginsDir = join(
		rootDir,
		".copilot",
		"installed-plugins",
	);

	return {
		marketplaceDir,
		marketplacePluginsDir: join(marketplaceDir, "plugins"),
		marketplaceMetadataPath: join(marketplaceDir, "marketplace.json"),
		nativeInstalledPluginsDir,
		nativeMarketplaceDir: join(nativeInstalledPluginsDir, MARKETPLACE_NAME),
		legacyConfigDir,
		legacySkillsDir,
		legacyAgentsDir,
		configDir: legacyConfigDir,
		skillsDir: legacySkillsDir,
		agentsDir: legacyAgentsDir,
	};
};

const writeMarketplacePluginArtifacts = async (
	paths: CopilotPaths,
	pluginName: string,
): Promise<void> => {
	await writeFixture(
		paths.marketplacePluginsDir,
		`${pluginName}/plugin.json`,
		JSON.stringify({ name: pluginName }),
	);
	await writeFixture(
		paths.marketplacePluginsDir,
		`${pluginName}/skills/${pluginName}-skill/SKILL.md`,
		"skill content",
	);
	await writeFixture(
		paths.marketplacePluginsDir,
		`${pluginName}/agents/${pluginName}-agent.agent.md`,
		"agent content",
	);
};

const writeNativeInstalledMarker = async (
	paths: CopilotPaths,
	pluginName: string,
): Promise<void> => {
	await writeFixture(
		paths.nativeMarketplaceDir,
		`${pluginName}/.installed`,
		"installed marker",
	);
};

const createRunGh =
	(
		pluginsOutput: string,
	): ((
		args: readonly string[],
	) => Promise<{ exitCode: number; output: string }>) =>
	async (args) => {
		if (args.join(" ") === "--version") {
			return {
				exitCode: 0,
				output: "gh version 2.74.1 (2026-04-01)",
			};
		}

		if (args.join(" ") === "copilot -- plugin list") {
			return {
				exitCode: 0,
				output: pluginsOutput,
			};
		}

		throw new Error(`Unexpected gh args: ${args.join(" ")}`);
	};

describe("copilot verifier", () => {
	let tempDir: string;
	let paths: CopilotPaths;

	beforeEach(async () => {
		tempDir = await createTempDir("copilot-verifier-test");
		paths = createCopilotPaths(tempDir);
	});

	afterEach(async () => {
		await cleanupTempDir(tempDir);
	});

	test("classifies healthy_native when native installed directories act as presence signals", async () => {
		await writeMarketplacePluginArtifacts(paths, "rp1-base");
		await writeMarketplacePluginArtifacts(paths, "rp1-dev");
		await writeNativeInstalledMarker(paths, "rp1-base");
		await writeNativeInstalledMarker(paths, "rp1-dev");

		const result = await verifyCopilotInstallation({
			getGhBinaryPath: () => "/usr/bin/gh",
			paths,
			readPlatformVersion: async () => "0.6.5",
			runGh: createRunGh(
				[
					"Installed plugins:",
					"  • rp1-base@rp1-local (v0.6.5)",
					"  • rp1-dev@rp1-local (v0.6.5)",
				].join("\n"),
			),
		});

		expect(result.state).toBe("healthy_native");
		expect(result.verified).toBe(true);
		expect(result.issues).toHaveLength(0);
		expect(result.plugins.every((plugin) => plugin.installed)).toBe(true);
	});

	test("classifies healthy_native when gh copilot omits plugin versions", async () => {
		await writeMarketplacePluginArtifacts(paths, "rp1-base");
		await writeMarketplacePluginArtifacts(paths, "rp1-dev");
		await writeNativeInstalledMarker(paths, "rp1-base");
		await writeNativeInstalledMarker(paths, "rp1-dev");

		const result = await verifyCopilotInstallation({
			getGhBinaryPath: () => "/usr/bin/gh",
			paths,
			readPlatformVersion: async () => "0.6.5",
			runGh: createRunGh(
				[
					"Installed plugins:",
					"  • rp1-base@rp1-local",
					"  • rp1-dev@rp1-local",
				].join("\n"),
			),
		});

		expect(result.state).toBe("healthy_native");
		expect(result.verified).toBe(true);
		expect(result.plugins.every((plugin) => plugin.installed)).toBe(true);
		expect(result.plugins.every((plugin) => plugin.version === null)).toBe(
			true,
		);
	});

	test("classifies partial_native when a listed plugin is missing its native installed directory", async () => {
		await writeMarketplacePluginArtifacts(paths, "rp1-base");
		await writeNativeInstalledMarker(paths, "rp1-base");
		await writeFixture(
			paths.marketplacePluginsDir,
			"rp1-dev/plugin.json",
			JSON.stringify({ name: "rp1-dev" }),
		);
		await writeFixture(
			paths.marketplacePluginsDir,
			"rp1-dev/skills/rp1-dev-skill/SKILL.md",
			"skill content",
		);
		await writeFixture(
			paths.marketplacePluginsDir,
			"rp1-dev/agents/rp1-dev-agent.agent.md",
			"agent content",
		);

		const result = await verifyCopilotInstallation({
			getGhBinaryPath: () => "/usr/bin/gh",
			paths,
			readPlatformVersion: async () => "0.6.5",
			runGh: createRunGh(
				[
					"Installed plugins:",
					"  • rp1-base@rp1-local (v0.6.5)",
					"  • rp1-dev@rp1-local (v0.6.5)",
				].join("\n"),
			),
		});

		expect(result.state).toBe("partial_native");
		expect(result.verified).toBe(false);
		const devPlugin = result.plugins.find(
			(plugin) => plugin.name === "rp1-dev",
		);
		expect(devPlugin).toBeDefined();
		expect(devPlugin?.installed).toBe(false);
		expect(
			devPlugin?.issues.some((issue) =>
				issue.includes(
					`Native installed plugin directory missing: ${join(paths.nativeMarketplaceDir, "rp1-dev")}`,
				),
			),
		).toBe(true);
		expect(
			devPlugin?.issues.some((issue) =>
				issue.includes(
					`Missing plugin.json in ${join(paths.nativeMarketplaceDir, "rp1-dev")}`,
				),
			),
		).toBe(false);
	});

	test("classifies partial_native and reports staged marketplace artifact and version issues", async () => {
		await writeMarketplacePluginArtifacts(paths, "rp1-base");
		await writeNativeInstalledMarker(paths, "rp1-base");
		await writeFixture(
			paths.marketplacePluginsDir,
			"rp1-dev/skills/rp1-dev-skill/SKILL.md",
			"skill content",
		);
		await writeFixture(
			paths.nativeMarketplaceDir,
			"rp1-dev/.installed",
			"installed marker",
		);

		const result = await verifyCopilotInstallation({
			getGhBinaryPath: () => "/usr/bin/gh",
			paths,
			readPlatformVersion: async () => "0.6.5",
			runGh: createRunGh(
				[
					"Installed plugins:",
					"  • rp1-base@rp1-local (v0.6.5)",
					"  • rp1-dev@rp1-local (v0.6.4)",
				].join("\n"),
			),
		});

		expect(result.state).toBe("partial_native");
		expect(result.verified).toBe(false);
		const devPlugin = result.plugins.find(
			(plugin) => plugin.name === "rp1-dev",
		);
		expect(devPlugin).toBeDefined();
		expect(
			devPlugin?.issues.some((issue) =>
				issue.includes(
					`Missing plugin.json in ${join(paths.marketplacePluginsDir, "rp1-dev")}`,
				),
			),
		).toBe(true);
		expect(
			devPlugin?.issues.some((issue) =>
				issue.includes(
					`Missing agents/*.agent.md in ${join(paths.marketplacePluginsDir, "rp1-dev")}`,
				),
			),
		).toBe(true);
		expect(
			devPlugin?.issues.some((issue) => issue.includes("Version mismatch")),
		).toBe(true);
		expect(
			result.remediation.some((step) => step.includes("just build-copilot")),
		).toBe(true);
	});

	test("classifies legacy_only when only legacy file-drop content exists", async () => {
		await writeFixture(paths.legacySkillsDir, "rp1-build/SKILL.md", "skill");
		await writeFixture(paths.legacyAgentsDir, "rp1-base-agent.md", "agent");

		const result = await verifyCopilotInstallation({
			getGhBinaryPath: () => null,
			paths,
			readPlatformVersion: async () => null,
			runGh: createRunGh("Installed plugins:\n"),
		});

		expect(result.state).toBe("legacy_only");
		expect(result.legacyFootprints).toHaveLength(2);
		expect(
			result.issues.some((issue) => issue.includes("legacy Copilot file-drop")),
		).toBe(true);
	});

	test("classifies mixed_native_and_legacy when native install coexists with legacy files", async () => {
		await writeMarketplacePluginArtifacts(paths, "rp1-base");
		await writeMarketplacePluginArtifacts(paths, "rp1-dev");
		await writeNativeInstalledMarker(paths, "rp1-base");
		await writeNativeInstalledMarker(paths, "rp1-dev");
		await writeFixture(paths.legacySkillsDir, "rp1-build/SKILL.md", "skill");

		const result = await verifyCopilotInstallation({
			getGhBinaryPath: () => "/usr/bin/gh",
			paths,
			readPlatformVersion: async () => "0.6.5",
			runGh: createRunGh(
				[
					"Installed plugins:",
					"  • rp1-base@rp1-local (v0.6.5)",
					"  • rp1-dev@rp1-local (v0.6.5)",
				].join("\n"),
			),
		});

		expect(result.state).toBe("mixed_native_and_legacy");
		expect(result.verified).toBe(true);
		expect(result.legacyFootprints).toHaveLength(1);
		expect(
			result.remediation.some((step) =>
				step.includes("Remove the legacy rp1 files"),
			),
		).toBe(true);
	});

	test("classifies not_installed when no native or legacy rp1 Copilot footprint exists", async () => {
		const result = await verifyCopilotInstallation({
			getGhBinaryPath: () => "/usr/bin/gh",
			paths,
			readPlatformVersion: async () => null,
			runGh: createRunGh(
				"Installed plugins:\n  • spark@copilot-plugins (v1.0.0)",
			),
		});

		expect(result.state).toBe("not_installed");
		expect(result.verified).toBe(false);
		expect(
			result.remediation.some((step) => step.includes("rp1 install copilot")),
		).toBe(true);
	});

	test("summarizes the reusable verifier into the generic install verification shape", async () => {
		await writeMarketplacePluginArtifacts(paths, "rp1-base");
		await writeNativeInstalledMarker(paths, "rp1-base");
		await writeFixture(paths.legacyAgentsDir, "rp1-base-agent.md", "agent");

		const result = await verifyCopilotInstallation({
			getGhBinaryPath: () => "/usr/bin/gh",
			paths,
			readPlatformVersion: async () => "0.6.5",
			runGh: createRunGh("Installed plugins:\n  • rp1-base@rp1-local (v0.6.5)"),
		});
		const summary = summarizeCopilotVerification(result);

		expect(summary.verified).toBe(false);
		expect(
			summary.plugins.find((plugin) => plugin.name === "rp1-base"),
		).toEqual(
			expect.objectContaining({
				location: join(paths.nativeMarketplaceDir, "rp1-base"),
				version: "0.6.5",
			}),
		);
		expect(
			summary.issues.some((issue) => issue.includes("legacy Copilot content")),
		).toBe(true);
	});
});
