/**
 * Uninstall subcommand for Copilot CLI.
 * Removes rp1 plugins from Copilot CLI environment.
 */

import { Command } from "commander";
import * as E from "fp-ts/lib/Either.js";
import { formatError, getExitCode } from "../../shared/errors.js";
import type { Logger } from "../../shared/logger.js";
import { confirmAction } from "../../shared/prompts.js";
import { getCopilotPaths, uninstallCopilot } from "../install/copilot/index.js";
import { colorFns } from "../lib/colors.js";

const { bold, dim } = colorFns;

/**
 * Subcommand: rp1 uninstall copilot
 * Removes rp1 plugins from Copilot CLI.
 */
export const uninstallCopilotCommand = new Command("copilot")
	.description("Remove rp1 plugins from Copilot CLI")
	.option("--dry-run", "Show what would be removed without making changes")
	.option("-y, --yes", "Skip confirmation prompts")
	.addHelpText(
		"after",
		`
Removes rp1 content from your Copilot CLI environment:
  - Uninstalls rp1 native plugins from GitHub Copilot CLI
  - Removes the rp1-local marketplace and ~/.rp1/copilot/marketplace
  - Cleans up rp1-only legacy files under ~/.config/github-copilot/
  - Preserves all non-rp1 content

Examples:
  rp1 uninstall copilot              Interactive uninstall
  rp1 uninstall copilot --dry-run    Preview changes without removing
  rp1 uninstall copilot -y           Non-interactive uninstall
`,
	)
	.action(async (options, command) => {
		const logger = command.parent?._logger as Logger;
		const isTTY = command.parent?._isTTY ?? process.stdout.isTTY ?? false;

		if (!logger) {
			console.error("Logger not initialized");
			process.exit(1);
		}

		const dryRun = options.dryRun ?? false;
		const yes = options.yes ?? false;
		const paths = getCopilotPaths();

		if (!dryRun && !yes) {
			const proceed = await confirmAction(
				"Remove rp1 plugins from Copilot CLI?",
				{ isTTY, defaultOnNonTTY: false },
			);
			if (!proceed) {
				console.log("Cancelled.");
				process.exit(0);
			}
		}

		if (dryRun) {
			console.log(dim("[dry-run] Uninstall preview:"));
			console.log("");
		}

		const result = await uninstallCopilot(paths, dryRun)();

		if (E.isLeft(result)) {
			console.error(formatError(result.left, process.stderr.isTTY ?? false));
			process.exit(getExitCode(result.left));
		}

		const {
			pluginsUninstalled,
			marketplaceRemoved,
			marketplaceDeleted,
			skillsRemoved,
			agentsRemoved,
			legacyConfigRemoved,
		} = result.right;

		if (dryRun) {
			console.log("");
			console.log(dim("Run without --dry-run to execute removal."));
			return;
		}

		console.log("");
		if (
			pluginsUninstalled.length > 0 ||
			marketplaceRemoved ||
			marketplaceDeleted ||
			skillsRemoved > 0 ||
			agentsRemoved ||
			legacyConfigRemoved
		) {
			logger.success(bold("rp1 has been removed from Copilot CLI"));
			if (pluginsUninstalled.length > 0) {
				console.log(
					dim(`  Uninstalled plugins: ${pluginsUninstalled.join(", ")}`),
				);
			}
			if (marketplaceRemoved) {
				console.log(dim("  Removed Copilot marketplace registration"));
			}
			if (marketplaceDeleted) {
				console.log(dim("  Removed ~/.rp1/copilot/marketplace"));
			}
			if (skillsRemoved > 0) {
				console.log(
					dim(
						`  Removed ${skillsRemoved} legacy skill director${skillsRemoved === 1 ? "y" : "ies"}`,
					),
				);
			}
			if (agentsRemoved) {
				console.log(dim("  Removed legacy rp1 agent files"));
			}
			if (legacyConfigRemoved) {
				console.log(dim("  Removed empty legacy Copilot config directory"));
			}
		} else {
			console.log("No rp1 Copilot content found in the current environment.");
		}
	});
