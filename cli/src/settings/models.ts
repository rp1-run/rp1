/**
 * Type definitions for user-controllable settings parsed from settings.toml.
 *
 * Covers `[models]` / `[models.<platform>]` sections for tier remapping
 * and the `[arcade]` section for Arcade UI preferences (theme, downsampling).
 */

import type { ModelTier } from "../build/models.js";
import type { BuildPlatform } from "../build/template-context.js";

/** Valid theme values for Arcade UI. */
export type ArcadeTheme = "light" | "dark" | "system";

/** Downsampling configuration for Arcade event display. */
export interface ArcadeDownsamplingSettings {
	readonly thresholdHours: number;
}

/**
 * Arcade UI settings parsed from the `[arcade]` section of settings.toml.
 * Consumed by the daemon server and REST endpoint.
 */
export interface ArcadeSettings {
	readonly theme: ArcadeTheme;
	readonly downsampling: ArcadeDownsamplingSettings;
}

/** Valid arcade theme strings for input validation. */
export const VALID_ARCADE_THEMES: readonly ArcadeTheme[] = [
	"light",
	"dark",
	"system",
] as const;

/** Default arcade settings applied when no `[arcade]` section exists. */
export const DEFAULT_ARCADE_SETTINGS: ArcadeSettings = {
	theme: "system",
	downsampling: { thresholdHours: 24 },
} as const;

/**
 * Harness selection parsed from the `[harnesses]` section of user-level settings.toml.
 * User-level only -- harness availability is per-machine, not per-project.
 */
export interface ParsedHarnessesSection {
	readonly enabled: readonly string[];
}

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
