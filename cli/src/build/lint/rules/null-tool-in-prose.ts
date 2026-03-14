/**
 * L005: Detect CC-specific tool names appearing in non-CC rendered prose.
 *
 * When rendered output for OpenCode or Codex contains prose references to
 * CC-native tool names (e.g., "use the Edit tool" in Codex output where
 * the editing model is apply_patch), it suggests the content was not
 * properly transformed through semantic tags.
 *
 * This rule produces warnings (not errors) because some prose references
 * may be intentional documentation or comparisons.
 */

import type { BuildPlatform } from "../../template-context.js";
import type { LintDiagnostic } from "../index.js";

const CC_TOOL_PROSE_PATTERNS: ReadonlyArray<{
	readonly pattern: RegExp;
	readonly tool: string;
	readonly tag: string;
}> = [
	{
		pattern: /\bthe Edit tool\b/g,
		tool: "Edit",
		tag: "{% edit_model %}",
	},
	{
		pattern: /\bthe Read tool\b/g,
		tool: "Read",
		tag: "platform-appropriate file reading instructions",
	},
	{
		pattern: /\bthe Write tool\b/g,
		tool: "Write",
		tag: "platform-appropriate file writing instructions",
	},
	{
		pattern: /\bTodoWrite\b/g,
		tool: "TodoWrite",
		tag: "{% plan_tool %}",
	},
	{
		pattern: /\bAskUserQuestion\b/g,
		tool: "AskUserQuestion",
		tag: "{% ask_user %}",
	},
	{
		pattern: /\bWebFetch\b/g,
		tool: "WebFetch",
		tag: "{% web_access %}",
	},
	{
		pattern: /\bEnterPlanMode\b/g,
		tool: "EnterPlanMode",
		tag: "{% plan_tool %}",
	},
	{
		pattern: /\bExitPlanMode\b/g,
		tool: "ExitPlanMode",
		tag: "{% plan_tool %}",
	},
];

function findLineNumber(content: string, index: number): number {
	let line = 1;
	for (let i = 0; i < index && i < content.length; i++) {
		if (content[i] === "\n") line++;
	}
	return line;
}

export function nullToolInProseRule(
	content: string,
	platform: BuildPlatform,
	file: string,
): LintDiagnostic[] {
	if (platform === "claude-code") return [];

	const diagnostics: LintDiagnostic[] = [];

	for (const { pattern, tool, tag } of CC_TOOL_PROSE_PATTERNS) {
		pattern.lastIndex = 0;
		let match: RegExpExecArray | null;
		while ((match = pattern.exec(content)) !== null) {
			diagnostics.push({
				rule: "L005",
				severity: "warning",
				message: `CC-specific tool name "${tool}" appears in ${platform} rendered output`,
				file,
				line: findLineNumber(content, match.index),
				suggestion: `Use ${tag} to produce platform-appropriate references`,
			});
		}
	}

	return diagnostics;
}
