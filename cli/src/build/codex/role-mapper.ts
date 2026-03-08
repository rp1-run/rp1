/**
 * Agent role-type mapper for Codex build output.
 * Maps rp1 agent categories to Codex role types using name/description heuristics.
 */

import type { CodexRoleType } from "./models.js";

/**
 * Determine the Codex role type for an agent based on name and description keywords.
 *
 * @param name - Agent name (e.g., "task-builder", "pr-sub-reviewer")
 * @param description - Agent description text
 * @returns The matched CodexRoleType, or "default" if no pattern matches
 */
export const mapAgentToRoleType = (
	name: string,
	description: string,
): CodexRoleType => {
	const text = `${name} ${description}`.toLowerCase();
	if (/builder|scaffolder|implement|writer/.test(text)) return "worker";
	if (/reviewer|checker|auditor|verifier|validator/.test(text))
		return "reviewer";
	if (/investigator|analyzer|extractor|research|explorer|spatial/.test(text))
		return "explorer";
	return "default";
};
