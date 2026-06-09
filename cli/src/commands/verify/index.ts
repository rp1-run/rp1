/**
 * Verify parent command with subcommands.
 * Provides verification for rp1 plugin installations across different tools.
 */

import { Command } from "commander";
import type { Logger } from "../../../shared/logger.js";
import { TOOLS_REGISTRY } from "../../config/supported-tools.generated.js";
import {
	isToolEnabled,
	type ToolsRegistry,
} from "../../config/supported-tools.js";
import { colorFns } from "../../lib/colors.js";
import {
	executeVerifyAntigravity,
	verifyAntigravitySubcommand,
} from "./antigravity.js";
import {
	executeVerifyClaudeCode,
	verifyClaudeCodeSubcommand,
} from "./claude-code.js";
import { executeVerifyCodex, verifyCodexSubcommand } from "./codex.js";
import { executeVerifyCopilot, verifyCopilotSubcommand } from "./copilot.js";
import { verifyGeminiSubcommand } from "./gemini.js";
import { verifyGooseSubcommand } from "./goose.js";
import { executeVerifyOpenCode, verifyOpenCodeSubcommand } from "./opencode.js";

const { bold, dim } = colorFns;

/**
 * Verify parent command.
 * When invoked without a subcommand, verifies all known platforms.
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
  copilot        Verify plugins in GitHub Copilot CLI
  antigravity    Verify Antigravity CLI integration

Examples:
  rp1 verify                Verify all platforms
  rp1 verify claude-code    Verify Claude Code installation
  rp1 verify opencode       Verify OpenCode installation
  rp1 verify codex          Verify Codex CLI installation
  rp1 verify copilot        Verify Copilot CLI installation
  rp1 verify antigravity    Verify Antigravity CLI setup
  rp1 verify goose          Verify Goose CLI setup
`,
	)
	.action(async (_options, command) => {
		const logger = command.parent?._logger as Logger;
		if (!logger) {
			console.error("Logger not initialized");
			process.exit(1);
		}

		console.log(bold("Verifying all platforms...\n"));

		const platforms: { name: string; run: () => Promise<boolean> }[] = [
			{ name: "Claude Code", run: () => executeVerifyClaudeCode(logger) },
			{
				name: "OpenCode",
				run: () => executeVerifyOpenCode(undefined, logger),
			},
		];

		if (isToolEnabled(TOOLS_REGISTRY as ToolsRegistry, "codex")) {
			platforms.push({
				name: "Codex CLI",
				run: () => executeVerifyCodex(logger),
			});
		}

		if (isToolEnabled(TOOLS_REGISTRY as ToolsRegistry, "copilot")) {
			platforms.push({
				name: "Copilot CLI",
				run: () => executeVerifyCopilot(logger),
			});
		}

		if (isToolEnabled(TOOLS_REGISTRY as ToolsRegistry, "antigravity")) {
			platforms.push({
				name: "Antigravity CLI",
				run: () => executeVerifyAntigravity(logger),
			});
		}

		let hasFailure = false;

		for (const platform of platforms) {
			const ok = await platform.run();
			if (!ok) hasFailure = true;
			console.log(dim("─".repeat(50)));
		}

		if (hasFailure) {
			process.exit(1);
		}
	});

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

const copilotVerifyEnabled = isToolEnabled(
	TOOLS_REGISTRY as ToolsRegistry,
	"copilot",
);
verifyCommand.addCommand(verifyCopilotSubcommand, {
	hidden: !copilotVerifyEnabled,
});
if (!copilotVerifyEnabled) {
	verifyCopilotSubcommand.action(async () => {
		process.exit(1);
	});
}

const antigravityVerifyEnabled = isToolEnabled(
	TOOLS_REGISTRY as ToolsRegistry,
	"antigravity",
);
verifyCommand.addCommand(verifyAntigravitySubcommand, {
	hidden: !antigravityVerifyEnabled,
});
if (!antigravityVerifyEnabled) {
	verifyAntigravitySubcommand.action(async () => {
		process.exit(1);
	});
}

verifyCommand.addCommand(verifyGeminiSubcommand, {
	hidden: true,
});

const gooseVerifyEnabled = isToolEnabled(
	TOOLS_REGISTRY as ToolsRegistry,
	"goose",
);
verifyCommand.addCommand(verifyGooseSubcommand, {
	hidden: !gooseVerifyEnabled,
});
if (!gooseVerifyEnabled) {
	verifyGooseSubcommand.action(async () => {
		process.exit(1);
	});
}

// Export subcommands for direct access if needed
export {
	executeVerifyAntigravity,
	verifyAntigravitySubcommand,
} from "./antigravity.js";
export {
	executeVerifyClaudeCode,
	verifyClaudeCodeSubcommand,
} from "./claude-code.js";
export { executeVerifyCodex, verifyCodexSubcommand } from "./codex.js";
export {
	executeVerifyCopilot,
	verifyCopilotSubcommand,
} from "./copilot.js";
export { executeVerifyGemini, verifyGeminiSubcommand } from "./gemini.js";
export { executeVerifyGoose, verifyGooseSubcommand } from "./goose.js";
export { executeVerifyOpenCode, verifyOpenCodeSubcommand } from "./opencode.js";
