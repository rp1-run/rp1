/**
 * Install subcommand for all detected tools.
 * Detects installed agentic tools and installs rp1 plugins for each.
 */

import { Command } from "commander";
import * as E from "fp-ts/lib/Either.js";
import { formatError, getExitCode } from "../../../shared/errors.js";
import type { Logger } from "../../../shared/logger.js";
import { createSpinner } from "../../../shared/spinner.js";
import { loadToolsRegistry } from "../../config/supported-tools.js";
import { colorFns } from "../../lib/colors.js";
import {
	type InstallContext,
	installAllDetectedTools,
} from "../../shared/install-core.js";

const { green, yellow, dim, bold } = colorFns;

/**
 * Subcommand: rp1 install all
 * Detects installed agentic tools and installs rp1 plugins for all of them.
 */
export const installAllSubcommand = new Command("all")
	.description("Install rp1 plugins to all detected agentic tools")
	.option("--dry-run", "Show what would be installed without installing")
	.option("-y, --yes", "Skip confirmation prompts")
	.addHelpText(
		"after",
		`
Examples:
  rp1 install all              Detect and install for all tools
  rp1 install all --dry-run    Preview what would be installed
  rp1 install all -y           Skip confirmation prompts
`,
	)
	.action(async (options, command) => {
		const logger = command.parent?.parent?._logger as Logger;
		const isTTY = command.parent?.parent?._isTTY ?? false;
		const spinner = createSpinner(isTTY);

		if (!logger) {
			console.error("Logger not initialized");
			process.exit(1);
		}

		const parentOpts = command.parent?.opts() ?? {};
		const ctx: InstallContext = {
			logger,
			isTTY,
			dryRun: options.dryRun ?? parentOpts.dryRun ?? false,
			skipPrompt: options.yes ?? parentOpts.yes ?? false,
		};

		// Display header
		console.log("");
		console.log(bold("Installing rp1 plugins to all detected tools"));
		console.log("");

		spinner.start("Loading tools registry...");
		const registry = await loadToolsRegistry();
		spinner.succeed("Tools registry loaded");

		const result = await installAllDetectedTools(registry, ctx)();

		if (E.isLeft(result)) {
			console.error(formatError(result.left, process.stderr.isTTY ?? false));
			process.exit(getExitCode(result.left));
		}

		const installResult = result.right;

		// Display results
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
			} else if (toolResult.skipped) {
				console.log(yellow(`  [SKIP] ${toolResult.toolName}`));
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
