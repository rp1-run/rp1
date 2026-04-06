/**
 * Copilot CLI platform registry with tool and metadata mappings.
 *
 * Tool name mappings are flagged as HYP-001 in the design document
 * and must be validated through the compatibility fixture.
 */

import type { PlatformRegistry } from "../models.js";

/**
 * Platform registry mapping Claude Code tools to Copilot CLI equivalents.
 * Tools mapped to null are filtered out of Copilot build output.
 */
export const copilotRegistry: PlatformRegistry = {
	directoryMappings: {
		agents: "agents",
	},

	toolMappings: {
		// File operations
		Read: "read_file",
		Write: "write_file",
		Edit: "edit_file",
		Grep: "grep_search",
		Glob: "file_search",

		// Execution
		Bash: "run_terminal_command",

		// Not supported on Copilot CLI
		NotebookEdit: null,
		BashOutput: null,
		KillShell: null,

		// Agent coordination
		Task: "create_agent",
		SlashCommand: null,
		Skill: "run_skill",

		// Web and external
		WebFetch: "fetch_url",
		WebSearch: null,

		// Interaction
		AskUserQuestion: "ask_user",
		TodoWrite: null,

		// Claude Code specific -- no Copilot equivalent
		ExitPlanMode: null,
		EnterPlanMode: null,
	},

	metadataMappings: {
		name: "name",
		version: "version",
		description: "description",
		"argument-hint": "argument-hint",
		tags: "tags",
		created: "created",
		author: "author",
	},
} as const;
