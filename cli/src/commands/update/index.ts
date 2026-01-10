/**
 * Update command for rp1.
 * Provides unified interface for updating CLI and plugins.
 *
 * Usage:
 *   rp1 update              - Update CLI, then prompt for plugin update
 *   rp1 update --check      - Check for updates without installing
 *   rp1 update --dry-run    - Show what would be done
 *   rp1 update --force      - Force update even if on latest
 *   rp1 update plugins      - Update plugins only
 */

import { Command } from "commander";
import * as E from "fp-ts/lib/Either.js";
import { formatError } from "../../../shared/errors.js";
import type { Logger } from "../../../shared/logger.js";
import { confirmAction } from "../../../shared/prompts.js";
import { loadToolsRegistry } from "../../config/supported-tools.js";
import { DEFAULT_TTL_HOURS, writeCache } from "../../lib/cache.js";
import { getColorFns } from "../../lib/colors.js";
import {
	detectInstallMethod,
	type InstallMethod,
	runUpdate,
} from "../../lib/package-manager.js";
import {
	type CheckOptions,
	checkForUpdate,
	getInstalledVersion,
} from "../../lib/version.js";
import {
	type InstallContext,
	installAllDetectedTools,
} from "../../shared/install-core.js";
import { pluginsSubcommand } from "./plugins.js";

/**
 * GitHub releases URL for manual installation instructions.
 */
const GITHUB_RELEASES_URL = "https://github.com/rp1-run/rp1/releases";

/**
 * Get human-readable name for installation method.
 */
const getMethodName = (method: InstallMethod): string => {
	switch (method) {
		case "homebrew":
			return "Homebrew";
		case "scoop":
			return "Scoop";
		case "manual":
			return "manual installation";
	}
};

/**
 * Get the update command for an installation method.
 */
const getUpdateCommand = (method: InstallMethod): string | null => {
	switch (method) {
		case "homebrew":
			return "brew upgrade rp1";
		case "scoop":
			return "scoop update rp1";
		case "manual":
			return null;
	}
};

/**
 * Format check-update result for human output.
 * Exported for use by deprecated check-update command wrapper.
 */
export const formatCheckOutput = (
	result: Awaited<ReturnType<typeof checkForUpdate>>,
	isTTY: boolean,
): void => {
	const { green, yellow, cyan, bold, dim } = getColorFns(isTTY);

	console.log(`rp1 ${bold(`v${result.currentVersion}`)} is installed.`);

	if (result.error) {
		console.log("");
		console.log(`${yellow("Warning:")} ${result.error}`);
		return;
	}

	if (result.updateAvailable && result.latestVersion) {
		console.log("");
		console.log(
			`${green("A new version is available:")} ${bold(`v${result.latestVersion}`)}`,
		);
		console.log("");
		console.log(`Run '${cyan("rp1 update")}' to update.`);
	} else if (result.latestVersion) {
		console.log("");
		console.log(green("You are up to date!"));
	}

	if (result.cached && result.cacheAgeHours !== null) {
		console.log("");
		const ageFormatted =
			result.cacheAgeHours < 1
				? `${Math.round(result.cacheAgeHours * 60)} minutes`
				: `${result.cacheAgeHours.toFixed(1)} hours`;
		console.log(dim(`(cached ${ageFormatted} ago)`));
	}
};

/**
 * Execute the self-update logic.
 * Returns true if update was successful, false if manual update required.
 * Exported for use by deprecated self-update command wrapper.
 */
