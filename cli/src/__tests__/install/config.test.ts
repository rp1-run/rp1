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

			// Verify parent directories were created
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
			expect(updatedConfig.plugin).toContain("./plugin/rp1-base-hooks");
		});

		test("creates plugin array if missing", async () => {
			const configPath = join(tempDir, "opencode.json");
			await writeFile(configPath, JSON.stringify({ customKey: "value" }));

			const result = await registerOpenCodePlugin(
				configPath,
				"rp1-base-hooks",
			)();

			expect(E.isRight(result)).toBe(true);

			const updatedContent = await readFile(configPath, "utf-8");
			const updatedConfig = JSON.parse(updatedContent);

			expect(Array.isArray(updatedConfig.plugin)).toBe(true);
			expect(updatedConfig.plugin).toContain("./plugin/rp1-base-hooks");
		});

		test("creates new config file when none exists", async () => {
			const configPath = join(tempDir, "opencode.json");

			const result = await registerOpenCodePlugin(
				configPath,
				"rp1-base-hooks",
			)();

			expect(E.isRight(result)).toBe(true);
			if (E.isRight(result)) {
				expect(result.right).toBe(true); // Newly registered
			}

			const content = await readFile(configPath, "utf-8");
			const config = JSON.parse(content);
			expect(config.plugin).toContain("./plugin/rp1-base-hooks");
		});

		test("returns false when plugin already registered", async () => {
			const configPath = join(tempDir, "opencode.json");
			const existingConfig = {
				plugin: ["./plugin/rp1-base-hooks"],
			};
			await writeFile(configPath, JSON.stringify(existingConfig));

			const result = await registerOpenCodePlugin(
				configPath,
				"rp1-base-hooks",
			)();

			expect(E.isRight(result)).toBe(true);
			if (E.isRight(result)) {
				expect(result.right).toBe(false); // Already registered
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
				expect(result.right).toBe(true); // Newly registered
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
			// Create a config file to backup
			const configPath = join(tempDir, "opencode.json");
			const configContent = { plugin: ["test"], key: "value" };
			await writeFile(configPath, JSON.stringify(configContent));

			const result = await backupConfig(configPath)();

			expect(E.isRight(result)).toBe(true);
			if (E.isRight(result) && result.right !== null) {
				const backupPath = result.right;
				expect(backupPath).toContain("opencode.json.backup.");

				// Verify backup file exists and has correct content
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
				// Timestamp format: YYYY-MM-DDTHH-MM-SS
				const timestampPattern = /\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}/;
				expect(result.right).toMatch(timestampPattern);
			}
		});
	});
});
