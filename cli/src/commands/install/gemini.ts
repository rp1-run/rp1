import { Command } from "commander";
import * as E from "fp-ts/lib/Either.js";
import { formatError, getExitCode } from "../../../shared/errors.js";
import type { Logger } from "../../../shared/logger.js";
import {
	GEMINI_SMOKE_COMMAND_INVOCATION,
	installGeminiSmokeCommand,
} from "../../install/gemini/index.js";
import { colorFns } from "../../lib/colors.js";

const { green, yellow, dim, bold, cyan } = colorFns;

export const installGeminiSubcommand = new Command("gemini")
	.description("Install experimental Gemini CLI smoke command")
	.option("--dry-run", "Show the command file path without writing")
	.addHelpText(
		"after",
		`
Examples:
  rp1 install gemini            Install the experimental Gemini smoke command
  rp1 install gemini --dry-run  Preview the smoke command file path
`,
	)
	.action(async (options, command) => {
		const logger = command.parent?.parent?._logger as Logger;
		if (!logger) {
			console.error("Logger not initialized");
			process.exit(1);
		}

		const result = await installGeminiSmokeCommand({
			dryRun: options.dryRun ?? command.parent?.opts()?.dryRun ?? false,
		})();

		if (E.isLeft(result)) {
			console.error(formatError(result.left, process.stderr.isTTY ?? false));
			process.exit(getExitCode(result.left));
		}

		const installResult = result.right;

		console.log("");
		console.log(bold("Gemini CLI experimental smoke setup"));
		console.log("");

		if (installResult.commandWritten) {
			console.log(
				green(`Installed smoke command: ${installResult.commandDisplayPath}`),
			);
		} else {
			console.log(
				yellow(
					`Dry run: would write smoke command to ${installResult.commandDisplayPath}`,
				),
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
		console.log(dim("Run from Gemini CLI:"));
		console.log(cyan(`  ${GEMINI_SMOKE_COMMAND_INVOCATION}`));
	});
