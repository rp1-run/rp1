/**
 * Unit tests for the verification step module.
 * Tests plugin installation verification for Claude Code.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
	getClaudePluginDirs,
	verifyClaudeCodePlugins,
} from "../../../init/steps/verification.js";
import { cleanupTempDir, createTempDir } from "../../helpers/index.js";

/**
 * Helper to create installed_plugins.json with given plugins.
 */
async function createInstalledPluginsJson(
	pluginDir: string,
	plugins: Array<{
		name: string;
		version: string;
		installPath?: string;
	}>,
): Promise<void> {
	const pluginsRecord: Record<
		string,
		Array<{
			scope: string;
			installPath: string;
			version: string;
			installedAt: string;
			lastUpdated: string;
		}>
	> = {};

	for (const plugin of plugins) {
		const fullId = `${plugin.name}@rp1-run`;
		const installPath =
			plugin.installPath ??
			join(pluginDir, "cache", "rp1-run", plugin.name, plugin.version);
		pluginsRecord[fullId] = [
			{
				scope: "user",
				installPath,
				version: plugin.version,
				installedAt: new Date().toISOString(),
				lastUpdated: new Date().toISOString(),
			},
		];
	}

	await writeFile(
		join(pluginDir, "installed_plugins.json"),
		JSON.stringify({ version: 2, plugins: pluginsRecord }, null, 2),
	);
}

