/**
 * Claude Code platform registry with passthrough tool mappings.
 * CC uses the native format, so all tools map to themselves.
 */

import type { PlatformRegistry } from "../models.js";

/**
 * Claude Code platform registry.
 * All tools are passthrough (native CC format).
 * Namespace references use the native `:` separator.
 * Allowed-tools remain as comma-separated strings.
 */
export const claudeCodeRegistry: PlatformRegistry = {
	directoryMappings: {
		agents: "agents",
	},

	toolMappings: {
		// All tools are passthrough for CC (native format)
		Read: "Read",
		Write: "Write",
		Edit: "Edit",
		NotebookEdit: "NotebookEdit",
		Grep: "Grep",
		Glob: "Glob",
		Bash: "Bash",
		BashOutput: "BashOutput",
		KillShell: "KillShell",
		Task: "Task",
		SlashCommand: "SlashCommand",
		Skill: "Skill",
		WebFetch: "WebFetch",
		WebSearch: "WebSearch",
		AskUserQuestion: "AskUserQuestion",
		TodoWrite: "TodoWrite",
		ExitPlanMode: "ExitPlanMode",
		EnterPlanMode: "EnterPlanMode",
	},

	metadataMappings: {
		name: "name",
		description: "description",
		"allowed-tools": "allowed-tools",
	},
} as const;
