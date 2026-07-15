import { existsSync, readFileSync, renameSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { writeArcadeSection } from "../settings/arcade-writer.js";
import type { ArcadeSettings } from "../settings/models.js";
import { VALID_ARCADE_THEMES } from "../settings/models.js";

export interface ArcadeSettingsMigrationResult {
	readonly globalMigrated: boolean;
	readonly projectMigrated: boolean;
	readonly globalJsonPath?: string;
	readonly projectJsonPath?: string;
}

export interface MigrateArcadeSettingsOptions {
	readonly projectRoot: string;
	readonly dryRun?: boolean;
	/** Override the global config directory for test isolation (defaults to ~/.config/rp1). */
	readonly globalConfigDir?: string;
}

/**
 * Parse a legacy settings.json and extract only the arcade-relevant fields.
 * Returns null if the JSON is malformed or contains no arcade-relevant data.
 */
function parseJsonSettings(content: string): Partial<ArcadeSettings> | null {
	try {
		const parsed = JSON.parse(content) as Record<string, unknown>;
		if (typeof parsed !== "object" || parsed === null) return null;

		const result: {
			theme?: ArcadeSettings["theme"];
			downsampling?: { thresholdHours: number };
		} = {};

		let hasArcadeData = false;

		if (
			typeof parsed.theme === "string" &&
			(VALID_ARCADE_THEMES as readonly string[]).includes(parsed.theme)
		) {
			result.theme = parsed.theme as ArcadeSettings["theme"];
			hasArcadeData = true;
		}

		if (
			typeof parsed.downsampling === "object" &&
			parsed.downsampling !== null
		) {
			const ds = parsed.downsampling as Record<string, unknown>;
			if (typeof ds.thresholdHours === "number") {
				result.downsampling = { thresholdHours: ds.thresholdHours };
				hasArcadeData = true;
			}
		}

		return hasArcadeData ? result : null;
	} catch {
		return null;
	}
}

/**
 * Resolve the global config directory, using the DI seam or the real path.
 */
function resolveGlobalConfigDir(globalConfigDir?: string): string {
	return globalConfigDir ?? join(homedir(), ".config", "rp1");
}

/**
 * Migrate a single settings.json file to the corresponding settings.toml.
 * Returns true if migration occurred, false otherwise.
 *
 * When `dryRun` is true, detects and reports but does not modify files.
 */
function migrateSingleJson(
	jsonPath: string,
	tomlPath: string,
	dryRun: boolean,
): boolean {
	if (!existsSync(jsonPath)) return false;

	const content = readFileSync(jsonPath, "utf-8");
	const arcadeSettings = parseJsonSettings(content);
	if (arcadeSettings === null) return false;

	if (dryRun) return true;

	writeArcadeSection(tomlPath, arcadeSettings);
	renameSync(jsonPath, `${jsonPath}.migrated`);
	return true;
}

/**
 * Migrate Arcade settings from legacy JSON files to the canonical TOML system.
 *
 * Detects `settings.json` at both global (~/.config/rp1/) and project-level
 * (.rp1/) paths, reads their arcade-relevant fields, writes them to the
 * corresponding `settings.toml` `[arcade]` section via the comment-preserving
 * writer, and renames the original JSON to `.migrated`.
 *
 * When TOML already has an `[arcade]` section, only missing keys are merged
 * (existing TOML entries are never overwritten).
 */
export async function migrateArcadeSettings(
	options: MigrateArcadeSettingsOptions,
): Promise<ArcadeSettingsMigrationResult> {
	const { projectRoot, dryRun = false, globalConfigDir } = options;

	const globalDir = resolveGlobalConfigDir(globalConfigDir);
	const globalJsonPath = join(globalDir, "settings.json");
	const globalTomlPath = join(globalDir, "settings.toml");

	const projectJsonPath = join(projectRoot, ".rp1", "settings.json");
	const projectTomlPath = join(projectRoot, ".rp1", "settings.toml");

	const globalMigrated = migrateSingleJson(
		globalJsonPath,
		globalTomlPath,
		dryRun,
	);
	const projectMigrated = migrateSingleJson(
		projectJsonPath,
		projectTomlPath,
		dryRun,
	);

	return {
		globalMigrated,
		projectMigrated,
		...(globalMigrated ? { globalJsonPath } : {}),
		...(projectMigrated ? { projectJsonPath } : {}),
	};
}
