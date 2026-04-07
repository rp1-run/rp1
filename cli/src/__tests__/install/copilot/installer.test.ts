import {
	afterEach,
	beforeEach,
	describe,
	expect,
	mock,
	spyOn,
	test,
} from "bun:test";
import { readdir } from "node:fs/promises";
import { basename, join } from "node:path";

import {
	installPlugin,
	previewCopilotInstallation,
	uninstallCopilot,
	validateCopilotArtifacts,
} from "../../../install/copilot/installer.js";
import { MARKETPLACE_NAME } from "../../../install/copilot/marketplace.js";
import type { CopilotPaths } from "../../../install/copilot/models.js";
import {
	cleanupTempDir,
	createTempDir,
	expectTaskLeft,
	expectTaskRight,
	getErrorMessage,
	installFakeGhCli,
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

const createMockLogger = () => ({
	trace: () => {},
	debug: () => {},
	info: () => {},
	warn: () => {},
	error: () => {},
	start: () => {},
	success: () => {},
	fail: () => {},
	box: () => {},
});

const writeNativeCopilotPlugin = async (
	artifactsDir: string,
	pluginKey: string,
	pluginName: string,
): Promise<void> => {
	await writeFixture(
		join(artifactsDir, pluginKey),
		"plugin.json",
		JSON.stringify({ name: pluginName }),
	);
	await writeFixture(
		join(artifactsDir, pluginKey),
		"manifest.json",
		JSON.stringify({ nativePluginName: pluginName }),
	);
	await writeFixture(
		join(artifactsDir, pluginKey),
		"README.md",
		`# ${pluginName}`,
	);
	await writeFixture(
		join(artifactsDir, pluginKey),
		`skills/${pluginName}-skill/SKILL.md`,
		"skill content",
	);
	await writeFixture(
		join(artifactsDir, pluginKey),
		`agents/${pluginName}-agent.agent.md`,
		"agent content",
	);
};

describe("copilot installer", () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await createTempDir("copilot-installer-test");
	});

	afterEach(async () => {
		mock.restore();
		await cleanupTempDir(tempDir);
	});

	describe("validateCopilotArtifacts", () => {
		test("succeeds when required native plugin artifacts exist", async () => {
			const artifactsDir = join(tempDir, "artifacts");
			await writeFixture(
				join(artifactsDir, "base"),
				"plugin.json",
				JSON.stringify({ name: "rp1-base" }),
			);
			await writeFixture(
				join(artifactsDir, "base"),
				"skills/rp1-build/SKILL.md",
				"skill content",
			);
			await writeFixture(
				join(artifactsDir, "base"),
				"agents/rp1-base-task-builder.agent.md",
				"agent content",
			);
			await writeFixture(
				join(artifactsDir, "dev"),
				"plugin.json",
				JSON.stringify({ name: "rp1-dev" }),
			);
			await writeFixture(
				join(artifactsDir, "dev"),
				"skills/rp1-review/SKILL.md",
				"skill content",
			);
			await writeFixture(
				join(artifactsDir, "dev"),
				"agents/rp1-dev-task-reviewer.agent.md",
				"agent content",
			);

			const result = await expectTaskRight(
				validateCopilotArtifacts(artifactsDir),
			);
			expect(result).toHaveLength(2);
			expect(result.map((dir) => basename(dir))).toEqual(["base", "dev"]);
		});

		test("includes optional plugins when their native artifacts are present", async () => {
			const artifactsDir = join(tempDir, "artifacts");
			for (const [pluginKey, pluginName] of [
				["base", "rp1-base"],
				["dev", "rp1-dev"],
				["utils", "rp1-utils"],
			] as const) {
				await writeFixture(
					join(artifactsDir, pluginKey),
					"plugin.json",
					JSON.stringify({ name: pluginName }),
				);
				await writeFixture(
					join(artifactsDir, pluginKey),
					`skills/${pluginName}-skill/SKILL.md`,
					"skill content",
				);
				await writeFixture(
					join(artifactsDir, pluginKey),
					`agents/${pluginName}-agent.agent.md`,
					"agent content",
				);
			}

			const result = await expectTaskRight(
				validateCopilotArtifacts(artifactsDir),
			);
			expect(result).toHaveLength(3);
		});

		test("accepts native plugin.json artifacts alongside README.md and manifest.json", async () => {
			const artifactsDir = join(tempDir, "artifacts");
			await writeNativeCopilotPlugin(artifactsDir, "base", "rp1-base");
			await writeNativeCopilotPlugin(artifactsDir, "dev", "rp1-dev");

			const result = await expectTaskRight(
				validateCopilotArtifacts(artifactsDir),
			);
			expect(result.map((dir) => basename(dir))).toEqual(["base", "dev"]);
		});

		test("fails when plugin directory missing", async () => {
			const artifactsDir = join(tempDir, "artifacts");

			const error = await expectTaskLeft(
				validateCopilotArtifacts(artifactsDir),
			);
			expect(getErrorMessage(error)).toContain("not found");
			expect((error as { suggestion?: string }).suggestion).toContain(
				"rp1 build",
			);
		});

		test("fails when plugin.json missing", async () => {
			const artifactsDir = join(tempDir, "artifacts");
			await writeFixture(
				join(artifactsDir, "base"),
				"skills/rp1-build/SKILL.md",
				"skill content",
			);
			await writeFixture(
				join(artifactsDir, "base"),
				"agents/rp1-base-task-builder.agent.md",
				"agent content",
			);

			const error = await expectTaskLeft(
				validateCopilotArtifacts(artifactsDir),
			);
			expect(getErrorMessage(error)).toContain("plugin.json");
		});

		test("fails when only legacy .md agent files are present", async () => {
			const artifactsDir = join(tempDir, "artifacts");
			await writeFixture(
				join(artifactsDir, "base"),
				"plugin.json",
				JSON.stringify({ name: "rp1-base" }),
			);
			await writeFixture(
				join(artifactsDir, "base"),
				"skills/rp1-build/SKILL.md",
				"skill content",
			);
			await writeFixture(
				join(artifactsDir, "base"),
				"agents/rp1-base-task-builder.md",
				"legacy agent content",
			);

			const error = await expectTaskLeft(
				validateCopilotArtifacts(artifactsDir),
			);
			expect(getErrorMessage(error)).toContain(".agent.md");
		});
	});

	describe("command construction", () => {
		test("previews marketplace registration plus install and update commands", async () => {
			const pluginDirs = [
				join(tempDir, "artifacts", "base"),
				join(tempDir, "artifacts", "dev"),
			];
			const paths = createCopilotPaths(tempDir);
			const logSpy = spyOn(console, "log").mockImplementation(() => {});

			await expectTaskRight(previewCopilotInstallation(pluginDirs, paths));

			const output = logSpy.mock.calls.flat().join("\n");
			expect(output).toContain(
				`gh copilot -- plugin marketplace add "${paths.marketplaceDir}"`,
			);
			expect(output).toContain(
				"gh copilot -- plugin install rp1-base@rp1-local",
			);
			expect(output).toContain(
				"gh copilot -- plugin update rp1-base@rp1-local",
			);
			expect(output).toContain(
				"gh copilot -- plugin install rp1-dev@rp1-local",
			);
			expect(output).toContain("gh copilot -- plugin update rp1-dev@rp1-local");
		});

		test("falls back from install to update when Copilot reports a plugin is already installed", async () => {
			const fakeGh = await installFakeGhCli(tempDir, {
				alreadyInstalledPlugins: ["rp1-base@rp1-local"],
			});

			try {
				const result = await expectTaskRight(
					installPlugin("rp1-base", createMockLogger(), false, false),
				);

				expect(result).toBe(true);
				const commands = await fakeGh.readCommands();
				expect(commands).toEqual([
					"copilot -- plugin install rp1-base@rp1-local",
					"copilot -- plugin update rp1-base@rp1-local",
				]);
			} finally {
				fakeGh.restore();
			}
		});
	});

	describe("uninstallCopilot", () => {
		test("uninstalls native Copilot plugins, removes the marketplace, and cleans rp1 legacy files", async () => {
			const paths = createCopilotPaths(tempDir);

			await writeFixture(
				paths.marketplacePluginsDir,
				"rp1-base/plugin.json",
				JSON.stringify({ name: "rp1-base" }),
			);
			await writeFixture(
				paths.marketplacePluginsDir,
				"rp1-dev/plugin.json",
				JSON.stringify({ name: "rp1-dev" }),
			);
			await writeFixture(
				paths.marketplacePluginsDir,
				"rp1-utils/plugin.json",
				JSON.stringify({ name: "rp1-utils" }),
			);
			await writeFixture(
				paths.nativeMarketplaceDir,
				"rp1-base/plugin.json",
				JSON.stringify({ name: "rp1-base" }),
			);
			await writeFixture(
				paths.nativeMarketplaceDir,
				"rp1-dev/plugin.json",
				JSON.stringify({ name: "rp1-dev" }),
			);
			await writeFixture(
				paths.nativeMarketplaceDir,
				"rp1-utils/plugin.json",
				JSON.stringify({ name: "rp1-utils" }),
			);
			await writeFixture(paths.skillsDir, "rp1-build/SKILL.md", "build skill");
			await writeFixture(
				paths.skillsDir,
				"other-skill/SKILL.md",
				"other skill",
			);
			await writeFixture(paths.agentsDir, "rp1-base-agent.md", "agent");

			const ghCalls: string[] = [];
			const runGh = async (args: readonly string[]) => {
				ghCalls.push(args.join(" "));
				return { exitCode: 0, output: "ok" };
			};
			const result = await expectTaskRight(
				uninstallCopilot(paths, false, { runGh }),
			);

			expect(result.pluginsUninstalled).toEqual([
				"rp1-base",
				"rp1-dev",
				"rp1-utils",
			]);
			expect(result.marketplaceRemoved).toBe(true);
			expect(result.marketplaceDeleted).toBe(true);
			expect(result.skillsRemoved).toBe(1);
			expect(result.agentsRemoved).toBe(true);
			expect(result.legacyConfigRemoved).toBe(false);
			expect(ghCalls).toEqual([
				"copilot -- plugin uninstall rp1-base@rp1-local",
				"copilot -- plugin uninstall rp1-dev@rp1-local",
				"copilot -- plugin uninstall rp1-utils@rp1-local",
				"copilot -- plugin marketplace remove rp1-local",
			]);

			const remaining = await readdir(paths.skillsDir);
			expect(remaining).toContain("other-skill");
			expect(remaining).not.toContain("rp1-build");
			await expect(readdir(paths.marketplaceDir)).rejects.toThrow();
		});

		test("dry run does not modify legacy files", async () => {
			const paths = createCopilotPaths(tempDir);

			await writeFixture(
				paths.marketplacePluginsDir,
				"rp1-base/plugin.json",
				JSON.stringify({ name: "rp1-base" }),
			);
			await writeFixture(paths.skillsDir, "rp1-build/SKILL.md", "build skill");

			const ghCalls: string[] = [];
			const runGh = async (args: readonly string[]) => {
				ghCalls.push(args.join(" "));
				return { exitCode: 0, output: "ok" };
			};
			const result = await expectTaskRight(
				uninstallCopilot(paths, true, { runGh }),
			);

			expect(result.pluginsUninstalled).toHaveLength(0);
			expect(result.marketplaceRemoved).toBe(false);
			expect(result.marketplaceDeleted).toBe(false);
			expect(result.skillsRemoved).toBe(0);
			expect(result.agentsRemoved).toBe(false);
			expect(result.legacyConfigRemoved).toBe(false);
			expect(ghCalls).toHaveLength(0);

			const entries = await readdir(paths.skillsDir);
			expect(entries).toContain("rp1-build");
		});

		test("force-removes the marketplace and clears legacy rp1 content", async () => {
			const paths = createCopilotPaths(tempDir);

			await writeFixture(
				paths.marketplacePluginsDir,
				"rp1-base/plugin.json",
				JSON.stringify({ name: "rp1-base" }),
			);
			await writeFixture(
				paths.marketplacePluginsDir,
				"rp1-dev/plugin.json",
				JSON.stringify({ name: "rp1-dev" }),
			);
			await writeFixture(
				paths.nativeMarketplaceDir,
				"rp1-base/plugin.json",
				JSON.stringify({ name: "rp1-base" }),
			);
			await writeFixture(
				paths.nativeMarketplaceDir,
				"rp1-dev/plugin.json",
				JSON.stringify({ name: "rp1-dev" }),
			);
			await writeFixture(paths.skillsDir, "rp1-build/SKILL.md", "build skill");
			await writeFixture(paths.agentsDir, "rp1-base-agent.md", "agent");

			const ghCalls: string[] = [];
			const runGh = async (args: readonly string[]) => {
				const command = args.join(" ");
				ghCalls.push(command);
				if (command === "copilot -- plugin marketplace remove rp1-local") {
					return {
						exitCode: 1,
						output: "plugins from this marketplace are installed; use --force",
					};
				}
				return { exitCode: 0, output: "ok" };
			};

			const result = await expectTaskRight(
				uninstallCopilot(paths, false, { runGh }),
			);

			expect(result.pluginsUninstalled).toEqual(["rp1-base", "rp1-dev"]);
			expect(result.marketplaceRemoved).toBe(true);
			expect(result.marketplaceDeleted).toBe(true);
			expect(result.skillsRemoved).toBe(1);
			expect(result.agentsRemoved).toBe(true);
			expect(ghCalls).toEqual([
				"copilot -- plugin uninstall rp1-base@rp1-local",
				"copilot -- plugin uninstall rp1-dev@rp1-local",
				"copilot -- plugin marketplace remove rp1-local",
				"copilot -- plugin marketplace remove --force rp1-local",
			]);
			expect(await readdir(paths.skillsDir)).toEqual([]);
			expect(await readdir(paths.agentsDir)).toEqual([]);
		});
	});
});
