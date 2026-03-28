/**
 * Migration module for auto-migrating from the old GitHub repo marketplace
 * (rp1-run) to the local filesystem marketplace. Transparently removes the
 * old marketplace registration and cached artifacts without user prompting.
 */

import { exec } from "node:child_process";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { pipe } from "fp-ts/lib/function.js";
import * as TE from "fp-ts/lib/TaskEither.js";
import type { CLIError } from "../../../shared/errors.js";
import { installError } from "../../../shared/errors.js";
import type { Logger } from "../../../shared/logger.js";

const execAsync = promisify(exec);

/**
 * Old GitHub-based marketplace name to detect and remove.
 */
const OLD_MARKETPLACE_NAME = "rp1-run";

/**
 * Command timeout in milliseconds.
 */
const COMMAND_TIMEOUT = 15000;

/**
 * Cached marketplace artifacts directory (tarball fallback from old installer).
 */
const getCacheDir = (): string =>
	join(process.env.HOME ?? tmpdir(), ".cache", "rp1", "marketplace");

/**
 * Auto-migrate from the old GitHub repo marketplace to the local filesystem
 * marketplace. Detects whether the old rp1-run marketplace is registered with
 * Claude Code and removes it if found, along with cached tarball artifacts.
 *
 * The migration is silent and non-interactive: it logs what it does but never
 * prompts the user for confirmation.
 *
 * @param logger - Logger for progress output
 * @param dryRun - If true, log actions without executing
 * @param isTTY - Whether the terminal supports TTY (unused, kept for interface consistency)
 * @returns TaskEither with true if migration happened, false if skipped
 */
export const migrateFromGitHubMarketplace = (
	logger: Logger,
	dryRun: boolean,
	_isTTY: boolean,
): TE.TaskEither<CLIError, boolean> =>
	pipe(
		checkOldMarketplaceExists(dryRun),
		TE.chain((exists) => {
			if (!exists) {
				return TE.right(false);
			}

			logger.info(
				`Detected old GitHub marketplace (${OLD_MARKETPLACE_NAME}), migrating...`,
			);

			return pipe(
				removeOldMarketplace(logger, dryRun),
				TE.chain(() => removeCachedArtifacts(logger, dryRun)),
				TE.map(() => {
					logger.info("Migration from GitHub marketplace complete");
					return true;
				}),
			);
		}),
	);

/**
 * Check if the old rp1-run marketplace is registered with Claude Code.
 */
const checkOldMarketplaceExists = (
	dryRun: boolean,
): TE.TaskEither<CLIError, boolean> => {
	if (dryRun) {
		return TE.right(false);
	}

	return TE.tryCatch(
		async () => {
			const { stdout } = await execAsync("claude plugin marketplace list", {
				timeout: COMMAND_TIMEOUT,
			});
			return stdout.includes(OLD_MARKETPLACE_NAME);
		},
		(e) => {
			const error = e as Error & { stderr?: string };
			const message = error.stderr || error.message || String(e);
			return installError(
				"migration-check",
				`Failed to list Claude Code marketplaces: ${message}`,
			);
		},
	);
};

/**
 * Remove the old rp1-run marketplace registration from Claude Code.
 */
const removeOldMarketplace = (
	logger: Logger,
	dryRun: boolean,
): TE.TaskEither<CLIError, void> => {
	const command = `claude plugin marketplace rm ${OLD_MARKETPLACE_NAME}`;

	if (dryRun) {
		logger.info(`[dry-run] Would execute: ${command}`);
		return TE.right(undefined);
	}

	return pipe(
		TE.tryCatch(
			async () => {
				await execAsync(command, { timeout: COMMAND_TIMEOUT });
			},
			(e) => {
				const error = e as Error & { stderr?: string };
				const message = error.stderr || error.message || String(e);
				return installError(
					"migration-remove",
					`Failed to remove old marketplace: ${message}`,
				);
			},
		),
		TE.map(() => {
			logger.info(`Removed old marketplace: ${OLD_MARKETPLACE_NAME}`);
		}),
	);
};

/**
 * Remove cached marketplace artifacts from the tarball fallback path.
 * Silently succeeds if the cache directory does not exist.
 */
const removeCachedArtifacts = (
	logger: Logger,
	dryRun: boolean,
): TE.TaskEither<CLIError, void> => {
	const cacheDir = getCacheDir();

	if (dryRun) {
		logger.info(`[dry-run] Would remove cached artifacts at ${cacheDir}`);
		return TE.right(undefined);
	}

	return TE.tryCatch(
		async () => {
			await rm(cacheDir, { recursive: true, force: true });
			logger.info(`Removed cached marketplace artifacts at ${cacheDir}`);
		},
		(e) =>
			installError(
				"migration-cache",
				`Failed to remove cached artifacts: ${e}`,
			),
	);
};
