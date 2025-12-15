/**
 * Artifact generation module for OpenCode build tool.
 */

import * as E from "fp-ts/lib/Either.js";
import type { CLIError } from "../../shared/errors.js";
import { generationError } from "../../shared/errors.js";
import type {
	BundleManifest,
	BundlePluginAssets,
	OpenCodeAgent,
	OpenCodeCommand,
	OpenCodeSkill,
	PluginManifest,
} from "./models.js";

/**
 * Escape a string value for safe YAML output.
 * Wraps in double quotes if the value contains special YAML characters.
 */
const escapeYamlValue = (value: string): string => {
	// Characters that require quoting in YAML
	const needsQuoting = /[[\]{}:#>|*&!%@`'"\\,\n]|^[\s-]|^\s*$/.test(value);
	if (needsQuoting) {
		// Escape backslashes and double quotes, then wrap in double quotes
		const escaped = value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
		return `"${escaped}"`;
	}
	return value;
};

/**
 * Generate OpenCode command markdown file with YAML frontmatter.
 */
export const generateCommandFile = (
	ocCmd: OpenCodeCommand,
	cmdName: string,
): E.Either<CLIError, { filename: string; content: string }> => {
	try {
		// Build YAML frontmatter (metadata only)
		const frontmatterLines = [
			"---",
			`description: ${escapeYamlValue(ocCmd.description)}`,
		];

		// Add argument-hint if present (quote the value to handle brackets properly in YAML)
		if (ocCmd.argumentHint) {
			frontmatterLines.push(`argument-hint: "${ocCmd.argumentHint}"`);
		}

		// NOTE: agent field intentionally omitted - OpenCode's agent: field runs as background agent
		// We use @ mentions in prompt content for explicit invocation instead

		if (ocCmd.model) {
			frontmatterLines.push(`model: ${ocCmd.model}`);
		}

		if (ocCmd.subtask) {
			frontmatterLines.push(`subtask: ${ocCmd.subtask}`);
		}

		frontmatterLines.push("---");

		// Combine frontmatter + prompt content (NOT inside frontmatter)
		const content = `${frontmatterLines.join("\n")}\n\n${ocCmd.template}`;
		const filename = `${cmdName}.md`;

		return E.right({ filename, content });
	} catch (e) {
		return E.left(generationError(cmdName, `Command generation failed: ${e}`));
	}
};

/**
 * Generate OpenCode agent markdown file with YAML frontmatter.
 */
export const generateAgentFile = (
	ocAgent: OpenCodeAgent,
): E.Either<CLIError, { filename: string; content: string }> => {
	try {
		// Build tools dict from tools list
		const toolsDict = {
			bash:
				ocAgent.tools.includes("bash_run") || ocAgent.tools.includes("Bash"),
			write:
				ocAgent.tools.includes("write_file") || ocAgent.tools.includes("Write"),
			edit:
				ocAgent.tools.includes("edit_file") || ocAgent.tools.includes("Edit"),
		};

		// Build YAML frontmatter
		const frontmatterLines = [
			"---",
			`description: ${escapeYamlValue(ocAgent.description)}`,
			`mode: ${ocAgent.mode}`,
		];

		// Only include model if it's not "inherit" (OpenCode doesn't understand inherit)
		if (ocAgent.model && ocAgent.model !== "inherit") {
			frontmatterLines.push(`model: ${ocAgent.model}`);
		}

		frontmatterLines.push(
			"tools:",
			`  bash: ${toolsDict.bash}`,
			`  write: ${toolsDict.write}`,
			`  edit: ${toolsDict.edit}`,
			"---",
			"",
			ocAgent.content,
		);

		const content = frontmatterLines.join("\n");
		const filename = `${ocAgent.name}.md`;

		return E.right({ filename, content });
	} catch (e) {
		return E.left(
			generationError(ocAgent.name, `Agent generation failed: ${e}`),
		);
	}
};

/**
 * Generate OpenCode SKILL.md file content.
 */
export const generateSkillFile = (
	ocSkill: OpenCodeSkill,
): E.Either<
	CLIError,
	{ skillDir: string; skillMdContent: string; supportingFiles: string[] }
> => {
	try {
		// Anthropic Skills v1.0 format
		const frontmatterLines = [
			"---",
			`name: ${escapeYamlValue(ocSkill.name)}`,
			`description: ${escapeYamlValue(ocSkill.description)}`,
		];

		// Add allowed-tools as YAML array if present (OpenCode format)
		if (ocSkill.allowedTools && ocSkill.allowedTools.length > 0) {
			frontmatterLines.push("allowed-tools:");
			for (const tool of ocSkill.allowedTools) {
				frontmatterLines.push(`  - ${tool}`);
			}
		}

		frontmatterLines.push("---", "", ocSkill.content);

		const skillMdContent = frontmatterLines.join("\n");
		const skillDir = ocSkill.name;

		// Supporting files are copied separately by caller
		// Generator just provides the paths
		return E.right({
			skillDir,
			skillMdContent,
			supportingFiles: [...ocSkill.supportingFiles],
		});
	} catch (e) {
		return E.left(
			generationError(ocSkill.name, `Skill generation failed: ${e}`),
		);
	}
};

/**
 * Generate OpenCode manifest.json content.
 */
export const generateManifest = (
	pluginName: string,
	version: string,
	commands: readonly string[],
	agents: readonly string[],
	skills: readonly string[],
	hasOpenCodePlugin?: boolean,
): E.Either<CLIError, string> => {
	try {
		const timestamp = new Date().toISOString();

		const manifest: PluginManifest = {
			plugin: pluginName,
			version,
			generatedAt: timestamp,
			opencodeVersionTested: "0.9.x",
			artifacts: {
				commands: [...commands],
				agents: [...agents],
				skills: [...skills],
			},
			installation: {
				commandsDir: "~/.config/opencode/command/",
				agentsDir: "~/.config/opencode/agent/",
				skillsDir: "~/.config/opencode/skills/",
			},
			requirements: {
				opencodeVersion: ">=0.8.0",
				opencodeSkillsRequired: skills.length > 0,
			},
			hasOpenCodePlugin,
		};

		return E.right(JSON.stringify(manifest, null, 2));
	} catch (e) {
		return E.left(
			generationError(pluginName, `Manifest generation failed: ${e}`),
		);
	}
};

/**
 * Generate combined bundle manifest for asset embedding.
 * This manifest is used by generate-asset-imports.ts to create static imports.
 */
export const generateBundleManifest = (
	baseAssets: BundlePluginAssets,
	devAssets: BundlePluginAssets,
	version: string,
): E.Either<CLIError, string> => {
	try {
		const manifest: BundleManifest = {
			plugins: {
				base: baseAssets,
				dev: devAssets,
			},
			version,
			buildTimestamp: new Date().toISOString(),
		};

		return E.right(JSON.stringify(manifest, null, 2));
	} catch (e) {
		return E.left(
			generationError("bundle", `Bundle manifest generation failed: ${e}`),
		);
	}
};
