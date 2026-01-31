/**
 * Unit tests for settings loader.
 * Tests TOML settings file loading from global and local paths.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	emptySettingsFile,
	loadSettings,
	loadSettingsFile,
	loadSettingsFileForValidation,
	resolveGlobalSettingsPath,
	resolveLocalSettingsPath,
} from "../../../agent-tools/transform-args/settings-loader.js";
import { expectTaskRight } from "../../helpers/fp-ts-helpers.js";

describe("settings-loader", () => {
	let testDir: string;

	beforeEach(async () => {
		testDir = join(tmpdir(), `rp1-settings-test-${Date.now()}`);
		await mkdir(testDir, { recursive: true });
	});

	afterEach(async () => {
		await rm(testDir, { recursive: true, force: true });
	});

	describe("resolveGlobalSettingsPath", () => {
		test("returns path in ~/.config/rp1/", () => {
			const path = resolveGlobalSettingsPath();

			expect(path).toContain(".config");
			expect(path).toContain("rp1");
			expect(path).toEndWith("settings.toml");
		});
	});

	describe("resolveLocalSettingsPath", () => {
		test("returns path relative to cwd", () => {
			const path = resolveLocalSettingsPath("/project");

			expect(path).toBe("/project/.rp1/settings.toml");
		});

		test("uses process.cwd() by default", () => {
			const path = resolveLocalSettingsPath();

			expect(path).toEndWith(".rp1/settings.toml");
			expect(path).toContain(process.cwd());
		});
	});

	describe("emptySettingsFile", () => {
		test("returns empty object", () => {
			const settings = emptySettingsFile();

			expect(settings).toEqual({});
			expect(Object.keys(settings)).toHaveLength(0);
		});
	});

	describe("loadSettingsFile", () => {
		test("returns empty settings for missing file", async () => {
			const nonExistentPath = join(testDir, "nonexistent.toml");

			const result = await expectTaskRight(loadSettingsFile(nonExistentPath));

			expect(result).toEqual({});
		});

		test("parses valid TOML file", async () => {
			const settingsPath = join(testDir, "settings.toml");
			await writeFile(
				settingsPath,
				`
schema_version = "1"

[global]
verbose = true

[build]
afk = true
mode = "fast"
`,
			);

			const result = await expectTaskRight(loadSettingsFile(settingsPath));

			expect(result.schema_version).toBe("1");
			expect(result.global).toEqual({ verbose: true });
			expect(result.build).toEqual({ afk: true, mode: "fast" });
		});

		test("returns empty settings for invalid TOML (graceful degradation)", async () => {
			const settingsPath = join(testDir, "invalid.toml");
			await writeFile(settingsPath, "this is not valid toml [[[");

			const result = await expectTaskRight(loadSettingsFile(settingsPath));

			expect(result).toEqual({});
		});

		test("handles empty file", async () => {
			const settingsPath = join(testDir, "empty.toml");
			await writeFile(settingsPath, "");

			const result = await expectTaskRight(loadSettingsFile(settingsPath));

			expect(result).toEqual({});
		});

		test("handles file with only comments", async () => {
			const settingsPath = join(testDir, "comments.toml");
			await writeFile(
				settingsPath,
				`
# This is a comment
# Another comment
`,
			);

			const result = await expectTaskRight(loadSettingsFile(settingsPath));

			expect(result).toEqual({});
		});
	});

	describe("loadSettings", () => {
		test("loads from both global and local paths", async () => {
			// Create local settings in test directory
			const localDir = join(testDir, ".rp1");
			await mkdir(localDir, { recursive: true });
			await writeFile(
				join(localDir, "settings.toml"),
				`
[build]
afk = true
`,
			);

			const result = await expectTaskRight(loadSettings(testDir));

			expect(result.localPath).toBe(join(testDir, ".rp1", "settings.toml"));
			expect(result.local.build).toEqual({ afk: true });
		});

		test("returns empty settings when files do not exist", async () => {
			const emptyDir = join(testDir, "empty-project");
			await mkdir(emptyDir, { recursive: true });

			const result = await expectTaskRight(loadSettings(emptyDir));

			expect(result.local).toEqual({});
		});

		test("includes correct paths in result", async () => {
			const result = await expectTaskRight(loadSettings(testDir));

			expect(result.globalPath).toContain(".config/rp1/settings.toml");
			expect(result.localPath).toBe(join(testDir, ".rp1/settings.toml"));
		});
	});

	describe("loadSettingsFileForValidation", () => {
		test("reports missing file as not existing but valid", async () => {
			const nonExistentPath = join(testDir, "missing.toml");

			const result = await loadSettingsFileForValidation(nonExistentPath);

			expect(result.exists).toBe(false);
			expect(result.valid).toBe(true);
			expect(result.content).toBeNull();
		});

		test("reports valid TOML file", async () => {
			const settingsPath = join(testDir, "valid.toml");
			await writeFile(
				settingsPath,
				`
[build]
afk = true
`,
			);

			const result = await loadSettingsFileForValidation(settingsPath);

			expect(result.exists).toBe(true);
			expect(result.valid).toBe(true);
			expect(result.content).toEqual({ build: { afk: true } });
			expect(result.error).toBeUndefined();
		});

		test("reports invalid TOML file with error message", async () => {
			const settingsPath = join(testDir, "invalid.toml");
			await writeFile(settingsPath, "invalid = [[[");

			const result = await loadSettingsFileForValidation(settingsPath);

			expect(result.exists).toBe(true);
			expect(result.valid).toBe(false);
			expect(result.content).toBeNull();
			expect(result.error).toBeDefined();
		});
	});
});
