/**
 * Verify parent command with subcommands.
 * Provides verification for rp1 plugin installations across different tools.
 */

import { Command } from "commander";
import { verifyClaudeCodeSubcommand } from "./claude-code.js";
import { verifyCodexSubcommand } from "./codex.js";
import { verifyOpenCodeSubcommand } from "./opencode.js";

/**
 * Verify parent command.
 * Shows help with available subcommands when invoked without arguments.
 */
export const verifyCommand = new Command("verify")
	.description("Verify rp1 plugin installations")
	.addHelpText(
		"after",
		`
Subcommands:
  claude-code    Verify plugins in Claude Code
  opencode       Verify plugins in OpenCode
  codex          Verify plugins in Codex CLI

Examples:
  rp1 verify claude-code    Verify Claude Code installation
  rp1 verify opencode       Verify OpenCode installation
  rp1 verify codex          Verify Codex CLI installation
`,
	);

verifyCommand.addCommand(verifyClaudeCodeSubcommand);
verifyCommand.addCommand(verifyOpenCodeSubcommand);
verifyCommand.addCommand(verifyCodexSubcommand);

// Export subcommands for direct access if needed
export {
	executeVerifyClaudeCode,
	verifyClaudeCodeSubcommand,
} from "./claude-code.js";
export { executeVerifyCodex, verifyCodexSubcommand } from "./codex.js";
export { executeVerifyOpenCode, verifyOpenCodeSubcommand } from "./opencode.js";
