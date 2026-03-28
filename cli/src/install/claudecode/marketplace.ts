/**
 * Local filesystem marketplace module for Claude Code plugin distribution.
 * Creates and registers a local directory as a Claude Code marketplace,
 * replacing the previous GitHub-repo-based marketplace approach.
 */

import { exec } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { pipe } from "fp-ts/lib/function.js";
import * as TE from "fp-ts/lib/TaskEither.js";
import type { CLIError } from "../../../shared/errors.js";
import { formatError, installError } from "../../../shared/errors.js";
import type { Logger } from "../../../shared/logger.js";
import { createSpinner } from "../../../shared/spinner.js";

const execAsync = promisify(exec);

/**
 * Marketplace name used in plugin references and registration.
 */
export const MARKETPLACE_NAME = "rp1-local";

/**
 * Default marketplace directory path.
 */
export const DEFAULT_MARKETPLACE_DIR = join(
	process.env.HOME ?? "/tmp",
	".rp1",
	"claude",
	"plugins",
);

/**
 * Command timeout in milliseconds.
 */
const COMMAND_TIMEOUT = 15000;

/**
 * Marketplace metadata structure written to .claude-plugin/marketplace.json.
 */
interface MarketplaceMetadata {
	readonly name: string;
	readonly owner: { readonly name: string };
	readonly plugins: readonly MarketplacePluginEntry[];
}

/**
 * Entry for a single plugin in the marketplace metadata.
 */
interface MarketplacePluginEntry {
	readonly name: string;
	readonly source: string;
}

/**
 * Result of creating a local marketplace.
 */
export interface MarketplaceResult {
	readonly marketplaceDir: string;
	readonly pluginsRegistered: readonly string[];
}

/**
 * Build the marketplace.json metadata structure.
 */
const buildMarketplaceMetadata = (
	plugins: readonly string[],
): MarketplaceMetadata => ({
	name: MARKETPLACE_NAME,
	owner: { name: "rp1" },
	plugins: plugins.map((plugin) => ({
		name: `rp1-${plugin}`,
		source: `./${plugin}/`,
	})),
});

/**
 * Create a local filesystem marketplace directory with marketplace.json metadata.
 *
 * Creates the directory structure at the specified path:
 * ```
 * marketplaceDir/
 *   .claude-plugin/
 *     marketplace.json
 *   base/   (created by asset extractor, not this function)
 *   dev/    (created by asset extractor, not this function)
 * ```
 *
 * The plugin subdirectories (base, dev, utils) are populated by the asset
 * extractor module. This function only creates the marketplace metadata.
 *
 * @param marketplaceDir - Target directory for the marketplace
 * @param plugins - Plugin keys to register (e.g., ["base", "dev"])
 * @returns TaskEither with MarketplaceResult on success
 */
export const createLocalMarketplace = (
	marketplaceDir: string,
	plugins: readonly string[],
): TE.TaskEither<CLIError, MarketplaceResult> =>
	TE.tryCatch(
		async () => {
			const metadataDir = join(marketplaceDir, ".claude-plugin");
			await mkdir(metadataDir, { recursive: true, mode: 0o755 });

			const metadata = buildMarketplaceMetadata(plugins);
			const metadataPath = join(metadataDir, "marketplace.json");
			await writeFile(metadataPath, JSON.stringify(metadata, null, 2) + "\n", {
				mode: 0o644,
			});

			return {
				marketplaceDir,
				pluginsRegistered: plugins.map((p) => `rp1-${p}`),
			};
		},
		(e) =>
			installError(
				"create-marketplace",
				`Failed to create local marketplace at ${marketplaceDir}: ${e}`,
			),
	);

/**
 * Register the local marketplace directory with Claude Code via the Claude CLI.
 *
 * Executes: claude plugin marketplace add <marketplaceDir>
 *
 * Handles the "already exists" case gracefully by returning true.
 *
 * @param marketplaceDir - Path to the local marketplace directory
 * @param logger - Logger for progress output
 * @param dryRun - If true, log the command without executing
 * @param isTTY - Whether the terminal supports TTY for spinner display
 * @returns TaskEither with true on success (or already registered)
 */
export const registerMarketplace = (
	marketplaceDir: string,
	logger: Logger,
	dryRun: boolean,
	isTTY: boolean,
): TE.TaskEither<CLIError, boolean> => {
	const command = `claude plugin marketplace add "${marketplaceDir}"`;
	const spinner = createSpinner(isTTY);

	if (dryRun) {
		logger.info(`[dry-run] Would execute: ${command}`);
		return TE.right(true);
	}

	spinner.start(`Registering local marketplace...`);

	return pipe(
		TE.tryCatch(
			async () => {
				const { stdout, stderr } = await execAsync(command, {
					timeout: COMMAND_TIMEOUT,
				});
				return stdout || stderr;
			},
			(e) => {
				const error = e as Error & { stderr?: string };
				const message = error.stderr || error.message || String(e);
				return installError(
					"register-marketplace",
					`Failed to register marketplace: ${message}`,
				);
			},
		),
		TE.map(() => {
			spinner.succeed(`Local marketplace registered at ${marketplaceDir}`);
			return true;
		}),
		TE.orElse((error) => {
			const message = formatError(error, false);
			if (/already (exists|added|registered)/i.test(message)) {
				spinner.stop();
				logger.info(`Local marketplace already registered`);
				return TE.right(true);
			}
			spinner.fail(`Failed to register marketplace: ${message}`);
			return TE.left(error);
		}),
	);
};
