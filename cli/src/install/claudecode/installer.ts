/**
 * Installer module for Claude Code plugin installation.
 * Executes Claude CLI commands to add marketplace and install plugins.
 */

import { exec } from "node:child_process";
import { promisify } from "node:util";
import { pipe } from "fp-ts/lib/function.js";
import * as TE from "fp-ts/lib/TaskEither.js";
import type { CLIError } from "../../../shared/errors.js";
import { formatError, installError } from "../../../shared/errors.js";
import type { Logger } from "../../../shared/logger.js";
import type { ClaudeCodeInstallResult } from "./models.js";

const execAsync = promisify(exec);

/**
 * Marketplace repository identifier (GitHub org/repo format).
 */
const MARKETPLACE_REPO = "rp1-run/rp1";

/**
 * Marketplace name used in plugin references (the GitHub org name).
 */
const MARKETPLACE_NAME = "rp1-run";

/**
 * Command timeout in milliseconds (30 seconds for network operations).
 */
const COMMAND_TIMEOUT = 30000;

/**
 * Execute a Claude CLI command.
 * @param command - The full command to execute
 * @param logger - Logger for output
 * @param dryRun - If true, log the command without executing
 * @returns TaskEither with stdout on success or CLIError on failure
 */
const executeClaudeCommand = (
	command: string,
	logger: Logger,
	dryRun: boolean,
): TE.TaskEither<CLIError, string> => {
	if (dryRun) {
		logger.info(`[dry-run] Would execute: ${command}`);
		return TE.right("");
	}

	logger.start(`Running: ${command}`);

	return pipe(
		TE.tryCatch(
			async () => {
				const { stdout, stderr } = await execAsync(command, {
					timeout: COMMAND_TIMEOUT,
				});
				// Some Claude commands output to stderr for progress info
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
 * Add rp1 marketplace to Claude Code.
 * Executes: claude plugin marketplace add rp1-run/rp1
 *
 * @param logger - Logger for progress output
 * @param dryRun - If true, log the command without executing
 * @returns TaskEither with true on success (or already exists), CLIError on failure
 */
export const addMarketplace = (
	logger: Logger,
	dryRun: boolean,
): TE.TaskEither<CLIError, boolean> => {
	const command = `claude plugin marketplace add ${MARKETPLACE_REPO}`;

	return pipe(
		executeClaudeCommand(command, logger, dryRun),
		TE.map(() => {
			if (!dryRun) {
				logger.success(`Marketplace ${MARKETPLACE_REPO} added`);
			}
			return true;
		}),
		TE.orElse((error) => {
			// Handle "already exists" gracefully
			if (error._tag === "InstallError" && isAlreadyExistsError(error)) {
				logger.info(`Marketplace ${MARKETPLACE_REPO} already registered`);
				return TE.right(true);
			}
			logger.fail(`Failed to add marketplace: ${getErrorMessage(error)}`);
			return TE.left(error);
		}),
	);
};

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
 * Install a plugin from the rp1 marketplace.
 * Executes: claude plugin install <plugin>@rp1 --scope <scope>
 *
 * @param pluginName - Name of the plugin to install (e.g., "rp1-base")
 * @param scope - Installation scope: "user", "project", or "local"
 * @param logger - Logger for progress output
 * @param dryRun - If true, log the command without executing
 * @returns TaskEither with true on success (or already exists), CLIError on failure
 */
export const installPlugin = (
	pluginName: string,
	scope: string,
	logger: Logger,
	dryRun: boolean,
): TE.TaskEither<CLIError, boolean> => {
	// Plugin name format: <plugin>@<marketplace>
	const pluginRef = `${pluginName}@${MARKETPLACE_NAME}`;
	const scopeArg = buildScopeArg(scope);
	const command = `claude plugin install ${pluginRef} ${scopeArg}`;

	return pipe(
		executeClaudeCommand(command, logger, dryRun),
		TE.map(() => {
			if (!dryRun) {
				logger.success(`Plugin ${pluginName} installed`);
			}
			return true;
		}),
		TE.orElse((error) => {
			// Handle "already exists" gracefully - try to update instead
			if (error._tag === "InstallError" && isAlreadyExistsError(error)) {
				logger.info(`Plugin ${pluginName} already installed, updating...`);
				return updatePlugin(pluginName, scope, logger, dryRun);
			}
			logger.fail(`Failed to install ${pluginName}: ${getErrorMessage(error)}`);
			return TE.left(error);
		}),
	);
};

/**
 * Update a plugin to latest version.
 * Executes: claude plugin update <plugin>@rp1 --scope <scope>
 *
 * @param pluginName - Name of the plugin to update (e.g., "rp1-base")
 * @param scope - Installation scope: "user", "project", or "local"
 * @param logger - Logger for progress output
 * @param dryRun - If true, log the command without executing
 * @returns TaskEither with true on success, CLIError on failure
 */
export const updatePlugin = (
	pluginName: string,
	scope: string,
	logger: Logger,
	dryRun: boolean,
): TE.TaskEither<CLIError, boolean> => {
	const pluginRef = `${pluginName}@${MARKETPLACE_NAME}`;
	const scopeArg = buildScopeArg(scope);
	const command = `claude plugin update ${pluginRef} ${scopeArg}`;

	return pipe(
		executeClaudeCommand(command, logger, dryRun),
		TE.map(() => {
			if (!dryRun) {
				logger.success(`Plugin ${pluginName} updated`);
			}
			return true;
		}),
		TE.mapLeft((error) => {
			logger.fail(`Failed to update ${pluginName}: ${getErrorMessage(error)}`);
			return error;
		}),
	);
};

/**
 * Install all rp1 plugins to Claude Code.
 * Orchestrates marketplace registration and plugin installation.
 *
 * @param scope - Installation scope: "user", "project", or "local"
 * @param logger - Logger for progress output
 * @param dryRun - If true, log commands without executing
 * @returns TaskEither with ClaudeCodeInstallResult on success
 */
export const installAllPlugins = (
	scope: string,
	logger: Logger,
	dryRun: boolean,
): TE.TaskEither<CLIError, ClaudeCodeInstallResult> => {
	const plugins = ["rp1-base", "rp1-dev"];
	const warnings: string[] = [];
	const pluginsInstalled: string[] = [];

	return pipe(
		// Step 1: Add marketplace
		addMarketplace(logger, dryRun),
		TE.chain((marketplaceAdded) =>
			pipe(
				// Step 2: Install rp1-base
				installPlugin(plugins[0], scope, logger, dryRun),
				TE.map((success) => {
					if (success) pluginsInstalled.push(plugins[0]);
					return { marketplaceAdded };
				}),
			),
		),
		TE.chain((result) =>
			pipe(
				// Step 3: Install rp1-dev
				installPlugin(plugins[1], scope, logger, dryRun),
				TE.map((success) => {
					if (success) pluginsInstalled.push(plugins[1]);
					return result;
				}),
			),
		),
		TE.map(
			(result): ClaudeCodeInstallResult => ({
				marketplaceAdded: result.marketplaceAdded,
				pluginsInstalled,
				warnings,
			}),
		),
	);
};
