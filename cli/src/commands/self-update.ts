/**
 * CLI command for self-updating rp1.
 * Detects installation method and runs appropriate update command.
 */

import { Command } from "commander";
import type { Logger } from "../../shared/logger.js";
import { getInstalledVersion } from "../lib/version.js";
import { checkForUpdate, type CheckOptions } from "../lib/version.js";
import {
  detectInstallMethod,
  runUpdate,
  type InstallMethod,
} from "../lib/package-manager.js";
import { invalidateCache } from "../lib/cache.js";
import { getColors } from "../lib/colors.js";

/**
 * GitHub releases URL for manual installation instructions.
 */
const GITHUB_RELEASES_URL = "https://github.com/rp1-run/rp1/releases";

/**
 * Format human-readable output for self-update command.
 *
 * @param isTTY - Whether output is a TTY (enables colors)
 */
const createFormatter = (isTTY: boolean) => {
  const c = getColors(isTTY);

  return {
    info: (msg: string) => console.log(msg),
    success: (msg: string) => console.log(`${c.green}${msg}${c.reset}`),
    warning: (msg: string) => console.log(`${c.yellow}${msg}${c.reset}`),
    error: (msg: string) => console.error(`${c.red}${msg}${c.reset}`),
    dim: (msg: string) => `${c.dim}${msg}${c.reset}`,
    cyan: (msg: string) => `${c.cyan}${msg}${c.reset}`,
  };
};

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
 * The self-update command.
 *
 * Usage:
 *   rp1 self-update [options]
 *
 * Options:
 *   --dry-run  Show what would be done without executing
 *   --force    Force update even if already on latest
 */
export const selfUpdateCommand = new Command("self-update")
  .description("Update rp1 to the latest version")
  .option("--dry-run", "Show what would be done without executing", false)
  .option("--force", "Force update even if already on latest", false)
  .addHelpText(
    "after",
    `
Examples:
  rp1 self-update           Update to the latest version
  rp1 self-update --dry-run Show what would be done without updating
  rp1 self-update --force   Force update even if already on latest
`,
  )
  .action(async (options, command) => {
    const logger = command.parent?._logger as Logger | undefined;
    const isTTY = command.parent?._isTTY ?? process.stdout.isTTY ?? false;
    const fmt = createFormatter(isTTY);

    // Log debug info if logger available
    logger?.debug(
      `Self-update starting (dry-run=${options.dryRun}, force=${options.force})`,
    );

    // Step 1: Detect installation method
    fmt.info("Detecting installation method...");
    const detection = await detectInstallMethod();
    logger?.debug(
      `Detection result: method=${detection.method}, confidence=${detection.confidence}`,
    );

    const methodName = getMethodName(detection.method);
    const updateCmd = getUpdateCommand(detection.method);

    if (detection.method === "manual") {
      // Manual installation - provide guidance and exit with code 2
      fmt.warning(`Could not detect package manager installation.`);
      console.log("");
      fmt.info(fmt.dim(detection.details));
      console.log("");
      fmt.info("Automatic update is not available for manual installations.");
      console.log("");
      fmt.info("To update manually:");
      fmt.info(`  1. Visit: ${fmt.cyan(GITHUB_RELEASES_URL)}`);
      fmt.info("  2. Download the latest release for your platform");
      fmt.info("  3. Replace your current rp1 binary");
      console.log("");
      fmt.info("Please restart Claude Code or OpenCode after updating.");
      process.exit(2);
    }

    fmt.success(`${methodName} installation detected`);
    console.log("");

    // Step 2: Check if update is needed (unless --force is set)
    const currentVersion = getInstalledVersion();

    if (!options.force) {
      fmt.info("Checking for updates...");
      const checkOptions: CheckOptions = {
        force: true, // Always bypass cache for self-update check
        timeoutMs: 10000, // Longer timeout for update scenario
      };
      const versionCheck = await checkForUpdate(checkOptions);

      if (!versionCheck.updateAvailable && versionCheck.latestVersion) {
        fmt.success(
          `You are already on the latest version (v${currentVersion})`,
        );
        console.log("");
        fmt.info(
          fmt.dim("Use --force to reinstall the current version if needed."),
        );
        process.exit(0);
      }

      if (versionCheck.updateAvailable && versionCheck.latestVersion) {
        fmt.info(
          `Update available: v${currentVersion} -> v${versionCheck.latestVersion}`,
        );
      }
    }

    console.log("");

    // Step 3: Handle dry-run mode
    if (options.dryRun) {
      fmt.info("Dry run mode - showing what would be done:");
      console.log("");
      fmt.info(`  Installation method: ${methodName}`);
      fmt.info(`  Current version: v${currentVersion}`);
      fmt.info(`  Update command: ${updateCmd}`);
      console.log("");
      fmt.info(
        "Run without --dry-run to perform the update.",
      );
      process.exit(0);
    }

    // Step 4: Run the update
    fmt.info("Updating rp1...");
    console.log("");

    const updateResult = await runUpdate(detection.method, currentVersion);

    if (!updateResult.success) {
      fmt.error("Update failed!");
      console.log("");
      if (updateResult.error) {
        fmt.error(updateResult.error);
      }
      console.log("");
      fmt.info("You can try updating manually:");
      fmt.info(`  ${updateCmd}`);
      process.exit(1);
    }

    // Step 5: Invalidate cache after successful update
    logger?.debug("Invalidating version cache after successful update");
    try {
      await invalidateCache()();
    } catch (e) {
      // Non-critical error, just log it
      logger?.debug(`Failed to invalidate cache: ${e}`);
    }

    // Step 6: Report success
    if (updateResult.output) {
      console.log(updateResult.output);
      console.log("");
    }

    if (updateResult.newVersion && updateResult.newVersion !== currentVersion) {
      fmt.success(
        `Successfully updated rp1 from v${currentVersion} to v${updateResult.newVersion}`,
      );
    } else if (updateResult.newVersion) {
      fmt.success(`rp1 v${updateResult.newVersion} is now installed`);
    } else {
      fmt.success("Update completed successfully");
    }

    console.log("");
    fmt.info("Please restart Claude Code or OpenCode to use the new version.");
    process.exit(0);
  });
