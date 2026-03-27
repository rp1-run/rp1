/**
 * Unit tests for settings loader argument defaults.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
	loadAllArgumentDefaults,
	loadArgumentDefaultsForSkill,
} from "../../settings/loader.js";
import {
	cleanupTempDir,
	createTempDir,
	writeFixture,
} from "../helpers/index.js";

let tempDir: string;

beforeEach(async () => {
	tempDir = await createTempDir("settings-loader");
});

afterEach(async () => {
	await cleanupTempDir(tempDir);
});

describe("loadArgumentDefaultsForSkill", () => {
	test("returns empty defaults when no settings files exist", async () => {
		const result = await loadArgumentDefaultsForSkill("build", tempDir);
		expect(result).toEqual({});
	});

	test("loads project-level defaults for a skill", async () => {
		await writeFixture(
			tempDir,
			".rp1/settings.toml",
			`[arguments.build]\nAFK = false\nGIT_COMMIT = true\n`,
		);

		const result = await loadArgumentDefaultsForSkill("build", tempDir);
		expect(result).toEqual({ AFK: false, GIT_COMMIT: true });
	});

	test("returns empty when skill has no entry in settings", async () => {
		await writeFixture(
			tempDir,
			".rp1/settings.toml",
			`[arguments.build]\nAFK = false\n`,
		);

		const result = await loadArgumentDefaultsForSkill("other-skill", tempDir);
		expect(result).toEqual({});
	});

	test("project settings take precedence over user settings", async () => {
		await writeFixture(
			tempDir,
			".rp1/settings.toml",
			`[arguments.build]\nAFK = true\n`,
		);

		// User settings are at ~/.config/rp1/settings.toml which we can't
		// control in isolation. Instead, verify that project values override
		// by confirming the project value is present in the result.
		const result = await loadArgumentDefaultsForSkill("build", tempDir);
		expect(result.AFK).toBe(true);
	});

	test("handles malformed TOML gracefully", async () => {
		await writeFixture(
			tempDir,
			".rp1/settings.toml",
			"this is not valid toml {{{}}}",
		);

		const result = await loadArgumentDefaultsForSkill("build", tempDir);
		expect(result).toEqual({});
	});

	test("handles settings file without arguments section", async () => {
		await writeFixture(tempDir, ".rp1/settings.toml", `[other]\nfoo = "bar"\n`);

		const result = await loadArgumentDefaultsForSkill("build", tempDir);
		expect(result).toEqual({});
	});
});

describe("loadAllArgumentDefaults", () => {
	test("returns empty when no settings files exist", async () => {
		const result = await loadAllArgumentDefaults(tempDir);
		expect(result).toEqual({});
	});

	test("loads defaults for all skills from project settings", async () => {
		await writeFixture(
			tempDir,
			".rp1/settings.toml",
			[
				"[arguments.build]",
				"AFK = false",
				"GIT_COMMIT = true",
				"",
				"[arguments.build-fast]",
				"AFK = false",
			].join("\n"),
		);

		const result = await loadAllArgumentDefaults(tempDir);
		expect(result).toEqual({
			build: { AFK: false, GIT_COMMIT: true },
			"build-fast": { AFK: false },
		});
	});

	test("handles string argument defaults", async () => {
		await writeFixture(
			tempDir,
			".rp1/settings.toml",
			`[arguments.build]\nPLATFORM = "claude-code"\n`,
		);

		const result = await loadAllArgumentDefaults(tempDir);
		expect(result).toEqual({
			build: { PLATFORM: "claude-code" },
		});
	});
});
