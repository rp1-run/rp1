/**
 * Tier resolution dictionary for per-agent model and effort tiering.
 *
 * Maps abstract tier aliases (deep, standard, fast) to platform-specific
 * model identifiers, and effort levels to platform-specific field names
 * and values. Centralizes all vendor model mappings so a single update
 * propagates to every agent at that tier.
 */

import type { EffortLevel, ModelTier } from "./models.js";
import type { BuildPlatform } from "./template-context.js";

// ---------------------------------------------------------------------------
// Tier → Platform → Model ID
// ---------------------------------------------------------------------------

/**
 * Centralized mapping from abstract tiers to concrete platform model IDs.
 * Updating an entry here propagates to all agents of that tier on next build.
 *
 * Intentionally omitted platforms (resolveTier returns null → inherit):
 * - copilot: no per-agent model tiering mechanism.
 * - opencode: no per-agent model tiering — inherits the session model, like copilot.
 *
 * Codex: deep and frontier both map to gpt-5.5 (its most capable model);
 * standard = gpt-5.4; fast = gpt-5.4-mini.
 *
 * Antigravity: uses Gemini models (gemini-3.1-pro for deep/frontier,
 * gemini-3.5-flash for standard/fast).
 *
 */
export const TIER_MODEL_MAP: Readonly<
	Record<Exclude<ModelTier, "inherit">, Partial<Record<BuildPlatform, string>>>
> = {
	frontier: {
		"claude-code": "fable",
		codex: "gpt-5.5",
		antigravity: "gemini-3.1-pro",
	},
	deep: {
		"claude-code": "opus",
		codex: "gpt-5.5",
		antigravity: "gemini-3.1-pro",
	},
	standard: {
		"claude-code": "sonnet",
		codex: "gpt-5.4",
		antigravity: "gemini-3.5-flash",
	},
	fast: {
		"claude-code": "haiku",
		codex: "gpt-5.4-mini",
		antigravity: "gemini-3.5-flash",
	},
} as const;

// ---------------------------------------------------------------------------
// Effort resolution
// ---------------------------------------------------------------------------

/** Resolved effort output with the platform/provider-specific field name and mapped value. */
interface EffortResolution {
	readonly fieldName: string;
	readonly value: string;
}

/** Per-platform effort field configuration. */
interface EffortFieldConfig {
	readonly fieldName: string;
	readonly mapValue: (effort: EffortLevel) => string;
}

/**
 * Clamp effort to Codex's vocabulary: Codex reasoning effort tops out at
 * xhigh, so max → xhigh; all other levels pass through unchanged.
 */
function clampToCodexEffort(effort: EffortLevel): string {
	return effort === "max" ? "xhigh" : effort;
}

/**
 * Per-platform effort configurations.
 * Platforms with null or not listed do not support per-agent effort control.
 */
const PLATFORM_EFFORT: Readonly<
	Partial<Record<BuildPlatform, EffortFieldConfig | null>>
> = {
	"claude-code": { fieldName: "effort", mapValue: (e) => e }, // supports all 5 levels incl max
	codex: {
		fieldName: "model_reasoning_effort",
		mapValue: clampToCodexEffort,
	},
	antigravity: null,
	opencode: null,
	copilot: null,
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Resolve an abstract model tier to the platform-specific model identifier.
 *
 * @returns The concrete model ID for the platform, or null when:
 *   - tier is "inherit" (agent inherits session model)
 *   - the platform has no tiering support (e.g., copilot)
 */
export function resolveTier(
	tier: ModelTier,
	platform: BuildPlatform,
): string | null {
	if (tier === "inherit") return null;
	return TIER_MODEL_MAP[tier]?.[platform] ?? null;
}

/**
 * Resolve an effort level to the platform-specific field name and value.
 *
 * @returns `{ fieldName, value }` for platforms that support per-agent effort,
 *   or null when:
 *   - effort is undefined (not declared)
 *   - tier is "fast" (fast-tier models do not support effort control)
 *   - the platform does not support per-agent effort
 */
export function resolveEffort(
	effort: EffortLevel | undefined,
	tier: ModelTier,
	platform: BuildPlatform,
): EffortResolution | null {
	if (effort === undefined) return null;
	if (tier === "fast") return null;

	const config = PLATFORM_EFFORT[platform];
	if (!config) return null;
	return { fieldName: config.fieldName, value: config.mapValue(effort) };
}
