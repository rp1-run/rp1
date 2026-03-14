/**
 * Plugin installation step for the rp1 init command.
 * Uses shared installation logic from install-core.ts to eliminate duplication
 * between init and install commands.
 */

import * as E from "fp-ts/lib/Either.js";
import { pipe } from "fp-ts/lib/function.js";
import * as TE from "fp-ts/lib/TaskEither.js";
import type { CLIError } from "../../../shared/errors.js";
import { formatError } from "../../../shared/errors.js";
import type { Logger } from "../../../shared/logger.js";
import { confirmAction, type PromptOptions } from "../../../shared/prompts.js";
import { createSpinner } from "../../../shared/spinner.js";
import type { ToolsRegistry } from "../../config/supported-tools.js";
import { installAllPlugins as defaultInstallAllPlugins } from "../../install/claudecode/installer.js";
import type {
	ClaudeCodeInstallResult,
	ClaudeCodePrerequisiteResult,
} from "../../install/claudecode/models.js";
import { runAllPrerequisiteChecks as defaultRunAllPrerequisiteChecks } from "../../install/claudecode/prerequisites.js";
import {
	type InstallContext,
	installOpenCodePlugins as sharedInstallOpenCodePlugins,
} from "../../shared/install-core.js";
import type {
	InitAction,
	PluginInstallResult,
	StepCallbacks,
} from "../models.js";
import { type DetectedTool, detectTools } from "../tool-detector.js";
import {
	verifyClaudeCodePlugins,
	verifyOpenCodePlugins,
} from "./verification.js";

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
 * Result of checking whether plugins are installed across detected platforms.
 */
export interface PluginsInstalledResult {
	/** Whether all detected platforms have plugins installed */
	readonly installed: boolean;
	/** Tools that were detected on the system */
	readonly detected: DetectedTool[];
}

/**
 * Check whether rp1 plugins are installed on all detected platforms.
 * Detects available tools via the registry, then runs the corresponding
 * verification function for each detected tool.
 *
 * Used by init to decide whether to trigger the install flow.
 *
 * @param registry - The tools registry to detect against
 * @returns Whether plugins are installed and which tools were detected
 */
export async function checkPluginsInstalled(
	registry: ToolsRegistry,
): Promise<PluginsInstalledResult> {
	const detectionResult = await detectTools(registry)();

	// detectTools never fails (returns Right), but handle defensively
	if (E.isLeft(detectionResult)) {
		return { installed: false, detected: [] };
	}

	const { detected } = detectionResult.right;

	if (detected.length === 0) {
		return { installed: false, detected: [] };
	}

	let allInstalled = true;

	for (const detectedTool of detected) {
		// Skip disabled tools
		if (detectedTool.tool.enabled === false) {
			continue;
		}

		if (detectedTool.tool.id === "claude-code") {
			const result = await verifyClaudeCodePlugins();
			if (!result.verified) {
				allInstalled = false;
			}
		} else if (detectedTool.tool.id === "opencode") {
			const result = await verifyOpenCodePlugins();
			if (!result.verified) {
				allInstalled = false;
			}
		}
	}

	return { installed: allInstalled, detected: [...detected] };
}

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
 * Uses shared installation logic from install-core.ts for consistency.
 *
 * @param detectedTool - The detected agentic tool (or null if none)
 * @param promptOptions - Options for prompting (TTY awareness)
 * @param logger - Logger for progress output
 * @param config - Optional plugin installation configuration
 * @param deps - Optional dependencies for testing (Claude Code only)
 * @param callbacks - Optional callbacks for reporting progress to UI
 * @returns Plugin installation step result with actions and result
 */
