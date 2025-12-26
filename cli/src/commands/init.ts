import { Command } from "commander";
import * as E from "fp-ts/lib/Either.js";
import { formatError, getExitCode } from "../../shared/errors.js";
import type { Logger } from "../../shared/logger.js";
import { loadToolsRegistry } from "../config/supported-tools.js";
import { executeInit, type InitResult } from "../init/index.js";
import { renderInit } from "../init/ui/index.js";

/**
 * Determine exit code based on init result.
 *
 * Exit codes:
 * - 0: Success - all operations completed (possibly with warnings)
 * - 1: Critical failure - init could not complete core setup
 *
 * Non-critical failures (e.g., plugin installation failure) do not affect exit code
 * because the core rp1 setup (directories, instruction file, gitignore) succeeded.
 */
function getInitExitCode(result: InitResult): number {
	const criticalFailures = result.actions.filter((action) => {
		if (action.type === "skipped" && action.reason === "User cancelled") {
			return false;
		}
		if (action.type === "plugin_install_failed") {
			return false;
		}
		if (action.type === "verification_failed") {
			return false;
		}
		return false;
	});

	return criticalFailures.length > 0 ? 1 : 0;
}

export const initCommand = new Command("init")
	.description("Initialize rp1 in the current project")
	.option("-y, --yes", "Non-interactive mode with sensible defaults")
	.option(
		"-i, --interactive",
		"Force interactive mode even without TTY (overrides --yes)",
	)
	.addHelpText(
		"after",
		`
Sets up rp1 directory structure, injects KB loading patterns into CLAUDE.md/AGENTS.md,
configures .gitignore, detects agentic tools, and installs plugins.

Non-interactive mode (--yes) behaviors:
  - Creates .rp1/ directory structure
  - Injects rp1 instructions into CLAUDE.md/AGENTS.md
  - Uses "recommended" gitignore preset
  - Installs plugins automatically if Claude Code is detected
  - Skips re-initialization prompts (preserves existing config)
  - Silent operation except for errors and final summary

Examples:
  rp1 init                    Interactive setup with prompts
  rp1 init --yes              Non-interactive with defaults (CI/automation)
  rp1 init --interactive      Force prompts even without TTY

Exit codes:
  0    Success (including with warnings)
  1    Critical failure (init could not complete)
`,
	)
	.action(async (options, command) => {
		const logger = command.parent?._logger as Logger;
		if (!logger) {
			console.error("Logger not initialized");
			process.exit(1);
		}

		const useNewUI = process.env.RP1_NEW_INIT !== "0";

		let initResult: InitResult;

		if (useNewUI) {
			try {
				const registry = await loadToolsRegistry();
				initResult = await renderInit(
					{
						yes: options.yes,
						interactive: options.interactive,
					},
					registry,
				);
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				console.error(`Init failed: ${message}`);
				process.exit(1);
			}
		} else {
			const result = await executeInit(
				{
					yes: options.yes,
					interactive: options.interactive,
				},
				logger,
			)();

			if (E.isLeft(result)) {
				console.error(formatError(result.left, process.stderr.isTTY ?? false));
				process.exit(getExitCode(result.left));
			}

			initResult = result.right;
		}

		logInitSummary(initResult, logger, options.yes);

		const exitCode = getInitExitCode(initResult);
		if (exitCode !== 0) {
			process.exit(exitCode);
		}
	});

/**
 * Log init summary.
 *
 * In non-interactive mode (--yes), only errors and warnings are logged.
 * The comprehensive summary is handled by displaySummary in the orchestrator.
 *
 * @param result - Init result
 * @param logger - Logger instance
 * @param isNonInteractive - Whether running in --yes mode
 */
function logInitSummary(
	result: InitResult,
	logger: Logger,
	_isNonInteractive?: boolean,
): void {
	for (const warning of result.warnings) {
		logger.warn(warning);
	}
}
