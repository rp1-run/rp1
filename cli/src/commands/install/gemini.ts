import { Command } from "commander";
import * as E from "fp-ts/lib/Either.js";
import { formatError, getExitCode } from "../../../shared/errors.js";
import type { Logger } from "../../../shared/logger.js";
import {
	geminiExtensionDisplayRoot,
	installGeminiBundleAssets,
} from "../../install/gemini/index.js";
import { colorFns } from "../../lib/colors.js";

const { green, yellow, dim, bold, cyan } = colorFns;

export const installGeminiSubcommand = new Command("gemini")
	.description("Install rp1 Gemini CLI extension assets")
	.option("--dry-run", "Show the extension asset path without writing")
	.addHelpText(
		"after",
		`
Examples:
  rp1 install gemini            Install Gemini CLI extension assets
  rp1 install gemini --dry-run  Preview Gemini extension asset installation
`,
	)
	.action(async (options, command) => {
		const logger = command.parent?.parent?._logger as Logger;
		if (!logger) {
			console.error("Logger not initialized");
			process.exit(1);
		}

		const result = await installGeminiBundleAssets({
			dryRun: options.dryRun ?? command.parent?.opts()?.dryRun ?? false,
		})();

		if (E.isLeft(result)) {
			console.error(formatError(result.left, process.stderr.isTTY ?? false));
			process.exit(getExitCode(result.left));
		}

		const installResult = result.right;

		console.log("");
		console.log(bold("Gemini CLI extension setup"));
		console.log("");

		if (installResult.commandWritten) {
			console.log(
				green(
					`Installed ${installResult.assetCount} Gemini extension assets under ${geminiExtensionDisplayRoot()}`,
				),
			);
		} else {
			console.log(
				yellow(
					`Dry run: would write ${installResult.assetCount} Gemini extension assets under ${geminiExtensionDisplayRoot()}`,
				),
			);
		}

		for (const extension of installResult.extensionDisplayDirs) {
			console.log(dim(`  - ${extension}`));
		}

		if (installResult.commandDisplayPath) {
			console.log(
				dim(`Primary command asset: ${installResult.commandDisplayPath}`),
			);
		}

		if (installResult.warnings.length > 0) {
			console.log("");
			console.log(dim("Notes:"));
			for (const warning of installResult.warnings) {
				console.log(dim(`  - ${warning}`));
			}
		}

		console.log("");
		console.log(dim("Installed Gemini scope:"));
		console.log(dim("  - Gemini commands"));
		console.log(dim("  - Gemini skills and agents"));
		console.log(
			dim("  - Gemini context, extension metadata, and support matrix"),
		);
		console.log("");
		console.log(dim("Next action:"));
		console.log(cyan("  rp1 verify gemini"));
	});
