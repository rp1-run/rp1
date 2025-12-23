/**
 * Plugin installation step for the rp1 init command.
 * Executes actual plugin installation using the existing Claude Code installer.
 */

import * as E from "fp-ts/lib/Either.js";
import { pipe } from "fp-ts/lib/function.js";
import * as TE from "fp-ts/lib/TaskEither.js";
import type { CLIError } from "../../../shared/errors.js";
import { formatError } from "../../../shared/errors.js";
import type { Logger } from "../../../shared/logger.js";
import { confirmAction, type PromptOptions } from "../../../shared/prompts.js";
import { createSpinner } from "../../../shared/spinner.js";
import { installAllPlugins as defaultInstallAllPlugins } from "../../install/claudecode/installer.js";
import type {
	ClaudeCodeInstallResult,
	ClaudeCodePrerequisiteResult,
} from "../../install/claudecode/models.js";
import { runAllPrerequisiteChecks as defaultRunAllPrerequisiteChecks } from "../../install/claudecode/prerequisites.js";
import type { InitAction, PluginInstallResult } from "../models.js";
import type { DetectedTool } from "../tool-detector.js";

/**
 * Configuration for plugin installation.
 */
export interface PluginInstallConfig {
	readonly dryRun: boolean;
	readonly scope: "user" | "project" | "local";
}

/**
 * Default plugin installation configuration.
 */
export const defaultPluginInstallConfig: PluginInstallConfig = {
	dryRun: false,
	scope: "user",
};

/**
 * Dependencies for plugin installation.
 * Allows injection for testing.
 */
export interface PluginInstallDeps {
	readonly runPrerequisiteChecks: () => TE.TaskEither<
		CLIError,
		readonly ClaudeCodePrerequisiteResult[]
	>;
	readonly installPlugins: (
		scope: string,
		logger: Logger,
		dryRun: boolean,
		isTTY: boolean,
	) => TE.TaskEither<CLIError, ClaudeCodeInstallResult>;
}

/**
 * Default dependencies using actual installer modules.
 */
export const defaultPluginInstallDeps: PluginInstallDeps = {
	runPrerequisiteChecks: defaultRunAllPrerequisiteChecks,
	installPlugins: defaultInstallAllPlugins,
};

/**
 * Execute plugin installation for Claude Code.
 * Reuses existing installer infrastructure with prerequisite checks.
 *
 * @param config - Plugin installation configuration
 * @param logger - Logger for progress output
 * @param isTTY - Whether the terminal supports TTY for spinner display
 * @param deps - Optional dependencies for testing
 * @returns TaskEither with PluginInstallResult on success or CLIError on failure
 */
export const installClaudeCodePlugins = (
	config: PluginInstallConfig,
	logger: Logger,
	isTTY: boolean,
	deps: PluginInstallDeps = defaultPluginInstallDeps,
): TE.TaskEither<CLIError, PluginInstallResult> =>
	pipe(
		// Step 1: Run prerequisite checks
		deps.runPrerequisiteChecks(),
		// Step 2: Install all plugins
		TE.chain(() =>
			deps.installPlugins(config.scope, logger, config.dryRun, isTTY),
		),
		// Step 3: Map to PluginInstallResult
		TE.map(
			(result): PluginInstallResult => ({
				success: true,
				pluginsInstalled: result.pluginsInstalled,
				warnings: result.warnings,
			}),
		),
		// Step 4: Handle errors gracefully - don't fail, return failed result
		TE.orElse(
			(error): TE.TaskEither<never, PluginInstallResult> =>
				TE.right({
					success: false,
					pluginsInstalled: [],
					warnings: [],
					error: error,
				}),
		),
	);

/**
 * Result of plugin installation step.
 */
export interface PluginInstallStepResult {
	readonly actions: readonly InitAction[];
	readonly result: PluginInstallResult | null;
}

/**
 * Main plugin installation step.
 * Handles tool detection, user confirmation, and execution.
 *
 * @param detectedTool - The detected agentic tool (or null if none)
 * @param promptOptions - Options for prompting (TTY awareness)
 * @param logger - Logger for progress output
 * @param config - Optional plugin installation configuration
 * @param deps - Optional dependencies for testing
 * @returns Plugin installation step result with actions and result
 */
