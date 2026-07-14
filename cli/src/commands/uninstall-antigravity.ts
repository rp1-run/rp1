import { Command } from "commander";
import * as E from "fp-ts/lib/Either.js";
import { formatError, getExitCode } from "../../shared/errors.js";
import type { Logger } from "../../shared/logger.js";
import { confirmAction } from "../../shared/prompts.js";
import {
	type AntigravityUninstallResult,
	uninstallAntigravityPackageAssets,
} from "../install/antigravity/index.js";
import { colorFns } from "../lib/colors.js";
import { syncHarnessSelectionRemove } from "../shared/install-core.js";

const { bold, cyan, dim, green, yellow } = colorFns;

const printList = (items: readonly string[]): void => {
	for (const item of items) {
		console.log(dim(`  - ${item}`));
	}
};

const printAntigravityUninstallResult = (
	result: AntigravityUninstallResult,
	logger: Logger,
): void => {
	console.log("");
	console.log(bold("Antigravity CLI package uninstall"));
	console.log("");

	if (result.dryRun) {
		if (result.wouldRemoveFiles.length > 0) {
			console.log(
				yellow("Dry run: would remove rp1-owned Antigravity assets:"),
			);
			printList(result.wouldRemoveFiles);
		} else {
			console.log("No rp1-owned Antigravity package assets found.");
		}
	} else if (result.removedFiles.length > 0) {
		logger.success(green("Removed rp1-owned Antigravity package assets"));
		printList(result.removedFiles);
	} else if (result.inactive) {
		console.log("No active rp1-owned Antigravity package assets found.");
	}

	const blockedStatuses = result.statuses.filter(
		(status) =>
			status.result === "blocked_unowned" || status.result === "failed",
	);
	if (blockedStatuses.length > 0) {
		console.log("");
		console.log(yellow("Skipped files that were not safe to remove:"));
		for (const status of blockedStatuses) {
			console.log(dim(`  - ${status.asset.displayPath}`));
			if (status.issue) console.log(dim(`    ${status.issue}`));
		}
	}

	if (result.unexpectedLeftovers.length > 0) {
		console.log("");
		console.log(yellow("Unexpected leftovers preserved:"));
		printList(result.unexpectedLeftovers);
	}

	if (result.issue) {
		console.log("");
		console.log(yellow(`Lifecycle state: ${result.state}`));
		console.log(dim(result.issue));
	}

	if (result.userAction) {
		console.log("");
		console.log(dim("Next action:"));
		console.log(cyan(`  ${result.userAction}`));
	}
};

export interface UninstallAntigravityCommandOptions {
	readonly homeDir?: string;
	readonly globalSettingsPath?: string;
}

export const createUninstallAntigravityCommand = (
	commandOptions: UninstallAntigravityCommandOptions = {},
): Command =>
	new Command("antigravity")
		.description("Remove rp1 Antigravity CLI package assets")
		.option("--dry-run", "Show what would be removed without making changes")
		.option("-y, --yes", "Skip confirmation prompts")
		.addHelpText(
			"after",
			`
Removes only rp1-owned Antigravity package assets:
  - Matches files from the rp1 Antigravity manifest
  - Preserves modified files and unexpected leftovers
  - Removes empty rp1 Antigravity package directories when safe

Examples:
  rp1 uninstall antigravity              Interactive uninstall
  rp1 uninstall antigravity --dry-run    Preview manifest-owned removal
  rp1 uninstall antigravity -y           Non-interactive uninstall
`,
		)
		.action(async (options, command) => {
			const logger = command.parent?.parent?._logger as Logger;
			const isTTY =
				command.parent?.parent?._isTTY ?? process.stdout.isTTY ?? false;

			if (!logger) {
				console.error("Logger not initialized");
				process.exit(1);
			}

			const parentOptions = command.parent?.opts?.() ?? {};
			const dryRun = Boolean(options.dryRun || parentOptions.dryRun);
			const yes = Boolean(options.yes || parentOptions.yes);

			if (!dryRun && !yes) {
				const proceed = await confirmAction(
					"Remove rp1 Antigravity CLI package assets?",
					{ isTTY, defaultOnNonTTY: false },
				);
				if (!proceed) {
					console.log("Cancelled.");
					process.exit(0);
				}
			}

			const result = await uninstallAntigravityPackageAssets({
				dryRun,
				homeDir: commandOptions.homeDir,
			})();

			if (E.isLeft(result)) {
				console.error(formatError(result.left, process.stderr.isTTY ?? false));
				process.exit(getExitCode(result.left));
			}

			if (!dryRun) {
				syncHarnessSelectionRemove(
					"antigravity",
					commandOptions.globalSettingsPath,
				);
			}

			printAntigravityUninstallResult(result.right, logger);
		});

export const uninstallAntigravityCommand = createUninstallAntigravityCommand();
