import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	type MigrateArcadeSettingsOptions,
	migrateArcadeSettings,
} from "../../migrate/arcade-settings.js";

describe("migrateArcadeSettings", () => {
	let tempDir: string;
	let globalConfigDir: string;
	let projectRoot: string;

	beforeEach(async () => {
		tempDir = join(
			tmpdir(),
			`rp1-arcade-migrate-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
		);
		globalConfigDir = join(tempDir, "global-config", "rp1");
		projectRoot = join(tempDir, "project");
		await mkdir(globalConfigDir, { recursive: true });
		await mkdir(join(projectRoot, ".rp1"), { recursive: true });
	});

	afterEach(async () => {
		await rm(tempDir, { recursive: true, force: true });
	});

	const opts = (
		overrides?: Partial<MigrateArcadeSettingsOptions>,
	): MigrateArcadeSettingsOptions => ({
		projectRoot,
		globalConfigDir,
		...overrides,
	});

	test("no-ops when no settings.json exists at either path", async () => {
		const result = await migrateArcadeSettings(opts());

		expect(result.globalMigrated).toBe(false);
		expect(result.projectMigrated).toBe(false);
	});

	test("migrates global settings.json to settings.toml [arcade] section", async () => {
		const jsonPath = join(globalConfigDir, "settings.json");
		await writeFile(
			jsonPath,
			JSON.stringify({
				version: 1,
				theme: "dark",
				downsampling: { thresholdHours: 48 },
			}),
		);

		const result = await migrateArcadeSettings(opts());

		expect(result.globalMigrated).toBe(true);
		expect(result.globalJsonPath).toBe(jsonPath);

		const tomlPath = join(globalConfigDir, "settings.toml");
		expect(existsSync(tomlPath)).toBe(true);
		const tomlContent = readFileSync(tomlPath, "utf-8");
		expect(tomlContent).toContain("[arcade]");
		expect(tomlContent).toContain('theme = "dark"');
		expect(tomlContent).toContain("[arcade.downsampling]");
		expect(tomlContent).toContain("thresholdHours = 48");

		expect(existsSync(join(globalConfigDir, "settings.json.migrated"))).toBe(
			true,
		);
		expect(existsSync(jsonPath)).toBe(false);
	});

	test("migrates project-level settings.json to settings.toml", async () => {
		const jsonPath = join(projectRoot, ".rp1", "settings.json");
		await writeFile(jsonPath, JSON.stringify({ version: 1, theme: "light" }));

		const result = await migrateArcadeSettings(opts());

		expect(result.projectMigrated).toBe(true);
		expect(result.projectJsonPath).toBe(jsonPath);

		const tomlPath = join(projectRoot, ".rp1", "settings.toml");
		expect(existsSync(tomlPath)).toBe(true);
		const tomlContent = readFileSync(tomlPath, "utf-8");
		expect(tomlContent).toContain("[arcade]");
		expect(tomlContent).toContain('theme = "light"');

		expect(
			existsSync(join(projectRoot, ".rp1", "settings.json.migrated")),
		).toBe(true);
		expect(existsSync(jsonPath)).toBe(false);
	});

	test("merges into existing TOML without overwriting existing arcade entries", async () => {
		const tomlPath = join(globalConfigDir, "settings.toml");
		await writeFile(tomlPath, '[arcade]\ntheme = "system"\n');

		const jsonPath = join(globalConfigDir, "settings.json");
		await writeFile(
			jsonPath,
			JSON.stringify({
				version: 1,
				theme: "dark",
				downsampling: { thresholdHours: 72 },
			}),
		);

		const result = await migrateArcadeSettings(opts());

		expect(result.globalMigrated).toBe(true);

		const tomlContent = readFileSync(tomlPath, "utf-8");
		expect(tomlContent).toContain('theme = "system"');
		expect(tomlContent).not.toContain('theme = "dark"');
		expect(tomlContent).toContain("thresholdHours = 72");
	});

	test("preserves existing comments in TOML when merging", async () => {
		const tomlPath = join(globalConfigDir, "settings.toml");
		const existingContent =
			'# User model preferences\n[models.claude-code]\nfrontier = "claude-sonnet-4-20250514"\n';
		await writeFile(tomlPath, existingContent);

		const jsonPath = join(globalConfigDir, "settings.json");
		await writeFile(jsonPath, JSON.stringify({ version: 1, theme: "dark" }));

		await migrateArcadeSettings(opts());

		const tomlContent = readFileSync(tomlPath, "utf-8");
		expect(tomlContent).toContain("# User model preferences");
		expect(tomlContent).toContain("[models.claude-code]");
		expect(tomlContent).toContain('frontier = "claude-sonnet-4-20250514"');
		expect(tomlContent).toContain("[arcade]");
		expect(tomlContent).toContain('theme = "dark"');
	});

	test("dry-run reports what would change without modifying files", async () => {
		const jsonPath = join(globalConfigDir, "settings.json");
		await writeFile(jsonPath, JSON.stringify({ version: 1, theme: "dark" }));

		const result = await migrateArcadeSettings(opts({ dryRun: true }));

		expect(result.globalMigrated).toBe(true);
		expect(result.globalJsonPath).toBe(jsonPath);

		expect(existsSync(jsonPath)).toBe(true);
		expect(existsSync(join(globalConfigDir, "settings.toml"))).toBe(false);
		expect(existsSync(join(globalConfigDir, "settings.json.migrated"))).toBe(
			false,
		);
	});

	test("migrates both global and project JSON files in a single call", async () => {
		const globalJson = join(globalConfigDir, "settings.json");
		const projectJson = join(projectRoot, ".rp1", "settings.json");
		await writeFile(globalJson, JSON.stringify({ version: 1, theme: "dark" }));
		await writeFile(
			projectJson,
			JSON.stringify({ version: 1, theme: "light" }),
		);

		const result = await migrateArcadeSettings(opts());

		expect(result.globalMigrated).toBe(true);
		expect(result.projectMigrated).toBe(true);
		expect(existsSync(join(globalConfigDir, "settings.json.migrated"))).toBe(
			true,
		);
		expect(
			existsSync(join(projectRoot, ".rp1", "settings.json.migrated")),
		).toBe(true);
	});

	test("handles malformed JSON gracefully without crashing", async () => {
		const jsonPath = join(globalConfigDir, "settings.json");
		await writeFile(jsonPath, "not valid json {{{");

		const result = await migrateArcadeSettings(opts());

		expect(result.globalMigrated).toBe(false);
		expect(existsSync(jsonPath)).toBe(true);
	});

	test("ignores unknown fields in JSON and only migrates arcade-relevant ones", async () => {
		const jsonPath = join(globalConfigDir, "settings.json");
		await writeFile(
			jsonPath,
			JSON.stringify({
				version: 1,
				theme: "dark",
				unknownField: "value",
				downsampling: { thresholdHours: 36, otherProp: true },
			}),
		);

		const result = await migrateArcadeSettings(opts());

		expect(result.globalMigrated).toBe(true);
		const tomlContent = readFileSync(
			join(globalConfigDir, "settings.toml"),
			"utf-8",
		);
		expect(tomlContent).toContain('theme = "dark"');
		expect(tomlContent).toContain("thresholdHours = 36");
		expect(tomlContent).not.toContain("unknownField");
		expect(tomlContent).not.toContain("otherProp");
	});
});
