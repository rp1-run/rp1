/**
 * Claude Code verification subcommand.
 * Verifies rp1 plugins are correctly installed in Claude Code.
 */

import { Command } from "commander";
import type { Logger } from "../../../shared/logger.js";
import { verifyClaudeCodePlugins } from "../../init/steps/verification.js";
import { colorFns } from "../../lib/colors.js";

const { green, yellow, red, dim, bold, cyan } = colorFns;

/**
 * Execute Claude Code verification.
 * Checks that rp1-base and rp1-dev plugins are installed.
 */
export const executeVerifyClaudeCode = async (
	_logger: Logger,
): Promise<void> => {
	console.log(bold("\nVerifying Claude Code Plugins\n"));

	const result = await verifyClaudeCodePlugins();

	console.log("+-----------+--------------+--------+");
	console.log("| Plugin    | Version      | Status |");
	console.log("+-----------+--------------+--------+");

	for (const plugin of result.plugins) {
		const name = plugin.name.padEnd(9);
		const version = (plugin.version ?? "not found").padEnd(12);
		const status = plugin.installed ? green("  OK  ") : red(" MISS ");
		console.log(`| ${name} | ${version} | ${status} |`);
	}

	console.log("+-----------+--------------+--------+");

	if (result.issues.length > 0) {
		console.log(yellow("\nIssues Found:"));
		for (const issue of result.issues) {
			console.log(yellow(`  - ${issue}`));
		}
	}

	if (!result.verified) {
		console.log(dim("\nRemediation:"));
		console.log(dim("  Install missing plugins with:"));
		console.log(cyan("    rp1 install claude-code"));
		console.log(
			dim("\n  For more information, see: https://rp1.run/installation"),
		);
		console.log(red(bold("\nPlugins incomplete")));
		process.exit(1);
	}

	console.log(green(bold("\nAll plugins installed")));
};

/**
 * Claude Code verification subcommand.
 */
export const verifyClaudeCodeSubcommand = new Command("claude-code")
	.description("Verify rp1 plugins in Claude Code")
	.addHelpText(
		"after",
		`
Examples:
  rp1 verify claude-code    Verify Claude Code plugins are installed
`,
	)
	.action(async (_options, command) => {
		const logger = command.parent?.parent?._logger as Logger;
		if (!logger) {
			console.error("Logger not initialized");
			process.exit(1);
		}

		await executeVerifyClaudeCode(logger);
	});
