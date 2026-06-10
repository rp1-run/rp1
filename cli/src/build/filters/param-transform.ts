/**
 * Liquid filter: param_transform
 *
 * Transforms parameter substitution markers into instructional text
 * for platforms that lack native argument substitution.
 *
 * | Platform    | Behavior                                              |
 * |-------------|-------------------------------------------------------|
 * | claude-code | Passthrough (no transformation)                       |
 * | opencode    | Passthrough (no transformation)                       |
 * | codex       | `$1` -> instructional text, `$ARGUMENTS` -> prose     |
 * | copilot     | `$1` -> instructional text, `$ARGUMENTS` -> prose     |
 * | antigravity | `$1` -> instructional text, `$ARGUMENTS` -> prose     |
 * | gemini      | `$1` -> instructional text, `$ARGUMENTS` -> prose     |
 * | goose       | Passthrough until Goose recipe params are rendered    |
 *
 * Codex has no native `$1`/`$ARGUMENTS` substitution model. Skills
 * must express parameters as instructional text so the model can
 * extract values from the user's prompt.
 *
 * Only transforms references outside code blocks.
 */

import { findMatchesOutsideCodeBlocks } from "../content-utils.js";
import type { BuildPlatform } from "../template-context.js";

const ORDINALS: readonly string[] = [
	"first",
	"second",
	"third",
	"fourth",
	"fifth",
	"sixth",
	"seventh",
	"eighth",
	"ninth",
	"tenth",
];

/**
 * Build the replacement string for a positional parameter reference.
 */
const positionalReplacement = (index: number): string => {
	const ordinal = ORDINALS[index - 1] ?? `#${index}`;
	return `the value of the ${ordinal} argument (extracted from the user's prompt)`;
};

const ARGUMENTS_REPLACEMENT =
	"the arguments provided by the user in their prompt";

/**
 * Transform parameter substitution markers to instructional text for Codex.
 * Replaces `$1`..`$N` and `$ARGUMENTS` outside code blocks.
 */
const transformParamsForCodex = (content: string): string => {
	const argumentsPattern = /\$ARGUMENTS/g;
	const argumentsMatches = findMatchesOutsideCodeBlocks(
		argumentsPattern,
		content,
	);

	let result = content;
	for (let i = argumentsMatches.length - 1; i >= 0; i--) {
		const match = argumentsMatches[i];
		const matchIndex = match.index;
		if (matchIndex === undefined) continue;
		result =
			result.slice(0, matchIndex) +
			ARGUMENTS_REPLACEMENT +
			result.slice(matchIndex + match[0].length);
	}

	const positionalPattern = /\$(\d+)\b/g;
	const positionalMatches = findMatchesOutsideCodeBlocks(
		positionalPattern,
		result,
	);

	for (let i = positionalMatches.length - 1; i >= 0; i--) {
		const match = positionalMatches[i];
		const matchIndex = match.index;
		if (matchIndex === undefined) continue;
		const paramIndex = parseInt(match[1], 10);
		const replacement = positionalReplacement(paramIndex);
		result =
			result.slice(0, matchIndex) +
			replacement +
			result.slice(matchIndex + match[0].length);
	}

	return result;
};

/**
 * Apply parameter transformation for the given platform.
 *
 * @param content - Source content containing parameter references
 * @param platform - Target build platform
 * @returns Transformed content with platform-appropriate parameter format
 */
export const paramTransform = (
	content: string,
	platform: BuildPlatform,
): string => {
	switch (platform) {
		case "claude-code":
		case "opencode":
			return content;
		case "codex":
			return transformParamsForCodex(content);
		case "copilot":
			return transformParamsForCodex(content);
		case "antigravity":
			return transformParamsForCodex(content);
		case "gemini":
			return transformParamsForCodex(content);
		case "goose":
			return content;
	}
};
