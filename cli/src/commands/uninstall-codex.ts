/**
 * Uninstall subcommand for Codex CLI.
 * Removes rp1 plugins from Codex CLI environment.
 */

import { Command } from "commander";
import * as E from "fp-ts/lib/Either.js";
import { formatError, getExitCode } from "../../shared/errors.js";
import type { Logger } from "../../shared/logger.js";
import { confirmAction } from "../../shared/prompts.js";
import { getCodexPaths, uninstallCodex } from "../install/codex/index.js";
import { colorFns } from "../lib/colors.js";

const { bold, dim } = colorFns;

/**
 * Subcommand: rp1 uninstall codex
 * Removes rp1 plugins from Codex CLI.
 */
export const uninstallCodexCommand = new Command("codex")
	.description("Remove rp1 plugins from Codex CLI")
	.option("--dry-run", "Show what would be removed without making changes")
	.option("-y, --yes", "Skip confirmation prompts")
	.addHelpText(
		"after",
		`
Removes rp1 content from your Codex CLI environment:
  - Removes rp1-* skill directories from ~/.codex/skills/
  - Removes rp1-managed agent files from ~/.codex/agents/rp1/
  - Removes rp1-managed sections from ~/.codex/config.toml
  - Preserves all non-rp1 content

Examples:
  rp1 uninstall codex              Interactive uninstall
  rp1 uninstall codex --dry-run    Preview changes without removing
  rp1 uninstall codex -y           Non-interactive uninstall
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
		const paths = getCodexPaths();

		if (!dryRun && !yes) {
			const proceed = await confirmAction(
				"Remove rp1 plugins from Codex CLI?",
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

		const result = await uninstallCodex(paths, dryRun)();

		if (E.isLeft(result)) {
			console.error(formatError(result.left, process.stderr.isTTY ?? false));
			process.exit(getExitCode(result.left));
		}

		const { skillsRemoved, agentsRemoved, configCleaned } = result.right;

		if (dryRun) {
			console.log("");
			console.log(dim("Run without --dry-run to execute removal."));
			return;
		}

		console.log("");
		if (skillsRemoved > 0 || agentsRemoved || configCleaned) {
			logger.success(bold("rp1 has been removed from Codex CLI"));
			if (skillsRemoved > 0) {
				console.log(dim(`  Removed ${skillsRemoved} skill directories`));
			}
			if (agentsRemoved) {
				console.log(dim("  Removed rp1 agent definitions"));
			}
			if (configCleaned) {
				console.log(dim("  Cleaned rp1 sections from config.toml"));
			}
		} else {
			console.log("No rp1 content found in Codex CLI environment.");
		}
	});
