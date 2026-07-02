/**
 * Artifact rewriter for install-time tier remapping.
 *
 * Pure-function module that transforms agent artifacts to reflect user-declared
 * tier-to-model remappings. Handles:
 * - Claude Code (.md): YAML frontmatter model/effort field updates
 * - Codex (.toml): targeted line-level model/effort field replacement
 * - Effort correction: strips effort when remapped model is fast-class
 * - Protected agent warnings: alerts on reasoning-critical agent downgrades
 */

import type { EffortLevel, ModelTier } from "../build/models.js";
import { PROTECTED_AGENTS, TIER_RANK } from "../build/models.js";
import type { BuildPlatform } from "../build/template-context.js";
import {
	modelSupportsEffort,
	TIER_MODEL_MAP,
} from "../build/tier-resolution.js";

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export interface EffortAdjustment {
	readonly agentName: string;
	readonly originalEffort: string;
	readonly action: "stripped" | "preserved";
	readonly reason: string;
}

export interface ProtectedWarning {
	readonly agentName: string;
	readonly originalTier: string;
	readonly newModel: string;
	readonly message: string;
}

export interface RewriteAgentOutput {
	readonly content: string;
	readonly modified: boolean;
	readonly effortAdjustment?: EffortAdjustment;
	readonly protectedWarning?: ProtectedWarning;
}

export interface RewriteAgentParams {
	readonly content: string;
	readonly agentName: string;
	readonly newModel: string;
	readonly originalTier: ModelTier;
	readonly originalEffort?: EffortLevel;
	readonly platform: BuildPlatform;
}

// ---------------------------------------------------------------------------
// Protected agent downgrade check
// ---------------------------------------------------------------------------

/**
 * Reverse-lookup: determine which tier a model ID belongs to on a platform.
 * Returns null for custom/unknown models not found in TIER_MODEL_MAP.
 */
function effectiveTierForModel(
	modelId: string,
	platform: BuildPlatform,
): Exclude<ModelTier, "inherit"> | null {
	const tiers = ["frontier", "deep", "standard", "fast"] as const;
	for (const tier of tiers) {
		if (TIER_MODEL_MAP[tier][platform] === modelId) return tier;
	}
	return null;
}

function checkProtectedDowngrade(
	agentName: string,
	originalTier: ModelTier,
	newModel: string,
	platform: BuildPlatform,
): ProtectedWarning | undefined {
	if (!PROTECTED_AGENTS.has(agentName)) return undefined;
	if (originalTier === "inherit") return undefined;

	const originalRank = TIER_RANK[originalTier];
	const newTier = effectiveTierForModel(newModel, platform);

	// For unknown models, warn conservatively since we cannot verify capability
	if (newTier === null) {
		return {
			agentName,
			originalTier,
			newModel,
			message: `Protected agent "${agentName}" remapped from ${originalTier} to unknown model "${newModel}"; verify it meets reasoning requirements`,
		};
	}

	const newRank = TIER_RANK[newTier];
	if (newRank < originalRank) {
		return {
			agentName,
			originalTier,
			newModel,
			message: `Protected agent "${agentName}" downgraded from ${originalTier} (rank ${originalRank}) to ${newTier} (rank ${newRank}) via model "${newModel}"; may degrade reasoning quality`,
		};
	}

	return undefined;
}

// ---------------------------------------------------------------------------
// Platforms that support model-field rewriting
// ---------------------------------------------------------------------------

const REWRITABLE_PLATFORMS: ReadonlySet<BuildPlatform> = new Set([
	"claude-code",
	"codex",
]);

// ---------------------------------------------------------------------------
// Claude Code rewriter (.md with YAML frontmatter)
// ---------------------------------------------------------------------------

