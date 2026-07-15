/**
 * Tests for daemon arcade settings integration: TOML loading,
 * grace fallback (JSON-to-TOML migration on startup), and cache invalidation.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { performArcadeGraceFallback } from "../../../web-ui/src/server/arcade-settings-bridge.js";
import {
	loadArcadeSettings,
	resetSettingsCache,
} from "../../settings/loader.js";
import {
	cleanupTempDir,
	createTempDir,
	writeFixture,
} from "../helpers/index.js";

let tempDir: string;

const isolatedGlobalDir = (): string => join(tempDir, "global-config");
const isolatedGlobalTomlPath = (): string =>
	join(isolatedGlobalDir(), "settings.toml");
const isolatedGlobalJsonPath = (): string =>
	join(isolatedGlobalDir(), "settings.json");
const projectJsonPath = (): string => join(tempDir, ".rp1", "settings.json");

beforeEach(async () => {
	resetSettingsCache();
	tempDir = await createTempDir("daemon-arcade-integration");
});

afterEach(async () => {
	await cleanupTempDir(tempDir);
});

describe("grace fallback: JSON-to-TOML migration on daemon start", () => {
	test("migrates global settings.json to settings.toml [arcade] section", async () => {
		await writeFixture(
			tempDir,
			"global-config/settings.json",
			JSON.stringify({ theme: "dark", downsampling: { thresholdHours: 48 } }),
		);

		const result = await performArcadeGraceFallback({
			projectRoot: tempDir,
			globalSettingsPath: isolatedGlobalTomlPath(),
			globalJsonPath: isolatedGlobalJsonPath(),
			projectJsonPath: projectJsonPath(),
		});

		expect(result.migrated).toBe(true);
		expect(result.migratedPaths).toContain(isolatedGlobalJsonPath());

		// JSON renamed to .migrated
		expect(existsSync(isolatedGlobalJsonPath())).toBe(false);
		expect(existsSync(`${isolatedGlobalJsonPath()}.migrated`)).toBe(true);

		// TOML has [arcade] section
		const tomlContent = readFileSync(isolatedGlobalTomlPath(), "utf-8");
		expect(tomlContent).toContain("[arcade]");
		expect(tomlContent).toContain('theme = "dark"');
	});

	test("migrates project-level settings.json to settings.toml", async () => {
		await writeFixture(
			tempDir,
			".rp1/settings.json",
			JSON.stringify({ theme: "light" }),
		);

		const result = await performArcadeGraceFallback({
			projectRoot: tempDir,
			globalSettingsPath: isolatedGlobalTomlPath(),
			globalJsonPath: isolatedGlobalJsonPath(),
			projectJsonPath: projectJsonPath(),
		});

		expect(result.migrated).toBe(true);
		expect(result.migratedPaths).toContain(projectJsonPath());

		expect(existsSync(projectJsonPath())).toBe(false);
		expect(existsSync(`${projectJsonPath()}.migrated`)).toBe(true);

		const tomlContent = readFileSync(
			join(tempDir, ".rp1", "settings.toml"),
			"utf-8",
		);
		expect(tomlContent).toContain("[arcade]");
		expect(tomlContent).toContain('theme = "light"');
	});

	test("TOML values take precedence over JSON when both exist", async () => {
		await writeFixture(
			tempDir,
			".rp1/settings.toml",
			'[arcade]\ntheme = "dark"\n',
		);
		await writeFixture(
			tempDir,
			".rp1/settings.json",
			JSON.stringify({ theme: "light" }),
		);

		const result = await performArcadeGraceFallback({
			projectRoot: tempDir,
			globalSettingsPath: isolatedGlobalTomlPath(),
			globalJsonPath: isolatedGlobalJsonPath(),
			projectJsonPath: projectJsonPath(),
		});

		// JSON still renamed (cleanup)
		expect(result.migrated).toBe(true);
		expect(existsSync(`${projectJsonPath()}.migrated`)).toBe(true);

		// TOML should preserve original values (writeArcadeSection does not overwrite)
		resetSettingsCache();
		const settings = await loadArcadeSettings(
			tempDir,
			isolatedGlobalTomlPath(),
		);
		expect(settings.theme).toBe("dark");
	});

	test("no-ops when no settings.json exists", async () => {
		const result = await performArcadeGraceFallback({
			projectRoot: tempDir,
			globalSettingsPath: isolatedGlobalTomlPath(),
			globalJsonPath: isolatedGlobalJsonPath(),
			projectJsonPath: projectJsonPath(),
		});

		expect(result.migrated).toBe(false);
		expect(result.migratedPaths).toHaveLength(0);
	});

	test("cache is invalidated after fallback migration", async () => {
		// Pre-populate cache with defaults
		const beforeSettings = await loadArcadeSettings(
			tempDir,
			isolatedGlobalTomlPath(),
		);
		expect(beforeSettings.theme).toBe("system");

		// Create a JSON file to trigger migration
		await writeFixture(
			tempDir,
			".rp1/settings.json",
			JSON.stringify({ theme: "dark" }),
		);

		await performArcadeGraceFallback({
			projectRoot: tempDir,
			globalSettingsPath: isolatedGlobalTomlPath(),
			globalJsonPath: isolatedGlobalJsonPath(),
			projectJsonPath: projectJsonPath(),
		});

		// After fallback, cache should be invalidated and fresh read returns migrated values
		const afterSettings = await loadArcadeSettings(
			tempDir,
			isolatedGlobalTomlPath(),
		);
		expect(afterSettings.theme).toBe("dark");
	});

	test("handles malformed JSON gracefully", async () => {
		await writeFixture(tempDir, ".rp1/settings.json", "not valid json {{{");

		const result = await performArcadeGraceFallback({
			projectRoot: tempDir,
			globalSettingsPath: isolatedGlobalTomlPath(),
			globalJsonPath: isolatedGlobalJsonPath(),
			projectJsonPath: projectJsonPath(),
		});

		// Should not crash; JSON left in place (not renamed since parsing failed)
		expect(result.migrated).toBe(false);
	});

	test("migrates both global and project JSON files", async () => {
		await writeFixture(
			tempDir,
			"global-config/settings.json",
			JSON.stringify({ theme: "dark" }),
		);
		await writeFixture(
			tempDir,
			".rp1/settings.json",
			JSON.stringify({ downsampling: { thresholdHours: 72 } }),
		);

		const result = await performArcadeGraceFallback({
			projectRoot: tempDir,
			globalSettingsPath: isolatedGlobalTomlPath(),
			globalJsonPath: isolatedGlobalJsonPath(),
			projectJsonPath: projectJsonPath(),
		});

		expect(result.migrated).toBe(true);
		expect(result.migratedPaths).toHaveLength(2);

		// Both JSONs renamed
		expect(existsSync(`${isolatedGlobalJsonPath()}.migrated`)).toBe(true);
		expect(existsSync(`${projectJsonPath()}.migrated`)).toBe(true);

		// Verify merged settings reflect both migrations
		resetSettingsCache();
		const settings = await loadArcadeSettings(
			tempDir,
			isolatedGlobalTomlPath(),
		);
		expect(settings.theme).toBe("dark");
		expect(settings.downsampling.thresholdHours).toBe(72);
	});
});
