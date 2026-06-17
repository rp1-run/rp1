/**
 * L015: Skill description length validation.
 *
 * Source-level lint rule that checks skill descriptions against length
 * thresholds. Long descriptions degrade discovery UX in host tool
 * skill lists and catalog displays.
 *
 * - >200 characters: error (must fix before build succeeds)
 * - >160 characters: warning (should shorten for readability)
 */

import type { LintDiagnostic } from "../index.js";

const WARNING_THRESHOLD = 160;
const ERROR_THRESHOLD = 200;

/**
 * Validate skill description length against L015 thresholds.
 *
 * @param description - Parsed skill description string
 * @param file - Source file path for diagnostic reporting
 */
export function lintSkillDescriptionLength(
	description: string,
	file: string,
): LintDiagnostic[] {
	const len = description.length;

	if (len > ERROR_THRESHOLD) {
		return [
			{
				rule: "L015",
				severity: "error",
				message: `skill description is ${len} characters (max ${ERROR_THRESHOLD}). Shorten to <=${WARNING_THRESHOLD} for best discovery UX.`,
				file,
				suggestion: `Trim the description to <=${WARNING_THRESHOLD} characters while preserving trigger verbs and domain nouns.`,
			},
		];
	}

	if (len > WARNING_THRESHOLD) {
		return [
			{
				rule: "L015",
				severity: "warning",
				message: `skill description is ${len} characters (recommended max ${WARNING_THRESHOLD}). Consider shortening for discovery readability.`,
				file,
				suggestion: `Trim the description to <=${WARNING_THRESHOLD} characters while preserving trigger verbs and domain nouns.`,
			},
		];
	}

	return [];
}
