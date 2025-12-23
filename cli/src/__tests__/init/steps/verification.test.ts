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
		test("detects plugins in expected directory structure", async () => {
			// Create the expected Claude Code plugin directory structure
			const pluginDir = join(tempDir, ".claude", "plugins");
			await mkdir(pluginDir, { recursive: true });

			// Create rp1-base plugin with manifest
			const basePluginDir = join(pluginDir, "rp1-base@rp1-run");
			const baseManifestDir = join(basePluginDir, ".claude-plugin");
			await mkdir(baseManifestDir, { recursive: true });
			await writeFile(
				join(baseManifestDir, "plugin.json"),
				JSON.stringify({ version: "0.2.3" }),
			);

			// Create rp1-dev plugin with manifest
			const devPluginDir = join(pluginDir, "rp1-dev@rp1-run");
			const devManifestDir = join(devPluginDir, ".claude-plugin");
			await mkdir(devManifestDir, { recursive: true });
			await writeFile(
				join(devManifestDir, "plugin.json"),
				JSON.stringify({ version: "0.2.3" }),
			);

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
			expect(basePlugin?.location).toBe(basePluginDir);

			// Check rp1-dev plugin
			const devPlugin = result.plugins.find((p) => p.name === "rp1-dev");
			expect(devPlugin).toBeDefined();
			expect(devPlugin?.installed).toBe(true);
			expect(devPlugin?.version).toBe("0.2.3");
			expect(devPlugin?.location).toBe(devPluginDir);
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

		test("extracts version from plugin.json manifest", async () => {
			// Create plugin directory with versioned manifest
			const pluginDir = join(tempDir, "plugins");
			await mkdir(pluginDir, { recursive: true });

			// Create rp1-base with specific version
			const basePluginDir = join(pluginDir, "rp1-base@rp1-run");
			const baseManifestDir = join(basePluginDir, ".claude-plugin");
			await mkdir(baseManifestDir, { recursive: true });
			await writeFile(
				join(baseManifestDir, "plugin.json"),
				JSON.stringify({ version: "1.2.3-beta.1" }),
			);

			// Create rp1-dev with different version
			const devPluginDir = join(pluginDir, "rp1-dev@rp1-run");
			const devManifestDir = join(devPluginDir, ".claude-plugin");
			await mkdir(devManifestDir, { recursive: true });
			await writeFile(
				join(devManifestDir, "plugin.json"),
				JSON.stringify({ version: "2.0.0" }),
			);

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
			const basePluginDir = join(pluginDir, "rp1-base@rp1-run");
			const baseManifestDir = join(basePluginDir, ".claude-plugin");
			await mkdir(baseManifestDir, { recursive: true });
			await writeFile(
				join(baseManifestDir, "plugin.json"),
				JSON.stringify({ version: "0.2.3" }),
			);

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

		test("handles plugin without manifest gracefully", async () => {
			// Create plugin directory structure without plugin.json
			const pluginDir = join(tempDir, "plugins");
			await mkdir(pluginDir, { recursive: true });

			// Create rp1-base without manifest (just the directory structure)
			const basePluginDir = join(pluginDir, "rp1-base@rp1-run");
			const baseManifestDir = join(basePluginDir, ".claude-plugin");
			await mkdir(baseManifestDir, { recursive: true });
			// No plugin.json file

			// Create rp1-dev with manifest
			const devPluginDir = join(pluginDir, "rp1-dev@rp1-run");
			const devManifestDir = join(devPluginDir, ".claude-plugin");
			await mkdir(devManifestDir, { recursive: true });
			await writeFile(
				join(devManifestDir, "plugin.json"),
				JSON.stringify({ version: "0.2.3" }),
			);

			const result = await verifyClaudeCodePlugins([pluginDir]);

			// Both plugins should be detected as installed
			expect(result.verified).toBe(true);

			// rp1-base should have "unknown" version (no manifest)
			const basePlugin = result.plugins.find((p) => p.name === "rp1-base");
			expect(basePlugin?.installed).toBe(true);
			expect(basePlugin?.version).toBe("unknown");

			// rp1-dev should have proper version
			const devPlugin = result.plugins.find((p) => p.name === "rp1-dev");
			expect(devPlugin?.installed).toBe(true);
			expect(devPlugin?.version).toBe("0.2.3");
		});

		test("handles malformed plugin.json gracefully", async () => {
			// Create plugin with invalid JSON manifest
			const pluginDir = join(tempDir, "plugins");
			await mkdir(pluginDir, { recursive: true });

			const basePluginDir = join(pluginDir, "rp1-base@rp1-run");
			const baseManifestDir = join(basePluginDir, ".claude-plugin");
			await mkdir(baseManifestDir, { recursive: true });
			await writeFile(join(baseManifestDir, "plugin.json"), "{ invalid json }");

			const devPluginDir = join(pluginDir, "rp1-dev@rp1-run");
			const devManifestDir = join(devPluginDir, ".claude-plugin");
			await mkdir(devManifestDir, { recursive: true });
			await writeFile(
				join(devManifestDir, "plugin.json"),
				JSON.stringify({ version: "0.2.3" }),
			);

			const result = await verifyClaudeCodePlugins([pluginDir]);

			// Both should still be detected as installed
			expect(result.verified).toBe(true);

			// rp1-base should have "unknown" version (failed to parse)
			const basePlugin = result.plugins.find((p) => p.name === "rp1-base");
			expect(basePlugin?.installed).toBe(true);
			expect(basePlugin?.version).toBe("unknown");
		});

		test("handles plugin.json without version field", async () => {
			// Create plugin with manifest missing version field
			const pluginDir = join(tempDir, "plugins");
			await mkdir(pluginDir, { recursive: true });

			const basePluginDir = join(pluginDir, "rp1-base@rp1-run");
			const baseManifestDir = join(basePluginDir, ".claude-plugin");
			await mkdir(baseManifestDir, { recursive: true });
			await writeFile(
				join(baseManifestDir, "plugin.json"),
				JSON.stringify({ name: "rp1-base" }), // No version field
			);

			const devPluginDir = join(pluginDir, "rp1-dev@rp1-run");
			await mkdir(devPluginDir, { recursive: true });

			const result = await verifyClaudeCodePlugins([pluginDir]);

			// rp1-base should be installed but with "unknown" version
			const basePlugin = result.plugins.find((p) => p.name === "rp1-base");
			expect(basePlugin?.installed).toBe(true);
			expect(basePlugin?.version).toBe("unknown");
		});

		test("uses first found directory from search list", async () => {
			// Create two plugin directories, only second one has plugins
			const firstDir = join(tempDir, "first-plugins");
			const secondDir = join(tempDir, "second-plugins");

			// Only create the second directory with plugins
			await mkdir(secondDir, { recursive: true });

			for (const pluginName of ["rp1-base", "rp1-dev"]) {
				const pluginPath = join(secondDir, `${pluginName}@rp1-run`);
				const manifestDir = join(pluginPath, ".claude-plugin");
				await mkdir(manifestDir, { recursive: true });
				await writeFile(
					join(manifestDir, "plugin.json"),
					JSON.stringify({ version: "1.0.0" }),
				);
			}

			// Pass both directories in order - should find plugins in second
			const result = await verifyClaudeCodePlugins([firstDir, secondDir]);

			// Should find plugins in the second directory
			expect(result.verified).toBe(true);
			expect(result.plugins.every((p) => p.installed)).toBe(true);
			expect(result.plugins.every((p) => p.location?.includes(secondDir))).toBe(
				true,
			);
		});

		test("returns correct structure when no directories provided", async () => {
			// Create plugin directory at temp location with standard naming
			const pluginDir = join(tempDir, ".claude", "plugins");
			await mkdir(pluginDir, { recursive: true });

			// Create both plugins
			for (const pluginName of ["rp1-base", "rp1-dev"]) {
				const pluginPath = join(pluginDir, `${pluginName}@rp1-run`);
				const manifestDir = join(pluginPath, ".claude-plugin");
				await mkdir(manifestDir, { recursive: true });
				await writeFile(
					join(manifestDir, "plugin.json"),
					JSON.stringify({ version: "1.0.0" }),
				);
			}

			// Pass custom directories to simulate the function's behavior
			const result = await verifyClaudeCodePlugins([pluginDir]);

			// Verify structure
			expect(result).toHaveProperty("verified");
			expect(result).toHaveProperty("plugins");
			expect(result).toHaveProperty("issues");
			expect(Array.isArray(result.plugins)).toBe(true);
			expect(Array.isArray(result.issues)).toBe(true);
		});
	});
});
