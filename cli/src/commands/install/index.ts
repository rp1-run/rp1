/**
 * Install parent command module.
 * Provides `rp1 install` with subcommands for different agentic tools.
 */

import { Command } from "commander";
import { installAllSubcommand } from "./all.js";
import { installClaudeCodeSubcommand } from "./claude-code.js";
import { installOpenCodeSubcommand } from "./opencode.js";

/**
 * Parent command: rp1 install
 * Shows help with available subcommands when run without arguments.
 */
export const installParentCommand = new Command("install")
	.description("Install rp1 plugins to agentic tools")
	.addHelpText(
		"after",
		`
Subcommands:
  claude-code    Install plugins to Claude Code
  opencode       Install plugins to OpenCode
  all            Install plugins to all detected tools

Examples:
  rp1 install claude-code              Install to Claude Code
  rp1 install opencode                 Install to OpenCode
  rp1 install all                      Install to all detected tools
  rp1 install claude-code --dry-run    Preview installation
  rp1 install opencode -y              Skip confirmation prompts
`,
	);

installParentCommand.addCommand(installClaudeCodeSubcommand);
installParentCommand.addCommand(installOpenCodeSubcommand);
installParentCommand.addCommand(installAllSubcommand);

export { installAllSubcommand } from "./all.js";
// Re-export subcommands for direct use if needed
export { installClaudeCodeSubcommand } from "./claude-code.js";
export { installOpenCodeSubcommand } from "./opencode.js";
