/**
 * Install subcommand for Claude Code.
 * Installs rp1 plugins to Claude Code using the marketplace.
 */

import { Command } from "commander";
import * as E from "fp-ts/lib/Either.js";
import { formatError, getExitCode } from "../../../shared/errors.js";
import type { Logger } from "../../../shared/logger.js";
import { createSpinner } from "../../../shared/spinner.js";
import { colorFns } from "../../lib/colors.js";
import {
	type InstallContext,
	installClaudeCodePlugins,
} from "../../shared/install-core.js";

const { green, dim, bold } = colorFns;

/**
 * Subcommand: rp1 install claude-code
 * Installs rp1 plugins to Claude Code.
 */
export const installClaudeCodeSubcommand = new Command("claude-code")
	.description("Install rp1 plugins to Claude Code")
	.option("--dry-run", "Show what would be executed without making changes")
	.option("-y, --yes", "Skip confirmation prompts (non-interactive mode)")
	.option(
		"-s, --scope <scope>",
		"Installation scope: user, project, or local",
		"user",
	)
	.option(
		"--https",
		"Use HTTPS transport instead of SSH (no SSH keys required)",
	)
	.addHelpText(
		"after",
		`
Examples:
  rp1 install claude-code              Install to user scope
  rp1 install claude-code --dry-run    Preview installation commands
  rp1 install claude-code -y           Non-interactive installation
  rp1 install claude-code -s project   Install to project scope
  rp1 install claude-code --https      Use HTTPS (no SSH keys needed)
`,
	)
	.action(async (options, command) => {
		const logger = command.parent?.parent?._logger as Logger;
		const isTTY = command.parent?.parent?._isTTY ?? false;
		const spinner = createSpinner(isTTY);

		if (!logger) {
			console.error("Logger not initialized");
			process.exit(1);
		}

		const scope = options.scope as "user" | "project" | "local";
		const parentOpts = command.parent?.opts() ?? {};
		const useHttps = options.https ?? parentOpts.https ?? false;
		const ctx: InstallContext = {
			logger,
			isTTY,
			dryRun: options.dryRun ?? parentOpts.dryRun ?? false,
			skipPrompt: options.yes ?? parentOpts.yes ?? false,
			useHttps,
		};

		// Display header
		console.log("");
		console.log(bold("Installing rp1 plugins to Claude Code"));
		if (useHttps) {
			console.log(dim("(using HTTPS transport)"));
		}
		console.log("");

		if (ctx.dryRun) {
			const marketplaceSource = useHttps
				? "https://github.com/rp1-run/rp1.git --sparse .claude-plugin cli/dist/claude-code"
				: "rp1-run/rp1";
			console.log(dim("[dry-run] Installation plan:"));
			console.log("");
			console.log(
				`${dim("1.")} claude plugin marketplace add ${marketplaceSource}`,
			);
			console.log(
				`${dim("2.")} claude plugin install rp1-base@rp1-run --scope ${scope}`,
			);
			console.log(
				`${dim("3.")} claude plugin install rp1-dev@rp1-run --scope ${scope}`,
			);
			console.log("");
			console.log(dim("Run without --dry-run to execute these commands."));
			return;
		}

		spinner.start("Installing plugins...");

		const result = await installClaudeCodePlugins(scope, ctx)();

		if (E.isLeft(result)) {
			spinner.stop();
			console.error(formatError(result.left, process.stderr.isTTY ?? false));
			process.exit(getExitCode(result.left));
		}

		spinner.succeed(
			green("rp1 plugins installed successfully to Claude Code!"),
		);
		console.log("");
		console.log(dim("Installed plugins:"));
		for (const plugin of result.right.pluginsInstalled) {
			console.log(dim(`  - ${plugin}`));
		}
		console.log("");
		console.log(dim("Restart Claude Code to load updated plugins."));
	});
