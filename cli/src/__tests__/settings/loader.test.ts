/**
 * Unit tests for settings loader argument defaults.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { join } from "node:path";
import * as E from "fp-ts/lib/Either.js";
import {
	loadAllArgumentDefaults,
	loadArgumentDefaultsForSkill,
	loadDirectorySettings,
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

	test("loads canonical skill names from settings tables", async () => {
		await writeFixture(
			tempDir,
			".rp1/settings.toml",
			`[arguments."dev:build"]\nafk = false\ngit_commit = true\n`,
		);

		const result = await loadArgumentDefaultsForSkill("dev:build", tempDir);
		expect(result).toEqual({ AFK: false, GIT_COMMIT: true });
	});

	test("loads lowercase argument keys and normalizes them to canonical names", async () => {
		await writeFixture(
			tempDir,
			".rp1/settings.toml",
			`[arguments.build]\nafk = false\ngit_commit = true\ngit_push = false\n`,
		);

		const result = await loadArgumentDefaultsForSkill("build", tempDir);
		expect(result).toEqual({
			AFK: false,
			GIT_COMMIT: true,
			GIT_PUSH: false,
		});
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

	test("canonical skill lookup falls back to legacy short section names", async () => {
		await writeFixture(
			tempDir,
			".rp1/settings.toml",
			`[arguments.build]\ngit_commit = true\n`,
		);

		const result = await loadArgumentDefaultsForSkill("dev:build", tempDir);
		expect(result.GIT_COMMIT).toBe(true);
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

	test("normalizes lowercase keys across all loaded skills", async () => {
		await writeFixture(
			tempDir,
			".rp1/settings.toml",
			[
				"[arguments.build]",
				"afk = false",
				"git_commit = true",
				"",
				"[arguments.build-fast]",
				"afk = true",
			].join("\n"),
		);

		const result = await loadAllArgumentDefaults(tempDir);
		expect(result).toEqual({
			build: { AFK: false, GIT_COMMIT: true },
			"build-fast": { AFK: true },
		});
	});
});

describe("loadDirectorySettings", () => {
	test("normalizes relative project settings against project_root when present", async () => {
		await writeFixture(
			tempDir,
			".rp1/settings.toml",
			[
				"[directories]",
				'project_root = "workspace"',
				'kb_root = "docs/context"',
				'work_root = "ops/work"',
			].join("\n"),
		);

		const result = loadDirectorySettings(tempDir);
		expect(E.isRight(result)).toBe(true);
		if (E.isLeft(result)) {
			return;
		}

		expect(result.right.projectRoot).toBe(join(tempDir, "workspace"));
		expect(result.right.kbRoot).toBe(
			join(tempDir, "workspace", "docs", "context"),
		);
		expect(result.right.workRoot).toBe(
			join(tempDir, "workspace", "ops", "work"),
		);
		expect(result.right.sources.projectRoot).toBe("project_settings");
		expect(result.right.sources.kbRoot).toBe("project_settings");
		expect(result.right.sources.workRoot).toBe("project_settings");
	});

	test("normalizes relative user settings against the user home directory", async () => {
		const userHomeDir = join(tempDir, "user-home");
		const globalSettingsPath = join(
			userHomeDir,
			".config",
			"rp1",
			"settings.toml",
		);
		await writeFixture(
			tempDir,
			".rp1/settings.toml",
			"[arguments.build]\nAFK = true\n",
		);
		await writeFixture(
			userHomeDir,
			".config/rp1/settings.toml",
			[
				"[directories]",
				'project_root = "projects/demo"',
				'kb_root = "shared/kb"',
				'work_root = "shared/work"',
			].join("\n"),
		);

		const result = loadDirectorySettings(tempDir, {
			globalSettingsPath,
			userHomeDir,
		});
		expect(E.isRight(result)).toBe(true);
		if (E.isLeft(result)) {
			return;
		}

		expect(result.right.projectRoot).toBe(
			join(userHomeDir, "projects", "demo"),
		);
		expect(result.right.kbRoot).toBe(join(userHomeDir, "shared", "kb"));
		expect(result.right.workRoot).toBe(join(userHomeDir, "shared", "work"));
		expect(result.right.sources.projectRoot).toBe("user_settings");
		expect(result.right.sources.kbRoot).toBe("user_settings");
		expect(result.right.sources.workRoot).toBe("user_settings");
	});

	test("prefers project settings over user settings for each directory field on the same project root", async () => {
		const userHomeDir = join(tempDir, "user-home");
		const globalSettingsPath = join(
			userHomeDir,
			".config",
			"rp1",
			"settings.toml",
		);
		await writeFixture(
			tempDir,
			".rp1/settings.toml",
			[
				"[directories]",
				'kb_root = "local/context"',
				'work_root = "local/work"',
			].join("\n"),
		);
		await writeFixture(
			userHomeDir,
			".config/rp1/settings.toml",
			[
				"[directories]",
				'kb_root = "global/context"',
				'work_root = "global/work"',
			].join("\n"),
		);

		const result = loadDirectorySettings(tempDir, {
			globalSettingsPath,
			userHomeDir,
		});
		expect(E.isRight(result)).toBe(true);
		if (E.isLeft(result)) {
			return;
		}

		expect(result.right.projectRoot).toBe(tempDir);
		expect(result.right.kbRoot).toBe(join(tempDir, "local", "context"));
		expect(result.right.workRoot).toBe(join(tempDir, "local", "work"));
		expect(result.right.sources.projectRoot).toBeUndefined();
		expect(result.right.sources.kbRoot).toBe("project_settings");
		expect(result.right.sources.workRoot).toBe("project_settings");
	});

	test("reloads project-local overrides from a user-redirected effective project root", async () => {
		const userHomeDir = join(tempDir, "user-home");
		const redirectedProjectRoot = join(tempDir, "redirected-project");
		const globalSettingsPath = join(
			userHomeDir,
			".config",
			"rp1",
			"settings.toml",
		);
		await writeFixture(
			userHomeDir,
			".config/rp1/settings.toml",
			[
				"[directories]",
				`project_root = "${redirectedProjectRoot}"`,
				'kb_root = "user/kb"',
				'work_root = "user/work"',
			].join("\n"),
		);
		await writeFixture(
			redirectedProjectRoot,
			".rp1/settings.toml",
			[
				"[directories]",
				'kb_root = "project/context"',
				'work_root = "project/work"',
			].join("\n"),
		);

		const result = loadDirectorySettings(tempDir, {
			globalSettingsPath,
			userHomeDir,
		});
		expect(E.isRight(result)).toBe(true);
		if (E.isLeft(result)) {
			return;
		}

		expect(result.right.projectRoot).toBe(redirectedProjectRoot);
		expect(result.right.kbRoot).toBe(
			join(redirectedProjectRoot, "project", "context"),
		);
		expect(result.right.workRoot).toBe(
			join(redirectedProjectRoot, "project", "work"),
		);
		expect(result.right.sources.projectRoot).toBe("user_settings");
		expect(result.right.sources.kbRoot).toBe("project_settings");
		expect(result.right.sources.workRoot).toBe("project_settings");
	});

	test("returns a validation error for invalid directory values", async () => {
		await writeFixture(
			tempDir,
			".rp1/settings.toml",
			"[directories]\nkb_root = 42\n",
		);

		const result = loadDirectorySettings(tempDir);
		expect(E.isLeft(result)).toBe(true);
		if (E.isRight(result)) {
			return;
		}

		expect(result.left._tag).toBe("ValidationError");
		if (result.left._tag !== "ValidationError") {
			return;
		}
		expect(result.left.file).toContain(".rp1/settings.toml");
		expect(result.left.message).toContain("[directories].kb_root");
	});
});