export const executeSelfUpdate = async (
	options: { dryRun: boolean; force: boolean },
	logger: Logger | undefined,
	isTTY: boolean,
): Promise<{ success: boolean; exitCode: number }> => {
	const { green, yellow, cyan, dim } = getColorFns(isTTY);

	logger?.debug(
		`Self-update starting (dry-run=${options.dryRun}, force=${options.force})`,
	);

	// Step 1: Detect installation method
	console.log("Detecting installation method...");
	const detection = await detectInstallMethod();
	logger?.debug(
		`Detection result: method=${detection.method}, confidence=${detection.confidence}`,
	);

	const methodName = getMethodName(detection.method);
	const updateCmd = getUpdateCommand(detection.method);

	if (detection.method === "manual") {
		console.log(yellow(`Could not detect package manager installation.`));
		console.log("");
		console.log(dim(detection.details));
		console.log("");
		console.log("Automatic update is not available for manual installations.");
		console.log("");
		console.log("To update manually:");
		console.log(`  1. Visit: ${cyan(GITHUB_RELEASES_URL)}`);
		console.log("  2. Download the latest release for your platform");
		console.log("  3. Replace your current rp1 binary");
		return { success: false, exitCode: 2 };
	}

	console.log(green(`${methodName} installation detected`));
	console.log("");

	// Step 2: Check if update is needed (unless --force is set)
	const currentVersion = getInstalledVersion();

	if (!options.force) {
		console.log("Checking for updates...");
		const checkOptions: CheckOptions = {
			force: true, // Always bypass cache for self-update check
			timeoutMs: 10000, // Longer timeout for update scenario
		};
		const versionCheck = await checkForUpdate(checkOptions);

		if (!versionCheck.updateAvailable && versionCheck.latestVersion) {
			console.log(
				green(`You are already on the latest version (v${currentVersion})`),
			);
			console.log("");
			console.log(
				dim("Use --force to reinstall the current version if needed."),
			);
			return { success: true, exitCode: 0 };
		}

		if (versionCheck.updateAvailable && versionCheck.latestVersion) {
			console.log(
				`Update available: v${currentVersion} -> v${versionCheck.latestVersion}`,
			);
		}
	}

	console.log("");

	// Step 3: Handle dry-run mode
	if (options.dryRun) {
		console.log("Dry run mode - showing what would be done:");
		console.log("");
		console.log(`  Installation method: ${methodName}`);
		console.log(`  Current version: v${currentVersion}`);
		console.log(`  Update command: ${updateCmd}`);
		return { success: true, exitCode: 0 };
	}

	// Step 4: Run the update
	console.log("Updating rp1...");
	console.log("");

	const updateResult = await runUpdate(detection.method, currentVersion);

	if (!updateResult.success) {
		console.error("Update failed!");
		console.log("");
		if (updateResult.error) {
			console.error(updateResult.error);
		}
		console.log("");
		console.log("You can try updating manually:");
		console.log(`  ${updateCmd}`);
		return { success: false, exitCode: 1 };
	}

	// Step 5: Update cache with new version to suppress update banner
	const newVersion = updateResult.newVersion ?? currentVersion;
	logger?.debug(
		`Updating version cache after successful update to v${newVersion}`,
	);
	const cacheResult = await writeCache({
		latestVersion: newVersion,
		releaseUrl: `${GITHUB_RELEASES_URL}/tag/v${newVersion}`,
		ttlHours: DEFAULT_TTL_HOURS,
	})();
	if (E.isLeft(cacheResult)) {
		logger?.debug(
			`Failed to update cache: ${formatError(cacheResult.left, false)}`,
		);
	}

	// Step 6: Report success
	if (updateResult.output) {
		console.log(updateResult.output);
		console.log("");
	}

	if (updateResult.newVersion && updateResult.newVersion !== currentVersion) {
		console.log(
			green(
				`Successfully updated rp1 from v${currentVersion} to v${updateResult.newVersion}`,
			),
		);
	} else if (updateResult.newVersion) {
		console.log(green(`rp1 v${updateResult.newVersion} is now installed`));
	} else {
		console.log(green("Update completed successfully"));
	}

	return { success: true, exitCode: 0 };
};

/**
 * Execute the update action logic.
 * Exported for use by deprecated command wrappers.
 *
 * @param options - Update options (check, dryRun, force, yes)
 * @param logger - Logger instance
 * @param isTTY - Whether running in TTY mode
 */
