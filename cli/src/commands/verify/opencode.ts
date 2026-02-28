/**
 * OpenCode verification subcommand.
 * Verifies rp1 plugins are correctly installed in OpenCode.
 */

import { Command } from "commander";
import * as E from "fp-ts/lib/Either.js";
import { formatError, getExitCode } from "../../../shared/errors.js";
import type { Logger } from "../../../shared/logger.js";
import { isHealthy } from "../../install/models.js";
import { verifyInstallation } from "../../install/verifier.js";
import { colorFns } from "../../lib/colors.js";

const { green, yellow, red, dim, bold, cyan } = colorFns;

/**
 * Execute OpenCode verification.
 * Checks that rp1 skills, agents, and hooks are installed.
 */
export const executeVerifyOpenCode = async (
	artifactsDir: string | undefined,
	_logger: Logger,
): Promise<void> => {
	console.log(bold("\nVerifying OpenCode Plugins\n"));

	const result = await verifyInstallation(artifactsDir)();

	if (E.isLeft(result)) {
		console.error(formatError(result.left, process.stderr.isTTY ?? false));
		process.exit(getExitCode(result.left));
	}

	const report = result.right;

	console.log("+-----------+--------------+--------+");
	console.log("| Component | Found/Expect | Status |");
	console.log("+-----------+--------------+--------+");

	const cmdOk = report.commandsFound >= report.commandsExpected;
	const cmdCount = `${report.commandsFound}/${report.commandsExpected}`.padEnd(
		12,
	);
	console.log(
		`| Commands  | ${cmdCount} | ${cmdOk ? green("  OK  ") : red(" MISS ")} |`,
	);

	const agentOk = report.agentsFound >= report.agentsExpected;
	const agentCount = `${report.agentsFound}/${report.agentsExpected}`.padEnd(
		12,
	);
	console.log(
		`| Agents    | ${agentCount} | ${agentOk ? green("  OK  ") : red(" MISS ")} |`,
	);

	const skillOk = report.skillsFound >= report.skillsExpected;
	const skillCount = `${report.skillsFound}/${report.skillsExpected}`.padEnd(
		12,
	);
	console.log(
		`| Skills    | ${skillCount} | ${skillOk ? green("  OK  ") : yellow(" WARN ")} |`,
	);

	const pluginOk = report.pluginsFound >= report.pluginsExpected;
	const pluginCount = `${report.pluginsFound}/${report.pluginsExpected}`.padEnd(
		12,
	);
	console.log(
		`| Plugins   | ${pluginCount} | ${pluginOk ? green("  OK  ") : yellow(" WARN ")} |`,
	);

	console.log("+-----------+--------------+--------+");

	if (report.issues.length > 0) {
		console.log(yellow("\nIssues Found:"));
		for (const issue of report.issues) {
			console.log(yellow(`  - ${issue}`));
		}
	}

	if (isHealthy(report)) {
		console.log(green("All components installed"));
	} else {
		console.log(red(bold("\nInstallation incomplete")));
		console.log(dim("\nRemediation:"));
		console.log(dim("  Install missing components with:"));
		console.log(cyan("    rp1 install opencode"));
		process.exit(1);
	}
};

/**
 * OpenCode verification subcommand.
 */
export const verifyOpenCodeSubcommand = new Command("opencode")
	.description("Verify rp1 installation in OpenCode")
	.option(
		"--artifacts-dir <path>",
		"Path to artifacts for name-based verification",
	)
	.addHelpText(
		"after",
		`
Examples:
  rp1 verify opencode                     Verify installation
  rp1 verify opencode --artifacts-dir .   Verify against specific artifacts
`,
	)
	.action(async (options, command) => {
		const logger = command.parent?.parent?._logger as Logger;
		if (!logger) {
			console.error("Logger not initialized");
			process.exit(1);
		}

		await executeVerifyOpenCode(options.artifactsDir, logger);
	});
