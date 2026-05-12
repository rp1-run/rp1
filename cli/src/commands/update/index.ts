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
import { resolveDirectorySet } from "../../../shared/directory-resolution.js";
import { formatError } from "../../../shared/errors.js";
import type { Logger } from "../../../shared/logger.js";
import { loadToolsRegistry } from "../../config/supported-tools.js";
import { detectTools } from "../../init/tool-detector.js";
import { DEFAULT_TTL_HOURS, writeCache } from "../../lib/cache.js";
import { getColorFns } from "../../lib/colors.js";
import {
	checkFenceStaleness,
	type FenceCheckResult,
} from "../../lib/fence-check.js";
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
import { executeMigrate, formatMigrateSummary } from "../../migrate/index.js";
import {
	type InstallContext,
	installAllDetectedTools,
} from "../../shared/install-core.js";
import { formatUpdateAllResult, pluginsSubcommand } from "./plugins.js";
import {
	isPostSelfUpdateProcess,
	readPostSelfUpdateState,
	relaunchPostSelfUpdate,
} from "./post-self-update.js";

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
	fenceResult?: FenceCheckResult | null,
): void => {
	const output: Record<string, unknown> = {
		current_version: result.currentVersion,
		latest_version: result.latestVersion,
		update_available: result.updateAvailable,
		release_url: result.releaseUrl,
		error: result.error,
		cached: result.cached,
		cache_age_hours: result.cacheAgeHours,
		cache_expires_in_hours: result.cacheExpiresInHours,
	};

	if (fenceResult?.hasProject) {
		output.fence_version = {
			current: fenceResult.oldestVersion,
			latest: fenceResult.latestFenceVersion,
			update_available: fenceResult.staleFiles.length > 0,
			stale_files: fenceResult.staleFiles,
		};
	}

	console.log(JSON.stringify(output, null, 2));
};

/**
 * Format check-update result for shell hooks.
 * Returns a single-line status message when version status is available,
 * otherwise null on error.
 */
export const formatCheckOutputHookText = (
	result: Awaited<ReturnType<typeof checkForUpdate>>,
	fenceResult?: FenceCheckResult | null,
): string | null => {
	if (result.error) {
		return null;
	}

	const stanzaSuffix =
		fenceResult?.hasProject && fenceResult.staleFiles.length > 0
			? " | stanza update: run rp1 migrate"
			: "";

	if (result.updateAvailable && result.latestVersion) {
		return `rp1 update available: v${result.currentVersion} -> v${result.latestVersion} | Run /self-update to update${stanzaSuffix}`;
	}

	// No update available — return current version info
	const displayVersion = getDisplayVersion();
	return `rp1 is running v${displayVersion}${stanzaSuffix}`;
};

/**
 * Format check-update result for human output.
 * Exported for use by deprecated check-update command wrapper.
 */
