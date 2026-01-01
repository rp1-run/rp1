import { Command } from "commander";
import * as E from "fp-ts/lib/Either.js";
import { formatError, getExitCode } from "../../shared/errors.js";
import type { Logger } from "../../shared/logger.js";
import type { PromptOptions } from "../../shared/prompts.js";
import { colorFns } from "../lib/colors.js";
import { executeUninstall, type UninstallConfig } from "../uninstall/index.js";

const { bold, dim, cyan } = colorFns;

export const uninstallCommand = new Command("uninstall")
	.description("Remove rp1 from the current project")
	.option("--dry-run", "Show what would be removed without making changes")
	.option("-y, --yes", "Skip confirmation prompts (non-interactive mode)")
	.option(
		"-s, --scope <scope>",
		"Claude Code plugin scope: user, project, or local",
		"user",
	)
	.addHelpText(
		"after",
		`
Removes rp1 configuration from your project:
  - Removes rp1 content from CLAUDE.md and AGENTS.md
  - Removes rp1 entries from .gitignore
  - Uninstalls rp1-base and rp1-dev plugins from Claude Code

The .rp1/ directory is preserved (contains your knowledge base).
To remove it completely, run: rm -rf .rp1

Examples:
  rp1 uninstall                 Interactive uninstall
  rp1 uninstall --dry-run       Preview changes without removing
  rp1 uninstall -y              Non-interactive uninstall
  rp1 uninstall -s project      Uninstall project-scoped plugins
`,
	)
	.action(async (options, command) => {
		const logger = command.parent?._logger as Logger;
		const isTTY = command.parent?._isTTY ?? process.stdout.isTTY ?? false;

		if (!logger) {
			console.error("Logger not initialized");
			process.exit(1);
		}

		const config: UninstallConfig = {
			dryRun: options.dryRun ?? false,
			yes: options.yes ?? false,
			scope: options.scope as "user" | "project" | "local",
		};

		const promptOptions: PromptOptions = {
			isTTY: config.yes ? false : isTTY,
		};

		const result = await executeUninstall(config, logger, promptOptions)();

		if (E.isLeft(result)) {
			console.error(formatError(result.left, isTTY));
			process.exit(getExitCode(result.left));
		}

		const { actions, warnings, manualCleanup } = result.right;

		// Check for cancellation or no changes
		const cancelled = actions.some(
			(a) => a.type === "skipped" && a.reason === "User cancelled",
		);
		if (cancelled) {
			process.exit(0);
		}

		const noChanges = actions.some((a) => a.type === "no_changes");
		if (noChanges) {
			process.exit(0);
		}

		// Display warnings
		for (const warning of warnings) {
			logger.warn(warning);
		}

		// Display summary
		const removedCount = actions.filter(
			(a) =>
				a.type === "removed_fenced_content" ||
				a.type === "file_emptied" ||
				a.type === "plugin_uninstalled",
		).length;

		if (removedCount > 0) {
			console.log("");
			if (config.dryRun) {
				logger.info(bold("Dry run complete - no changes made"));
			} else {
				logger.success(bold("rp1 has been uninstalled"));
			}
		}

		// Display manual cleanup instructions
		if (manualCleanup.length > 0 && !config.dryRun) {
			console.log("");
			console.log(dim("Manual cleanup (optional):"));
			for (const item of manualCleanup) {
				if (item.startsWith("  ")) {
					console.log(cyan(item));
				} else {
					console.log(dim(item));
				}
			}
		}
	});