export const executePluginInstallation = async (
	detectedTool: DetectedTool | null,
	promptOptions: PromptOptions,
	logger: Logger,
	config: PluginInstallConfig = defaultPluginInstallConfig,
	deps: PluginInstallDeps = defaultPluginInstallDeps,
	callbacks?: StepCallbacks,
): Promise<PluginInstallStepResult> => {
	const actions: InitAction[] = [];

	// No tool detected - skip installation
	if (!detectedTool) {
		logger.info("No agentic tool detected - skipping plugin installation");
		callbacks?.onActivity("No agentic tool detected", "warning");
		actions.push({
			type: "skipped",
			reason: "No agentic tool detected - cannot install plugins",
		});
		return { actions, result: null };
	}

	// Skip disabled tools
	if (detectedTool.tool.enabled === false) {
		logger.info(
			`${detectedTool.tool.name} is disabled - skipping plugin installation`,
		);
		callbacks?.onActivity(`${detectedTool.tool.name} is disabled`, "info");
		actions.push({
			type: "skipped",
			reason: `${detectedTool.tool.name} is currently disabled`,
		});
		return { actions, result: null };
	}

	// Check for supported tools (Claude Code and OpenCode)
	const supportedTools = ["claude-code", "opencode"];
	if (!supportedTools.includes(detectedTool.tool.id)) {
		// Unsupported tools require manual installation
		logger.info(
			`Plugin installation for ${detectedTool.tool.name} requires manual setup.`,
		);
		logger.box(
			`See: https://rp1.run/getting-started/installation/#${detectedTool.tool.id}`,
		);
		callbacks?.onActivity(
			`Manual installation required for ${detectedTool.tool.name}`,
			"info",
		);
		actions.push({
			type: "skipped",
			reason: `Automated installation not supported for ${detectedTool.tool.name}`,
		});
		return { actions, result: null };
	}

	callbacks?.onActivity(
		`Installing plugins for ${detectedTool.tool.name}`,
		"info",
	);

	// Non-interactive mode (--yes): proceed with installation
	if (!promptOptions.isTTY) {
		logger.info("Installing plugins (non-interactive mode)...");
		return executeInstallationForTool(
			detectedTool,
			actions,
			config,
			logger,
			promptOptions.isTTY,
			deps,
			callbacks,
		);
	}

	// Interactive: confirm with user
	const confirmed = await confirmAction(
		`Install rp1 plugins to ${detectedTool.tool.name}?`,
		{ ...promptOptions, defaultOnNonTTY: true },
	);

	if (!confirmed) {
		logger.info("Plugin installation declined");
		callbacks?.onActivity("Plugin installation declined by user", "info");
		actions.push({
			type: "skipped",
			reason: "Plugin installation declined by user",
		});
		return { actions, result: null };
	}

	// Execute installation for the specific tool
	return executeInstallationForTool(
		detectedTool,
		actions,
		config,
		logger,
		promptOptions.isTTY,
		deps,
		callbacks,
	);
};

/**
 * Execute the actual plugin installation for a specific tool.
 * Uses shared installation logic from install-core.ts.
 * Routes to the appropriate installer based on tool ID.
 */
async function executeInstallationForTool(
	detectedTool: DetectedTool,
	actions: InitAction[],
	config: PluginInstallConfig,
	logger: Logger,
	isTTY: boolean,
	deps: PluginInstallDeps = defaultPluginInstallDeps,
	callbacks?: StepCallbacks,
): Promise<PluginInstallStepResult> {
	const spinner = createSpinner(isTTY);
	spinner.start(`Installing plugins for ${detectedTool.tool.name}...`);

	// Create InstallContext for shared installation functions
	const ctx: InstallContext = {
		logger,
		isTTY,
		dryRun: config.dryRun,
		skipPrompt: !isTTY,
	};

	let resultEither: E.Either<CLIError, PluginInstallResult>;

	if (detectedTool.tool.id === "claude-code") {
		// Use injectable deps for Claude Code (supports testing)
		// Note: installClaudeCodePlugins never fails due to orElse, but type is still Either<CLIError, ...>
		resultEither = (await installClaudeCodePlugins(
			config,
			logger,
			isTTY,
			deps,
		)()) as E.Either<CLIError, PluginInstallResult>;
	} else if (detectedTool.tool.id === "opencode") {
		// Use shared OpenCode installation logic
		const openCodeResult = await sharedInstallOpenCodePlugins({}, ctx)();

		if (E.isLeft(openCodeResult)) {
			resultEither = E.right({
				success: false,
				pluginsInstalled: [],
				warnings: [],
				error: openCodeResult.left,
			});
		} else {
			resultEither = E.right({
				success: true,
				pluginsInstalled: ["rp1-base", "rp1-dev"],
				warnings: [],
			});
		}
	} else {
		// This should not happen due to earlier check, but handle defensively
		resultEither = E.right({
			success: false,
			pluginsInstalled: [],
			warnings: [`Unsupported tool: ${detectedTool.tool.name}`],
		});
	}

	// Process the result (common for all tools)
	return processInstallationResult(
		resultEither,
		actions,
		spinner,
		logger,
		callbacks,
	);
}

/**
 * Process installation result and update actions.
 * Extracted to share between different tool installations.
 */
function processInstallationResult(
	resultEither: E.Either<CLIError, PluginInstallResult>,
	actions: InitAction[],
	spinner: ReturnType<typeof createSpinner>,
	logger: Logger,
	callbacks?: StepCallbacks,
): PluginInstallStepResult {
	// This should typically be Right since we convert errors to failed results in orElse
	// but we handle Left defensively
	if (E.isLeft(resultEither)) {
		const error = resultEither.left;
		const errorMessage = formatError(error, false);
		actions.push({
			type: "plugin_install_failed",
			name: "rp1-plugins",
			error: errorMessage,
		});
		spinner.fail(`Plugin installation failed: ${errorMessage}`);
		callbacks?.onActivity(`Installation failed: ${errorMessage}`, "error");
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
		callbacks?.onActivity(
			`Installed ${result.pluginsInstalled.length} plugin(s)`,
			"success",
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
		callbacks?.onActivity(`Installation failed: ${errorMessage}`, "error");
		logger.info(
			"You can try installing manually: https://rp1.run/getting-started/installation/",
		);
	}

	return { actions, result };
}
