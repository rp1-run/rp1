/**
 * CLI command for checking rp1 version updates.
 * Provides human-readable and JSON output formats with cache support.
 */

import { Command } from "commander";
import type { Logger } from "../../shared/logger.js";
import { getColorFns } from "../lib/colors.js";
import {
	checkFenceStaleness,
	type FenceCheckResult,
} from "../lib/fence-check.js";
import { type CheckOptions, checkForUpdate } from "../lib/version.js";
import { formatCheckOutputHookText } from "./update/index.js";

/**
 * JSON output structure for check-update command.
 * Uses snake_case for JSON API consistency.
 */
interface FenceVersionJson {
	readonly current: string | null;
	readonly latest: string;
	readonly update_available: boolean;
	readonly stale_files: string[];
}

interface CheckUpdateJsonOutput {
	readonly current_version: string;
	readonly latest_version: string | null;
	readonly update_available: boolean;
	readonly release_url: string | null;
	readonly error: string | null;
	readonly cached: boolean;
	readonly cache_age_hours: number | null;
	readonly cache_expires_in_hours: number | null;
	readonly fence_version?: FenceVersionJson;
}

/**
 * Format human-readable output for version check result.
 *
 * @param result - Version check result
 * @param isTTY - Whether output is a TTY (enables colors)
 * @returns Formatted string for console output
 */
const formatHumanOutput = (
	result: Awaited<ReturnType<typeof checkForUpdate>>,
	fenceResult: FenceCheckResult | null,
	isTTY: boolean,
): string => {
	const { green, yellow, cyan, bold, dim } = getColorFns(isTTY);

	const lines: string[] = [];

	// Current version line
	lines.push(`rp1 ${bold(`v${result.currentVersion}`)} is installed.`);

	// Error case
	if (result.error) {
		lines.push("");
		lines.push(`${yellow("Warning:")} ${result.error}`);
		return lines.join("\n");
	}

	// Update available
	if (result.updateAvailable && result.latestVersion) {
		lines.push("");
		lines.push(
			`${green("A new version is available:")} ${bold(`v${result.latestVersion}`)}`,
		);
		lines.push("");
		lines.push(
			`Run '${cyan("rp1 self-update")}' or '${cyan("/self-update")}' to update.`,
		);
	} else if (result.latestVersion) {
		lines.push("");
		lines.push(green("You are up to date!"));
	}

	// Fence staleness (only when project exists and stale files found)
	if (fenceResult?.hasProject && fenceResult.staleFiles.length > 0) {
		const currentDisplay = fenceResult.oldestVersion ?? "0.0.0";
		lines.push("");
		lines.push(
			`${yellow("Stanza configuration is outdated")} (v${currentDisplay} -> v${fenceResult.latestFenceVersion}).`,
		);
		lines.push(`  Outdated: ${fenceResult.staleFiles.join(", ")}`);
		lines.push(`  Run '${cyan("rp1 migrate")}' to update.`);
	}

	// Cache status (only if cached)
	if (result.cached && result.cacheAgeHours !== null) {
		lines.push("");
		const ageFormatted =
			result.cacheAgeHours < 1
				? `${Math.round(result.cacheAgeHours * 60)} minutes`
				: `${result.cacheAgeHours.toFixed(1)} hours`;
		lines.push(dim(`(cached ${ageFormatted} ago)`));
	}

	return lines.join("\n");
};

/**
 * Convert version check result to JSON output format.
 *
 * @param result - Version check result
 * @returns JSON-serializable output object
 */
const toJsonOutput = (
	result: Awaited<ReturnType<typeof checkForUpdate>>,
	fenceResult: FenceCheckResult | null,
): CheckUpdateJsonOutput => {
	const base: CheckUpdateJsonOutput = {
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
		return {
			...base,
			fence_version: {
				current: fenceResult.oldestVersion,
				latest: fenceResult.latestFenceVersion,
				update_available: fenceResult.staleFiles.length > 0,
				stale_files: fenceResult.staleFiles,
			},
		};
	}

	return base;
};

