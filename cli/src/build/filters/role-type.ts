/**
 * Liquid filter: role_type
 *
 * Applies the Codex role-type heuristic to agent data.
 * Wraps the existing mapAgentToRoleType() function from codex/role-mapper.ts.
 */

import type { CodexRoleType } from "../codex/models.js";

/**
 * Determine the Codex role type for an agent based on name and description.
 *
 * Heuristic keyword matching:
 * - builder/scaffolder/implement/writer -> "worker"
 * - reviewer/checker/auditor/verifier/validator -> "reviewer"
 * - investigator/analyzer/extractor/research/explorer/spatial -> "explorer"
 * - no match -> "default"
 *
 * @param name - Agent name (e.g. "task-builder", "pr-sub-reviewer")
 * @param description - Agent description text
 * @returns Matched CodexRoleType
 */
export const roleType = (name: string, description: string): CodexRoleType => {
	const text = `${name} ${description}`.toLowerCase();
	if (/builder|scaffolder|implement|writer/.test(text)) return "worker";
	if (/reviewer|checker|auditor|verifier|validator/.test(text))
		return "reviewer";
	if (/investigator|analyzer|extractor|research|explorer|spatial/.test(text))
		return "explorer";
	return "default";
};
