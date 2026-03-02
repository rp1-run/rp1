/**
 * Unit tests for config.ts - OpenCode configuration management.
 * Tests rp1's configuration logic, not library functionality.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import * as E from "fp-ts/lib/Either.js";

import {
	backupConfig,
	readOpenCodeConfig,
	registerOpenCodePlugin,
} from "../../install/config.js";
import { cleanupTempDir, createTempDir } from "../helpers/index.js";

const hasPluginRef = (plugins: string[], name: string) =>
	plugins.some((p) => p.includes(name));

describe("config", () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await createTempDir("config-test");
	});

	afterEach(async () => {
		await cleanupTempDir(tempDir);
	});

	describe("readOpenCodeConfig", () => {
		test("returns empty object when config file does not exist", async () => {
			const configPath = join(tempDir, "nonexistent", "opencode.json");
			const result = await readOpenCodeConfig(configPath)();

			expect(E.isRight(result)).toBe(true);
			if (E.isRight(result)) {
				expect(result.right).toEqual({});
			}
		});

		test("parses existing valid config file", async () => {
			const configPath = join(tempDir, "opencode.json");
			const existingConfig = { plugin: ["some-plugin"], customKey: "value" };
			await writeFile(configPath, JSON.stringify(existingConfig));

			const result = await readOpenCodeConfig(configPath)();

			expect(E.isRight(result)).toBe(true);
			if (E.isRight(result)) {
				expect(result.right).toEqual(existingConfig);
			}
		});

		test("returns empty object for invalid JSON", async () => {
			const configPath = join(tempDir, "opencode.json");
			await writeFile(configPath, "{ invalid json }");

			const result = await readOpenCodeConfig(configPath)();

			expect(E.isRight(result)).toBe(true);
			if (E.isRight(result)) {
				expect(result.right).toEqual({});
			}
		});
	});

	describe("registerOpenCodePlugin", () => {
		test("creates parent directories if missing", async () => {
			const configPath = join(tempDir, "nested", "deep", "opencode.json");

			const result = await registerOpenCodePlugin(
				configPath,
				"rp1-base-hooks",
			)();

			expect(E.isRight(result)).toBe(true);

			const parentDir = join(tempDir, "nested", "deep");
			const dirStat = await stat(parentDir);
			expect(dirStat.isDirectory()).toBe(true);
		});

		test("preserves existing config keys when adding plugin", async () => {
			const configPath = join(tempDir, "opencode.json");
			const existingConfig = {
				plugin: ["existing-plugin"],
				customKey: "should-be-preserved",
				model: "claude-3",
			};
			await writeFile(configPath, JSON.stringify(existingConfig));

			const result = await registerOpenCodePlugin(
				configPath,
				"rp1-base-hooks",
			)();

			expect(E.isRight(result)).toBe(true);

			const updatedContent = await readFile(configPath, "utf-8");
			const updatedConfig = JSON.parse(updatedContent);

			expect(updatedConfig.customKey).toBe("should-be-preserved");
			expect(updatedConfig.model).toBe("claude-3");
			expect(updatedConfig.plugin).toContain("existing-plugin");
			expect(hasPluginRef(updatedConfig.plugin, "rp1-base-hooks")).toBe(true);
		});

		test("writes file:// URL for plugin reference", async () => {
			const configPath = join(tempDir, "opencode.json");
			await writeFile(configPath, JSON.stringify({ plugin: [] }));

			await registerOpenCodePlugin(configPath, "rp1-base-hooks")();

			const content = await readFile(configPath, "utf-8");
			const config = JSON.parse(content);
			const ref = config.plugin.find((p: string) =>
				p.includes("rp1-base-hooks"),
			);
			expect(ref).toStartWith("file://");
			expect(ref).toEndWith("index.ts");
		});

		test("migrates old-style reference to file:// URL", async () => {
			const configPath = join(tempDir, "opencode.json");
			await writeFile(
				configPath,
				JSON.stringify({ plugin: ["./plugin/rp1-base-hooks"] }),
			);

			const result = await registerOpenCodePlugin(
				configPath,
				"rp1-base-hooks",
			)();

			expect(E.isRight(result)).toBe(true);
			if (E.isRight(result)) {
				expect(result.right).toBe(true);
			}

			const content = await readFile(configPath, "utf-8");
			const config = JSON.parse(content);
			expect(config.plugin).toHaveLength(1);
			expect(config.plugin[0]).toStartWith("file://");
		});

		test("returns false when plugin already registered with file:// URL", async () => {
			const configPath = join(tempDir, "opencode.json");
			const pluginRef = `file://${join(tempDir, "plugins", "rp1-base-hooks", "index.ts")}`;
			await writeFile(configPath, JSON.stringify({ plugin: [pluginRef] }));

			const result = await registerOpenCodePlugin(
				configPath,
				"rp1-base-hooks",
			)();

			expect(E.isRight(result)).toBe(true);
			if (E.isRight(result)) {
				expect(result.right).toBe(false);
			}
		});

		test("returns true when plugin newly registered", async () => {
			const configPath = join(tempDir, "opencode.json");
			await writeFile(configPath, JSON.stringify({ plugin: [] }));

			const result = await registerOpenCodePlugin(
				configPath,
				"rp1-base-hooks",
			)();

			expect(E.isRight(result)).toBe(true);
			if (E.isRight(result)) {
				expect(result.right).toBe(true);
			}
		});
	});

	describe("backupConfig", () => {
		test("returns null when no existing config to backup", async () => {
			const configPath = join(tempDir, "nonexistent.json");

			const result = await backupConfig(configPath)();

			expect(E.isRight(result)).toBe(true);
			if (E.isRight(result)) {
				expect(result.right).toBeNull();
			}
		});

		test("creates timestamped backup file for existing config", async () => {
			const configPath = join(tempDir, "opencode.json");
			const configContent = { plugin: ["test"], key: "value" };
			await writeFile(configPath, JSON.stringify(configContent));

			const result = await backupConfig(configPath)();

			expect(E.isRight(result)).toBe(true);
			if (E.isRight(result) && result.right !== null) {
				const backupPath = result.right;
				expect(backupPath).toContain("opencode.json.backup.");

				const backupContent = await readFile(backupPath, "utf-8");
				expect(JSON.parse(backupContent)).toEqual(configContent);
			}
		});

		test("backup filename includes timestamp", async () => {
			const configPath = join(tempDir, "opencode.json");
			await writeFile(configPath, JSON.stringify({ test: true }));

			const result = await backupConfig(configPath)();

			expect(E.isRight(result)).toBe(true);
			if (E.isRight(result) && result.right !== null) {
				const timestampPattern = /\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}/;
				expect(result.right).toMatch(timestampPattern);
			}
		});
	});
});
