/**
 * CLI command for checking rp1 version updates.
 * Provides human-readable and JSON output formats with cache support.
 */

import { Command } from "commander";
import type { Logger } from "../../shared/logger.js";
import { checkForUpdate, type CheckOptions } from "../lib/version.js";
import { getColors } from "../lib/colors.js";

/**
 * JSON output structure for check-update command.
 * Uses snake_case for JSON API consistency.
 */
interface CheckUpdateJsonOutput {
  readonly current_version: string;
  readonly latest_version: string | null;
  readonly update_available: boolean;
  readonly release_url: string | null;
  readonly error: string | null;
  readonly cached: boolean;
  readonly cache_age_hours: number | null;
  readonly cache_expires_in_hours: number | null;
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
  isTTY: boolean,
): string => {
  const { green, yellow, cyan, bold, dim, reset } = getColors(isTTY);

  const lines: string[] = [];

  // Current version line
  lines.push(`rp1 ${bold}v${result.currentVersion}${reset} is installed.`);

  // Error case
  if (result.error) {
    lines.push("");
    lines.push(`${yellow}Warning:${reset} ${result.error}`);
    return lines.join("\n");
  }

  // Update available
  if (result.updateAvailable && result.latestVersion) {
    lines.push("");
    lines.push(
      `${green}A new version is available:${reset} ${bold}v${result.latestVersion}${reset}`,
    );
    lines.push("");
    lines.push(
      `Run '${cyan}rp1 self-update${reset}' or '${cyan}/self-update${reset}' to update.`,
    );
  } else if (result.latestVersion) {
    lines.push("");
    lines.push(`${green}You are up to date!${reset}`);
  }

  // Cache status (only if cached)
  if (result.cached && result.cacheAgeHours !== null) {
    lines.push("");
    const ageFormatted =
      result.cacheAgeHours < 1
        ? `${Math.round(result.cacheAgeHours * 60)} minutes`
        : `${result.cacheAgeHours.toFixed(1)} hours`;
    lines.push(`${dim}(cached ${ageFormatted} ago)${reset}`);
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
): CheckUpdateJsonOutput => ({
  current_version: result.currentVersion,
  latest_version: result.latestVersion,
  update_available: result.updateAvailable,
  release_url: result.releaseUrl,
  error: result.error,
  cached: result.cached,
  cache_age_hours: result.cacheAgeHours,
  cache_expires_in_hours: result.cacheExpiresInHours,
});

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

    // Validate numeric options
    if (isNaN(timeoutMs) || timeoutMs <= 0) {
      const errorOutput = options.json
        ? JSON.stringify({ error: "Invalid timeout value" }, null, 2)
        : "Error: Invalid timeout value. Must be a positive number.";
      console.error(errorOutput);
      process.exit(1);
    }

    if (isNaN(ttlHours) || ttlHours <= 0) {
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

      // Output result
      if (options.json) {
        console.log(JSON.stringify(toJsonOutput(result), null, 2));
      } else {
        console.log(formatHumanOutput(result, isTTY));
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