/**
 * The check-update command.
 *
 * Usage:
 *   rp1 check-update [options]
 *
 * Options:
 *   --json          Output result as JSON
 *   --timeout <ms>  API timeout in milliseconds (default: 5000)
 *   --force         Bypass cache and force fresh check
 *   --cache-ttl <h> Cache TTL in hours (default: 24)
 */
export const checkUpdateCommand = new Command("check-update")
	.description("Check if a newer version of rp1 is available")
	.option("--json", "Output result as JSON", false)
	.option("--format <format>", "Output format: human or hook-text")
	.option("--timeout <ms>", "API timeout in milliseconds", "5000")
	.option("--force", "Bypass cache and force fresh check", false)
	.option("--cache-ttl <hours>", "Cache TTL in hours", "24")
	.addHelpText(
		"after",
		`
Examples:
  rp1 check-update              Check for updates (human-readable)
  rp1 check-update --json       Check for updates (JSON output)
  rp1 check-update --force      Bypass cache and check immediately
  rp1 check-update --timeout 10000  Use 10-second timeout
`,
	)
	.action(async (options, command) => {
		const logger = command.parent?._logger as Logger | undefined;
		const isTTY = command.parent?._isTTY ?? process.stdout.isTTY ?? false;

		// Parse options
		const timeoutMs = parseInt(options.timeout, 10);
		const ttlHours = parseInt(options.cacheTtl, 10);
		if (options.json && options.format) {
			console.error("Error: --json and --format cannot be used together.");
			process.exit(1);
		}

		if (
			options.format !== undefined &&
			options.format !== "human" &&
			options.format !== "hook-text"
		) {
			console.error("Error: Invalid format. Use 'human' or 'hook-text'.");
			process.exit(1);
		}

		// Validate numeric options
		if (Number.isNaN(timeoutMs) || timeoutMs <= 0) {
			const errorOutput = options.json
				? JSON.stringify({ error: "Invalid timeout value" }, null, 2)
				: "Error: Invalid timeout value. Must be a positive number.";
			console.error(errorOutput);
			process.exit(1);
		}

		if (Number.isNaN(ttlHours) || ttlHours <= 0) {
			const errorOutput = options.json
				? JSON.stringify({ error: "Invalid cache-ttl value" }, null, 2)
				: "Error: Invalid cache-ttl value. Must be a positive number.";
			console.error(errorOutput);
			process.exit(1);
		}

		// Build check options
		const checkOptions: CheckOptions = {
			force: options.force,
			timeoutMs,
			ttlHours,
		};

		// Log debug info if logger available
		logger?.debug(
			`Checking for updates (force=${options.force}, timeout=${timeoutMs}ms, ttl=${ttlHours}h)`,
		);

		try {
			// Execute version check
			const result = await checkForUpdate(checkOptions);

			// Check fence staleness (graceful when no project)
			let fenceResult: FenceCheckResult | null = null;
			try {
				fenceResult = checkFenceStaleness(process.cwd());
			} catch {
				// Fence check is best-effort; do not block version output
			}

			// Output result
			if (options.json) {
				console.log(JSON.stringify(toJsonOutput(result, fenceResult), null, 2));
			} else if (options.format === "hook-text") {
				const message = formatCheckOutputHookText(result, fenceResult);
				if (message) {
					console.log(message);
					process.exit(0);
				}
				process.exit(result.error && !result.latestVersion ? 2 : 1);
			} else {
				console.log(formatHumanOutput(result, fenceResult, isTTY));
			}

			// Exit code: 0 for success (check completed regardless of update availability)
			// Exit code: 1 only for errors that prevented the check
			if (result.error && !result.latestVersion) {
				process.exit(1);
			}
			process.exit(0);
		} catch (error) {
			// Unexpected error during check
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
	});
