/**
 * Liquid filter: namespace_ref
 *
 * Transforms agent/skill namespace references in content for the target platform.
 *
 * | Platform    | Input              | Output              |
 * |-------------|--------------------|---------------------|
 * | claude-code | `rp1-base:agent`   | `rp1-base:agent`    |
 * | opencode    | `rp1-base:agent`   | `rp1-base/agent`    |
 * | codex       | `/rp1-base:agent`  | `$rp1-base-agent`   |
 *
 * Wraps the existing transformNamespaceSeparator() and
 * transformNamespaceToCodex() logic from transformations.ts and
 * codex/transformations.ts respectively.
 */

import { PLUGIN_NAMES } from "../../../shared/canonical-name.js";
import { findMatchesOutsideCodeBlocks } from "../content-utils.js";
import type { BuildPlatform } from "../template-context.js";

/**
 * Transform namespace separator for OpenCode.
 * Replaces colon with slash: rp1-base:x -> rp1-base/x, rp1-dev:x -> rp1-dev/x
 */
const transformNamespaceSeparator = (content: string): string => {
	let result = content;
	for (const plugin of PLUGIN_NAMES) {
		result = result.replaceAll(`rp1-${plugin}:`, `rp1-${plugin}/`);
	}
	return result;
};

/**
 * Transform slash-command namespace references to Codex $ mention syntax.
 * /rp1-base:skill-name  -> $rp1-base-skill-name
 * /rp1-dev:skill-name   -> $rp1-dev-skill-name
 * /rp1-utils:skill-name -> $rp1-utils-skill-name
 *
 * Only transforms references outside code blocks.
 */
const transformNamespaceToCodex = (content: string): string => {
	const pluginAlternation = PLUGIN_NAMES.join("|");
	const pattern = new RegExp(
		`/rp1-(${pluginAlternation}):([a-z][a-z0-9-]*)`,
		"g",
	);

	const matches = findMatchesOutsideCodeBlocks(pattern, content);

	let result = content;
	for (let i = matches.length - 1; i >= 0; i--) {
		const match = matches[i];
		const matchIndex = match.index;
		if (matchIndex === undefined) continue;
		const plugin = match[1];
		const skill = match[2];
		const replacement = `$rp1-${plugin}-${skill}`;
		result =
			result.slice(0, matchIndex) +
			replacement +
			result.slice(matchIndex + match[0].length);
	}

	return result;
};

/**
 * Apply namespace reference transformation for the given platform.
 *
 * @param content - Source content containing namespace references
 * @param platform - Target build platform
 * @returns Transformed content with platform-appropriate namespace format
 */
export const namespaceRef = (
	content: string,
	platform: BuildPlatform,
): string => {
	switch (platform) {
		case "claude-code":
			return content;
		case "opencode":
			return transformNamespaceSeparator(content);
		case "codex":
			return transformNamespaceToCodex(content);
	}
};
