/**
 * UI entry point for the init wizard.
 * Provides TTY-aware rendering with non-TTY fallback support.
 *
 * @see design.md#3.5-non-tty-fallback-strategy
 */

import figures from "figures";
import { Box, render, Static } from "ink";
import type React from "react";
import type { CLIError } from "../../../shared/errors.js";
import type { ToolsRegistry } from "../../config/supported-tools.js";
import type { InitOptions, InitResult } from "../models.js";
import { FinalSummary } from "./components/FinalSummary.js";
import type { WizardState } from "./hooks/useWizardState.js";
import { WIZARD_STEPS } from "./hooks/useWizardState.js";
import { InitWizard } from "./InitWizard.js";

/**
 * Detect whether interactive TTY mode should be used.
 *
 * TTY detection logic:
 * 1. If --yes flag is set, force non-interactive mode
 * 2. If --interactive flag is set, force interactive mode
 * 3. Otherwise, check process.stdout.isTTY
 *
 * @param options - Init options from CLI
 * @returns true if interactive mode should be used
 */
export const detectTTY = (options: InitOptions): boolean => {
	if (options.yes) {
		return false;
	}
	if (options.interactive) {
		return true;
	}
	return process.stdout.isTTY ?? false;
};

/**
 * Non-TTY progress logger.
 * Outputs clean text without ANSI codes for CI/automation environments.
 */
class NonTTYLogger {
	private format(icon: string, message: string): string {
		return `${icon} ${message}`;
	}

	info(message: string): void {
		console.log(this.format(figures.info, message));
	}

	success(message: string): void {
		console.log(this.format(figures.tick, message));
	}

	warning(message: string): void {
		console.log(this.format(figures.warning, message));
	}

	error(message: string): void {
		console.log(this.format(figures.cross, message));
	}

	step(name: string, description: string): void {
		console.log(this.format(figures.pointer, `${name}: ${description}`));
	}

	stepComplete(name: string): void {
		console.log(this.format(figures.tick, `${name}: Complete`));
	}

	stepSkip(name: string, reason: string): void {
		console.log(this.format(figures.line, `${name}: Skipped (${reason})`));
	}

	stepFail(name: string, error: string): void {
		console.log(this.format(figures.cross, `${name}: Failed - ${error}`));
	}
}

/**
 * Static summary component for non-TTY rendering.
 * Uses Ink's Static component for clean output.
 */
const StaticSummary: React.FC<{ readonly state: WizardState }> = ({
	state,
}) => {
	return <FinalSummary state={state} />;
};

/**
 * Build a minimal WizardState from InitResult for static rendering.
 * Used when executing non-interactively to render the final summary.
 */
export const buildStateFromResult = (result: InitResult): WizardState => {
	const steps = WIZARD_STEPS.map((step) => ({
		...step,
		status: "completed" as const,
		activities: [],
	}));

	return {
		currentStepIndex: steps.length - 1,
		steps,
		activities: [],
		detectedTools: result.detectedTool ? [result.detectedTool] : [],
		healthReport: result.healthReport,
		projectContext: null,
		userChoices: {},
		phase: "complete",
		error: null,
	};
};

/**
 * Execute init in non-interactive mode with console.log progress.
 * Used for CI/automation environments where TTY is not available.
 */
export const executeInitNonInteractive = async (
	options: InitOptions,
	_registry: ToolsRegistry,
): Promise<InitResult> => {
	const logger = new NonTTYLogger();

	// Import the executeInit function from the main init module
	// Note: We use dynamic import to avoid circular dependencies
	const { executeInit } = await import("../index.js");

	// Create a logger that uses our NonTTYLogger
	const { createLogger } = await import("../../../shared/logger.js");
	const initLogger = createLogger({ level: "info", color: false });

	// Wrap the logger methods to also output to our NonTTYLogger
	const originalInfo = initLogger.info.bind(initLogger);
	const originalSuccess = initLogger.success.bind(initLogger);
	const originalWarn = initLogger.warn.bind(initLogger);
	const originalError = initLogger.error.bind(initLogger);

	initLogger.info = (msg: string) => {
		logger.info(msg);
		originalInfo(msg);
	};
	initLogger.success = (msg: string) => {
		logger.success(msg);
		originalSuccess(msg);
	};
	initLogger.warn = (msg: string) => {
		logger.warning(msg);
		originalWarn(msg);
	};
	initLogger.error = (msg: string) => {
		logger.error(msg);
		originalError(msg);
	};

	console.log("");
	console.log("rp1 init (non-interactive mode)");
	console.log("================================");
	console.log("");

	const result = await executeInit({ ...options, yes: true }, initLogger)();

	if (result._tag === "Left") {
		const { formatError } = await import("../../../shared/errors.js");
		throw new Error(formatError(result.left, false));
	}

	return result.right;
};

/**
 * Strip ANSI escape codes from a string.
 * Used to ensure clean output in non-TTY mode.
 */
export const stripAnsi = (str: string): string => {
	// biome-ignore lint/suspicious/noControlCharactersInRegex: Intentionally matching ANSI escape sequences
	const ansiRegex = /\x1B\[[0-9;]*m/g;
	return str.replace(ansiRegex, "");
};

/**
 * Render the init wizard with TTY-aware mode selection.
 *
 * In TTY mode:
 * - Full interactive Ink rendering with real-time updates
 * - Step-by-step wizard flow with spinners and prompts
 *
 * In non-TTY mode:
 * - Execute steps with console.log progress
 * - Render final summary using Ink Static component
 * - Clean output without ANSI codes
 *
 * @param options - Init options from CLI
 * @param registry - Tools registry for AI tool detection
 * @returns Promise resolving to InitResult on success
 */
export const renderInit = async (
	options: InitOptions,
	registry: ToolsRegistry,
): Promise<InitResult> => {
	const isTTY = detectTTY(options);

	if (isTTY) {
		// Full interactive Ink rendering
		return new Promise<InitResult>((resolve, reject) => {
			let finalResult: InitResult | null = null;

			const handleComplete = (result: InitResult) => {
				finalResult = result;
			};

			const handleError = (error: CLIError) => {
				import("../../../shared/errors.js").then(({ formatError }) => {
					reject(new Error(formatError(error, false)));
				});
			};

			const { waitUntilExit } = render(
				<InitWizard
					options={options}
					registry={registry}
					onComplete={handleComplete}
					onError={handleError}
				/>,
			);

			waitUntilExit()
				.then(() => {
					if (finalResult) {
						resolve(finalResult);
					} else {
						reject(new Error("Init wizard exited without result"));
					}
				})
				.catch(reject);
		});
	}

	// Non-TTY: Execute steps with console.log progress
	const result = await executeInitNonInteractive(options, registry);

	// Render final summary statically using Ink
	const state = buildStateFromResult(result);

	// Use Ink's Static component for clean output
	const { unmount } = render(
		<Static items={[state]}>
			{(item) => (
				<Box key="summary">
					<StaticSummary state={item} />
				</Box>
			)}
		</Static>,
	);

	// Give Ink time to render, then unmount
	await new Promise((resolve) => setTimeout(resolve, 100));
	unmount();

	return result;
};

export default renderInit;
