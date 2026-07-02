import { existsSync, readFileSync } from "node:fs";
import {
	resolveGlobalSettingsPath,
	resolveLocalSettingsPath,
} from "../../shared/settings.js";
import { VALID_MODEL_TIERS } from "../build/models.js";
import type { BuildPlatform } from "../build/template-context.js";
import type { PlatformTierMap, TierRemappingConfig } from "./models.js";

/** Argument defaults for a single skill/agent, keyed by UPPER_SNAKE_CASE argument name. */
export type ArgumentDefaults = Readonly<
	Record<string, string | boolean | number>
>;

/** All argument defaults from a settings file, keyed by skill/agent name. */
export type SettingsArgumentDefaults = Readonly<
	Record<string, ArgumentDefaults>
>;

/** Parsed models section from a single settings file. */
type ParsedModelsSection = Readonly<{
	preset?: string;
	platforms: Readonly<Partial<Record<BuildPlatform, PlatformTierMap>>>;
}>;

type ParsedSettingsFile = Readonly<{
	arguments: SettingsArgumentDefaults;
	directories: Record<string, never>;
	models: ParsedModelsSection;
}>;

const isPlainRecord = (
	value: unknown,
): value is Readonly<Record<string, unknown>> =>
	value !== null && typeof value === "object" && !Array.isArray(value);

// Lifetime assumption: agent-tools processes are single-invocation, so this
// module-level cache never needs runtime invalidation. A long-lived consumer
// (daemon, watcher) must call resetSettingsCache() on settings changes.
const settingsCache = new Map<string, ParsedSettingsFile>();

/** Clear the in-memory settings cache. Call in test `beforeEach` for isolation. */
export const resetSettingsCache = (): void => {
	settingsCache.clear();
};

const UPPER_SNAKE_CASE_PATTERN = /^[A-Z][A-Z0-9_]*$/;
const LOWER_CONFIG_KEY_PATTERN = /^[a-z][a-z0-9_-]*$/;

const normalizeArgumentKey = (key: string): string => {
	if (UPPER_SNAKE_CASE_PATTERN.test(key)) {
		return key;
	}

	if (LOWER_CONFIG_KEY_PATTERN.test(key)) {
		return key.replace(/-/g, "_").toUpperCase();
	}

	return key;
};

/** Reserved keys under [models] that are not platform names. */
const MODELS_RESERVED_KEYS = new Set(["preset"]);

/** Known tier keys that map to model identifiers (derived from canonical source). */
const TIER_KEYS: ReadonlySet<string> = new Set(
	VALID_MODEL_TIERS.filter((t) => t !== "inherit"),
);

/**
 * Extract tier-to-model mappings from a platform sub-table under [models].
 * Only string values for known tier keys are included; other entries are ignored.
 */
const parsePlatformTierMap = (
	table: Readonly<Record<string, unknown>>,
): PlatformTierMap | null => {
	const map: Record<string, string> = {};
	let hasEntries = false;

	for (const [key, value] of Object.entries(table)) {
		if (TIER_KEYS.has(key) && typeof value === "string") {
			map[key] = value;
			hasEntries = true;
		}
	}

	return hasEntries ? (map as PlatformTierMap) : null;
};

/**
 * Extract the models section from parsed TOML.
 * Handles both `[models]` (preset) and `[models.<platform>]` (tier mappings).
 */
const parseModelsSection = (
	parsed: Record<string, unknown>,
): ParsedModelsSection => {
	const modelsSection = parsed.models;
	const emptyModels: ParsedModelsSection = { platforms: {} };

	if (!isPlainRecord(modelsSection)) {
		return emptyModels;
	}

	const preset =
		typeof modelsSection.preset === "string" ? modelsSection.preset : undefined;

	const platforms: Record<string, PlatformTierMap> = {};

	for (const [key, value] of Object.entries(modelsSection)) {
		if (MODELS_RESERVED_KEYS.has(key)) continue;
		if (!isPlainRecord(value)) continue;

		const tierMap = parsePlatformTierMap(value);
		if (tierMap) {
			platforms[key] = tierMap;
		}
	}

	return { preset, platforms };
};

const parseSettingsFileStrict = (filePath: string): ParsedSettingsFile => {
	const cached = settingsCache.get(filePath);
	if (cached) {
		return cached;
	}

	if (!existsSync(filePath)) {
		const empty: ParsedSettingsFile = {
			arguments: {},
			directories: {},
			models: { platforms: {} },
		};
		settingsCache.set(filePath, empty);
		return empty;
	}

	try {
		const text = readFileSync(filePath, "utf-8");
		const parsed = Bun.TOML.parse(text) as Record<string, unknown>;
		const argumentsSection = parsed.arguments;
		const argumentDefaults: Record<string, ArgumentDefaults> = {};

		if (isPlainRecord(argumentsSection)) {
			for (const [skillName, table] of Object.entries(argumentsSection)) {
				if (isPlainRecord(table)) {
					const filteredDefaults: Record<string, string | boolean | number> =
						{};
					for (const [key, value] of Object.entries(table)) {
						if (
							typeof value === "string" ||
							typeof value === "boolean" ||
							typeof value === "number"
						) {
							const normalizedKey = normalizeArgumentKey(key);
							if (normalizedKey in filteredDefaults) {
								continue;
							}
							filteredDefaults[normalizedKey] = value;
						}
					}
					argumentDefaults[skillName] = filteredDefaults;
				}
			}
		}

		const models = parseModelsSection(parsed);

		const result: ParsedSettingsFile = {
			arguments: argumentDefaults,
			directories: {},
			models,
		};
		settingsCache.set(filePath, result);
		return result;
	} catch {
		const empty: ParsedSettingsFile = {
			arguments: {},
			directories: {},
			models: { platforms: {} },
		};
		settingsCache.set(filePath, empty);
		return empty;
	}
};

