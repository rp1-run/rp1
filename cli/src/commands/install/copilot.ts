/**
 * Install subcommand for Copilot CLI.
 * Installs rp1 plugins to Copilot CLI environment.
 */

import { Command } from "commander";
import * as E from "fp-ts/lib/Either.js";
import { formatError, getExitCode } from "../../../shared/errors.js";
import type { Logger } from "../../../shared/logger.js";
import { colorFns } from "../../lib/colors.js";
import {
	type InstallContext,
	installCopilotPlugins,
} from "../../shared/install-core.js";

const { dim } = colorFns;

/**
 * Subcommand: rp1 install copilot
 * Installs rp1 plugins to Copilot CLI.
 */
export const installCopilotSubcommand = new Command("copilot")
	.description("Install rp1 plugins to Copilot CLI")
	.option("-a, --artifacts-dir <path>", "Path to Copilot artifacts directory")
	.option("--dry-run", "Show what would be installed without installing")
	.option("-y, --yes", "Skip confirmation prompts")
	.addHelpText(
		"after",
		`
Examples:
  rp1 install copilot                    Install from default artifacts
  rp1 install copilot --dry-run          Preview installation
  rp1 install copilot -a ./my-artifacts  Install from custom path
  rp1 install copilot -y                 Skip confirmation prompts
`,
	)
	.action(async (options, command) => {
		const logger = command.parent?.parent?._logger as Logger;
		const isTTY = command.parent?.parent?._isTTY ?? false;

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

		const result = await installCopilotPlugins(
			{
				artifactsDir: options.artifactsDir ?? null,
			},
			ctx,
		)();

		if (E.isLeft(result)) {
			console.error(formatError(result.left, process.stderr.isTTY ?? false));
			process.exit(getExitCode(result.left));
		}

		const installResult = result.right;

		if (!ctx.dryRun) {
			console.log("");
			console.log("Installed plugins:");
			for (const plugin of installResult.pluginsInstalled) {
				console.log(`  - ${plugin}`);
			}

			if (installResult.warnings.length > 0) {
				console.log("");
				console.log(dim("Warnings:"));
				for (const warning of installResult.warnings) {
					console.log(dim(`  - ${warning}`));
				}
			}

			console.log("");
			console.log("Start a Copilot CLI session to use rp1 skills.");
		}
	});
