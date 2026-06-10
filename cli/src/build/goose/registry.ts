/**
 * Goose platform registry with tool and metadata mappings.
 */

import type { PlatformRegistry } from "../models.js";

export const gooseRegistry: PlatformRegistry = {
	directoryMappings: {
		agents: "agents",
		recipes: "recipes",
		skills: "skills",
	},

	toolMappings: {
		Read: "developer",
		Write: "developer",
		Edit: "developer",
		Grep: "developer",
		Glob: "developer",
		Bash: "developer",

		NotebookEdit: null,
		BashOutput: null,
		KillShell: null,
		Task: null,
		Skill: null,
		SlashCommand: null,
		TodoWrite: null,

		WebFetch: null,
		WebSearch: null,
		AskUserQuestion: null,

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
