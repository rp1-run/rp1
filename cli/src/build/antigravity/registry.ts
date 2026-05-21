import type { PlatformRegistry } from "../models.js";

export const antigravityRegistry: PlatformRegistry = {
	directoryMappings: {
		agents: "agents",
		skills: "skills",
	},

	toolMappings: {
		Read: "read_file",
		Write: "write_file",
		Edit: "replace",
		NotebookEdit: "replace",
		Grep: "search_file_content",
		Glob: "glob",
		Bash: "run_shell_command",
		BashOutput: null,
		KillShell: null,
		Task: "invoke_subagent",
		SlashCommand: "slash_command",
		Skill: "activate_skill",
		WebFetch: "web_fetch",
		WebSearch: "web_search",
		AskUserQuestion: "ask_user",
		TodoWrite: "write_todos",
		ExitPlanMode: "exit_plan_mode",
		EnterPlanMode: "enter_plan_mode",
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
