/**
 * Install subcommand for Codex CLI.
 * Installs rp1 plugins to Codex CLI environment.
 */

import { Command } from "commander";
import * as E from "fp-ts/lib/Either.js";
import { formatError, getExitCode } from "../../../shared/errors.js";
import type { Logger } from "../../../shared/logger.js";
import { colorFns } from "../../lib/colors.js";
import {
	type InstallContext,
	installCodexPlugins,
} from "../../shared/install-core.js";

const { dim } = colorFns;

/**
 * Subcommand: rp1 install codex
 * Installs rp1 plugins to Codex CLI.
 */
export const installCodexSubcommand = new Command("codex")
	.description("Install rp1 plugins to Codex CLI")
	.option("-a, --artifacts-dir <path>", "Path to Codex artifacts directory")
	.option("--dry-run", "Show what would be installed without installing")
	.option("-y, --yes", "Skip confirmation prompts")
	.addHelpText(
		"after",
		`
Examples:
  rp1 install codex                    Install from default artifacts
  rp1 install codex --dry-run          Preview installation
  rp1 install codex -a ./my-artifacts  Install from custom path
  rp1 install codex -y                 Skip confirmation prompts
`,
	)
	.action(async (options, command) => {
		const logger = command.parent?.parent?._logger as Logger;
		const isTTY = command.parent?.parent?._isTTY ?? false;

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

		const result = await installCodexPlugins(
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
			console.log("  - rp1-base");
			console.log("  - rp1-dev");

			if (installResult.warnings.length > 0) {
				console.log("");
				console.log(dim("Warnings:"));
				for (const warning of installResult.warnings) {
					console.log(dim(`  - ${warning}`));
				}
			}

			console.log("");
			console.log("Start a Codex session to use rp1 skills.");
		}
	});
