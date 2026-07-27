/**
 * L017: Flag SKILL.md bodies that exceed the recommended size.
 *
 * Anthropic's Agent Skills guidance puts a SKILL.md body under 500 lines and
 * describes a three-tier disclosure model: metadata is pre-loaded, SKILL.md
 * loads when the skill triggers, and reference files are read on demand at
 * zero cost until then. Once SKILL.md loads, every line is a recurring token
 * cost for the rest of the session, so oversized bodies are paid for on paths
 * that never use most of the content.
 *
 * Measured against COMPILED output rather than authored source. The build
 * injects generated sections (Resolve Arguments, Host Context, Workflow
 * Bootstrap) and expands shared includes, so compiled output runs larger --
 * two skills in this repo sit under the limit as authored and over it once
 * built, which source inspection cannot see.
 *
 * Scoped to skills. Agents are flat files with no companion directory
 * available to split into, and the published limit addresses SKILL.md.
 * Reference and companion files are exempt by construction: the build lints
 * only SKILL.md and agent artifacts, never the files under a skill directory.
 */

import type { BuildPlatform } from "../../template-context.js";
import type { LintDiagnostic } from "../index.js";

/** Published SKILL.md body ceiling. */
const MAX_SKILL_LINES = 500;

export function skillBodySizeRule(
	content: string,
	_platform: BuildPlatform,
	file: string,
): LintDiagnostic[] {
	if (!file.endsWith("SKILL.md")) {
		return [];
	}

	const lines = content.split("\n").length;
	if (lines <= MAX_SKILL_LINES) {
		return [];
	}

	return [
		{
			rule: "L017",
			severity: "error",
			message: `compiled SKILL.md is ${lines} lines (recommended max ${MAX_SKILL_LINES}); every line is a recurring token cost once the skill loads`,
			file,
			suggestion:
				"Move phase-specific or conditional detail into references/<topic>.md and link it from a References table with a 'When to Load' column",
		},
	];
}
