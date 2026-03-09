/**
 * Codex CLI verification subcommand.
 * Verifies rp1 plugins are correctly installed in Codex CLI.
 */

import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { Command } from "commander";
import * as E from "fp-ts/lib/Either.js";
import type { Logger } from "../../../shared/logger.js";
import { hasShellFencedContent } from "../../init/shell-fence.js";
import {
	checkCodexInstalled,
	getCodexPaths,
} from "../../install/codex/prerequisites.js";
import { colorFns } from "../../lib/colors.js";

const { green, yellow, red, dim, bold, cyan } = colorFns;

const FENCE_ID = "rp1";

interface CodexVerifyReport {
	readonly codexInstalled: boolean;
	readonly codexVersion: string;
	readonly skillsDirs: readonly string[];
	readonly skillsFound: number;
	readonly agentTomlsFound: number;
	readonly configHasFence: boolean;
	readonly issues: readonly string[];
}

/**
 * Execute Codex CLI verification.
 * Checks skills dirs, agent TOML files, and config.toml fenced section.
 */
export const executeVerifyCodex = async (_logger: Logger): Promise<void> => {
	console.log(bold("\nVerifying Codex CLI Plugins\n"));

	const paths = getCodexPaths();
	const issues: string[] = [];

	// 1. Check Codex CLI is installed
	const codexResult = await checkCodexInstalled()();
	let codexInstalled = false;
	let codexVersion = "not found";

	if (E.isRight(codexResult)) {
		codexInstalled = true;
		codexVersion = codexResult.right.value ?? "unknown";
	} else {
		issues.push("Codex CLI not found in PATH");
	}

	// 2. Check skills directories (Codex uses flat rp1-* dirs, not rp1-base/rp1-dev)
	const skillsDirs: string[] = [];
	let skillsFound = 0;

	if (existsSync(paths.skillsDir)) {
		try {
			const entries = await readdir(paths.skillsDir, { withFileTypes: true });
			for (const entry of entries) {
				if (entry.isDirectory() && entry.name.startsWith("rp1-")) {
					skillsDirs.push(entry.name);
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

	// 3. Check agent TOML files
	let agentTomlsFound = 0;
	if (existsSync(paths.agentsDir)) {
		try {
			const entries = await readdir(paths.agentsDir);
			agentTomlsFound = entries.filter((e) => e.endsWith(".toml")).length;
		} catch {
			issues.push(`Cannot read agents dir: ${paths.agentsDir}`);
		}
	} else {
		issues.push(`Agents directory missing: ${paths.agentsDir}`);
	}

	// 4. Check config.toml fenced section
	let configHasFence = false;
	if (existsSync(paths.configFile)) {
		try {
			const content = await readFile(paths.configFile, "utf-8");
			configHasFence = hasShellFencedContent(content, FENCE_ID);
			if (!configHasFence) {
				issues.push("config.toml missing rp1-managed fenced section");
			}
		} catch {
			issues.push(`Cannot read config: ${paths.configFile}`);
		}
	} else {
		issues.push(`Config file missing: ${paths.configFile}`);
	}

	const report: CodexVerifyReport = {
		codexInstalled,
		codexVersion,
		skillsDirs,
		skillsFound,
		agentTomlsFound,
		configHasFence,
		issues,
	};

	// Display table
	const W = 18;
	console.log(`+--------------+-${"-".repeat(W)}-+--------+`);
	console.log(`| Component    | ${"Value".padEnd(W)} | Status |`);
	console.log(`+--------------+-${"-".repeat(W)}-+--------+`);

	// Codex CLI
	const versionStr = codexVersion.padEnd(W);
	console.log(
		`| Codex CLI    | ${versionStr} | ${codexInstalled ? green("  OK  ") : red(" MISS ")} |`,
	);

	// Skills
	const skillCount = `${skillsFound} dirs`.padEnd(W);
	const skillOk = skillsFound > 0;
	console.log(
		`| Skills       | ${skillCount} | ${skillOk ? green("  OK  ") : red(" MISS ")} |`,
	);

	// Agent TOMLs
	const agentStr = `${agentTomlsFound} files`.padEnd(W);
	const agentOk = agentTomlsFound > 0;
	console.log(
		`| Agent TOMLs  | ${agentStr} | ${agentOk ? green("  OK  ") : yellow(" WARN ")} |`,
	);

	// Config fence
	const fenceStr = (configHasFence ? "present" : "missing").padEnd(W);
	console.log(
		`| Config fence | ${fenceStr} | ${configHasFence ? green("  OK  ") : red(" MISS ")} |`,
	);

	console.log(`+--------------+-${"-".repeat(W)}-+--------+`);

	if (report.issues.length > 0) {
		console.log(yellow("\nIssues Found:"));
		for (const issue of report.issues) {
			console.log(yellow(`  - ${issue}`));
		}
	}

	const healthy = skillOk && configHasFence;
	if (healthy) {
		console.log(green(bold("\nAll components installed")));
	} else {
		console.log(red(bold("\nInstallation incomplete")));
		console.log(dim("\nRemediation:"));
		console.log(dim("  Install missing components with:"));
		console.log(cyan("    rp1 install codex"));
		process.exit(1);
	}
};

/**
 * Codex verification subcommand.
 */
export const verifyCodexSubcommand = new Command("codex")
	.description("Verify rp1 installation in Codex CLI")
	.addHelpText(
		"after",
		`
Examples:
  rp1 verify codex    Verify Codex CLI installation
`,
	)
	.action(async (_options, command) => {
		const logger = command.parent?.parent?._logger as Logger;
		if (!logger) {
			console.error("Logger not initialized");
			process.exit(1);
		}

		await executeVerifyCodex(logger);
	});