/**
 * Load and parse a TOML settings file, extracting the `[arguments.*]` tables.
 * Returns an empty record when the file is missing or malformed.
 */
const loadArgumentsFromFile = async (
	filePath: string,
): Promise<SettingsArgumentDefaults> => {
	return parseSettingsFileStrict(filePath).arguments;
};

const getLegacySkillAlias = (skillName: string): string | undefined => {
	const colonIndex = skillName.indexOf(":");
	if (colonIndex < 0 || colonIndex === skillName.length - 1) {
		return undefined;
	}
	return skillName.slice(colonIndex + 1);
};

/**
 * Load argument defaults for a specific skill/agent from both project-level
 * and user-level settings files.
 *
 * Merge precedence: project settings > user settings.
 *
 * @param skillName - The skill or agent name to look up (e.g., "build")
 * @param projectRoot - Project root directory (contains `.rp1/`)
 * @returns Merged argument defaults for the given skill
 */
export const loadArgumentDefaultsForSkill = async (
	skillName: string,
	projectRoot: string,
): Promise<ArgumentDefaults> => {
	const [projectDefaults, userDefaults] = await Promise.all([
		loadArgumentsFromFile(resolveLocalSettingsPath(projectRoot)),
		loadArgumentsFromFile(resolveGlobalSettingsPath()),
	]);

	const legacySkillName = getLegacySkillAlias(skillName);
	const userSkillDefaults = {
		...(legacySkillName ? (userDefaults[legacySkillName] ?? {}) : {}),
		...(userDefaults[skillName] ?? {}),
	};
	const projectSkillDefaults = {
		...(legacySkillName ? (projectDefaults[legacySkillName] ?? {}) : {}),
		...(projectDefaults[skillName] ?? {}),
	};

	return { ...userSkillDefaults, ...projectSkillDefaults };
};

/**
 * Load all argument defaults from both project-level and user-level settings
 * files, merged across all skills.
 *
 * Merge precedence: project settings > user settings (per-skill, per-argument).
 *
 * @param projectRoot - Project root directory (contains `.rp1/`)
 * @param globalSettingsPath - Override path to user-level settings file (defaults to ~/.config/rp1/settings.toml). Exposed for test isolation.
 * @returns Merged argument defaults keyed by skill name
 */
export const loadAllArgumentDefaults = async (
	projectRoot: string,
	globalSettingsPath?: string,
): Promise<SettingsArgumentDefaults> => {
	const [projectDefaults, userDefaults] = await Promise.all([
		loadArgumentsFromFile(resolveLocalSettingsPath(projectRoot)),
		loadArgumentsFromFile(globalSettingsPath ?? resolveGlobalSettingsPath()),
	]);

	const allSkillNames = new Set([
		...Object.keys(userDefaults),
		...Object.keys(projectDefaults),
	]);

	const result: Record<string, ArgumentDefaults> = {};

	for (const name of allSkillNames) {
		const userSkill = userDefaults[name] ?? {};
		const projectSkill = projectDefaults[name] ?? {};
		result[name] = { ...userSkill, ...projectSkill };
	}

	return result;
};

/**
 * Load the `[models]` section from a single settings file.
 * Returns the parsed models section when present, or an empty structure.
 */
const loadModelsFromFile = (filePath: string): ParsedModelsSection => {
	return parseSettingsFileStrict(filePath).models;
};

/**
 * Merge two platform tier maps, where `override` entries take precedence
 * over `base` entries for the same tier.
 */
const mergePlatformTierMaps = (
	base: PlatformTierMap,
	override: PlatformTierMap,
): PlatformTierMap => {
	return { ...base, ...override };
};

/**
 * Load tier remapping configuration from both project-level and user-level
 * settings files.
 *
 * Merge precedence: project settings > user settings (per-platform, per-tier).
 * Project-level preset overrides user-level preset.
 *
 * @param projectRoot - Project root directory (contains `.rp1/`)
 * @returns Merged tier remapping configuration
 */
export const loadTierRemappings = async (
	projectRoot: string,
): Promise<TierRemappingConfig> => {
	const projectModels = loadModelsFromFile(
		resolveLocalSettingsPath(projectRoot),
	);
	const userModels = loadModelsFromFile(resolveGlobalSettingsPath());

	const preset = projectModels.preset ?? userModels.preset;

	const allPlatforms = new Set([
		...Object.keys(userModels.platforms),
		...Object.keys(projectModels.platforms),
	]);

	const platforms: Record<string, PlatformTierMap> = {};

	for (const platform of allPlatforms) {
		const userMap = userModels.platforms[platform as BuildPlatform];
		const projectMap = projectModels.platforms[platform as BuildPlatform];

		if (userMap && projectMap) {
			platforms[platform] = mergePlatformTierMaps(userMap, projectMap);
		} else {
			platforms[platform] = (projectMap ?? userMap)!;
		}
	}

	return { preset, platforms };
};
