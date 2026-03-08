/**
 * Canonical tool name mapping for cross-provider eval assertions.
 * Maps provider-specific tool names to a small set of canonical names
 * that evals actually assert on.
 */

/** Only the tools we actually assert on in evals. */
export type CanonicalTool =
	| "shell"
	| "read"
	| "write"
	| "edit"
	| "ask_user"
	| "subagent"
	| "skill";

const CANONICAL_MAP: Record<string, CanonicalTool> = {
	// Claude Code (PascalCase)
	Bash: "shell",
	Read: "read",
	Write: "write",
	Edit: "edit",
	AskUserQuestion: "ask_user",
	Agent: "subagent",
	Task: "subagent",
	Skill: "skill",
	// OpenCode (lowercase)
	bash: "shell",
	read: "read",
	write: "write",
	edit: "edit",
	question: "ask_user",
	task: "subagent",
	skill: "skill",
	// Codex (namespaced)
	"functions.exec_command": "shell",
	"functions.apply_patch": "edit",
	"functions.request_user_input": "ask_user",
};

/** Resolve a raw provider tool name to its canonical form, or undefined if untracked. */
export function toCanonical(rawName: string): CanonicalTool | undefined {
	return CANONICAL_MAP[rawName];
}
