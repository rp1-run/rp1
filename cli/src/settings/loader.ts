/**
 * Settings loader for argument defaults.
 * Loads and merges argument defaults from project-level and user-level
 * TOML settings files, with project settings taking precedence.
 */

import {
	resolveGlobalSettingsPath,
	resolveLocalSettingsPath,
} from "./validator.js";

/** Argument defaults for a single skill/agent, keyed by UPPER_SNAKE_CASE argument name. */
export type ArgumentDefaults = Readonly<
	Record<string, string | boolean | number>
>;

/** All argument defaults from a settings file, keyed by skill/agent name. */
export type SettingsArgumentDefaults = Readonly<
	Record<string, ArgumentDefaults>
>;

/**
 * Load and parse a TOML settings file, extracting the `[arguments.*]` tables.
 * Returns an empty record when the file is missing or malformed.
 */
const loadArgumentsFromFile = async (
	filePath: string,
): Promise<SettingsArgumentDefaults> => {
	const file = Bun.file(filePath);
	const exists = await file.exists();

	if (!exists) {
		return {};
	}

	try {
		const text = await file.text();
		const parsed = Bun.TOML.parse(text) as Record<string, unknown>;
		const argumentsSection = parsed.arguments;

		if (
			argumentsSection === undefined ||
			argumentsSection === null ||
			typeof argumentsSection !== "object"
		) {
			return {};
		}

		const result: Record<string, ArgumentDefaults> = {};

		for (const [skillName, table] of Object.entries(
			argumentsSection as Record<string, unknown>,
		)) {
			if (
				table !== null &&
				typeof table === "object" &&
				!Array.isArray(table)
			) {
				result[skillName] = table as ArgumentDefaults;
			}
		}

		return result;
	} catch {
		return {};
	}
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

	const userSkillDefaults = userDefaults[skillName] ?? {};
	const projectSkillDefaults = projectDefaults[skillName] ?? {};

	return { ...userSkillDefaults, ...projectSkillDefaults };
};

/**
 * Load all argument defaults from both project-level and user-level settings
 * files, merged across all skills.
 *
 * Merge precedence: project settings > user settings (per-skill, per-argument).
 *
 * @param projectRoot - Project root directory (contains `.rp1/`)
 * @returns Merged argument defaults keyed by skill name
 */
export const loadAllArgumentDefaults = async (
	projectRoot: string,
): Promise<SettingsArgumentDefaults> => {
	const [projectDefaults, userDefaults] = await Promise.all([
		loadArgumentsFromFile(resolveLocalSettingsPath(projectRoot)),
		loadArgumentsFromFile(resolveGlobalSettingsPath()),
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
