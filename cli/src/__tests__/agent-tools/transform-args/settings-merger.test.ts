/**
 * Unit tests for settings merger.
 * Tests merging of global, local, and CLI settings with proper precedence.
 */

import { describe, expect, test } from "bun:test";
import type { SettingsFile } from "../../../agent-tools/transform-args/models.js";
import {
	emptyMergedSettings,
	extractSettings,
	getBooleanSetting,
	getSettingWithSource,
	getStringSetting,
	mergeSettings,
	mergeSettingsWithoutCLI,
} from "../../../agent-tools/transform-args/settings-merger.js";

describe("settings-merger", () => {
	describe("extractSettings", () => {
		test("extracts global section contents", () => {
			const settings: SettingsFile = {
				global: { verbose: true, mode: "fast" },
			};

			const result = extractSettings(settings);

			expect(result).toEqual({ verbose: true, mode: "fast" });
		});

		test("returns empty object for empty settings", () => {
			const settings: SettingsFile = {};

			const result = extractSettings(settings);

			expect(result).toEqual({});
		});

		test("ignores nested objects (old namespace sections)", () => {
			const settings: SettingsFile = {
				global: { verbose: true },
				build: { afk: true },
			};

			// Only global section is extracted, nested objects are ignored
			const result = extractSettings(settings);

			expect(result).toEqual({ verbose: true });
		});

		test("extracts root-level primitive values", () => {
			const settings: SettingsFile = {
				verbose: true,
				mode: "fast",
				count: 5,
			} as SettingsFile;

			const result = extractSettings(settings);

			expect(result).toEqual({ verbose: true, mode: "fast", count: 5 });
		});

		test("ignores schema_version", () => {
			const settings: SettingsFile = {
				schema_version: "1",
				global: { verbose: true },
			};

			const result = extractSettings(settings);

			expect(result).toEqual({ verbose: true });
		});
	});

	describe("mergeSettings", () => {
		test("applies global settings first", () => {
			const result = mergeSettings({
				globalSettings: {
					global: { afk: true, mode: "fast" },
				},
				localSettings: {},
				cliArguments: {},
			});

			expect(result.values).toEqual({ afk: true, mode: "fast" });
			expect(result.source).toEqual({ afk: "global", mode: "global" });
		});

		test("local settings override global", () => {
			const result = mergeSettings({
				globalSettings: {
					global: { afk: true, mode: "fast" },
				},
				localSettings: {
					global: { afk: false },
				},
				cliArguments: {},
			});

			expect(result.values.afk).toBe(false);
			expect(result.values.mode).toBe("fast");
			expect(result.source.afk).toBe("local");
			expect(result.source.mode).toBe("global");
		});

		test("CLI arguments override local and global", () => {
			const result = mergeSettings({
				globalSettings: {
					global: { afk: true, mode: "fast" },
				},
				localSettings: {
					global: { afk: false, verbose: true },
				},
				cliArguments: { afk: true, extra: "cli-value" },
			});

			expect(result.values.afk).toBe(true);
			expect(result.values.mode).toBe("fast");
			expect(result.values.verbose).toBe(true);
			expect(result.values.extra).toBe("cli-value");
			expect(result.source.afk).toBe("cli");
			expect(result.source.mode).toBe("global");
			expect(result.source.verbose).toBe("local");
			expect(result.source.extra).toBe("cli");
		});

		test("undefined CLI values are not applied", () => {
			const result = mergeSettings({
				globalSettings: {
					global: { afk: true },
				},
				localSettings: {},
				cliArguments: { afk: undefined },
			});

			expect(result.values.afk).toBe(true);
			expect(result.source.afk).toBe("global");
		});

		test("handles empty inputs", () => {
			const result = mergeSettings({
				globalSettings: {},
				localSettings: {},
				cliArguments: {},
			});

			expect(result.values).toEqual({});
			expect(result.source).toEqual({});
		});
	});

	describe("mergeSettingsWithoutCLI", () => {
		test("merges only global and local settings", () => {
			const result = mergeSettingsWithoutCLI(
				{ global: { afk: true } },
				{ global: { afk: false, verbose: true } },
			);

			expect(result.values.afk).toBe(false);
			expect(result.values.verbose).toBe(true);
			expect(result.source.afk).toBe("local");
			expect(result.source.verbose).toBe("local");
		});
	});

	describe("getSettingWithSource", () => {
		test("returns value and source for existing setting", () => {
			const merged = mergeSettings({
				globalSettings: { global: { afk: true } },
				localSettings: {},
				cliArguments: {},
			});

			const [value, source] = getSettingWithSource(merged, "afk");

			expect(value).toBe(true);
			expect(source).toBe("global");
		});

		test("returns undefined and default for missing setting", () => {
			const merged = emptyMergedSettings();

			const [value, source] = getSettingWithSource(merged, "missing");

			expect(value).toBeUndefined();
			expect(source).toBe("default");
		});
	});

	describe("getStringSetting", () => {
		test("returns string value when present", () => {
			const merged = mergeSettings({
				globalSettings: { global: { mode: "fast" } },
				localSettings: {},
				cliArguments: {},
			});

			const value = getStringSetting(merged, "mode", "slow");

			expect(value).toBe("fast");
		});

		test("returns default when value is not string", () => {
			const merged = mergeSettings({
				globalSettings: { global: { mode: 123 } },
				localSettings: {},
				cliArguments: {},
			});

			const value = getStringSetting(merged, "mode", "default");

			expect(value).toBe("default");
		});

		test("returns default when key is missing", () => {
			const merged = emptyMergedSettings();

			const value = getStringSetting(merged, "missing", "default");

			expect(value).toBe("default");
		});
	});

	describe("getBooleanSetting", () => {
		test("returns boolean value when present", () => {
			const merged = mergeSettings({
				globalSettings: { global: { afk: true } },
				localSettings: {},
				cliArguments: {},
			});

			const value = getBooleanSetting(merged, "afk", false);

			expect(value).toBe(true);
		});

		test("converts string true to boolean", () => {
			const merged = mergeSettings({
				globalSettings: {},
				localSettings: {},
				cliArguments: { afk: "true" },
			});

			const value = getBooleanSetting(merged, "afk", false);

			expect(value).toBe(true);
		});

		test("converts string false to boolean", () => {
			const merged = mergeSettings({
				globalSettings: {},
				localSettings: {},
				cliArguments: { afk: "false" },
			});

			const value = getBooleanSetting(merged, "afk", true);

			expect(value).toBe(false);
		});

		test("returns default when value is not boolean or boolean string", () => {
			const merged = mergeSettings({
				globalSettings: { global: { afk: "yes" } },
				localSettings: {},
				cliArguments: {},
			});

			const value = getBooleanSetting(merged, "afk", false);

			expect(value).toBe(false);
		});
	});
});
