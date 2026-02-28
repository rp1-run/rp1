/**
 * Install subcommand for OpenCode.
 * Installs rp1 plugins to OpenCode platform.
 */

import { Command } from "commander";
import * as E from "fp-ts/lib/Either.js";
import { formatError, getExitCode } from "../../../shared/errors.js";
import type { Logger } from "../../../shared/logger.js";
import { createSpinner } from "../../../shared/spinner.js";
import { colorFns } from "../../lib/colors.js";
import {
	type InstallContext,
	installOpenCodePlugins,
} from "../../shared/install-core.js";

const { green, dim, bold } = colorFns;

/**
 * Subcommand: rp1 install opencode
 * Installs rp1 plugins to OpenCode.
 */
export const installOpenCodeSubcommand = new Command("opencode")
	.description("Install rp1 plugins to OpenCode platform")
	.option("-a, --artifacts-dir <path>", "Path to artifacts directory")
	.option("--dry-run", "Show what would be installed without installing")
	.option("-y, --yes", "Skip confirmation prompts")
	.addHelpText(
		"after",
		`
Examples:
  rp1 install opencode                    Install from default artifacts
  rp1 install opencode --dry-run          Preview installation
  rp1 install opencode -a ./my-artifacts  Install from custom path
  rp1 install opencode -y                 Skip confirmation prompts
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

		const ctx: InstallContext = {
			logger,
			isTTY,
			dryRun: options.dryRun ?? false,
			skipPrompt: options.yes ?? false,
		};

		// Display header
		console.log("");
		console.log(bold("Installing rp1 plugins to OpenCode"));
		console.log("");

		if (ctx.dryRun) {
			console.log(dim("[dry-run] Installation preview:"));
			console.log("");
			console.log(dim("Would install rp1 plugins to OpenCode configuration."));
			console.log(dim("  - rp1-base: agents, skills (rp1-* namespaced)"));
			console.log(dim("  - rp1-dev: agents, skills (rp1-* namespaced)"));
			console.log("");
			console.log(dim("Run without --dry-run to execute installation."));
			return;
		}

		spinner.start("Installing plugins...");

		const result = await installOpenCodePlugins(
			{
				artifactsDir: options.artifactsDir ?? null,
			},
			ctx,
		)();

		if (E.isLeft(result)) {
			spinner.stop();
			console.error(formatError(result.left, process.stderr.isTTY ?? false));
			process.exit(getExitCode(result.left));
		}

		spinner.succeed(green("rp1 plugins installed successfully to OpenCode!"));
		console.log("");
		console.log(dim("Installed plugins:"));
		console.log(dim("  - rp1-base"));
		console.log(dim("  - rp1-dev"));
		console.log("");
		console.log(
			dim("Restart OpenCode and run /skills to see available rp1 skills."),
		);
	});
