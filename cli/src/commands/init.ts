import { Command } from "commander";
import * as E from "fp-ts/lib/Either.js";
import { formatError, getExitCode } from "../../shared/errors.js";
import type { Logger } from "../../shared/logger.js";
import { executeInit, type InitResult } from "../init/index.js";

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
configures .gitignore, detects agentic tools, and offers plugin installation.

Examples:
  rp1 init                    Interactive setup with prompts
  rp1 init --yes              Non-interactive with defaults (CI/automation)
  rp1 init --interactive      Force prompts even without TTY

Options:
  --yes, -y          Skip all prompts, use recommended defaults
  --interactive, -i  Force interactive mode (overrides --yes if both specified)
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

		if (E.isLeft(result)) {
			console.error(formatError(result.left, process.stderr.isTTY ?? false));
			process.exit(getExitCode(result.left));
		}

		// Log summary of actions
		const initResult: InitResult = result.right;
		logInitSummary(initResult, logger);
	});

function logInitSummary(result: InitResult, logger: Logger): void {
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
