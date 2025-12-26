import { Command } from "commander";
import * as E from "fp-ts/lib/Either.js";
import { formatError, getExitCode } from "../../shared/errors.js";
import type { Logger } from "../../shared/logger.js";
import { verifyClaudeCodePlugins } from "../init/steps/verification.js";
import { executeClaudeCodeInstall } from "../install/claudecode/index.js";
import {
	executeInstall,
	executeList,
	executeVerify,
} from "../install/index.js";
import { colorFns } from "../lib/colors.js";

export const installCommand = new Command("install:opencode")
	.description("Install rp1 plugins to OpenCode platform")
	.option("-a, --artifacts-dir <path>", "Path to artifacts directory")
	.option("--skip-skills", "Skip skills installation")
	.option("--dry-run", "Show what would be installed without installing")
	.option("-y, --yes", "Skip confirmation prompts")
	.addHelpText(
		"after",
		`
Examples:
  rp1 install:opencode                    Install from default artifacts
  rp1 install:opencode --dry-run          Preview installation
  rp1 install:opencode -a ./my-artifacts  Install from custom path
  rp1 install:opencode -y                 Skip confirmation prompts
`,
	)
	.action(async (options, command) => {
		const logger = command.parent?._logger as Logger;
		const isTTY = command.parent?._isTTY ?? false;

		if (!logger) {
			console.error("Logger not initialized");
			process.exit(1);
		}

		const args: string[] = [];
		if (options.artifactsDir) {
			args.push("--artifacts-dir", options.artifactsDir);
		}
		if (options.skipSkills) {
			args.push("--skip-skills");
		}
		if (options.dryRun) {
			args.push("--dry-run");
		}
		if (options.yes) {
			args.push("--yes");
		}

		const result = await executeInstall(args, logger, {
			isTTY,
			skipPrompt: options.yes,
		})();

		if (E.isLeft(result)) {
			console.error(formatError(result.left, process.stderr.isTTY ?? false));
			process.exit(getExitCode(result.left));
		}
	});

export const verifyCommand = new Command("verify:opencode")
	.description("Verify rp1 installation health")
	.option(
		"--artifacts-dir <path>",
		"Path to artifacts for name-based verification",
	)
	.addHelpText(
		"after",
		`
Examples:
  rp1 verify:opencode                     Verify installation
  rp1 verify:opencode --artifacts-dir .   Verify against specific artifacts
`,
	)
	.action(async (options, command) => {
		const logger = command.parent?._logger as Logger;
		if (!logger) {
			console.error("Logger not initialized");
			process.exit(1);
		}

		const args: string[] = [];
		if (options.artifactsDir) {
			args.push("--artifacts-dir", options.artifactsDir);
		}

		const result = await executeVerify(args, logger)();

		if (E.isLeft(result)) {
			console.error(formatError(result.left, process.stderr.isTTY ?? false));
			process.exit(getExitCode(result.left));
		}
	});

export const listCommand = new Command("list")
	.description("List installed rp1 commands")
	.addHelpText(
		"after",
		`
Examples:
  rp1 list                                List all installed commands
`,
	)
	.action(async (_options, command) => {
		const logger = command.parent?._logger as Logger;
		if (!logger) {
			console.error("Logger not initialized");
			process.exit(1);
		}

		const result = await executeList([], logger)();

		if (E.isLeft(result)) {
			console.error(formatError(result.left, process.stderr.isTTY ?? false));
			process.exit(getExitCode(result.left));
		}
	});

export const installClaudeCodeCommand = new Command("install:claude-code")
	.description("Install rp1 plugins to Claude Code")
	.option("--dry-run", "Show what would be executed without making changes")
	.option("-y, --yes", "Skip confirmation prompts (non-interactive mode)")
	.option(
		"-s, --scope <scope>",
		"Installation scope: user, project, or local",
		"user",
	)
	.addHelpText(
		"after",
		`
Examples:
  rp1 install:claude-code                Install to user scope
  rp1 install:claude-code --dry-run      Preview installation commands
  rp1 install:claude-code -y             Non-interactive installation
  rp1 install:claude-code -s project     Install to project scope
`,
	)
	.action(async (options, command) => {
		const logger = command.parent?._logger as Logger;
		const isTTY = command.parent?._isTTY ?? false;

		if (!logger) {
			console.error("Logger not initialized");
			process.exit(1);
		}

		const args: string[] = [];
		if (options.dryRun) {
			args.push("--dry-run");
		}
		if (options.yes) {
			args.push("--yes");
		}
		if (options.scope) {
			args.push("--scope", options.scope);
		}

		const result = await executeClaudeCodeInstall(args, logger, {
			isTTY,
			skipPrompt: options.yes,
		})();

		if (E.isLeft(result)) {
			console.error(formatError(result.left, process.stderr.isTTY ?? false));
			process.exit(getExitCode(result.left));
		}
	});

const { green, yellow, red, dim, bold, cyan } = colorFns;

export const verifyClaudeCodeCommand = new Command("verify:claude-code")
	.description("Verify Claude Code plugin installation")
	.addHelpText(
		"after",
		`
Examples:
  rp1 verify:claude-code    Verify Claude Code plugins are installed
`,
	)
	.action(async (_options, command) => {
		const logger = command.parent?._logger as Logger;
		if (!logger) {
			console.error("Logger not initialized");
			process.exit(1);
		}

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
			console.log(cyan("    rp1 install:claude-code"));
			console.log(
				dim("\n  For more information, see: https://rp1.run/installation"),
			);
			console.log(red(bold("\nPlugins incomplete")));
			process.exit(1);
		}

		console.log(green(bold("\nAll plugins installed")));
	});
