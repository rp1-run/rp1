/**
 * Build-time validation of declared sub-agents against actual agent files.
 * Validates that SKILL.md metadata.sub_agents references resolve to real
 * agent .md files and flags undeclared or dead references.
 */

import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { ClaudeCodeSkill } from "../models.js";

/** Validation result with categorized diagnostics. */
export interface SubAgentValidationResult {
	readonly errors: readonly string[];
	readonly warnings: readonly string[];
	readonly info: readonly string[];
}

/** Parsed sub-agent reference from "rp1-{plugin}:{agent-name}" format. */
interface ParsedRef {
	readonly plugin: string;
	readonly agentName: string;
	readonly raw: string;
}

const SUB_AGENT_REF_PATTERN = /^rp1-(base|dev|utils):([a-z][a-z0-9-]*)$/;

/**
 * Parse a sub-agent reference string into its components.
 * Returns undefined if the format is invalid.
 */
const parseSubAgentRef = (ref: string): ParsedRef | undefined => {
	const match = ref.match(SUB_AGENT_REF_PATTERN);
	if (!match) return undefined;
	return { plugin: match[1], agentName: match[2], raw: ref };
};

/**
 * Determine which plugin a skill belongs to based on its name and metadata.
 * Falls back to scanning plugin directories if needed.
 */
const inferSkillPlugin = (
	skillName: string,
	projectRoot: string,
): string | undefined => {
	const plugins = ["base", "dev", "utils"];
	for (const plugin of plugins) {
		const skillDir = join(projectRoot, "plugins", plugin, "skills", skillName);
		if (existsSync(join(skillDir, "SKILL.md"))) {
			return plugin;
		}
	}
	return undefined;
};

/**
 * Find agent name references in skill content.
 * Looks for agent names that appear as identifiable references
 * (in subagent_type declarations, Task tool invocations, or quoted references).
 */
const findAgentReferencesInContent = (
	content: string,
	knownAgentNames: ReadonlySet<string>,
): ReadonlySet<string> => {
	const found = new Set<string>();
	for (const agentName of knownAgentNames) {
		if (content.includes(agentName)) {
			found.add(agentName);
		}
	}
	return found;
};

/**
 * Collect all known agent names from the project by scanning plugin agent directories.
 */
const collectAllAgentNames = (projectRoot: string): ReadonlySet<string> => {
	const names = new Set<string>();
	const plugins = ["base", "dev", "utils"];

	for (const plugin of plugins) {
		const agentsDir = join(projectRoot, "plugins", plugin, "agents");
		try {
			const entries: string[] = readdirSync(agentsDir);
			for (const entry of entries) {
				if (entry.endsWith(".md")) {
					names.add(entry.replace(/\.md$/, ""));
				}
			}
		} catch {
			// Plugin may not have an agents directory
		}
	}

	return names;
};

/**
 * Validate declared sub-agents against actual agent files in plugin directories.
 *
 * Produces:
 * - errors: declared sub-agent has no corresponding .md file (build-blocking)
 * - warnings: content references an agent not listed in sub_agents; declared agent not referenced in content
 * - info: cross-plugin agent references (e.g., rp1-base: agent in a dev skill)
 */
export const validateSubAgents = (
	projectRoot: string,
	skills: readonly ClaudeCodeSkill[],
): SubAgentValidationResult => {
	const errors: string[] = [];
	const warnings: string[] = [];
	const info: string[] = [];

	const allAgentNames = collectAllAgentNames(projectRoot);

	for (const skill of skills) {
		const subAgents = skill.metadata?.subAgents;
		if (!subAgents || subAgents.length === 0) continue;

		const skillPlugin = inferSkillPlugin(skill.name, projectRoot);
		const declaredAgentNames = new Set<string>();

		for (const ref of subAgents) {
			const parsed = parseSubAgentRef(ref);
			if (!parsed) {
				errors.push(
					`[${skill.name}] Invalid sub_agent reference format: "${ref}" (expected "rp1-{plugin}:{agent-name}")`,
				);
				continue;
			}

			declaredAgentNames.add(parsed.agentName);

			const agentFilePath = join(
				projectRoot,
				"plugins",
				parsed.plugin,
				"agents",
				`${parsed.agentName}.md`,
			);

			if (!existsSync(agentFilePath)) {
				errors.push(
					`[${skill.name}] Declared sub-agent "${ref}" has no corresponding file: ${agentFilePath}`,
				);
			}

			if (skillPlugin && parsed.plugin !== skillPlugin) {
				info.push(
					`[${skill.name}] Cross-plugin sub-agent reference: "${ref}" (skill is in ${skillPlugin})`,
				);
			}
		}

		const contentRefs = findAgentReferencesInContent(
			skill.content,
			allAgentNames,
		);

		for (const agentName of contentRefs) {
			if (!declaredAgentNames.has(agentName)) {
				warnings.push(
					`[${skill.name}] Content references agent "${agentName}" not listed in metadata.sub_agents`,
				);
			}
		}

		for (const agentName of declaredAgentNames) {
			if (!contentRefs.has(agentName)) {
				warnings.push(
					`[${skill.name}] Declared sub-agent "${agentName}" is not referenced in skill content`,
				);
			}
		}
	}

	return { errors, warnings, info };
};
