/**
 * Type definitions for user-controllable model tier remapping settings.
 *
 * These types model the `[models]` and `[models.<platform>]` sections in
 * settings.toml, allowing users to declare abstract-tier-to-model remappings
 * that are applied at install time without requiring the build pipeline.
 */

import type { ModelTier } from "../build/models.js";
import type { BuildPlatform } from "../build/template-context.js";

/**
 * Per-platform tier-to-model mapping from user settings.
 *
 * Each key is a concrete tier (excluding "inherit") and each value is
 * the user-chosen model identifier string for that tier on a given platform.
 * Omitted tiers preserve the build-time default.
 */
export type PlatformTierMap = Readonly<
	Partial<Record<Exclude<ModelTier, "inherit">, string>>
>;

/**
 * Complete tier remapping configuration parsed from settings.toml.
 *
 * Combines an optional preset name with per-platform tier overrides.
 * Within a file, explicit `[models.<platform>]` entries take precedence
 * over the preset's values for that platform.
 */
export interface TierRemappingConfig {
	readonly preset?: string;
	readonly platforms: Readonly<Partial<Record<BuildPlatform, PlatformTierMap>>>;
}
