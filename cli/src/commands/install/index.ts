/**
 * Install parent command module.
 * Provides `rp1 install` with subcommands for different agentic tools.
 * When run without a subcommand, auto-detects platforms and installs to all.
 */

import { Command } from "commander";
import * as E from "fp-ts/lib/Either.js";
import { formatError, getExitCode } from "../../../shared/errors.js";
import type { Logger } from "../../../shared/logger.js";
import { createSpinner } from "../../../shared/spinner.js";
import { loadToolsRegistry } from "../../config/supported-tools.js";
import type { VerificationResult } from "../../init/models.js";
import {
	verifyClaudeCodePlugins,
	verifyOpenCodePlugins,
} from "../../init/steps/verification.js";
import { colorFns } from "../../lib/colors.js";
import {
	type InstallContext,
	installAllDetectedTools,
	installForSpecificTool,
	type ToolInstallResult,
} from "../../shared/install-core.js";
import { installAllSubcommand } from "./all.js";
import { installClaudeCodeSubcommand } from "./claude-code.js";
import { installOpenCodeSubcommand } from "./opencode.js";

const { green, yellow, red, dim, bold } = colorFns;

/**
 * Run post-install verification for successfully installed tools.
 * Verifies that plugins are actually present and correctly configured.
 */
async function runPostInstallVerification(
	successfulTools: readonly ToolInstallResult[],
): Promise<void> {
	const toolIds = successfulTools.map((t) => t.toolId);
	if (toolIds.length === 0) return;

	console.log(bold("Verifying installation..."));
	console.log("");

	let allVerified = true;

	for (const toolId of toolIds) {
		let result: VerificationResult | null = null;

		if (toolId === "claude-code") {
			result = await verifyClaudeCodePlugins();
		} else if (toolId === "opencode") {
			result = await verifyOpenCodePlugins();
		}

		if (!result) continue;

		for (const plugin of result.plugins) {
			const status = plugin.installed ? green("[OK]") : red("[MISS]");
			const version = plugin.version ?? "not found";
			console.log(`  ${status} ${plugin.name} (${dim(version)})`);
		}

		if (result.issues.length > 0) {
			for (const issue of result.issues) {
				console.log(yellow(`    - ${issue}`));
			}
		}

		if (!result.verified) {
			allVerified = false;
		}
	}

	console.log("");
	if (allVerified) {
		console.log(green("Verification passed"));
	} else {
		console.log(
			yellow("Verification found issues. Run `rp1 verify` for details."),
		);
	}
}

/**
 * Parent command: rp1 install
 * When run without a subcommand, auto-detects platforms and installs to all.
 * Subcommands target specific platforms.
 */
export const installParentCommand = new Command("install")
	.description("Install rp1 plugins to agentic tools")
	.option("--dry-run", "Show what would be installed without installing")
	.option("-y, --yes", "Skip confirmation prompts")
	.option(
		"-p, --platform <platform>",
		"Target a specific platform (claude-code, opencode)",
	)
	.addHelpText(
		"after",
		`
When run without a subcommand, auto-detects installed platforms and installs to all.
Use --platform to target a specific platform.

Subcommands:
  claude-code    Install plugins to Claude Code
  opencode       Install plugins to OpenCode
  all            Install plugins to all detected tools

Examples:
  rp1 install                            Auto-detect and install to all platforms
  rp1 install --platform claude-code     Install to Claude Code only
  rp1 install claude-code                Install to Claude Code (subcommand)
  rp1 install opencode                   Install to OpenCode (subcommand)
  rp1 install all                        Install to all detected tools
  rp1 install --dry-run                  Preview installation
  rp1 install -y                         Skip confirmation prompts
`,
	)
	.action(async (options, command) => {
		const logger = command.parent?._logger as Logger;
		const isTTY = command.parent?._isTTY ?? false;
		const spinner = createSpinner(isTTY);

		if (!logger) {
			console.error("Logger not initialized");
			process.exit(1);
		}

		const ctx: InstallContext = {
			logger,
			isTTY,
			dryRun: options.dryRun ?? false,
			skipPrompt: options.yes ?? false,
		};

		console.log("");
		console.log(bold("Installing rp1 plugins to all detected tools"));
		console.log("");

		spinner.start("Loading tools registry...");
		const registry = await loadToolsRegistry();
		spinner.succeed("Tools registry loaded");

		// If --platform is specified, install to that specific platform
		if (options.platform) {
			const result = await installForSpecificTool(
				options.platform,
				registry,
				ctx,
			)();

			if (E.isLeft(result)) {
				console.error(formatError(result.left, process.stderr.isTTY ?? false));
				process.exit(getExitCode(result.left));
			}

			const toolResult = result.right;
			console.log("");
			if (toolResult.success) {
				console.log(green(`  [OK] ${toolResult.toolName}`));
				for (const plugin of toolResult.pluginsInstalled) {
					console.log(dim(`       - ${plugin}`));
				}
			} else {
				console.log(yellow(`  [WARN] ${toolResult.toolName}`));
				if (toolResult.error) {
					console.log(dim(`         ${formatError(toolResult.error, false)}`));
				}
			}

			for (const warning of toolResult.warnings) {
				console.log(yellow(`         ${warning}`));
			}

			console.log("");

			if (toolResult.success && !ctx.dryRun) {
				await runPostInstallVerification([toolResult]);
				console.log("");
			}

			console.log(
				dim(
					"Restart your agentic tools and run /help to see available rp1 skills.",
				),
			);
			return;
		}

		// Default: install to all detected platforms
		const result = await installAllDetectedTools(registry, ctx)();

		if (E.isLeft(result)) {
			console.error(formatError(result.left, process.stderr.isTTY ?? false));
			process.exit(getExitCode(result.left));
		}

		const installResult = result.right;

		console.log("");
		console.log(bold("Installation Results:"));
		console.log("");

		for (const toolResult of installResult.results) {
			if (toolResult.success) {
				console.log(green(`  [OK] ${toolResult.toolName}`));
				if (toolResult.pluginsInstalled.length > 0) {
					for (const plugin of toolResult.pluginsInstalled) {
						console.log(dim(`       - ${plugin}`));
					}
				}
			} else {
				console.log(yellow(`  [WARN] ${toolResult.toolName}`));
				if (toolResult.error) {
					console.log(dim(`         ${formatError(toolResult.error, false)}`));
				}
			}

			for (const warning of toolResult.warnings) {
				console.log(yellow(`         ${warning}`));
			}
		}

		console.log("");
		if (installResult.installed > 0) {
			console.log(
				green(
					`Installed rp1 plugins to ${installResult.installed} tool(s) successfully!`,
				),
			);

			if (!ctx.dryRun) {
				console.log("");
				const successfulTools = installResult.results.filter((r) => r.success);
				await runPostInstallVerification(successfulTools);
			}
		} else {
			console.log(yellow("No tools were installed."));
		}

		console.log("");
		console.log(
			dim(
				"Restart your agentic tools and run /help to see available rp1 skills.",
			),
		);
	});

installParentCommand.addCommand(installClaudeCodeSubcommand);
installParentCommand.addCommand(installOpenCodeSubcommand);
installParentCommand.addCommand(installAllSubcommand);

export { installAllSubcommand } from "./all.js";
// Re-export subcommands for direct use if needed
export { installClaudeCodeSubcommand } from "./claude-code.js";
export { installOpenCodeSubcommand } from "./opencode.js";
