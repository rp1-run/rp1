import { Command } from "commander";
import * as E from "fp-ts/lib/Either.js";
import { formatError, getExitCode } from "../../shared/errors.js";
import type { Logger } from "../../shared/logger.js";
import { executeInit, type InitResult } from "../init/index.js";

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
	// Check for critical failures that prevent rp1 from being usable
	const criticalFailures = result.actions.filter((action) => {
		// User cancellation is not a failure
		if (action.type === "skipped" && action.reason === "User cancelled") {
			return false;
		}
		// Plugin failures are non-critical - rp1 still works, just needs manual plugin install
		if (action.type === "plugin_install_failed") {
			return false;
		}
		// Verification failures are non-critical
		if (action.type === "verification_failed") {
			return false;
		}
		return false;
	});

	// Currently all failures handled during init are non-critical
	// The main executeInit function throws CLIError for critical failures
	// which are caught before this function is called
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

		const result = await executeInit(
			{
				yes: options.yes,
				interactive: options.interactive,
			},
			logger,
		)();

		// Handle execution error (critical failure)
		if (E.isLeft(result)) {
			console.error(formatError(result.left, process.stderr.isTTY ?? false));
			process.exit(getExitCode(result.left));
		}

		// Log summary of actions (shown in both interactive and non-interactive modes)
		const initResult: InitResult = result.right;
		logInitSummary(initResult, logger, options.yes);

		// Exit with appropriate code based on result
		const exitCode = getInitExitCode(initResult);
		if (exitCode !== 0) {
			process.exit(exitCode);
		}
		// Exit code 0 is implicit (process exits normally)
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
	isNonInteractive?: boolean,
): void {
	// In non-interactive mode, only log warnings (errors are handled by displaySummary)
	// This ensures silent operation except for errors and final summary
	if (isNonInteractive) {
		// Only log warnings - the final summary is already displayed by displaySummary
		for (const warning of result.warnings) {
			logger.warn(warning);
		}
		return;
	}

	// Interactive mode: log detailed summary
	// Count action types
	const created = result.actions.filter(
		(a) => a.type === "created_directory" || a.type === "created_file",
	).length;
	const updated = result.actions.filter(
		(a) => a.type === "updated_file",
	).length;
	const skipped = result.actions.filter((a) => a.type === "skipped").length;

	// Log warnings if any
	for (const warning of result.warnings) {
		logger.warn(warning);
	}

	// Log summary
	if (created > 0 || updated > 0) {
		logger.info(`Actions: ${created} created, ${updated} updated`);
	}

	if (skipped > 0) {
		logger.debug(`Skipped: ${skipped} items`);
	}

	if (result.detectedTool) {
		logger.info(`Detected tool: ${result.detectedTool.tool.name}`);
	}
}
