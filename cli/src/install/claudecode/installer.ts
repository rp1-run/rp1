/**
 * Installer module for Claude Code plugin installation.
 * Uses the local filesystem marketplace powered by embedded binary assets,
 * replacing the previous GitHub-repo-based marketplace approach.
 */

import { exec } from "node:child_process";
import { stat } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { pipe } from "fp-ts/lib/function.js";
import * as TE from "fp-ts/lib/TaskEither.js";
import type { CLIError } from "../../../shared/errors.js";
import { formatError, installError } from "../../../shared/errors.js";
import type { Logger } from "../../../shared/logger.js";
import { createSpinner, type Spinner } from "../../../shared/spinner.js";
import { getInstalledVersion } from "../../lib/version.js";
import { extractPlatformAssets } from "../asset-extractor.js";
import { writeVersionMarker } from "../version-marker.js";
import {
	createLocalMarketplace,
	DEFAULT_MARKETPLACE_DIR,
	MARKETPLACE_NAME,
	registerMarketplace,
} from "./marketplace.js";
import { migrateFromGitHubMarketplace } from "./migration.js";
import type { ClaudeCodeInstallResult } from "./models.js";

const execAsync = promisify(exec);

/**
 * Command timeout in milliseconds.
 */
const COMMAND_TIMEOUT = 30000;

/**
 * Required plugins that must always be installed.
 */
const CLAUDE_CODE_REQUIRED_PLUGINS = ["base", "dev"] as const;

/**
 * Optional plugins included when their artifacts are present (e.g., dev builds).
 */
const CLAUDE_CODE_OPTIONAL_PLUGINS = ["utils"] as const;

/**
 * Execute a Claude CLI command.
 * @param command - The full command to execute
 * @param spinner - Spinner for progress indication
 * @param logger - Logger for output
 * @param dryRun - If true, log the command without executing
 * @returns TaskEither with stdout on success or CLIError on failure
 */
const executeClaudeCommand = (
	command: string,
	spinner: Spinner,
	logger: Logger,
	dryRun: boolean,
): TE.TaskEither<CLIError, string> => {
	if (dryRun) {
		logger.info(`[dry-run] Would execute: ${command}`);
		return TE.right("");
	}

	spinner.start(`Running: ${command}`);

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
				return installError("claude-command", `Command failed: ${message}`);
			},
		),
	);
};

/**
 * Check if an error indicates the resource already exists.
 * Examines the formatted error message for "already exists" patterns.
 */
const isAlreadyExistsError = (error: CLIError): boolean => {
	const message = formatError(error, false);
	const alreadyExistsPatterns = [
		/already exists/i,
		/already added/i,
		/already installed/i,
		/already registered/i,
	];
	return alreadyExistsPatterns.some((pattern) => pattern.test(message));
};

/**
 * Get a human-readable error message from a CLIError.
 */
const getErrorMessage = (error: CLIError): string => formatError(error, false);

/**
 * Build scope argument for Claude CLI commands.
 */
const buildScopeArg = (scope: string): string => {
	switch (scope) {
		case "project":
			return "--scope project";
		case "local":
			return "--scope local";
		default:
			return "--scope user";
	}
};

/**
 * Install a plugin from the local marketplace.
 * Executes: claude plugin install <plugin>@rp1-local --scope <scope>
 *
 * @param pluginName - Name of the plugin to install (e.g., "rp1-base")
 * @param scope - Installation scope: "user", "project", or "local"
 * @param logger - Logger for progress output
 * @param dryRun - If true, log the command without executing
 * @param isTTY - Whether the terminal supports TTY for spinner display
 * @returns TaskEither with true on success (or already exists), CLIError on failure
 */
export const installPlugin = (
	pluginName: string,
	scope: string,
	logger: Logger,
	dryRun: boolean,
	isTTY: boolean,
): TE.TaskEither<CLIError, boolean> => {
	const pluginRef = `${pluginName}@${MARKETPLACE_NAME}`;
	const scopeArg = buildScopeArg(scope);
	const command = `claude plugin install ${pluginRef} ${scopeArg}`;
	const spinner = createSpinner(isTTY);

	return pipe(
		executeClaudeCommand(command, spinner, logger, dryRun),
		TE.map(() => {
			if (!dryRun) {
				spinner.succeed(`Plugin ${pluginName} installed`);
			}
			return true;
		}),
		TE.orElse((error) => {
			if (error._tag === "InstallError" && isAlreadyExistsError(error)) {
				spinner.stop();
				logger.info(`Plugin ${pluginName} already installed, updating...`);
				return updatePlugin(pluginName, scope, logger, dryRun, isTTY);
			}
			spinner.fail(
				`Failed to install ${pluginName}: ${getErrorMessage(error)}`,
			);
			return TE.left(error);
		}),
	);
};