export const executeUpdateAction = async (
	options: { check: boolean; dryRun: boolean; force: boolean; yes: boolean },
	logger: Logger | undefined,
	isTTY: boolean,
): Promise<void> => {
	const { dim } = getColorFns(isTTY);

	logger?.debug(
		`Update action starting (check=${options.check}, dry-run=${options.dryRun}, force=${options.force}, yes=${options.yes})`,
	);

	// Handle --check mode: delegate to check-update logic
	if (options.check) {
		const checkOptions: CheckOptions = {
			force: false, // Use cache unless expired
			timeoutMs: 5000,
		};

		logger?.debug(`Checking for updates (timeout=${checkOptions.timeoutMs}ms)`);

		try {
			const result = await checkForUpdate(checkOptions);
			formatCheckOutput(result, isTTY);

			if (result.error && !result.latestVersion) {
				process.exit(1);
			}
			process.exit(0);
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : "Unknown error";
			console.error(`Error: ${errorMessage}`);
			process.exit(1);
		}
	}

	// Standard update flow: self-update then optionally update plugins
	const updateResult = await executeSelfUpdate(
		{ dryRun: options.dryRun, force: options.force },
		logger,
		isTTY,
	);

	// If self-update failed or requires manual intervention, exit
	if (!updateResult.success || updateResult.exitCode !== 0) {
		process.exit(updateResult.exitCode);
	}

	// For dry-run, also show plugin update preview
	if (options.dryRun) {
		console.log("");
		console.log("Plugin updates would also be available:");
		console.log(
			"  Run 'rp1 update plugins' to update plugins after CLI update.",
		);
		console.log("");
		console.log("Run without --dry-run to perform the update.");
		process.exit(0);
	}

	// Prompt for plugin update (skip in non-TTY or if --yes)
	if (!isTTY) {
		// Non-TTY: skip plugin prompt silently
		console.log("");
		console.log(
			dim("Please restart Claude Code or OpenCode to use the new version."),
		);
		console.log(dim("Run 'rp1 update plugins' to update plugins."));
		process.exit(0);
	}

	console.log("");
	const shouldUpdatePlugins = options.yes
		? true
		: await confirmAction("Would you like to update rp1 plugins as well?", {
				isTTY,
				defaultOnNonTTY: false,
			});

	if (shouldUpdatePlugins && logger) {
		await executePluginUpdates(
			{ dryRun: false, yes: options.yes },
			logger,
			isTTY,
		);
	}

	console.log("");
	console.log(
		dim("Please restart Claude Code or OpenCode to use the new version."),
	);
	process.exit(0);
};

/**
 * Execute plugin updates for all detected tools.
 */
const executePluginUpdates = async (
	options: { dryRun: boolean; yes: boolean },
	logger: Logger,
	isTTY: boolean,
): Promise<void> => {
	const { green, yellow, bold, dim } = getColorFns(isTTY);

	const ctx: InstallContext = {
		logger,
		isTTY,
		dryRun: options.dryRun,
		skipPrompt: options.yes || !isTTY,
	};

	const registry = await loadToolsRegistry();

	console.log("");
	console.log(bold("Updating plugins for all detected tools..."));
	console.log("");

	const result = await installAllDetectedTools(registry, ctx)();

	if (E.isLeft(result)) {
		console.error(formatError(result.left, isTTY));
		return;
	}

	const { installed, results, detected } = result.right;

	console.log(`Detected tools: ${detected.map((d) => d.tool.name).join(", ")}`);
	console.log(`Successfully updated: ${installed}/${results.length}`);
	console.log("");

	for (const res of results) {
		if (res.success) {
			console.log(green(`${res.toolName}: Plugins updated`));
		} else {
			console.log(yellow(`${res.toolName}: Update failed`));
			if (res.error) {
				console.log(dim(`  ${formatError(res.error, false)}`));
			}
		}
	}
};

/**
 * The update command.
 *
 * Usage:
 *   rp1 update [options]
 *   rp1 update plugins [tool]
 *
 * Options:
 *   --check    Check for updates without installing
 *   --dry-run  Show what would be done without executing
 *   --force    Force update even if already on latest
 *   -y, --yes  Skip confirmation prompts
 */
export const updateCommand = new Command("update")
	.description("Update rp1 CLI and/or plugins")
	.option("--check", "Check for updates without installing", false)
	.option("--dry-run", "Show what would be done without executing", false)
	.option("--force", "Force update even if already on latest", false)
	.option("-y, --yes", "Skip confirmation prompts", false)
	.addHelpText(
		"after",
		`
Subcommands:
  plugins [tool]  Update plugins only (default: all detected tools)

Options:
  --check    Check for available updates without installing
  --dry-run  Preview what would be done without making changes
  --force    Force update even if already on the latest version
  -y, --yes  Skip all confirmation prompts

Examples:
  rp1 update                   Update CLI, then prompt for plugin update
  rp1 update --check           Check if updates are available
  rp1 update --dry-run         Preview update actions
  rp1 update --force           Force reinstall current version
  rp1 update -y                Update without prompts
  rp1 update plugins           Update plugins for all detected tools
  rp1 update plugins claude-code  Update Claude Code plugins only
`,
	)
	.action(async (options, command) => {
		const logger = command.parent?._logger as Logger | undefined;
		const isTTY = command.parent?._isTTY ?? process.stdout.isTTY ?? false;

		await executeUpdateAction(options, logger, isTTY);
	});

updateCommand.addCommand(pluginsSubcommand);