export const executePluginInstallation = async (
	detectedTool: DetectedTool | null,
	promptOptions: PromptOptions,
	logger: Logger,
	config: PluginInstallConfig = defaultPluginInstallConfig,
	deps: PluginInstallDeps = defaultPluginInstallDeps,
): Promise<PluginInstallStepResult> => {
	const actions: InitAction[] = [];

	// No tool detected - skip installation
	if (!detectedTool) {
		logger.info("No agentic tool detected - skipping plugin installation");
		actions.push({
			type: "skipped",
			reason: "No agentic tool detected - cannot install plugins",
		});
		return { actions, result: null };
	}

	// Only Claude Code supports automated plugin installation
	if (detectedTool.tool.id !== "claude-code") {
		// OpenCode and other tools require manual installation
		logger.info(
			`Plugin installation for ${detectedTool.tool.name} requires manual setup.`,
		);
		logger.box(
			`See: https://rp1.run/getting-started/installation/#${detectedTool.tool.id}`,
		);
		actions.push({
			type: "skipped",
			reason: `Automated installation not supported for ${detectedTool.tool.name}`,
		});
		return { actions, result: null };
	}

	// Non-interactive mode (--yes): proceed with installation
	if (!promptOptions.isTTY) {
		logger.info("Installing plugins (non-interactive mode)...");
		return executeInstallation(
			actions,
			config,
			logger,
			promptOptions.isTTY,
			deps,
		);
	}

	// Interactive: confirm with user
	const confirmed = await confirmAction(
		`Install rp1 plugins to ${detectedTool.tool.name}?`,
		{ ...promptOptions, defaultOnNonTTY: true },
	);

	if (!confirmed) {
		logger.info("Plugin installation declined");
		actions.push({
			type: "skipped",
			reason: "Plugin installation declined by user",
		});
		return { actions, result: null };
	}

	// Execute installation
	return executeInstallation(
		actions,
		config,
		logger,
		promptOptions.isTTY,
		deps,
	);
};

/**
 * Execute the actual plugin installation.
 * Extracted for reuse between interactive and non-interactive modes.
 */
async function executeInstallation(
	actions: InitAction[],
	config: PluginInstallConfig,
	logger: Logger,
	isTTY: boolean,
	deps: PluginInstallDeps = defaultPluginInstallDeps,
): Promise<PluginInstallStepResult> {
	const spinner = createSpinner(isTTY);
	spinner.start("Installing plugins...");

	const resultEither = await installClaudeCodePlugins(
		config,
		logger,
		isTTY,
		deps,
	)();

	// installClaudeCodePlugins never fails (errors converted to failed result)
	// but we handle both cases for type safety
	if (E.isLeft(resultEither)) {
		// This branch should never be reached due to orElse, but handle defensively
		const error = resultEither.left;
		const errorMessage = formatError(error, false);
		actions.push({
			type: "plugin_install_failed",
			name: "rp1-plugins",
			error: errorMessage,
		});
		spinner.fail(`Plugin installation failed: ${errorMessage}`);
		return { actions, result: null };
	}

	const result = resultEither.right;

	if (result.success) {
		// Record each installed plugin
		for (const plugin of result.pluginsInstalled) {
			actions.push({
				type: "plugin_installed",
				name: plugin,
				version: "latest",
			});
		}

		// Log warnings if any
		for (const warning of result.warnings) {
			logger.warn(warning);
		}

		spinner.succeed(
			`Installed ${result.pluginsInstalled.length} plugin(s): ${result.pluginsInstalled.join(", ")}`,
		);
	} else {
		// Installation failed
		const errorMessage =
			result.error instanceof Error
				? result.error.message
				: typeof result.error === "object" && result.error !== null
					? formatError(result.error as CLIError, false)
					: String(result.error ?? "Unknown error");

		actions.push({
			type: "plugin_install_failed",
			name: "rp1-plugins",
			error: errorMessage,
		});

		spinner.fail(`Plugin installation failed: ${errorMessage}`);
		logger.info(
			"You can try installing manually: https://rp1.run/getting-started/installation/",
		);
	}

	return { actions, result };
}
