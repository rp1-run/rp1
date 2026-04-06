/**
 * Copilot CLI verification subcommand.
 * Verifies rp1 plugins are correctly installed in GitHub Copilot CLI.
 */

import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { Command } from "commander";
import * as E from "fp-ts/lib/Either.js";
import type { Logger } from "../../../shared/logger.js";
import {
	checkCopilotInstalled,
	getCopilotPaths,
} from "../../install/copilot/prerequisites.js";
import { colorFns } from "../../lib/colors.js";

const { green, yellow, red, dim, bold, cyan } = colorFns;

interface CopilotVerifyReport {
	readonly ghInstalled: boolean;
	readonly ghVersion: string;
	readonly skillsFound: number;
	readonly agentsFound: number;
	readonly issues: readonly string[];
}

/**
 * Execute Copilot CLI verification.
 * Checks gh CLI availability, skills dirs, and agent files.
 */
export const executeVerifyCopilot = async (
	_logger: Logger,
): Promise<boolean> => {
	console.log(bold("\nVerifying Copilot CLI Plugins\n"));

	const paths = getCopilotPaths();
	const issues: string[] = [];

	// 1. Check GitHub CLI is installed
	const ghResult = await checkCopilotInstalled()();
	let ghInstalled = false;
	let ghVersion = "not found";

	if (E.isRight(ghResult)) {
		ghInstalled = true;
		ghVersion = ghResult.right.value ?? "unknown";
	} else {
		issues.push("GitHub CLI (gh) not found in PATH");
	}

	// 2. Check skills directories
	let skillsFound = 0;
	if (existsSync(paths.skillsDir)) {
		try {
			const entries = await readdir(paths.skillsDir, { withFileTypes: true });
			for (const entry of entries) {
				if (entry.isDirectory() && entry.name.startsWith("rp1-")) {
					skillsFound++;
				}
			}
			if (skillsFound === 0) {
				issues.push(`No rp1-* skill directories found in ${paths.skillsDir}`);
			}
		} catch {
			issues.push(`Cannot read skills dir: ${paths.skillsDir}`);
		}
	} else {
		issues.push(`Skills directory missing: ${paths.skillsDir}`);
	}

	// 3. Check agent files
	let agentsFound = 0;
	if (existsSync(paths.agentsDir)) {
		try {
			const entries = await readdir(paths.agentsDir);
			agentsFound = entries.filter((e) => e.endsWith(".md")).length;
		} catch {
			issues.push(`Cannot read agents dir: ${paths.agentsDir}`);
		}
	} else {
		issues.push(`Agents directory missing: ${paths.agentsDir}`);
	}

	const report: CopilotVerifyReport = {
		ghInstalled,
		ghVersion,
		skillsFound,
		agentsFound,
		issues,
	};

	// Display table
	const W = 18;
	console.log(`+--------------+-${"-".repeat(W)}-+--------+`);
	console.log(`| Component    | ${"Value".padEnd(W)} | Status |`);
	console.log(`+--------------+-${"-".repeat(W)}-+--------+`);

	// GitHub CLI
	const versionStr = ghVersion.padEnd(W);
	console.log(
		`| GitHub CLI   | ${versionStr} | ${ghInstalled ? green("  OK  ") : red(" MISS ")} |`,
	);

	// Skills
	const skillStr = `${skillsFound} dirs`.padEnd(W);
	const skillOk = skillsFound > 0;
	console.log(
		`| Skills       | ${skillStr} | ${skillOk ? green("  OK  ") : red(" MISS ")} |`,
	);

	// Agents
	const agentStr = `${agentsFound} files`.padEnd(W);
	const agentOk = agentsFound > 0;
	console.log(
		`| Agents       | ${agentStr} | ${agentOk ? green("  OK  ") : yellow(" WARN ")} |`,
	);

	console.log(`+--------------+-${"-".repeat(W)}-+--------+`);

	if (report.issues.length > 0) {
		console.log(yellow("\nIssues Found:"));
		for (const issue of report.issues) {
			console.log(yellow(`  - ${issue}`));
		}
	}

	const healthy = ghInstalled && skillOk;
	if (healthy) {
		console.log(green(bold("\nAll components installed")));
		return true;
	}

	console.log(red(bold("\nInstallation incomplete")));
	console.log(dim("\nRemediation:"));
	console.log(dim("  Install missing components with:"));
	console.log(cyan("    rp1 install copilot"));
	return false;
};

/**
 * Copilot verification subcommand.
 */
export const verifyCopilotSubcommand = new Command("copilot")
	.description("Verify rp1 installation in GitHub Copilot CLI")
	.addHelpText(
		"after",
		`
Examples:
  rp1 verify copilot    Verify Copilot CLI installation
`,
	)
	.action(async (_options, command) => {
		const logger = command.parent?.parent?._logger as Logger;
		if (!logger) {
			console.error("Logger not initialized");
			process.exit(1);
		}

		const ok = await executeVerifyCopilot(logger);
		if (!ok) process.exit(1);
	});