describe("verification step", () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await createTempDir("verification-test");
	});

	afterEach(async () => {
		await cleanupTempDir(tempDir);
	});

	describe("getClaudePluginDirs", () => {
		test("returns directories based on provided home path", () => {
			const dirs = getClaudePluginDirs("/test/home");

			// Should contain standard Claude plugin paths
			expect(dirs.some((d) => d.includes(".claude/plugins"))).toBe(true);
			expect(dirs.some((d) => d.includes("/test/home"))).toBe(true);
		});
	});

	describe("verifyClaudeCodePlugins", () => {
		test("detects plugins from installed_plugins.json", async () => {
			// Create the expected Claude Code plugin directory structure
			const pluginDir = join(tempDir, ".claude", "plugins");
			await mkdir(pluginDir, { recursive: true });

			// Create installed_plugins.json with both plugins
			await createInstalledPluginsJson(pluginDir, [
				{ name: "rp1-base", version: "0.2.3" },
				{ name: "rp1-dev", version: "0.2.3" },
			]);

			// Pass custom search directories
			const result = await verifyClaudeCodePlugins([pluginDir]);

			expect(result.verified).toBe(true);
			expect(result.plugins).toHaveLength(2);
			expect(result.issues).toHaveLength(0);

			// Check rp1-base plugin
			const basePlugin = result.plugins.find((p) => p.name === "rp1-base");
			expect(basePlugin).toBeDefined();
			expect(basePlugin?.installed).toBe(true);
			expect(basePlugin?.version).toBe("0.2.3");

			// Check rp1-dev plugin
			const devPlugin = result.plugins.find((p) => p.name === "rp1-dev");
			expect(devPlugin).toBeDefined();
			expect(devPlugin?.installed).toBe(true);
			expect(devPlugin?.version).toBe("0.2.3");
		});

		test("handles missing plugin directory gracefully", async () => {
			// Pass non-existent directory paths
			const nonExistentDir = join(tempDir, "non-existent-plugins");
			const result = await verifyClaudeCodePlugins([nonExistentDir]);

			expect(result.verified).toBe(false);
			expect(result.plugins).toHaveLength(2);
			expect(result.issues).toContain("Claude Code plugin directory not found");

			// All plugins should be marked as not installed
			for (const plugin of result.plugins) {
				expect(plugin.installed).toBe(false);
				expect(plugin.version).toBeNull();
				expect(plugin.location).toBeNull();
			}
		});

		test("extracts version from installed_plugins.json", async () => {
			// Create plugin directory with versioned plugins
			const pluginDir = join(tempDir, "plugins");
			await mkdir(pluginDir, { recursive: true });

			// Create installed_plugins.json with specific versions
			await createInstalledPluginsJson(pluginDir, [
				{ name: "rp1-base", version: "1.2.3-beta.1" },
				{ name: "rp1-dev", version: "2.0.0" },
			]);

			const result = await verifyClaudeCodePlugins([pluginDir]);

			expect(result.verified).toBe(true);

			const basePlugin = result.plugins.find((p) => p.name === "rp1-base");
			expect(basePlugin?.version).toBe("1.2.3-beta.1");

			const devPlugin = result.plugins.find((p) => p.name === "rp1-dev");
			expect(devPlugin?.version).toBe("2.0.0");
		});

		test("reports issues for partial installations", async () => {
			// Create plugin directory with only one plugin installed
			const pluginDir = join(tempDir, "plugins");
			await mkdir(pluginDir, { recursive: true });

			// Only create rp1-base, not rp1-dev
			await createInstalledPluginsJson(pluginDir, [
				{ name: "rp1-base", version: "0.2.3" },
			]);

			const result = await verifyClaudeCodePlugins([pluginDir]);

			// Verification should fail because not all plugins are installed
			expect(result.verified).toBe(false);
			expect(result.plugins).toHaveLength(2);
			expect(result.issues.length).toBeGreaterThan(0);

			// rp1-base should be installed
			const basePlugin = result.plugins.find((p) => p.name === "rp1-base");
			expect(basePlugin?.installed).toBe(true);

			// rp1-dev should not be installed
			const devPlugin = result.plugins.find((p) => p.name === "rp1-dev");
			expect(devPlugin?.installed).toBe(false);

			// Issue should mention rp1-dev
			expect(result.issues.some((i) => i.includes("rp1-dev"))).toBe(true);
		});

		test("handles missing installed_plugins.json gracefully", async () => {
			// Create plugin directory without installed_plugins.json
			const pluginDir = join(tempDir, "plugins");
			await mkdir(pluginDir, { recursive: true });

			const result = await verifyClaudeCodePlugins([pluginDir]);

			// Verification should fail
			expect(result.verified).toBe(false);

			// All plugins should be marked as not installed
			for (const plugin of result.plugins) {
				expect(plugin.installed).toBe(false);
			}

			// Issues should mention installed_plugins.json
			expect(
				result.issues.some((i) => i.includes("installed_plugins.json")),
			).toBe(true);
		});

		test("handles malformed installed_plugins.json gracefully", async () => {
			// Create plugin directory with invalid JSON
			const pluginDir = join(tempDir, "plugins");
			await mkdir(pluginDir, { recursive: true });
			await writeFile(
				join(pluginDir, "installed_plugins.json"),
				"{ invalid json }",
			);

			const result = await verifyClaudeCodePlugins([pluginDir]);

			// Verification should fail
			expect(result.verified).toBe(false);

			// All plugins should be marked as not installed
			for (const plugin of result.plugins) {
				expect(plugin.installed).toBe(false);
			}
		});

		test("handles empty plugins object in installed_plugins.json", async () => {
			// Create plugin directory with empty plugins
			const pluginDir = join(tempDir, "plugins");
			await mkdir(pluginDir, { recursive: true });
			await writeFile(
				join(pluginDir, "installed_plugins.json"),
				JSON.stringify({ version: 2, plugins: {} }),
			);

			const result = await verifyClaudeCodePlugins([pluginDir]);

			// Verification should fail - no plugins installed
			expect(result.verified).toBe(false);
			expect(result.plugins).toHaveLength(2);

			// All plugins should be marked as not installed
			for (const plugin of result.plugins) {
				expect(plugin.installed).toBe(false);
			}
		});

		test("uses first found directory from search list", async () => {
			// Create two plugin directories, only second one has plugins
			const firstDir = join(tempDir, "first-plugins");
			const secondDir = join(tempDir, "second-plugins");

			// Only create the second directory with plugins
			await mkdir(secondDir, { recursive: true });
			await createInstalledPluginsJson(secondDir, [
				{ name: "rp1-base", version: "1.0.0" },
				{ name: "rp1-dev", version: "1.0.0" },
			]);

			// Pass both directories in order - should find plugins in second
			const result = await verifyClaudeCodePlugins([firstDir, secondDir]);

			// Should find plugins in the second directory
			expect(result.verified).toBe(true);
			expect(result.plugins.every((p) => p.installed)).toBe(true);
		});

		test("returns correct structure when plugins found", async () => {
			// Create plugin directory with standard naming
			const pluginDir = join(tempDir, ".claude", "plugins");
			await mkdir(pluginDir, { recursive: true });

			// Create both plugins
			await createInstalledPluginsJson(pluginDir, [
				{ name: "rp1-base", version: "1.0.0" },
				{ name: "rp1-dev", version: "1.0.0" },
			]);

			// Pass custom directories to simulate the function's behavior
			const result = await verifyClaudeCodePlugins([pluginDir]);

			// Verify structure
			expect(result).toHaveProperty("verified");
			expect(result).toHaveProperty("plugins");
			expect(result).toHaveProperty("issues");
			expect(Array.isArray(result.plugins)).toBe(true);
			expect(Array.isArray(result.issues)).toBe(true);
			expect(result.verified).toBe(true);
		});
	});
});
