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
 * Copilot is intentionally omitted (no tiering mechanism); resolveTier
 * returns null for unmapped platforms.
 */
const TIER_MODEL_MAP: Readonly<
	Record<Exclude<ModelTier, "inherit">, Partial<Record<BuildPlatform, string>>>
> = {
	// frontier: most-capable model per platform.
	// claude-code/opencode/antigravity are Anthropic-backed and share the same
	// alias vocabulary (they already map deep→opus identically), so frontier→fable
	// on all three. codex (OpenAI) and gemini (Google) have no class above their
	// current deep model yet, so frontier currently coincides with their deep model
	// (o3 / gemini-2.5-pro) and should be bumped when a higher class ships.
	frontier: {
		"claude-code": "fable",
		codex: "o3",
		opencode: "fable",
		antigravity: "fable",
		gemini: "gemini-2.5-pro",
	},
	deep: {
		"claude-code": "opus",
		codex: "o3",
		opencode: "opus",
		antigravity: "opus",
		gemini: "gemini-2.5-pro",
	},
	standard: {
		"claude-code": "sonnet",
		codex: "o4-mini",
		opencode: "sonnet",
		antigravity: "sonnet",
		gemini: "gemini-2.5-flash",
	},
	fast: {
		"claude-code": "haiku",
		codex: "gpt-4.1-nano",
		opencode: "haiku",
		antigravity: "haiku",
		gemini: "gemini-2.5-flash",
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
 * Clamp effort levels to the three-level vocabulary (low/medium/high)
 * supported by OpenAI and Codex platforms. xhigh and max map to high.
 */
function clampToThreeLevels(effort: EffortLevel): string {
	if (effort === "xhigh" || effort === "max") return "high";
	return effort;
}

// Every model produced by TIER_MODEL_MAP MUST have an entry here;
// add new model classes in one place.
const MODEL_PROVIDER: Readonly<
	Record<string, "anthropic" | "openai" | "google">
> = {
	fable: "anthropic",
	opus: "anthropic",
	sonnet: "anthropic",
	haiku: "anthropic",
	o3: "openai",
	"o4-mini": "openai",
	"gpt-4.1-nano": "openai",
	"gemini-2.5-pro": "google",
	"gemini-2.5-flash": "google",
};

/**
 * Derive the model provider from a resolved model identifier.
 * Used by OpenCode to select the correct effort pass-through field name.
 *
 * Looks up the explicit MODEL_PROVIDER registry (case-insensitive fallback).
 * Returns "unknown" for unrecognized models.
 */
function deriveProvider(
	resolvedModel: string,
): "anthropic" | "openai" | "google" | "unknown" {
	const direct = MODEL_PROVIDER[resolvedModel];
	if (direct) return direct;
	const lower = MODEL_PROVIDER[resolvedModel.toLowerCase()];
	if (lower) return lower;
	return "unknown";
}

/**
 * OpenCode effort field configs keyed by derived provider.
 * Anthropic models on OpenCode do not support per-agent effort pass-through.
 */
const OPENCODE_PROVIDER_EFFORT: Readonly<
	Record<string, EffortFieldConfig | null>
> = {
	openai: { fieldName: "reasoningEffort", mapValue: clampToThreeLevels },
	anthropic: null,
	google: null,
	unknown: null,
};

/**
 * Direct platform effort configurations (non-provider-dependent).
 * Platforms not listed (copilot) or with null values do not support
 * per-agent effort control.
 */
const PLATFORM_EFFORT: Readonly<
	Partial<Record<BuildPlatform, EffortFieldConfig | null>>
> = {
	"claude-code": { fieldName: "effort", mapValue: (e) => e },
	codex: {
		fieldName: "model_reasoning_effort",
		mapValue: clampToThreeLevels,
	},
	antigravity: null,
	gemini: null,
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
 * Resolve an effort level to the platform/provider-specific field name and value.
 *
 * For OpenCode, the provider is derived from the resolved model ID to select
 * the correct pass-through field name (e.g., `reasoningEffort` for OpenAI).
 *
 * @returns `{ fieldName, value }` for platforms that support per-agent effort,
 *   or null when:
 *   - effort is undefined (not declared)
 *   - tier is "fast" (fast-tier models do not support effort control)
 *   - the platform/provider does not support per-agent effort
 */
export function resolveEffort(
	effort: EffortLevel | undefined,
	tier: ModelTier,
	platform: BuildPlatform,
	resolvedModel: string | null,
): EffortResolution | null {
	if (effort === undefined) return null;
	if (tier === "fast") return null;

	// OpenCode: provider-dependent effort field.
	// When tier is "inherit", resolvedModel is null (the session model is
	// unknown at build time), so provider resolves to "unknown" and effort
	// is correctly omitted — the runtime session model determines behavior.
	if (platform === "opencode") {
		const provider = resolvedModel ? deriveProvider(resolvedModel) : "unknown";
		const config = OPENCODE_PROVIDER_EFFORT[provider];
		if (!config) return null;
		return { fieldName: config.fieldName, value: config.mapValue(effort) };
	}

	// Other platforms: direct lookup
	const config = PLATFORM_EFFORT[platform];
	if (!config) return null;
	return { fieldName: config.fieldName, value: config.mapValue(effort) };
}
