/**
 * Unit tests for settings merger.
 * Tests merging of global, local, and CLI settings with proper precedence.
 */

import { describe, expect, test } from "bun:test";
import type { SettingsFile } from "../../../agent-tools/transform-args/models.js";
import {
	emptyMergedSettings,
	extractNamespaceSettings,
	getBooleanSetting,
	getSettingWithSource,
	getStringSetting,
	mergeSettings,
	mergeSettingsWithoutCLI,
} from "../../../agent-tools/transform-args/settings-merger.js";

describe("settings-merger", () => {
	describe("extractNamespaceSettings", () => {
		test("extracts global section only when namespace is global", () => {
			const settings: SettingsFile = {
				global: { verbose: true, mode: "fast" },
				build: { afk: true },
			};

			const result = extractNamespaceSettings(settings, "global");

			expect(result).toEqual({ verbose: true, mode: "fast" });
		});

		test("merges global section with namespace section", () => {
			const settings: SettingsFile = {
				global: { verbose: true, mode: "fast" },
				build: { afk: true, mode: "slow" },
			};

			const result = extractNamespaceSettings(settings, "build");

			expect(result).toEqual({
				verbose: true,
				mode: "slow", // namespace overrides global
				afk: true,
			});
		});

		test("returns only global section when namespace not found", () => {
			const settings: SettingsFile = {
				global: { verbose: true },
			};

			const result = extractNamespaceSettings(settings, "unknown");

			expect(result).toEqual({ verbose: true });
		});

		test("returns empty object for empty settings", () => {
			const settings: SettingsFile = {};

			const result = extractNamespaceSettings(settings, "build");

			expect(result).toEqual({});
		});

		test("handles missing global section", () => {
			const settings: SettingsFile = {
				build: { afk: true },
			};

			const result = extractNamespaceSettings(settings, "build");

			expect(result).toEqual({ afk: true });
		});
	});

	describe("mergeSettings", () => {
		test("applies global settings first", () => {
			const result = mergeSettings({
				globalSettings: {
					build: { afk: true, mode: "fast" },
				},
				localSettings: {},
				cliArguments: {},
				namespace: "build",
			});

			expect(result.values).toEqual({ afk: true, mode: "fast" });
			expect(result.source).toEqual({ afk: "global", mode: "global" });
		});

		test("local settings override global", () => {
			const result = mergeSettings({
				globalSettings: {
					build: { afk: true, mode: "fast" },
				},
				localSettings: {
					build: { afk: false },
				},
				cliArguments: {},
				namespace: "build",
			});

			expect(result.values.afk).toBe(false);
			expect(result.values.mode).toBe("fast");
			expect(result.source.afk).toBe("local");
			expect(result.source.mode).toBe("global");
		});

		test("CLI arguments override local and global", () => {
			const result = mergeSettings({
				globalSettings: {
					build: { afk: true, mode: "fast" },
				},
				localSettings: {
					build: { afk: false, verbose: true },
				},
				cliArguments: { afk: true, extra: "cli-value" },
				namespace: "build",
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
					build: { afk: true },
				},
				localSettings: {},
				cliArguments: { afk: undefined },
				namespace: "build",
			});

			expect(result.values.afk).toBe(true);
			expect(result.source.afk).toBe("global");
		});

		test("uses global section from settings files", () => {
			const result = mergeSettings({
				globalSettings: {
					global: { verbose: true },
					build: { mode: "fast" },
				},
				localSettings: {},
				cliArguments: {},
				namespace: "build",
			});

			expect(result.values).toEqual({ verbose: true, mode: "fast" });
		});

		test("handles empty inputs", () => {
			const result = mergeSettings({
				globalSettings: {},
				localSettings: {},
				cliArguments: {},
				namespace: "build",
			});

			expect(result.values).toEqual({});
			expect(result.source).toEqual({});
		});
	});

	describe("mergeSettingsWithoutCLI", () => {
		test("merges only global and local settings", () => {
			const result = mergeSettingsWithoutCLI(
				{ build: { afk: true } },
				{ build: { afk: false, verbose: true } },
				"build",
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
				globalSettings: { build: { afk: true } },
				localSettings: {},
				cliArguments: {},
				namespace: "build",
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
				globalSettings: { build: { mode: "fast" } },
				localSettings: {},
				cliArguments: {},
				namespace: "build",
			});

			const value = getStringSetting(merged, "mode", "slow");

			expect(value).toBe("fast");
		});

		test("returns default when value is not string", () => {
			const merged = mergeSettings({
				globalSettings: { build: { mode: 123 } },
				localSettings: {},
				cliArguments: {},
				namespace: "build",
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
				globalSettings: { build: { afk: true } },
				localSettings: {},
				cliArguments: {},
				namespace: "build",
			});

			const value = getBooleanSetting(merged, "afk", false);

			expect(value).toBe(true);
		});

		test("converts string true to boolean", () => {
			const merged = mergeSettings({
				globalSettings: {},
				localSettings: {},
				cliArguments: { afk: "true" },
				namespace: "build",
			});

			const value = getBooleanSetting(merged, "afk", false);

			expect(value).toBe(true);
		});

		test("converts string false to boolean", () => {
			const merged = mergeSettings({
				globalSettings: {},
				localSettings: {},
				cliArguments: { afk: "false" },
				namespace: "build",
			});

			const value = getBooleanSetting(merged, "afk", true);

			expect(value).toBe(false);
		});

		test("returns default when value is not boolean or boolean string", () => {
			const merged = mergeSettings({
				globalSettings: { build: { afk: "yes" } },
				localSettings: {},
				cliArguments: {},
				namespace: "build",
			});

			const value = getBooleanSetting(merged, "afk", false);

			expect(value).toBe(false);
		});

		test("returns default when key is missing", () => {
			const merged = emptyMergedSettings();

			const value = getBooleanSetting(merged, "missing", true);

			expect(value).toBe(true);
		});
	});

	describe("emptyMergedSettings", () => {
		test("returns empty values and source objects", () => {
			const result = emptyMergedSettings();

			expect(result.values).toEqual({});
			expect(result.source).toEqual({});
		});
	});
});
