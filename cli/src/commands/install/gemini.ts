import { Command } from "commander";
import * as E from "fp-ts/lib/Either.js";
import { formatError, getExitCode } from "../../../shared/errors.js";
import type { Logger } from "../../../shared/logger.js";
import {
	GEMINI_BOUNDARY_COMMAND_DISPLAY_PATH,
	GEMINI_BOUNDARY_COMMAND_INVOCATION,
	GEMINI_EXTENSION_DISPLAY_DIR,
	GEMINI_SMOKE_COMMAND_INVOCATION,
	GEMINI_SUBAGENT_COMMAND_DISPLAY_PATH,
	GEMINI_SUBAGENT_COMMAND_INVOCATION,
	installGeminiSmokeCommand,
} from "../../install/gemini/index.js";
import { colorFns } from "../../lib/colors.js";

const { green, yellow, dim, bold, cyan } = colorFns;

export const installGeminiSubcommand = new Command("gemini")
	.description(
		"Install experimental Gemini CLI smoke, P2, and P3 validation assets",
	)
	.option("--dry-run", "Show the extension asset path without writing")
	.addHelpText(
		"after",
		`
Examples:
  rp1 install gemini            Install experimental Gemini smoke, P2, and P3 validation assets
  rp1 install gemini --dry-run  Preview the extension asset path
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
		console.log(bold("Gemini CLI experimental extension setup"));
		console.log("");

		if (installResult.commandWritten) {
			console.log(
				green(`Installed extension assets: ${GEMINI_EXTENSION_DISPLAY_DIR}`),
			);
			console.log(
				dim(`  - Smoke command: ${installResult.commandDisplayPath}`),
			);
			console.log(
				dim(
					`  - P2 delegation command: ${GEMINI_SUBAGENT_COMMAND_DISPLAY_PATH}`,
				),
			);
			console.log(
				dim(`  - P3 boundary command: ${GEMINI_BOUNDARY_COMMAND_DISPLAY_PATH}`),
			);
		} else {
			console.log(
				yellow(
					`Dry run: would write extension assets to ${GEMINI_EXTENSION_DISPLAY_DIR}`,
				),
			);
			console.log(
				dim(`  - Smoke command: ${installResult.commandDisplayPath}`),
			);
			console.log(
				dim(
					`  - P2 delegation command: ${GEMINI_SUBAGENT_COMMAND_DISPLAY_PATH}`,
				),
			);
			console.log(
				dim(`  - P3 boundary command: ${GEMINI_BOUNDARY_COMMAND_DISPLAY_PATH}`),
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
		console.log(dim("Installed validation scope:"));
		console.log(dim("  - Smoke setup and artifact registration"));
		console.log(dim("  - P2 delegation evidence"));
		console.log(
			dim("  - P3 lifecycle, trust, headless, and user-gate boundaries"),
		);
		console.log("");
		console.log(dim("Run from Gemini CLI:"));
		console.log(cyan(`  ${GEMINI_SMOKE_COMMAND_INVOCATION}`));
		console.log(cyan(`  ${GEMINI_SUBAGENT_COMMAND_INVOCATION}`));
		console.log(cyan(`  ${GEMINI_BOUNDARY_COMMAND_INVOCATION}`));
	});
