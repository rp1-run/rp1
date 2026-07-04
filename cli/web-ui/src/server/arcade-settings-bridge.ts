/**
 * Arcade settings integration bridge for the daemon.
 *
 * Provides the grace fallback that migrates leftover settings.json files
 * to TOML on daemon startup, and exposes a loader wrapper that uses the
 * canonical TOML settings system (cross-package import from cli/src/settings/,
 * accepted per design tradeoff -- narrow interface: one loader, one writer, one type).
 */

import { existsSync, readFileSync, renameSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { writeArcadeSection } from "../../../src/settings/arcade-writer.js";
import {
	loadArcadeSettings,
	resetSettingsCache,
} from "../../../src/settings/loader.js";
import type { ArcadeSettings } from "../../../src/settings/models.js";

export type { ArcadeSettings };
export { loadArcadeSettings, resetSettingsCache };

/** Result of the grace fallback migration attempt. */
export interface GraceFallbackResult {
	readonly migrated: boolean;
	readonly migratedPaths: readonly string[];
}

/** Injection points for the grace fallback, enabling hermetic testing. */
export interface GraceFallbackDeps {
	readonly projectRoot: string;
	readonly globalSettingsPath?: string;
	readonly globalJsonPath?: string;
	readonly projectJsonPath?: string;
}

/** Default global JSON path matching the legacy settings-loader convention. */
const defaultGlobalJsonPath = (): string =>
	join(homedir(), ".config", "rp1", "settings.json");

/** Default project JSON path matching the legacy settings-loader convention. */
const defaultProjectJsonPath = (projectRoot: string): string =>
	join(projectRoot, ".rp1", "settings.json");

/** Default global TOML path for writeArcadeSection target. */
const defaultGlobalTomlPath = (): string =>
	join(homedir(), ".config", "rp1", "settings.toml");

/** Default project TOML path for writeArcadeSection target. */
const defaultProjectTomlPath = (projectRoot: string): string =>
	join(projectRoot, ".rp1", "settings.toml");

/**
 * Read a legacy settings.json and extract arcade-relevant fields.
 * Returns null on parse failure or if the file has no useful arcade fields.
 */
function readLegacyJsonSettings(
	jsonPath: string,
): Partial<ArcadeSettings> | null {
	try {
		const content = readFileSync(jsonPath, "utf-8");
		const parsed = JSON.parse(content) as Record<string, unknown>;

		const result: {
			theme?: ArcadeSettings["theme"];
			downsampling?: { thresholdHours: number };
		} = {};

		if (
			typeof parsed.theme === "string" &&
			(parsed.theme === "light" ||
				parsed.theme === "dark" ||
				parsed.theme === "system")
		) {
			result.theme = parsed.theme;
		}

		if (
			parsed.downsampling !== null &&
			typeof parsed.downsampling === "object"
		) {
			const ds = parsed.downsampling as Record<string, unknown>;
			if (typeof ds.thresholdHours === "number") {
				result.downsampling = { thresholdHours: ds.thresholdHours };
			}
		}

		if (result.theme === undefined && result.downsampling === undefined) {
			return null;
		}

		return result;
	} catch {
		return null;
	}
}

/**
 * Migrate a single legacy JSON settings file to the TOML [arcade] section.
 *
 * - Reads arcade fields from the JSON file
 * - Writes them to the corresponding TOML file via writeArcadeSection
 *   (which preserves existing TOML content and does not overwrite existing keys)
 * - Renames the JSON file to `.migrated`
 *
 * Returns the JSON path if migration succeeded, null otherwise.
 */
function migrateSingleJsonFile(
	jsonPath: string,
	tomlPath: string,
): string | null {
	if (!existsSync(jsonPath)) {
		return null;
	}

	const arcadeFields = readLegacyJsonSettings(jsonPath);
	if (arcadeFields === null) {
		return null;
	}

	writeArcadeSection(tomlPath, arcadeFields);
	renameSync(jsonPath, `${jsonPath}.migrated`);
	return jsonPath;
}

/**
 * Grace fallback: detect leftover settings.json files (global and project-level),
 * migrate their arcade fields into the corresponding settings.toml, rename the
 * originals to `.migrated`, and invalidate the settings cache.
 *
 * This function is designed to run once on daemon startup to bridge the
 * transition for users who have not yet run `rp1 migrate`.
 *
 * @param deps - Injection points for paths (production defaults resolve automatically)
 * @returns Result indicating whether any migration occurred and which paths were migrated
 */
export async function performArcadeGraceFallback(
	deps: GraceFallbackDeps,
): Promise<GraceFallbackResult> {
	const globalJsonPath = deps.globalJsonPath ?? defaultGlobalJsonPath();
	const projectJsonPath =
		deps.projectJsonPath ?? defaultProjectJsonPath(deps.projectRoot);
	const globalTomlPath = deps.globalSettingsPath ?? defaultGlobalTomlPath();
	const projectTomlPath = defaultProjectTomlPath(deps.projectRoot);

	const migratedPaths: string[] = [];

	// Migrate global JSON first (user-level)
	const globalResult = migrateSingleJsonFile(globalJsonPath, globalTomlPath);
	if (globalResult) {
		migratedPaths.push(globalResult);
	}

	// Migrate project-level JSON
	const projectResult = migrateSingleJsonFile(projectJsonPath, projectTomlPath);
	if (projectResult) {
		migratedPaths.push(projectResult);
	}

	if (migratedPaths.length > 0) {
		resetSettingsCache();
	}

	return {
		migrated: migratedPaths.length > 0,
		migratedPaths,
	};
}

/**
 * Load arcade settings with grace fallback for the daemon.
 *
 * 1. Attempts grace fallback (migrate any leftover JSON files)
 * 2. Loads arcade settings from the canonical TOML system
 * 3. Returns the resolved settings and whether migration occurred
 */
export async function loadArcadeSettingsWithFallback(
	projectRoot: string,
	globalSettingsPath?: string,
): Promise<{ settings: ArcadeSettings; fallbackTriggered: boolean }> {
	const fallbackResult = await performArcadeGraceFallback({
		projectRoot,
		globalSettingsPath,
	});

	if (fallbackResult.migrated) {
		console.log(
			`[settings] Migrated legacy Arcade settings.json to settings.toml (${fallbackResult.migratedPaths.length} file(s)). ` +
				"Run `rp1 migrate` to migrate project-level settings explicitly.",
		);
	}

	const settings = await loadArcadeSettings(projectRoot, globalSettingsPath);

	return { settings, fallbackTriggered: fallbackResult.migrated };
}
