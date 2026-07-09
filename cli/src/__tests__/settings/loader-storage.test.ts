/**
 * Unit tests for TOML [storage] section parsing and two-level merge.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { readStorageMode } from "../../../shared/storage-mode.js";
import { loadStorageMode, resetSettingsCache } from "../../settings/loader.js";
import {
	cleanupTempDir,
	createTempDir,
	writeFixture,
} from "../helpers/index.js";

let tempDir: string;

/** Path to a nonexistent global settings file within tempDir, isolating tests from ~/.config/rp1/settings.toml. */
const isolatedGlobalPath = (): string =>
	join(tempDir, ".no-global", "settings.toml");

beforeEach(async () => {
	resetSettingsCache();
	tempDir = await createTempDir("settings-loader-storage");
});

afterEach(async () => {
	await cleanupTempDir(tempDir);
});

describe("parseStorageSection via loadStorageMode", () => {
	test("returns 'local' when no settings files exist", async () => {
		const result = await loadStorageMode(tempDir, isolatedGlobalPath());
		expect(result).toBe("local");
	});

	test("parses [storage] section with mode = 'central'", async () => {
		await writeFixture(
			tempDir,
			".rp1/settings.toml",
			`[storage]\nmode = "central"\n`,
		);

		const result = await loadStorageMode(tempDir, isolatedGlobalPath());
		expect(result).toBe("central");
	});

	test("parses [storage] section with mode = 'local'", async () => {
		await writeFixture(
			tempDir,
			".rp1/settings.toml",
			`[storage]\nmode = "local"\n`,
		);

		const result = await loadStorageMode(tempDir, isolatedGlobalPath());
		expect(result).toBe("local");
	});

	test("returns 'local' when [storage] section is absent", async () => {
		await writeFixture(
			tempDir,
			".rp1/settings.toml",
			`[arguments.build]\nAFK = false\n`,
		);

		const result = await loadStorageMode(tempDir, isolatedGlobalPath());
		expect(result).toBe("local");
	});

	test("ignores invalid mode values and falls back to 'local'", async () => {
		await writeFixture(
			tempDir,
			".rp1/settings.toml",
			`[storage]\nmode = "cloud"\n`,
		);

		const result = await loadStorageMode(tempDir, isolatedGlobalPath());
		expect(result).toBe("local");
	});

	test("ignores non-string mode values", async () => {
		await writeFixture(tempDir, ".rp1/settings.toml", `[storage]\nmode = 42\n`);

		const result = await loadStorageMode(tempDir, isolatedGlobalPath());
		expect(result).toBe("local");
	});

	test("coexists with other sections without interference", async () => {
		await writeFixture(
			tempDir,
			".rp1/settings.toml",
			[
				"[arguments.build]",
				"AFK = false",
				"",
				"[models.claude-code]",
				'deep = "claude-sonnet-4-20250514"',
				"",
				"[storage]",
				'mode = "central"',
				"",
				"[arcade]",
				'theme = "dark"',
			].join("\n"),
		);

		const result = await loadStorageMode(tempDir, isolatedGlobalPath());
		expect(result).toBe("central");
	});
});

describe("two-level merge for storage mode", () => {
	test("project-level overrides user-level mode", async () => {
		const globalPath = join(tempDir, "global-config", "settings.toml");

		await writeFixture(
			tempDir,
			"global-config/settings.toml",
			`[storage]\nmode = "central"\n`,
		);
		await writeFixture(
			tempDir,
			".rp1/settings.toml",
			`[storage]\nmode = "local"\n`,
		);

		const result = await loadStorageMode(tempDir, globalPath);
		expect(result).toBe("local");
	});

	test("user-level value used when project-level omits [storage]", async () => {
		const globalPath = join(tempDir, "global-config", "settings.toml");

		await writeFixture(
			tempDir,
			"global-config/settings.toml",
			`[storage]\nmode = "central"\n`,
		);
		await writeFixture(
			tempDir,
			".rp1/settings.toml",
			`[arguments.build]\nAFK = false\n`,
		);

		const result = await loadStorageMode(tempDir, globalPath);
		expect(result).toBe("central");
	});

	test("returns 'local' when neither level has [storage]", async () => {
		const globalPath = join(tempDir, "global-config", "settings.toml");

		await writeFixture(
			tempDir,
			"global-config/settings.toml",
			`[arguments.build]\nAFK = false\n`,
		);
		await writeFixture(
			tempDir,
			".rp1/settings.toml",
			`[arguments.build]\nGIT_COMMIT = true\n`,
		);

		const result = await loadStorageMode(tempDir, globalPath);
		expect(result).toBe("local");
	});

	test("user-level invalid mode falls through to default 'local'", async () => {
		const globalPath = join(tempDir, "global-config", "settings.toml");

		await writeFixture(
			tempDir,
			"global-config/settings.toml",
			`[storage]\nmode = "invalid"\n`,
		);

		const result = await loadStorageMode(tempDir, globalPath);
		expect(result).toBe("local");
	});
});

describe("cross-verification: loadStorageMode delegates to readStorageMode", () => {
	test("loadStorageMode and readStorageMode return identical results for central mode", async () => {
		const globalPath = isolatedGlobalPath();
		await writeFixture(
			tempDir,
			".rp1/settings.toml",
			`[storage]\nmode = "central"\n`,
		);

		const loaderResult = await loadStorageMode(tempDir, globalPath);
		const sharedResult = readStorageMode(tempDir, globalPath);
		expect(loaderResult).toBe(sharedResult);
		expect(loaderResult).toBe("central");
	});

	test("loadStorageMode and readStorageMode return identical results for absent section", async () => {
		const globalPath = isolatedGlobalPath();
		await writeFixture(
			tempDir,
			".rp1/settings.toml",
			`[arguments.build]\nAFK = false\n`,
		);

		const loaderResult = await loadStorageMode(tempDir, globalPath);
		const sharedResult = readStorageMode(tempDir, globalPath);
		expect(loaderResult).toBe(sharedResult);
		expect(loaderResult).toBe("local");
	});
});

describe("storage mode cache behavior", () => {
	test("resetSettingsCache forces fresh read of storage mode", async () => {
		await writeFixture(
			tempDir,
			".rp1/settings.toml",
			`[storage]\nmode = "local"\n`,
		);

		const first = await loadStorageMode(tempDir, isolatedGlobalPath());
		expect(first).toBe("local");

		await writeFixture(
			tempDir,
			".rp1/settings.toml",
			`[storage]\nmode = "central"\n`,
		);

		resetSettingsCache();

		const second = await loadStorageMode(tempDir, isolatedGlobalPath());
		expect(second).toBe("central");
	});
});
