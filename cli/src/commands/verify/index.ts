/**
 * Verify parent command with subcommands.
 * Provides verification for rp1 plugin installations across different tools.
 */

import { Command } from "commander";
import { TOOLS_REGISTRY } from "../../config/supported-tools.generated.js";
import {
	isToolEnabled,
	type ToolsRegistry,
} from "../../config/supported-tools.js";
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

Examples:
  rp1 verify claude-code    Verify Claude Code installation
  rp1 verify opencode       Verify OpenCode installation
`,
	);

verifyCommand.addCommand(verifyClaudeCodeSubcommand);
verifyCommand.addCommand(verifyOpenCodeSubcommand);

const codexVerifyEnabled = isToolEnabled(
	TOOLS_REGISTRY as ToolsRegistry,
	"codex",
);
verifyCommand.addCommand(verifyCodexSubcommand, {
	hidden: !codexVerifyEnabled,
});
if (!codexVerifyEnabled) {
	verifyCodexSubcommand.action(async () => {
		process.exit(1);
	});
}

// Export subcommands for direct access if needed
export {
	executeVerifyClaudeCode,
	verifyClaudeCodeSubcommand,
} from "./claude-code.js";
export { executeVerifyCodex, verifyCodexSubcommand } from "./codex.js";
export { executeVerifyOpenCode, verifyOpenCodeSubcommand } from "./opencode.js";
