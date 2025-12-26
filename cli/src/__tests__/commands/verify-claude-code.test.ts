/**
 * Unit tests for the verify:claude-code command.
 * Tests plugin verification display, exit codes, and remediation steps.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { VerificationResult } from "../../init/models.js";
import { verifyClaudeCodePlugins } from "../../init/steps/verification.js";
import { cleanupTempDir, createTempDir } from "../helpers/index.js";

describe("verify:claude-code command", () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await createTempDir("verify-claude-code-test");
	});

	afterEach(async () => {
		await cleanupTempDir(tempDir);
	});

	/**
	 * Helper to create plugin directory structure with both plugins installed.
	 * Creates installed_plugins.json which is the format Claude Code uses.
	 */
	async function createInstalledPlugins(
		pluginDir: string,
		versions: { base?: string; dev?: string } = {},
	): Promise<void> {
		await mkdir(pluginDir, { recursive: true });

		const baseVersion = versions.base ?? "0.2.5";
		const devVersion = versions.dev ?? "0.2.5";
		const now = new Date().toISOString();

		// Create installed_plugins.json
		const installedPlugins = {
			version: 1,
			plugins: {
				"rp1-base@rp1-run": [
					{
						scope: "user",
						installPath: join(pluginDir, "rp1-base@rp1-run"),
						version: baseVersion,
						installedAt: now,
						lastUpdated: now,
					},
				],
				"rp1-dev@rp1-run": [
					{
						scope: "user",
						installPath: join(pluginDir, "rp1-dev@rp1-run"),
						version: devVersion,
						installedAt: now,
						lastUpdated: now,
					},
				],
			},
		};

		await writeFile(
			join(pluginDir, "installed_plugins.json"),
			JSON.stringify(installedPlugins, null, 2),
		);
	}

	/**
	 * Helper to create only rp1-base plugin (partial installation).
	 * Creates installed_plugins.json with only rp1-base.
	 */
	async function createPartialInstallation(
		pluginDir: string,
		baseVersion = "0.2.5",
	): Promise<void> {
		await mkdir(pluginDir, { recursive: true });

		const now = new Date().toISOString();

		// Create installed_plugins.json with only rp1-base
		const installedPlugins = {
			version: 1,
			plugins: {
				"rp1-base@rp1-run": [
					{
						scope: "user",
						installPath: join(pluginDir, "rp1-base@rp1-run"),
						version: baseVersion,
						installedAt: now,
						lastUpdated: now,
					},
				],
			},
		};

		await writeFile(
			join(pluginDir, "installed_plugins.json"),
			JSON.stringify(installedPlugins, null, 2),
		);
	}

	describe("verifyClaudeCodePlugins integration", () => {
		test("returns verified=true and exit code 0 when all plugins installed", async () => {
			const pluginDir = join(tempDir, ".claude", "plugins");
			await createInstalledPlugins(pluginDir);

			const result = await verifyClaudeCodePlugins([pluginDir]);

			expect(result.verified).toBe(true);
			expect(result.plugins).toHaveLength(2);
			expect(result.issues).toHaveLength(0);

			// All plugins should be installed
			const allInstalled = result.plugins.every((p) => p.installed);
			expect(allInstalled).toBe(true);
		});

		test("returns verified=false when plugins missing", async () => {
			const nonExistentDir = join(tempDir, "non-existent-plugins");

			const result = await verifyClaudeCodePlugins([nonExistentDir]);

			expect(result.verified).toBe(false);
			expect(result.plugins).toHaveLength(2);
			expect(result.issues.length).toBeGreaterThan(0);

			// All plugins should be not installed
			const anyInstalled = result.plugins.some((p) => p.installed);
			expect(anyInstalled).toBe(false);
		});

		test("displays version information for installed plugins", async () => {
			const pluginDir = join(tempDir, ".claude", "plugins");
			await createInstalledPlugins(pluginDir, {
				base: "1.2.3",
				dev: "2.0.0-beta.1",
			});

			const result = await verifyClaudeCodePlugins([pluginDir]);

			expect(result.verified).toBe(true);

			const basePlugin = result.plugins.find((p) => p.name === "rp1-base");
			expect(basePlugin?.version).toBe("1.2.3");

			const devPlugin = result.plugins.find((p) => p.name === "rp1-dev");
			expect(devPlugin?.version).toBe("2.0.0-beta.1");
		});

		test("returns issues when plugins are missing", async () => {
			const pluginDir = join(tempDir, "plugins");
			await createPartialInstallation(pluginDir);

			const result = await verifyClaudeCodePlugins([pluginDir]);

			expect(result.verified).toBe(false);
			expect(result.issues.some((i) => i.includes("rp1-dev"))).toBe(true);
		});
	});

	describe("command output format", () => {
		test("displays table header with correct columns", async () => {
			const pluginDir = join(tempDir, ".claude", "plugins");
			await createInstalledPlugins(pluginDir);

			const result = await verifyClaudeCodePlugins([pluginDir]);

			// Simulate the command output format
			const output: string[] = [];
			output.push("+-----------+--------------+--------+");
			output.push("| Plugin    | Version      | Status |");
			output.push("+-----------+--------------+--------+");

			for (const plugin of result.plugins) {
				const name = plugin.name.padEnd(9);
				const version = (plugin.version ?? "not found").padEnd(12);
				const status = plugin.installed ? "  OK  " : " MISS ";
				output.push(`| ${name} | ${version} | ${status} |`);
			}

			output.push("+-----------+--------------+--------+");

			expect(output[1]).toContain("Plugin");
			expect(output[1]).toContain("Version");
			expect(output[1]).toContain("Status");
		});

		test("displays OK status for installed plugins", async () => {
			const pluginDir = join(tempDir, ".claude", "plugins");
			await createInstalledPlugins(pluginDir);

			const result = await verifyClaudeCodePlugins([pluginDir]);

			for (const plugin of result.plugins) {
				expect(plugin.installed).toBe(true);
			}
		});

		test("displays MISS status for missing plugins", async () => {
			const nonExistentDir = join(tempDir, "non-existent");

			const result = await verifyClaudeCodePlugins([nonExistentDir]);

			for (const plugin of result.plugins) {
				expect(plugin.installed).toBe(false);
			}
		});

		test("displays version as not found for missing plugins", async () => {
			const nonExistentDir = join(tempDir, "non-existent");

			const result = await verifyClaudeCodePlugins([nonExistentDir]);

			for (const plugin of result.plugins) {
				expect(plugin.version).toBeNull();
			}
		});
	});

	describe("exit code behavior", () => {
		test("should return verified=true (exit 0 condition) when all plugins installed", async () => {
			const pluginDir = join(tempDir, ".claude", "plugins");
			await createInstalledPlugins(pluginDir);

			const result = await verifyClaudeCodePlugins([pluginDir]);

			// Command exits with 0 when result.verified is true
			expect(result.verified).toBe(true);
		});

		test("should return verified=false (exit 1 condition) when plugins missing", async () => {
			const nonExistentDir = join(tempDir, "non-existent");

			const result = await verifyClaudeCodePlugins([nonExistentDir]);

			// Command exits with 1 when result.verified is false
			expect(result.verified).toBe(false);
		});

		test("should return verified=false (exit 1 condition) for partial installation", async () => {
			const pluginDir = join(tempDir, "plugins");
			await createPartialInstallation(pluginDir);

			const result = await verifyClaudeCodePlugins([pluginDir]);

			// Command exits with 1 when not all plugins are installed
			expect(result.verified).toBe(false);
		});
	});

	describe("remediation steps", () => {
		test("issues array is empty when all plugins installed", async () => {
			const pluginDir = join(tempDir, ".claude", "plugins");
			await createInstalledPlugins(pluginDir);

			const result = await verifyClaudeCodePlugins([pluginDir]);

			expect(result.issues).toHaveLength(0);
		});

		test("issues array contains remediation info when plugins missing", async () => {
			const nonExistentDir = join(tempDir, "non-existent");

			const result = await verifyClaudeCodePlugins([nonExistentDir]);

			expect(result.issues.length).toBeGreaterThan(0);
			// Should mention Claude Code plugin directory not found
			expect(
				result.issues.some((i) =>
					i.includes("Claude Code plugin directory not found"),
				),
			).toBe(true);
		});

		test("issues mention specific missing plugin for partial install", async () => {
			const pluginDir = join(tempDir, "plugins");
			await createPartialInstallation(pluginDir);

			const result = await verifyClaudeCodePlugins([pluginDir]);

			expect(result.issues.length).toBeGreaterThan(0);
			// Should mention rp1-dev not found
			expect(result.issues.some((i) => i.includes("rp1-dev"))).toBe(true);
		});
	});

	describe("command behavior simulation", () => {
		/**
		 * Simulates the command action logic without actually running commander.
		 * This tests the core business logic that determines output and exit code.
		 */
		function simulateCommandAction(result: VerificationResult): {
			exitCode: number;
			showsRemediation: boolean;
			showsAllInstalled: boolean;
		} {
			const showsRemediation = !result.verified;
			const showsAllInstalled = result.verified;
			const exitCodeValue = result.verified ? 0 : 1;

			return {
				exitCode: exitCodeValue,
				showsRemediation,
				showsAllInstalled,
			};
		}

		test("simulated command returns exit code 0 when verified", async () => {
			const pluginDir = join(tempDir, ".claude", "plugins");
			await createInstalledPlugins(pluginDir);

			const result = await verifyClaudeCodePlugins([pluginDir]);
			const simulated = simulateCommandAction(result);

			expect(simulated.exitCode).toBe(0);
			expect(simulated.showsRemediation).toBe(false);
			expect(simulated.showsAllInstalled).toBe(true);
		});

		test("simulated command returns exit code 1 when not verified", async () => {
			const nonExistentDir = join(tempDir, "non-existent");

			const result = await verifyClaudeCodePlugins([nonExistentDir]);
			const simulated = simulateCommandAction(result);

			expect(simulated.exitCode).toBe(1);
			expect(simulated.showsRemediation).toBe(true);
			expect(simulated.showsAllInstalled).toBe(false);
		});

		test("simulated command shows remediation for partial install", async () => {
			const pluginDir = join(tempDir, "plugins");
			await createPartialInstallation(pluginDir);

			const result = await verifyClaudeCodePlugins([pluginDir]);
			const simulated = simulateCommandAction(result);

			expect(simulated.exitCode).toBe(1);
			expect(simulated.showsRemediation).toBe(true);
		});
	});

	describe("VerificationResult structure", () => {
		test("returns correct structure with all required fields", async () => {
			const pluginDir = join(tempDir, ".claude", "plugins");
			await createInstalledPlugins(pluginDir);

			const result = await verifyClaudeCodePlugins([pluginDir]);

			expect(result).toHaveProperty("verified");
			expect(result).toHaveProperty("plugins");
			expect(result).toHaveProperty("issues");

			expect(typeof result.verified).toBe("boolean");
			expect(Array.isArray(result.plugins)).toBe(true);
			expect(Array.isArray(result.issues)).toBe(true);
		});

		test("plugins array contains both expected plugins", async () => {
			const pluginDir = join(tempDir, ".claude", "plugins");
			await createInstalledPlugins(pluginDir);

			const result = await verifyClaudeCodePlugins([pluginDir]);

			const pluginNames = result.plugins.map((p) => p.name);
			expect(pluginNames).toContain("rp1-base");
			expect(pluginNames).toContain("rp1-dev");
		});

		test("each plugin has required fields", async () => {
			const pluginDir = join(tempDir, ".claude", "plugins");
			await createInstalledPlugins(pluginDir);

			const result = await verifyClaudeCodePlugins([pluginDir]);

			for (const plugin of result.plugins) {
				expect(plugin).toHaveProperty("name");
				expect(plugin).toHaveProperty("installed");
				expect(plugin).toHaveProperty("version");
				expect(plugin).toHaveProperty("location");

				expect(typeof plugin.name).toBe("string");
				expect(typeof plugin.installed).toBe("boolean");
			}
		});
	});

	describe("version display", () => {
		test("displays exact version from plugin manifest", async () => {
			const pluginDir = join(tempDir, ".claude", "plugins");
			await createInstalledPlugins(pluginDir, {
				base: "1.0.0",
				dev: "1.0.0",
			});

			const result = await verifyClaudeCodePlugins([pluginDir]);

			const basePlugin = result.plugins.find((p) => p.name === "rp1-base");
			expect(basePlugin?.version).toBe("1.0.0");
		});

		test("displays unknown when installed_plugins.json has no version", async () => {
			const pluginDir = join(tempDir, "plugins");
			await mkdir(pluginDir, { recursive: true });

			const now = new Date().toISOString();

			// Create installed_plugins.json with missing version for rp1-base
			const installedPlugins = {
				version: 1,
				plugins: {
					"rp1-base@rp1-run": [
						{
							scope: "user",
							installPath: join(pluginDir, "rp1-base@rp1-run"),
							// version intentionally omitted
							installedAt: now,
							lastUpdated: now,
						},
					],
					"rp1-dev@rp1-run": [
						{
							scope: "user",
							installPath: join(pluginDir, "rp1-dev@rp1-run"),
							version: "1.0.0",
							installedAt: now,
							lastUpdated: now,
						},
					],
				},
			};

			await writeFile(
				join(pluginDir, "installed_plugins.json"),
				JSON.stringify(installedPlugins, null, 2),
			);

			const result = await verifyClaudeCodePlugins([pluginDir]);

			const basePlugin = result.plugins.find((p) => p.name === "rp1-base");
			expect(basePlugin?.version).toBe("unknown");
		});

		test("displays different versions for each plugin", async () => {
			const pluginDir = join(tempDir, ".claude", "plugins");
			await createInstalledPlugins(pluginDir, {
				base: "0.1.0",
				dev: "0.2.0",
			});

			const result = await verifyClaudeCodePlugins([pluginDir]);

			const basePlugin = result.plugins.find((p) => p.name === "rp1-base");
			const devPlugin = result.plugins.find((p) => p.name === "rp1-dev");

			expect(basePlugin?.version).toBe("0.1.0");
			expect(devPlugin?.version).toBe("0.2.0");
		});

		test("handles semver prerelease versions", async () => {
			const pluginDir = join(tempDir, ".claude", "plugins");
			await createInstalledPlugins(pluginDir, {
				base: "1.0.0-alpha.1",
				dev: "2.0.0-beta.2+build.123",
			});

			const result = await verifyClaudeCodePlugins([pluginDir]);

			const basePlugin = result.plugins.find((p) => p.name === "rp1-base");
			const devPlugin = result.plugins.find((p) => p.name === "rp1-dev");

			expect(basePlugin?.version).toBe("1.0.0-alpha.1");
			expect(devPlugin?.version).toBe("2.0.0-beta.2+build.123");
		});
	});
});