function rewriteClaudeCode(
	content: string,
	newModel: string,
	originalEffort: EffortLevel | undefined,
	supportsEffort: boolean,
): { content: string; modified: boolean } {
	const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n/);

	if (!frontmatterMatch) {
		// No frontmatter — construct one with model field
		const newFrontmatter =
			supportsEffort && originalEffort
				? `---\nmodel: ${newModel}\neffort: ${originalEffort}\n---\n`
				: `---\nmodel: ${newModel}\n---\n`;
		return { content: newFrontmatter + content, modified: true };
	}

	const originalFrontmatter = frontmatterMatch[1];
	const body = content.slice(frontmatterMatch[0].length);

	// Parse frontmatter lines, update model, handle effort
	const lines = originalFrontmatter.split("\n");
	const updatedLines: string[] = [];
	let modelFound = false;
	let effortFound = false;
	let currentModel = "";

	for (const line of lines) {
		const modelMatch = line.match(/^model:\s*(.+)$/);
		if (modelMatch) {
			currentModel = modelMatch[1].trim();
			modelFound = true;
			updatedLines.push(`model: ${newModel}`);
			continue;
		}

		const effortMatch = line.match(/^effort:\s*(.+)$/);
		if (effortMatch) {
			effortFound = true;
			if (supportsEffort) {
				updatedLines.push(line);
			}
			// When !supportsEffort, skip the line (strip effort)
			continue;
		}

		updatedLines.push(line);
	}

	if (!modelFound) {
		updatedLines.unshift(`model: ${newModel}`);
	}

	const newFrontmatter = updatedLines.join("\n");

	// Re-check: if currentModel was already newModel and effort unchanged, not modified
	if (currentModel === newModel && (!effortFound || supportsEffort)) {
		return { content, modified: false };
	}

	return {
		content: `---\n${newFrontmatter}\n---\n${body}`,
		modified: true,
	};
}

// ---------------------------------------------------------------------------
// Codex rewriter (.toml with targeted line replacement)
// ---------------------------------------------------------------------------

function rewriteCodex(
	content: string,
	newModel: string,
	_originalEffort: EffortLevel | undefined,
	supportsEffort: boolean,
): { content: string; modified: boolean } {
	const lines = content.split("\n");
	const updatedLines: string[] = [];
	let modified = false;
	let inMultilineString = false;

	for (const line of lines) {
		// Track multiline string boundaries (triple-quoted '''...''')
		if (inMultilineString) {
			updatedLines.push(line);
			if (line.includes("'''")) {
				inMultilineString = false;
			}
			continue;
		}

		// Match model = "..." line
		const modelMatch = line.match(/^model\s*=\s*"([^"]*)"$/);
		if (modelMatch) {
			const currentModel = modelMatch[1];
			if (currentModel !== newModel) {
				updatedLines.push(`model = "${newModel}"`);
				modified = true;
			} else {
				updatedLines.push(line);
			}
			continue;
		}

		// Match model_reasoning_effort = "..." line
		const effortMatch = line.match(/^model_reasoning_effort\s*=\s*"([^"]*)"$/);
		if (effortMatch) {
			if (supportsEffort) {
				updatedLines.push(line);
			} else {
				// Strip effort line
				modified = true;
			}
			continue;
		}

		// Detect start of multiline string (assignment opening: `key = '''`)
		if (line.includes("=") && line.endsWith("'''")) {
			inMultilineString = true;
		}

		updatedLines.push(line);
	}

	if (!modified) {
		return { content, modified: false };
	}

	return { content: updatedLines.join("\n"), modified: true };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Rewrite a single agent artifact according to the tier remapping.
 *
 * Dispatches to platform-specific rewriters, applies effort correction,
 * and checks for protected-agent downgrades. Platforms without model-field
 * support (copilot, opencode, antigravity) are skipped with no error.
 */
export function rewriteAgentArtifact(
	params: RewriteAgentParams,
): RewriteAgentOutput {
	const {
		content,
		agentName,
		newModel,
		originalTier,
		originalEffort,
		platform,
	} = params;

	// Skip unsupported platforms
	if (!REWRITABLE_PLATFORMS.has(platform)) {
		return { content, modified: false };
	}

	const supportsEffort = modelSupportsEffort(newModel, platform);

	// Platform-specific rewrite
	let rewriteResult: { content: string; modified: boolean };
	if (platform === "claude-code") {
		rewriteResult = rewriteClaudeCode(
			content,
			newModel,
			originalEffort,
			supportsEffort,
		);
	} else {
		rewriteResult = rewriteCodex(
			content,
			newModel,
			originalEffort,
			supportsEffort,
		);
	}

	// Effort adjustment reporting
	let effortAdjustment: EffortAdjustment | undefined;
	if (originalEffort && !supportsEffort && rewriteResult.modified) {
		effortAdjustment = {
			agentName,
			originalEffort,
			action: "stripped",
			reason: `Model "${newModel}" is fast-class on ${platform} and does not support effort control`,
		};
	}

	// Protected agent downgrade warning
	const protectedWarning = rewriteResult.modified
		? checkProtectedDowngrade(agentName, originalTier, newModel, platform)
		: undefined;

	return {
		content: rewriteResult.content,
		modified: rewriteResult.modified,
		effortAdjustment,
		protectedWarning,
	};
}
