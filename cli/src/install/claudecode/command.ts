/**
 * Command orchestrator module for Claude Code plugin installation.
 * Coordinates prerequisites and installation.
 */

import { pipe } from "fp-ts/lib/function.js";
import * as TE from "fp-ts/lib/TaskEither.js";
import type { CLIError } from "../../../shared/errors.js";
import type { Logger } from "../../../shared/logger.js";
import { createSpinner, type Spinner } from "../../../shared/spinner.js";
import { getColorFns } from "../../lib/colors.js";
import { installAllPlugins } from "./installer.js";
import type {
	ClaudeCodeInstallConfig,
	ClaudeCodeInstallResult,
	ClaudeCodePrerequisiteResult,
} from "./models.js";
import { runAllPrerequisiteChecks } from "./prerequisites.js";

/**
 * Parsed CLI arguments for Claude Code installation.
 */
export interface ClaudeCodeInstallArgs {
	readonly dryRun: boolean;
	readonly yes: boolean;
	readonly scope: "user" | "project" | "local";
	readonly showHelp: boolean;
}

/**
 * Runtime options for installation execution.
 */
export interface ClaudeCodeInstallOptions {
	readonly isTTY: boolean;
	readonly skipPrompt: boolean;
}

/**
 * Default installation options.
 */
export const defaultClaudeCodeInstallOptions: ClaudeCodeInstallOptions = {
	isTTY: false,
	skipPrompt: false,
};

/**
 * Parse CLI arguments for Claude Code installation.
 * Supports: --dry-run, -y/--yes, -s/--scope <scope>
 *
 * @param args - Array of CLI arguments
 * @returns Parsed arguments with showHelp flag
 */
export const parseClaudeCodeInstallArgs = (
	args: readonly string[],
): ClaudeCodeInstallArgs => {
	let dryRun = false;
	let yes = false;
	let scope: "user" | "project" | "local" = "user";
	let showHelp = false;

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];

		if (arg === "--dry-run") {
			dryRun = true;
		} else if (arg === "-y" || arg === "--yes") {
			yes = true;
		} else if (arg === "-s" || arg === "--scope") {
			const nextArg = args[i + 1];
			if (nextArg === "user" || nextArg === "project" || nextArg === "local") {
				scope = nextArg;
				i++; // Skip the next argument since we consumed it
			}
		} else if (arg === "-h" || arg === "--help") {
			showHelp = true;
		}
	}

	return { dryRun, yes, scope, showHelp };
};

/**
 * Create installation config from parsed args.
 */
const createConfig = (
	args: ClaudeCodeInstallArgs,
): ClaudeCodeInstallConfig => ({
	dryRun: args.dryRun,
	yes: args.yes,
	scope: args.scope,
});

/**
 * Display planned commands for dry-run mode.
 */
const displayDryRunPlan = (
	config: ClaudeCodeInstallConfig,
	logger: Logger,
	isTTY: boolean,
): void => {
	const color = getColorFns(isTTY);

	logger.info(color.yellow("[dry-run] Installation plan:"));
	logger.info("");
	logger.info(`${color.dim("1.")} claude plugin marketplace add rp1-run/rp1`);
	logger.info(
		`${color.dim("2.")} claude plugin install rp1-base@rp1-run --scope ${config.scope}`,
	);
	logger.info(
		`${color.dim("3.")} claude plugin install rp1-dev@rp1-run --scope ${config.scope}`,
	);
	logger.info("");
	logger.info(color.dim("Run without --dry-run to execute these commands."));
};

/**
 * Display installation success message.
 */
const displaySuccess = (
	result: ClaudeCodeInstallResult,
	spinner: Spinner,
	logger: Logger,
	isTTY: boolean,
): void => {
	const color = getColorFns(isTTY);

	logger.info("");
	spinner.succeed(
		color.green("rp1 plugins installed successfully to Claude Code!"),
	);
	logger.info("");
	logger.info(color.dim("Installed plugins:"));
	for (const plugin of result.pluginsInstalled) {
		logger.info(color.dim(`  • ${plugin}`));
	}
	logger.info("");
	logger.info(
		color.dim(
			"Restart Claude Code and run /help to see available rp1 commands.",
		),
	);
};

/**
 * Log prerequisite check results.
 */
const logPrerequisiteResults = (
	results: readonly ClaudeCodePrerequisiteResult[],
	spinner: Spinner,
): void => {
	for (const result of results) {
		if (result.passed) {
			spinner.succeed(result.message);
		}
	}
};

/**
 * Execute dry-run mode: display planned commands and exit.
 */
const executeDryRun = (
	config: ClaudeCodeInstallConfig,
	logger: Logger,
	isTTY: boolean,
): TE.TaskEither<CLIError, void> => {
	displayDryRunPlan(config, logger, isTTY);
	return TE.right(undefined);
};

/**
 * Execute normal installation mode.
 */
const executeNormalInstall = (
	config: ClaudeCodeInstallConfig,
	spinner: Spinner,
	logger: Logger,
	isTTY: boolean,
): TE.TaskEither<CLIError, void> =>
	pipe(
		// Step 1: Install plugins
		TE.Do,
		TE.tap(() => {
			logger.info("");
			spinner.start("Installing plugins...");
			return TE.right(undefined);
		}),
		TE.chain(() =>
			installAllPlugins(config.scope, logger, config.dryRun, isTTY),
		),
		// Step 2: Display success message
		TE.map((installResult: ClaudeCodeInstallResult) => {
			displaySuccess(installResult, spinner, logger, isTTY);
		}),
	);

/**
 * Execute Claude Code installation.
 * Orchestrates prerequisites, installation, and verification.
 *
 * @param args - CLI arguments array
 * @param logger - Logger for output
 * @param options - Runtime options (isTTY, skipPrompt)
 * @returns TaskEither with void on success, CLIError on failure
 */
export const executeClaudeCodeInstall = (
	args: readonly string[],
	logger: Logger,
	options: ClaudeCodeInstallOptions = defaultClaudeCodeInstallOptions,
): TE.TaskEither<CLIError, void> => {
	const parsedArgs = parseClaudeCodeInstallArgs(args);
	const config = createConfig(parsedArgs);
	const isTTY = options.isTTY;
	const color = getColorFns(isTTY);
	const spinner = createSpinner(isTTY);

	// Display header
	logger.info("");
	logger.info(color.bold("Installing rp1 plugins to Claude Code"));
	logger.info("");

	return pipe(
		// Step 1: Run prerequisite checks
		TE.Do,
		TE.tap(() => {
			spinner.start("Checking prerequisites...");
			return TE.right(undefined);
		}),
		TE.chain(() => runAllPrerequisiteChecks()),
		TE.tap((prereqResults: readonly ClaudeCodePrerequisiteResult[]) => {
			logPrerequisiteResults(prereqResults, spinner);
			return TE.right(undefined);
		}),
		// Step 2: Branch based on dry-run mode
		TE.chain(() => {
			if (config.dryRun) {
				return executeDryRun(config, logger, isTTY);
			}
			return executeNormalInstall(config, spinner, logger, isTTY);
		}),
		// Stop spinner on error to ensure clean exit
		TE.mapLeft((error) => {
			spinner.stop();
			return error;
		}),
	);
};