export const formatCheckOutput = (
	result: Awaited<ReturnType<typeof checkForUpdate>>,
	isTTY: boolean,
	fenceResult?: FenceCheckResult | null,
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

	// Fence staleness (only when project exists and stale files found)
	if (fenceResult?.hasProject && fenceResult.staleFiles.length > 0) {
		const currentDisplay = fenceResult.oldestVersion ?? "0.0.0";
		console.log("");
		console.log(
			`${yellow("Stanza configuration is outdated")} (v${currentDisplay} -> v${fenceResult.latestFenceVersion}).`,
		);
		console.log(`  Outdated: ${fenceResult.staleFiles.join(", ")}`);
		console.log(`  Run '${cyan("rp1 migrate")}' to update.`);
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
): Promise<{
	success: boolean;
	exitCode: number;
	updatedBinary: boolean;
}> => {
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
		return { success: false, exitCode: 2, updatedBinary: false };
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
			return { success: true, exitCode: 0, updatedBinary: false };
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
		return { success: true, exitCode: 0, updatedBinary: false };
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
		return { success: false, exitCode: 1, updatedBinary: false };
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

	return { success: true, exitCode: 0, updatedBinary: true };
};

const noopLogger: Logger = {
	trace: () => {},
	debug: () => {},
	info: () => {},
	warn: () => {},
	error: () => {},
	start: () => {},
	success: () => {},
	fail: () => {},
	box: () => {},
};

interface UpdateArcadeState {
	readonly daemonWasRunning: boolean;
	readonly daemonPort?: number;
}

export interface PostUpdatePhaseResult {
	readonly success: boolean;
	readonly exitCode: number;
}

/**
 * Stop the Arcade daemon before any mutating update work begins.
 */
const stopArcadeBeforeUpdate = async (
	logger: Logger,
	isTTY: boolean,
): Promise<UpdateArcadeState> => {
	const { green, bold, dim } = getColorFns(isTTY);
	const { getStatus, stopDaemon } = await import(
		"../../../web-ui/src/daemon/index.js"
	);

	console.log("");
	console.log(bold("Preparing Arcade daemon..."));

	const status = await getStatus();
	if (!status.running) {
		console.log(dim("Arcade daemon is not running."));
		return { daemonWasRunning: false };
	}

	logger.debug(
		`Stopping Arcade daemon before update (port=${status.port ?? "unknown"})`,
	);
	const stopped = await stopDaemon();
	if (!stopped) {
		throw new Error("Failed to stop the running Arcade daemon.");
	}

	console.log(green("Arcade daemon stopped."));
	return {
		daemonWasRunning: true,
		daemonPort: status.port,
	};
};

/**
 * Restart the Arcade daemon if it was running before the update began.
 */
const restartArcadeAfterUpdate = async (
	state: UpdateArcadeState,
	logger: Logger,
	isTTY: boolean,
): Promise<PostUpdatePhaseResult> => {
	const { green, bold, dim } = getColorFns(isTTY);

	if (!state.daemonWasRunning) {
		console.log("");
		console.log(
			dim("Arcade daemon was not running before update. Skipping restart."),
		);
		return { success: true, exitCode: 0 };
	}

	console.log("");
	console.log(bold("Restarting Arcade daemon..."));

	try {
		const { ensureDaemon } = await import(
			"../../../web-ui/src/daemon/index.js"
		);
		const result = await ensureDaemon(state.daemonPort, getInstalledVersion());
		logger.debug(
			`Arcade daemon ready after update (port=${result.connection.port}, reused=${result.wasRunning})`,
		);
		console.log(
			green(`Arcade daemon ready on port ${result.connection.port}.`),
		);
		return { success: true, exitCode: 0 };
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.error(`Failed to restart Arcade daemon: ${message}`);
		return { success: false, exitCode: 1 };
	}
};

/**
 * Update plugins for all detected tools using the standard install/update path.
 */
export const updateDetectedPlugins = async (
	options: { dryRun: boolean; yes: boolean },
	logger: Logger,
	isTTY: boolean,
): Promise<PostUpdatePhaseResult> => {
	const { bold, dim, yellow } = getColorFns(isTTY);
	const registry = await loadToolsRegistry();
	const detection = await detectTools(registry)();

	console.log("");
	console.log(bold("Updating plugins for detected tools..."));

	if (E.isRight(detection) && detection.right.detected.length === 0) {
		console.log(
			dim("No installed agentic tools detected. Skipping plugin refresh."),
		);
		return { success: true, exitCode: 0 };
	}

	const ctx: InstallContext = {
		logger,
		isTTY,
		dryRun: options.dryRun,
		skipPrompt: options.yes || !isTTY,
	};

	const result = await installAllDetectedTools(registry, ctx)();
	if (E.isLeft(result)) {
		console.error(formatError(result.left, isTTY));
		console.log("");
		console.log(
			yellow(
				bold("Plugin refresh failed, but the core rp1 update will continue."),
			),
		);
		console.log(
			dim("Repair the host tool, then run `rp1 update plugins` to retry."),
		);
		return { success: true, exitCode: 0 };
	}

	formatUpdateAllResult(result.right, isTTY);

	const failedResults = result.right.results.filter((tool) => !tool.success);
	if (failedResults.length > 0) {
		console.log("");
		console.log(
			yellow(
				bold(
					"Plugin refresh had failures, but the core rp1 update will continue.",
				),
			),
		);
		for (const failed of failedResults) {
			console.log(
				dim(
					`  Repair ${failed.toolName}, then run \`rp1 update plugins ${failed.toolId}\` to retry.`,
				),
			);
		}
	}

	return { success: true, exitCode: 0 };
};

/**
 * Run project migrations after plugin refresh. This is best-effort when the
 * current working directory is not an rp1 project.
 */
const runProjectMigrations = async (
	cwd: string,
	options: { dryRun: boolean },
	isTTY: boolean,
): Promise<PostUpdatePhaseResult> => {
	const { bold, dim } = getColorFns(isTTY);
	const directories = resolveDirectorySet(cwd);

	console.log("");
	console.log(
		bold(
			options.dryRun
				? "Checking project migrations..."
				: "Running project migrations...",
		),
	);

	if (E.isLeft(directories)) {
		console.log(
			dim(
				"No rp1 project detected from current directory. Skipping migrations.",
			),
		);
		return { success: true, exitCode: 0 };
	}

	if (options.dryRun) {
		console.log(
			dim(`Would run project migrations for ${directories.right.projectRoot}.`),
		);
		return { success: true, exitCode: 0 };
	}

	try {
		const result = await executeMigrate(cwd);
		console.log(formatMigrateSummary(result));
		return { success: true, exitCode: 0 };
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.error(`Migration failed: ${message}`);
		return { success: false, exitCode: 1 };
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
	const resumingPostSelfUpdate = isPostSelfUpdateProcess();
	const lifecycleLogger = logger ?? noopLogger;
	let arcadeState: UpdateArcadeState = resumingPostSelfUpdate
		? readPostSelfUpdateState()
		: { daemonWasRunning: false };

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

			// Check fence staleness (graceful when no project)
			let fenceResult: FenceCheckResult | null = null;
			try {
				fenceResult = checkFenceStaleness(process.cwd());
			} catch {
				// Fence check is best-effort; do not block version output
			}

			if (options.json) {
				formatCheckOutputJson(result, fenceResult);
			} else if (options.format === "hook-text") {
				const message = formatCheckOutputHookText(result, fenceResult);
				if (message) {
					console.log(message);
					process.exit(0);
				}
				process.exit(result.error && !result.latestVersion ? 2 : 1);
			} else {
				formatCheckOutput(result, isTTY, fenceResult);
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

	if (!options.dryRun && !resumingPostSelfUpdate) {
		try {
			arcadeState = await stopArcadeBeforeUpdate(lifecycleLogger, isTTY);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			console.error(`Failed to prepare Arcade daemon: ${message}`);
			process.exit(1);
		}
	}

	let updateResult: {
		success: boolean;
		exitCode: number;
		updatedBinary: boolean;
	} = {
		success: true,
		exitCode: 0,
		updatedBinary: false,
	};

	if (!resumingPostSelfUpdate) {
		// Standard update flow: self-update, then continue with the same
		// lifecycle in the freshly installed binary if the executable changed.
		updateResult = await executeSelfUpdate(
			{ dryRun: options.dryRun, force: options.force },
			logger,
			isTTY,
		);

		if (!updateResult.success && updateResult.exitCode !== 2) {
			if (!options.dryRun) {
				await restartArcadeAfterUpdate(arcadeState, lifecycleLogger, isTTY);
			}
			process.exit(updateResult.exitCode);
		}

		if (updateResult.updatedBinary) {
			console.log("");
			console.log("Relaunching updated rp1 for post-update lifecycle...");

			const handoff = relaunchPostSelfUpdate({
				yes: options.yes,
				state: arcadeState,
			});
			if (!handoff.success && handoff.error) {
				console.error(
					`Failed to relaunch updated rp1 for post-update lifecycle: ${handoff.error}`,
				);
				if (!options.dryRun) {
					await restartArcadeAfterUpdate(arcadeState, lifecycleLogger, isTTY);
				}
			}
			process.exit(handoff.exitCode);
		}
	}

	const pluginResult = await updateDetectedPlugins(
		{ dryRun: options.dryRun, yes: options.yes },
		lifecycleLogger,
		isTTY,
	);
	let migrationResult: PostUpdatePhaseResult;
	if (pluginResult.success) {
		migrationResult = await runProjectMigrations(
			process.cwd(),
			{ dryRun: options.dryRun },
			isTTY,
		);
	} else {
		console.log("");
		console.log("Skipping project migrations because plugin refresh failed.");
		migrationResult = {
			success: false,
			exitCode: pluginResult.exitCode,
		};
	}
	const restartResult = options.dryRun
		? { success: true, exitCode: 0 }
		: await restartArcadeAfterUpdate(arcadeState, lifecycleLogger, isTTY);

	const postUpdateFailed =
		!pluginResult.success || !migrationResult.success || !restartResult.success;
	const postUpdateExitCode = !pluginResult.success
		? pluginResult.exitCode
		: !migrationResult.success
			? migrationResult.exitCode
			: restartResult.exitCode;

	if (postUpdateFailed) {
		process.exit(postUpdateExitCode || 1);
	}

	if (!updateResult.success || updateResult.exitCode !== 0) {
		process.exit(updateResult.exitCode);
	}

	console.log("");
	console.log(
		dim(
			"Please restart Claude Code, OpenCode, Codex, or Copilot CLI to use the new version.",
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
  rp1 update                   Update CLI, plugins, migrations, and Arcade lifecycle
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
