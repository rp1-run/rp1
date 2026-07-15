/**
 * Unit tests for TOML [arcade] section parsing and two-level merge.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { join } from "node:path";
import {
	loadArcadeSettings,
	resetSettingsCache,
} from "../../settings/loader.js";
import type { ArcadeSettings } from "../../settings/models.js";
import {
	cleanupTempDir,
	createTempDir,
	writeFixture,
} from "../helpers/index.js";

let tempDir: string;

/** Path to a nonexistent global settings file within tempDir, isolating tests from ~/.config/rp1/settings.toml. */
const isolatedGlobalPath = (): string =>
	join(tempDir, ".no-global", "settings.toml");

const DEFAULTS: ArcadeSettings = {
	theme: "system",
	downsampling: { thresholdHours: 24 },
};

beforeEach(async () => {
	resetSettingsCache();
	tempDir = await createTempDir("settings-loader-arcade");
});

afterEach(async () => {
	await cleanupTempDir(tempDir);
});

describe("parseArcadeSection via loadArcadeSettings", () => {
	test("returns defaults when no settings files exist", async () => {
		const result = await loadArcadeSettings(tempDir, isolatedGlobalPath());
		expect(result).toEqual(DEFAULTS);
	});

	test("parses [arcade] section with theme", async () => {
		await writeFixture(
			tempDir,
			".rp1/settings.toml",
			`[arcade]\ntheme = "dark"\n`,
		);

		const result = await loadArcadeSettings(tempDir, isolatedGlobalPath());
		expect(result.theme).toBe("dark");
		expect(result.downsampling).toEqual({ thresholdHours: 24 });
	});

	test("parses [arcade.downsampling] sub-table", async () => {
		await writeFixture(
			tempDir,
			".rp1/settings.toml",
			`[arcade]\ntheme = "light"\n\n[arcade.downsampling]\nthresholdHours = 48\n`,
		);

		const result = await loadArcadeSettings(tempDir, isolatedGlobalPath());
		expect(result.theme).toBe("light");
		expect(result.downsampling.thresholdHours).toBe(48);
	});

	test("returns defaults when [arcade] section is absent", async () => {
		await writeFixture(
			tempDir,
			".rp1/settings.toml",
			`[arguments.build]\nAFK = false\n`,
		);

		const result = await loadArcadeSettings(tempDir, isolatedGlobalPath());
		expect(result).toEqual(DEFAULTS);
	});

	test("ignores invalid theme values and falls back to default", async () => {
		await writeFixture(
			tempDir,
			".rp1/settings.toml",
			`[arcade]\ntheme = "neon"\n`,
		);

		const result = await loadArcadeSettings(tempDir, isolatedGlobalPath());
		expect(result.theme).toBe("system");
	});

	test("ignores non-number thresholdHours and falls back to default", async () => {
		await writeFixture(
			tempDir,
			".rp1/settings.toml",
			`[arcade.downsampling]\nthresholdHours = "not-a-number"\n`,
		);

		const result = await loadArcadeSettings(tempDir, isolatedGlobalPath());
		expect(result.downsampling.thresholdHours).toBe(24);
	});
});

describe("two-level merge for arcade settings", () => {
	test("project-level overrides user-level theme", async () => {
		const globalDir = join(tempDir, "global-config");
		const globalPath = join(globalDir, "settings.toml");

		await writeFixture(
			tempDir,
			"global-config/settings.toml",
			`[arcade]\ntheme = "dark"\n`,
		);
		await writeFixture(
			tempDir,
			".rp1/settings.toml",
			`[arcade]\ntheme = "light"\n`,
		);

		const result = await loadArcadeSettings(tempDir, globalPath);
		expect(result.theme).toBe("light");
	});

	test("project-level overrides user-level downsampling", async () => {
		const globalPath = join(tempDir, "global-config", "settings.toml");

		await writeFixture(
			tempDir,
			"global-config/settings.toml",
			`[arcade.downsampling]\nthresholdHours = 12\n`,
		);
		await writeFixture(
			tempDir,
			".rp1/settings.toml",
			`[arcade.downsampling]\nthresholdHours = 72\n`,
		);

		const result = await loadArcadeSettings(tempDir, globalPath);
		expect(result.downsampling.thresholdHours).toBe(72);
	});

	test("user-level values fill in when project-level omits them", async () => {
		const globalPath = join(tempDir, "global-config", "settings.toml");

		await writeFixture(
			tempDir,
			"global-config/settings.toml",
			`[arcade]\ntheme = "dark"\n\n[arcade.downsampling]\nthresholdHours = 48\n`,
		);
		// Project has no [arcade] section
		await writeFixture(
			tempDir,
			".rp1/settings.toml",
			`[arguments.build]\nAFK = false\n`,
		);

		const result = await loadArcadeSettings(tempDir, globalPath);
		expect(result.theme).toBe("dark");
		expect(result.downsampling.thresholdHours).toBe(48);
	});

	test("per-key merge: project theme overrides user, but user downsampling preserved", async () => {
		const globalPath = join(tempDir, "global-config", "settings.toml");

		await writeFixture(
			tempDir,
			"global-config/settings.toml",
			`[arcade]\ntheme = "dark"\n\n[arcade.downsampling]\nthresholdHours = 48\n`,
		);
		await writeFixture(
			tempDir,
			".rp1/settings.toml",
			`[arcade]\ntheme = "light"\n`,
		);

		const result = await loadArcadeSettings(tempDir, globalPath);
		expect(result.theme).toBe("light");
		expect(result.downsampling.thresholdHours).toBe(48);
	});
});

describe("arcade settings cache behavior", () => {
	test("resetSettingsCache forces fresh read of arcade settings", async () => {
		await writeFixture(
			tempDir,
			".rp1/settings.toml",
			`[arcade]\ntheme = "dark"\n`,
		);

		const first = await loadArcadeSettings(tempDir, isolatedGlobalPath());
		expect(first.theme).toBe("dark");

		await writeFixture(
			tempDir,
			".rp1/settings.toml",
			`[arcade]\ntheme = "light"\n`,
		);

		resetSettingsCache();

		const second = await loadArcadeSettings(tempDir, isolatedGlobalPath());
		expect(second.theme).toBe("light");
	});
});
