/**
 * Settings file validation.
 * Validates TOML syntax in global and local rp1 settings files,
 * and semantic validation for [models.*] tier remapping sections.
 */

export {
	resolveGlobalSettingsPath,
	resolveLocalSettingsPath,
} from "../../shared/settings.js";

import {
	resolveGlobalSettingsPath,
	resolveLocalSettingsPath,
} from "../../shared/settings.js";

import type { BundleAgentEntry } from "../build/models.js";
import type { BuildPlatform } from "../build/template-context.js";
import {
	getValidModelIdsForPlatform,
	modelSupportsEffort,
} from "../build/tier-resolution.js";
import type { TierRemappingConfig } from "./models.js";
import { VALID_PRESET_NAMES } from "./presets.js";
import { REWRITABLE_PLATFORMS } from "./rewriter.js";

/**
 * Load a single settings file for validation purposes.
 * Returns parsed content status and any TOML parse error details.
 *
 * @param filePath - Absolute path to settings file
 * @returns Object with exists, valid, parsed content, and any error
 */
const loadSettingsFileForValidation = async (
	filePath: string,
): Promise<{
	exists: boolean;
	valid: boolean;
	error?: string;
	line?: number;
}> => {
	const file = Bun.file(filePath);
	const exists = await file.exists();

	if (!exists) {
		return { exists: false, valid: true };
	}

	const text = await file.text();

	try {
		Bun.TOML.parse(text);
		return { exists: true, valid: true };
	} catch (e) {
		const message = e instanceof Error ? e.message : String(e);
		const lineMatch = message.match(/line (\d+)/i);
		const line = lineMatch ? Number.parseInt(lineMatch[1], 10) : undefined;
		return { exists: true, valid: false, error: message, line };
	}
};

/**
 * Validate settings files and return validation result.
 *
 * Checks both global and local settings files for TOML validity.
 *
 * @param cwd - Current working directory for local settings resolution
 * @returns Promise with validation results for both files
 */
export const validateSettings = async (
	cwd: string = process.cwd(),
): Promise<{
	valid: boolean;
	globalFile: {
		path: string;
		exists: boolean;
		valid: boolean;
		error?: string;
		line?: number;
	};
	localFile: {
		path: string;
		exists: boolean;
		valid: boolean;
		error?: string;
		line?: number;
	};
}> => {
	const globalPath = resolveGlobalSettingsPath();
	const localPath = resolveLocalSettingsPath(cwd);

	const [globalResult, localResult] = await Promise.all([
		loadSettingsFileForValidation(globalPath),
		loadSettingsFileForValidation(localPath),
	]);

	const globalFile = {
		path: globalPath,
		exists: globalResult.exists,
		valid: globalResult.valid,
		error: globalResult.error,
		line: globalResult.line,
	};

	const localFile = {
		path: localPath,
		exists: localResult.exists,
		valid: localResult.valid,
		error: localResult.error,
		line: localResult.line,
	};

	const valid = globalFile.valid && localFile.valid;

	return { valid, globalFile, localFile };
};

// ---------------------------------------------------------------------------
// Tier remapping validation
// ---------------------------------------------------------------------------

/** Semantic validation result for [models.*] tier remapping configuration. */
export interface TierRemappingValidationResult {
	readonly valid: boolean;
	readonly errors: readonly string[];
	readonly warnings: readonly string[];
	readonly effortAdjustments: readonly string[];
}

/** Known BuildPlatform values for platform-name validation. */
const KNOWN_PLATFORMS: ReadonlySet<string> = new Set<BuildPlatform>([
	"claude-code",
	"codex",
	"opencode",
	"copilot",
	"antigravity",
]);

/**
 * Validate a tier remapping configuration for correctness.
 *
 * Checks:
 * 1. Preset name (if set) is a known preset.
 * 2. Platform names are known BuildPlatform values (unknown → warning).
 * 3. Platforms without model-field support (copilot, opencode) → warning.
 * 4. Model IDs are valid for the target platform (invalid → error with valid options).
 * 5. Effort compatibility: agents that would have effort stripped (when agent metadata provided).
 *
 * @param config - Parsed tier remapping configuration
 * @param agentEntries - Optional agent manifest entries for effort compatibility preview
 */
export function validateTierRemappings(
	config: TierRemappingConfig,
	agentEntries?: readonly BundleAgentEntry[],
): TierRemappingValidationResult {
	const errors: string[] = [];
	const warnings: string[] = [];
	const effortAdjustments: string[] = [];

	if (
		config.preset !== undefined &&
		!VALID_PRESET_NAMES.includes(
			config.preset as (typeof VALID_PRESET_NAMES)[number],
		)
	) {
		errors.push(
			`Unknown preset '${config.preset}'. Valid presets: ${VALID_PRESET_NAMES.join(", ")}`,
		);
	}

	for (const [platformKey, tierMap] of Object.entries(config.platforms)) {
		if (!KNOWN_PLATFORMS.has(platformKey)) {
			warnings.push(
				`'${platformKey}' is an unknown platform; remapping will be ignored. Known platforms: ${[...KNOWN_PLATFORMS].join(", ")}`,
			);
			continue;
		}

		const platform = platformKey as BuildPlatform;

		if (!REWRITABLE_PLATFORMS.has(platform)) {
			warnings.push(
				`Remapping for '${platform}' will have no effect: installed artifacts for this platform cannot be rewritten`,
			);
			continue;
		}

		if (!tierMap) continue;

		const validIds = getValidModelIdsForPlatform(platform);

		for (const [tier, modelId] of Object.entries(tierMap)) {
			if (!validIds.includes(modelId)) {
				errors.push(
					`Invalid model '${modelId}' for ${platform} tier '${tier}'. Valid models: ${validIds.join(", ")}`,
				);
				continue;
			}

			if (agentEntries && !modelSupportsEffort(modelId, platform)) {
				for (const agent of agentEntries) {
					if (agent.tier === tier && agent.effort !== undefined) {
						effortAdjustments.push(
							`Agent '${agent.name}' (tier: ${tier}, effort: ${agent.effort}) will have effort stripped when remapped to '${modelId}' on ${platform}`,
						);
					}
				}
			}
		}
	}

	return {
		valid: errors.length === 0,
		errors,
		warnings,
		effortAdjustments,
	};
}