/**
 * Update a plugin to latest version.
 * Executes: claude plugin update <plugin>@rp1-local --scope <scope>
 *
 * @param pluginName - Name of the plugin to update (e.g., "rp1-base")
 * @param scope - Installation scope: "user", "project", or "local"
 * @param logger - Logger for progress output
 * @param dryRun - If true, log the command without executing
 * @param isTTY - Whether the terminal supports TTY for spinner display
 * @returns TaskEither with true on success, CLIError on failure
 */
export const updatePlugin = (
	pluginName: string,
	scope: string,
	logger: Logger,
	dryRun: boolean,
	isTTY: boolean,
): TE.TaskEither<CLIError, boolean> => {
	const pluginRef = `${pluginName}@${MARKETPLACE_NAME}`;
	const scopeArg = buildScopeArg(scope);
	const command = `claude plugin update ${pluginRef} ${scopeArg}`;
	const spinner = createSpinner(isTTY);

	return pipe(
		executeClaudeCommand(command, spinner, logger, dryRun),
		TE.map(() => {
			if (!dryRun) {
				spinner.succeed(`Plugin ${pluginName} updated`);
			}
			return true;
		}),
		TE.mapLeft((error) => {
			spinner.fail(`Failed to update ${pluginName}: ${getErrorMessage(error)}`);
			return error;
		}),
	);
};

/**
 * Install all rp1 plugins to Claude Code via the local filesystem marketplace.
 * Orchestrates the full install flow:
 * 1. Migrate from old GitHub marketplace (if present)
 * 2. Extract Claude Code assets from binary to local marketplace directory
 * 3. Create marketplace metadata (marketplace.json)
 * 4. Register local marketplace with Claude CLI
 * 5. Install plugins from local marketplace
 * 6. Write version marker for staleness detection
 *
 * @param scope - Installation scope: "user", "project", or "local"
 * @param logger - Logger for progress output
 * @param dryRun - If true, log commands without executing
 * @param isTTY - Whether the terminal supports TTY for spinner display
 * @returns TaskEither with ClaudeCodeInstallResult on success
 */
export const installAllPlugins = (
	scope: string,
	logger: Logger,
	dryRun: boolean,
	isTTY: boolean,
): TE.TaskEither<CLIError, ClaudeCodeInstallResult> => {
	const pluginKeys: string[] = [...CLAUDE_CODE_REQUIRED_PLUGINS];
	const plugins: string[] = pluginKeys.map((k) => `rp1-${k}`);
	const warnings: string[] = [];
	const pluginsInstalled: string[] = [];
	const marketplaceDir = DEFAULT_MARKETPLACE_DIR;

	return pipe(
		// Step 1: Migrate from old GitHub marketplace if present
		migrateFromGitHubMarketplace(logger, dryRun, isTTY),
		// Step 2: Extract Claude Code assets from binary to marketplace dir
		// Include optional plugins in extraction so their assets are written
		// if present in the binary; detection in step 3 confirms which exist.
		TE.chain(() => {
			logger.info("Extracting Claude Code assets...");
			return extractPlatformAssets({
				platform: "claude-code",
				targetDir: marketplaceDir,
				plugins: [
					...CLAUDE_CODE_REQUIRED_PLUGINS,
					...CLAUDE_CODE_OPTIONAL_PLUGINS,
				],
			});
		}),
		// Step 3: Detect optional plugins whose artifacts are present
		TE.chain(() =>
			TE.tryCatch(
				async () => {
					for (const plugin of CLAUDE_CODE_OPTIONAL_PLUGINS) {
						const pluginDir = join(marketplaceDir, plugin);
						try {
							await stat(pluginDir);
							pluginKeys.push(plugin);
							plugins.push(`rp1-${plugin}`);
							logger.info(`Optional plugin detected: rp1-${plugin}`);
						} catch {
							// Optional plugin not present, skip
						}
					}
				},
				(e) =>
					installError(
						"detect-optional-plugins",
						`Failed to detect optional plugins: ${e}`,
					),
			),
		),
		// Step 4: Create marketplace metadata (marketplace.json)
		TE.chain(() => createLocalMarketplace(marketplaceDir, pluginKeys)),
		// Step 5: Register local marketplace with Claude CLI
		TE.chain(() => registerMarketplace(marketplaceDir, logger, dryRun, isTTY)),
		// Step 6: Install all discovered plugins
		TE.chain(() =>
			plugins.reduce(
				(acc, pluginName) =>
					pipe(
						acc,
						TE.chain(() =>
							pipe(
								installPlugin(pluginName, scope, logger, dryRun, isTTY),
								TE.map((success) => {
									if (success) pluginsInstalled.push(pluginName);
								}),
							),
						),
					),
				TE.right<CLIError, void>(undefined),
			),
		),
		// Step 7: Write version marker
		TE.chain(() => writeVersionMarker("claude-code", getInstalledVersion())),
		// Return result
		TE.map(
			(): ClaudeCodeInstallResult => ({
				marketplaceAdded: true,
				pluginsInstalled,
				warnings,
			}),
		),
	);
};
