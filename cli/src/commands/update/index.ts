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
import { loadToolsRegistry } from "../../config/supported-tools.js";
import { updatePlugin } from "../../install/claudecode/installer.js";
import {
	isStale,
	type PlatformVersions,
	readAllVersionMarkers,
} from "../../install/version-marker.js";
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
	getDisplayVersion,
	getInstalledVersion,
} from "../../lib/version.js";
import {
	type InstallContext,
	installForSpecificTool,
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
 * Format check-update result for JSON output.
 * Uses snake_case keys for API consistency.
 */
export const formatCheckOutputJson = (
	result: Awaited<ReturnType<typeof checkForUpdate>>,
): void => {
	console.log(
		JSON.stringify(
			{
				current_version: result.currentVersion,
				latest_version: result.latestVersion,
				update_available: result.updateAvailable,
				release_url: result.releaseUrl,
				error: result.error,
				cached: result.cached,
				cache_age_hours: result.cacheAgeHours,
				cache_expires_in_hours: result.cacheExpiresInHours,
			},
			null,
			2,
		),
	);
};

/**
 * Format check-update result for shell hooks.
 * Returns a single-line message when an update is available, otherwise null.
 */
export const formatCheckOutputHookText = (
	result: Awaited<ReturnType<typeof checkForUpdate>>,
): string | null => {
	if (result.error) {
		return null;
	}

	if (result.updateAvailable && result.latestVersion) {
		return `rp1 update available: v${result.currentVersion} -> v${result.latestVersion} | Run /self-update to update`;
	}

	// No update available — return current version info
	const displayVersion = getDisplayVersion();
	return `rp1 is running v${displayVersion}`;
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
 * Known platforms for staleness detection.
 * Order determines display order in status output.
 */
const KNOWN_PLATFORMS = ["claude-code", "opencode", "codex"] as const;

/**
 * Check plugin staleness via version markers and reinstall stale platforms.
 * Reads the centralized version markers file and compares each platform's
 * installed version against the current binary version. Stale platforms
 * are automatically re-extracted and reinstalled from the binary.
 *
 * For Claude Code, additionally runs `claude plugin update` after reinstall
 * to ensure Claude picks up the new plugin files.
 *
 * @param options - Update options (dryRun)
 * @param logger - Logger instance
 * @param isTTY - Whether running in TTY mode
 */
const checkAndReinstallStalePlugins = async (
	options: { dryRun: boolean; yes: boolean },
	logger: Logger,
	isTTY: boolean,
): Promise<void> => {
	const { green, yellow, bold, dim } = getColorFns(isTTY);
	const currentVersion = getInstalledVersion();

	console.log("");
	console.log(bold("Checking plugin staleness..."));

	const markersResult = await readAllVersionMarkers()();

	if (E.isLeft(markersResult)) {
		console.log(
			yellow("Warning: Could not read version markers. Skipping plugin check."),
		);
		logger.debug(
			`Version marker read failed: ${formatError(markersResult.left, false)}`,
		);
		return;
	}

	const markers: PlatformVersions = markersResult.right;
	const stalePlatforms: string[] = [];
	const upToDatePlatforms: string[] = [];

	for (const platform of KNOWN_PLATFORMS) {
		const marker = markers[platform] ?? null;
		if (isStale(marker, currentVersion)) {
			stalePlatforms.push(platform);
		} else {
			upToDatePlatforms.push(platform);
		}
	}

	if (stalePlatforms.length === 0) {
		console.log(green("All platform plugins are up to date."));
		console.log("");
		for (const platform of upToDatePlatforms) {
			console.log(
				dim(
					`  ${platform}: v${markers[platform]?.version ?? "unknown"} (current)`,
				),
			);
		}
		return;
	}

	console.log("");
	console.log(
		`Stale plugins detected for: ${stalePlatforms.map((p) => bold(p)).join(", ")}`,
	);

	if (options.dryRun) {
		console.log("");
		console.log("Dry run mode - would reinstall plugins for:");
		for (const platform of stalePlatforms) {
			const markerVersion = markers[platform]?.version ?? "none";
			console.log(`  ${platform}: ${markerVersion} -> ${currentVersion}`);
		}
		return;
	}

	const ctx: InstallContext = {
		logger,
		isTTY,
		dryRun: options.dryRun,
		skipPrompt: options.yes || !isTTY,
	};

	const registry = await loadToolsRegistry();

	console.log("");
	console.log(bold("Reinstalling stale plugins..."));
	console.log("");

	for (const platform of stalePlatforms) {
		const markerVersion = markers[platform]?.version ?? "none";
		console.log(
			`Updating ${platform} plugins (${markerVersion} -> ${currentVersion})...`,
		);

		const result = await installForSpecificTool(platform, registry, ctx)();

		if (E.isLeft(result)) {
			console.log(yellow(`  ${platform}: Failed to reinstall`));
			logger.debug(`  Error: ${formatError(result.left, false)}`);
			continue;
		}

		if (result.right.success) {
			console.log(green(`  ${platform}: Plugins reinstalled`));

			if (platform === "claude-code") {
				console.log(dim("  Running claude plugin update..."));
				for (const pluginName of ["rp1-base", "rp1-dev"]) {
					const updateResult = await updatePlugin(
						pluginName,
						"user",
						logger,
						options.dryRun,
						isTTY,
					)();
					if (E.isLeft(updateResult)) {
						logger.debug(
							`  claude plugin update for ${pluginName} failed: ${formatError(updateResult.left, false)}`,
						);
					}
				}
			}
		} else {
			console.log(yellow(`  ${platform}: Reinstall failed`));
			if (result.right.error) {
				logger.debug(`  Error: ${formatError(result.right.error, false)}`);
			}
		}
	}

	console.log("");
	for (const platform of upToDatePlatforms) {
		console.log(dim(`  ${platform}: Already up to date`));
	}
};

/**
 * Execute the update action logic.
 * Exported for use by deprecated command wrappers.
 *
 * @param options - Update options (check, dryRun, force, yes, json)
 * @param logger - Logger instance
 * @param isTTY - Whether running in TTY mode
 */
export const executeUpdateAction = async (
	options: {
		check: boolean;
		dryRun: boolean;
		force: boolean;
		yes: boolean;
		json?: boolean;
		format?: string;
	},
	logger: Logger | undefined,
	isTTY: boolean,
): Promise<void> => {
	const { dim } = getColorFns(isTTY);

	logger?.debug(
		`Update action starting (check=${options.check}, dry-run=${options.dryRun}, force=${options.force}, yes=${options.yes}, json=${options.json}, format=${options.format})`,
	);

	// Handle --check mode: delegate to check-update logic
	if (options.check) {
		if (options.json && options.format) {
			console.error("Error: --json and --format cannot be used together.");
			process.exit(1);
		}

		if (
			options.format !== undefined &&
			options.format !== "human" &&
			options.format !== "hook-text"
		) {
			console.error(
				"Error: Invalid --format value. Use 'human' or 'hook-text'.",
			);
			process.exit(1);
		}

		const checkOptions: CheckOptions = {
			force: false, // Use cache unless expired
			timeoutMs: 5000,
		};

		logger?.debug(`Checking for updates (timeout=${checkOptions.timeoutMs}ms)`);

		try {
			const result = await checkForUpdate(checkOptions);

			if (options.json) {
				formatCheckOutputJson(result);
			} else if (options.format === "hook-text") {
				const message = formatCheckOutputHookText(result);
				if (message) {
					console.log(message);
					process.exit(0);
				}
				process.exit(result.error && !result.latestVersion ? 2 : 1);
			} else {
				formatCheckOutput(result, isTTY);
			}

			if (result.error && !result.latestVersion) {
				process.exit(1);
			}
			process.exit(0);
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : "Unknown error";

			if (options.json) {
				console.error(
					JSON.stringify(
						{
							current_version: null,
							latest_version: null,
							update_available: false,
							release_url: null,
							error: errorMessage,
							cached: false,
							cache_age_hours: null,
							cache_expires_in_hours: null,
						},
						null,
						2,
					),
				);
			} else {
				console.error(`Error: ${errorMessage}`);
			}
			process.exit(1);
		}
	}

	// Standard update flow: self-update then check plugin staleness
	const updateResult = await executeSelfUpdate(
		{ dryRun: options.dryRun, force: options.force },
		logger,
		isTTY,
	);

	// If self-update had a hard failure (not manual-install), exit immediately
	if (!updateResult.success && updateResult.exitCode !== 2) {
		process.exit(updateResult.exitCode);
	}

	// Check plugin staleness and reinstall if needed.
	// This runs for both successful updates AND manual installs (exitCode 2),
	// so curl/direct-download users still get plugin staleness checks.
	if (logger) {
		await checkAndReinstallStalePlugins(
			{ dryRun: options.dryRun, yes: options.yes },
			logger,
			isTTY,
		);
	}

	// If self-update required manual intervention (manual install), exit
	// after plugin checks have completed
	if (!updateResult.success || updateResult.exitCode !== 0) {
		process.exit(updateResult.exitCode);
	}

	console.log("");
	console.log(
		dim(
			"Please restart Claude Code, OpenCode, or Codex to use the new version.",
		),
	);
	process.exit(0);
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
	.option("--json", "Output result as JSON (only with --check)", false)
	.option("--format <format>", "Output format for --check: human or hook-text")
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
  --json     Output result as JSON (only with --check)
  --format   Output format for --check: human or hook-text
  --dry-run  Preview what would be done without making changes
  --force    Force update even if already on the latest version
  -y, --yes  Skip all confirmation prompts

Examples:
  rp1 update                   Update CLI, then prompt for plugin update
  rp1 update --check           Check if updates are available
  rp1 update --check --json    Check for updates with JSON output
  rp1 update --check --format hook-text  Emit shell-friendly hook text
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

		await executeUpdateAction(
			{
				check: options.check,
				dryRun: options.dryRun,
				force: options.force,
				yes: options.yes,
				json: options.json,
				format: options.format,
			},
			logger,
			isTTY,
		);
	});

updateCommand.addCommand(pluginsSubcommand);
