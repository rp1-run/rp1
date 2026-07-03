/**
 * Blessed preset configurations for tier-to-model remapping.
 *
 * Ships three presets (budget, standard, premium) that define complete
 * tier-to-model mappings per platform. The premium preset matches the
 * current TIER_MODEL_MAP build defaults so users can verify their
 * install matches the shipped configuration.
 */

import type { ModelTier } from "../build/models.js";
import type { BuildPlatform } from "../build/template-context.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Remappable tier names exposed in presets (excludes inherit and frontier). */
type RemappableTier = Extract<ModelTier, "deep" | "standard" | "fast">;

/** Per-platform tier-to-model mapping within a preset. Complete (non-Partial). */
export type PresetPlatformMap = Readonly<Record<RemappableTier, string>>;

/** Valid preset names. */
export type PresetName = "budget" | "standard" | "premium";

/** Valid preset name values for runtime validation. */
export const VALID_PRESET_NAMES: readonly PresetName[] = [
	"budget",
	"standard",
	"premium",
] as const;

/** Named preset configuration with complete tier-to-model mappings per platform. */
export interface PresetConfig {
	readonly name: PresetName;
	readonly description: string;
	readonly platforms: Readonly<
		Partial<Record<BuildPlatform, PresetPlatformMap>>
	>;
}

// ---------------------------------------------------------------------------
// Preset definitions
// ---------------------------------------------------------------------------

/**
 * Blessed presets ordered by cost: budget < standard < premium.
 *
 * - **budget**: All tiers use fast-class models. Minimizes cost at the
 *   expense of reasoning quality on deep/standard agents.
 * - **standard**: Collapses deep tier to sonnet-class. For users without
 *   Opus access or wanting a balance of cost and capability.
 * - **premium**: Matches current TIER_MODEL_MAP build defaults. Full
 *   capability with frontier-class models at the deep tier.
 *
 * Only Claude Code and Codex are mapped; other platforms (copilot,
 * opencode, antigravity) do not support per-agent model fields in
 * their installed artifacts.
 */
const PRESETS: Readonly<Record<PresetName, PresetConfig>> = {
	budget: {
		name: "budget",
		description: "Cost-optimized: uses only fast-class models across all tiers",
		platforms: {
			"claude-code": {
				deep: "haiku",
				standard: "haiku",
				fast: "haiku",
			},
			codex: {
				deep: "gpt-5.4-mini",
				standard: "gpt-5.4-mini",
				fast: "gpt-5.4-mini",
			},
		},
	},
	standard: {
		name: "standard",
		description:
			"Balanced: collapses deep tier to sonnet-class for users without Opus access",
		platforms: {
			"claude-code": {
				deep: "sonnet",
				standard: "sonnet",
				fast: "haiku",
			},
			codex: {
				deep: "gpt-5.4",
				standard: "gpt-5.4",
				fast: "gpt-5.4-mini",
			},
		},
	},
	premium: {
		name: "premium",
		description:
			"Full capability: matches build defaults with frontier-class models at deep tier",
		platforms: {
			"claude-code": {
				deep: "opus",
				standard: "sonnet",
				fast: "haiku",
			},
			codex: {
				deep: "gpt-5.5",
				standard: "gpt-5.4",
				fast: "gpt-5.4-mini",
			},
		},
	},
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Look up a preset by name.
 * @returns The preset configuration, or undefined if the name is not recognized.
 */
export function getPreset(name: string): PresetConfig | undefined {
	return PRESETS[name as PresetName];
}

/**
 * List all available presets ordered budget -> standard -> premium.
 * @returns Array of all preset configurations.
 */
export function listPresets(): readonly PresetConfig[] {
	return VALID_PRESET_NAMES.map((name) => PRESETS[name]);
}
