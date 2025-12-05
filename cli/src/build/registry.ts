/**
 * Platform registry with transformation rules.
 * TypeScript port of tools/build/src/rp1_opencode_builder/registry.py
 */

import type { PlatformRegistry } from "./models.js";

/**
 * Default platform registry with mappings from Claude Code to OpenCode.
 */
export const defaultRegistry: PlatformRegistry = {
  directoryMappings: {
    agents: "agent",
    commands: "command",
  },

  toolMappings: {
    // Direct file operation mappings
    Read: "read_file",
    Write: "write_file",
    Edit: "edit_file",
    NotebookEdit: "edit_notebook_cell",
    // Search and discovery mappings
    Grep: "grep_file",
    Glob: "glob_pattern",
    // Execution mappings
    Bash: "bash_run",
    BashOutput: "get_bash_output",
    KillShell: "kill_bash",
    // Agent coordination (semantic transformations)
    Task: "@mention",
    SlashCommand: "command_invoke",
    Skill: "skills_{name}",
    // Web and external
    WebFetch: "web_fetch",
    WebSearch: "web_search",
    // Interaction
    AskUserQuestion: "ask_user",
    TodoWrite: "manage_todos",
    // Special tools (Claude Code specific)
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

/**
 * Get a tool mapping, returning the original tool name if no mapping exists.
 */
export const getToolMapping = (
  registry: PlatformRegistry,
  tool: string,
): string | null => {
  const mapping = registry.toolMappings[tool];
  if (mapping === undefined) {
    return tool; // No mapping, keep original
  }
  return mapping; // null means tool should be filtered out
};

/**
 * Get a directory mapping.
 */
export const getDirectoryMapping = (
  registry: PlatformRegistry,
  dir: string,
): string => {
  return registry.directoryMappings[dir] ?? dir;
};
