/**
 * Codex platform registry with tool and metadata mappings.
 */

import type { PlatformRegistry } from "../models.js";

/**
 * Platform registry mapping Claude Code tools to Codex equivalents.
 * Tools mapped to null are filtered out of Codex build output.
 */
export const codexRegistry: PlatformRegistry = {
	directoryMappings: {
		agents: "agents",
	},

	toolMappings: {
		// Confirmed Codex tools (from evals/suites/shared/tool-names.ts)
		Bash: "functions.exec_command",
		Edit: "functions.apply_patch",
		AskUserQuestion: "functions.request_user_input",

		// No dedicated Codex equivalents (agents use exec_command instead)
		Read: null,
		Write: null,
		Grep: null,
		Glob: null,
		NotebookEdit: null,
		BashOutput: null,
		KillShell: null,
		WebFetch: null,
		WebSearch: null,
		TodoWrite: null,

		// Agent coordination -- handled by Codex native multi-agent spawning
		Task: null,
		SlashCommand: null,
		Skill: null,

		// Claude Code specific -- no Codex equivalent
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
