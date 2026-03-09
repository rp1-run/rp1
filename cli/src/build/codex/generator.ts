/**
 * Artifact generation module for Codex build target.
 * Produces skill directories, agent TOML files, openai.yaml metadata, and manifests.
 */

import * as E from "fp-ts/lib/Either.js";
import { stringify } from "smol-toml";
import type { CLIError } from "../../../shared/errors.js";
import { generationError } from "../../../shared/errors.js";
import type { CodexAgent, CodexManifest, CodexSkill } from "./models.js";

/**
 * Escape a string value for safe YAML output.
 * Wraps in double quotes if the value contains special YAML characters.
 */
const escapeYamlValue = (value: string): string => {
	const needsQuoting = /[[\]{}:#>|*&!%@`'"\\,\n]|^[\s-]|^\s*$/.test(value);
	if (needsQuoting) {
		const escaped = value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
		return `"${escaped}"`;
	}
	return value;
};

/**
 * Generate Codex SKILL.md file content with frontmatter.
 *
 * Produces a SKILL.md preserving the Agent Skills v1.0 format with
 * Codex-transformed content and metadata.
 */
export const generateCodexSkillDir = (
	codexSkill: CodexSkill,
): E.Either<
	CLIError,
	{
		skillDir: string;
		skillMdContent: string;
		supportingFiles: readonly string[];
	}
> => {
	try {
		const frontmatterLines = [
			"---",
			`name: ${escapeYamlValue(codexSkill.name)}`,
			`description: ${escapeYamlValue(codexSkill.description)}`,
		];

		if (codexSkill.allowedTools) {
			frontmatterLines.push(
				`allowed-tools: ${escapeYamlValue(codexSkill.allowedTools)}`,
			);
		}

		if (codexSkill.metadata) {
			frontmatterLines.push("metadata:");
			const meta = codexSkill.metadata;
			if (meta.version) frontmatterLines.push(`  version: ${meta.version}`);
			if (meta.tags && meta.tags.length > 0) {
				frontmatterLines.push("  tags:");
				for (const tag of meta.tags) {
					frontmatterLines.push(`    - ${tag}`);
				}
			}
			if (meta.created) frontmatterLines.push(`  created: ${meta.created}`);
			if (meta.author) frontmatterLines.push(`  author: ${meta.author}`);
			if (meta.argumentHint) {
				frontmatterLines.push(`  argument-hint: "${meta.argumentHint}"`);
			}
		}

		frontmatterLines.push("---", "", codexSkill.content);

		const skillMdContent = frontmatterLines.join("\n");
		const skillDir = codexSkill.name;

		return E.right({
			skillDir,
			skillMdContent,
			supportingFiles: codexSkill.supportingFiles,
		});
	} catch (e) {
		return E.left(
			generationError(codexSkill.name, `Codex skill generation failed: ${e}`),
		);
	}
};

/**
 * Generate agents/openai.yaml content for a Codex skill directory.
 *
 * Produces a minimal YAML file with display_name and allow_implicit_invocation: false.
 * Uses string templating since only two fields are needed (per design decision D7).
 */
export const generateOpenaiYaml = (
	skillName: string,
): E.Either<CLIError, string> => {
	try {
		const displayName = escapeYamlValue(skillName);
		const content = `display_name: ${displayName}\nallow_implicit_invocation: false\n`;
		return E.right(content);
	} catch (e) {
		return E.left(
			generationError(skillName, `openai.yaml generation failed: ${e}`),
		);
	}
};

/**
 * Generate rp1-agents.toml content for a plugin's agents.
 *
 * Produces a single TOML file with [agents.<name>] sections for each agent,
 * containing model, role, and developer_instructions fields.
 * Uses smol-toml for correct multiline string escaping.
 */
export const generateAgentToml = (
	agents: readonly CodexAgent[],
): E.Either<CLIError, string> => {
	try {
		const agentsMap: Record<
			string,
			Record<
				string,
				{
					model: string;
					role: string;
					developer_instructions: string;
				}
			>
		> = { agents: {} };

		for (const agent of agents) {
			agentsMap.agents[agent.name] = {
				model: agent.model,
				role: agent.roleType,
				developer_instructions: agent.developerInstructions,
			};
		}

		const tomlContent = stringify(agentsMap);
		return E.right(tomlContent);
	} catch (e) {
		return E.left(
			generationError("rp1-agents.toml", `Agent TOML generation failed: ${e}`),
		);
	}
};

/**
 * Generate AGENTS.md listing all agents with descriptions and role types.
 * Uses Codex $ syntax for any cross-references.
 */
export const generateCodexAgentsMd = (
	pluginName: string,
	agents: readonly CodexAgent[],
): E.Either<CLIError, string> => {
	try {
		const lines: string[] = [
			`# rp1-${pluginName} Agents`,
			"",
			"| Agent | Role | Description |",
			"|-------|------|-------------|",
		];

		for (const agent of agents) {
			lines.push(
				`| ${agent.name} | ${agent.roleType} | ${agent.description} |`,
			);
		}

		lines.push("");

		return E.right(lines.join("\n"));
	} catch (e) {
		return E.left(
			generationError(pluginName, `Codex AGENTS.md generation failed: ${e}`),
		);
	}
};

/**
 * Generate Codex manifest.json content for a plugin.
 *
 * Tracks generated skills, agents, and build metadata for use by
 * the Codex installer (M2.3).
 */
export const generateCodexManifest = (
	pluginName: string,
	version: string,
	skills: readonly string[],
	agents: readonly string[],
): E.Either<CLIError, string> => {
	try {
		const timestamp = new Date().toISOString();

		const manifest: CodexManifest = {
			plugin: pluginName,
			version,
			generatedAt: timestamp,
			codexVersionTested: "0.1.x",
			artifacts: {
				skills: [...skills],
				agents: [...agents],
			},
			installation: {
				skillsDir: ".agents/skills/",
				configFile: "codex.toml",
			},
		};

		return E.right(JSON.stringify(manifest, null, 2));
	} catch (e) {
		return E.left(
			generationError(pluginName, `Codex manifest generation failed: ${e}`),
		);
	}
};
