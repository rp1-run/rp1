import { Command } from "commander";
import * as E from "fp-ts/lib/Either.js";
import { formatError, getExitCode } from "../../../shared/errors.js";
import type { Logger } from "../../../shared/logger.js";
import {
	antigravityPackageDisplayRoot,
	installAntigravityBundleAssets,
} from "../../install/antigravity/index.js";
import { colorFns } from "../../lib/colors.js";

const { green, yellow, dim, bold, cyan } = colorFns;

const validationLine = (status: string, issue: string | null): string => {
	if (issue) return `Plugin validation: ${status} (${issue})`;
	return `Plugin validation: ${status}`;
};

export const installAntigravitySubcommand = new Command("antigravity")
	.description("Install rp1 Antigravity CLI package assets")
	.option("--dry-run", "Show the package asset path without writing")
	.addHelpText(
		"after",
		`
Examples:
  rp1 install antigravity            Install Antigravity CLI package assets
  rp1 install antigravity --dry-run  Preview Antigravity package asset installation
`,
	)
	.action(async (options, command) => {
		const logger = command.parent?.parent?._logger as Logger;
		if (!logger) {
			console.error("Logger not initialized");
			process.exit(1);
		}

		const result = await installAntigravityBundleAssets({
			dryRun: options.dryRun ?? command.parent?.opts()?.dryRun ?? false,
		})();

		if (E.isLeft(result)) {
			console.error(formatError(result.left, process.stderr.isTTY ?? false));
			process.exit(getExitCode(result.left));
		}

		const installResult = result.right;

		console.log("");
		console.log(bold("Antigravity CLI package setup"));
		console.log("");

		if (installResult.assetsWritten) {
			console.log(
				green(
					`Installed ${installResult.assetCount} Antigravity package assets under ${antigravityPackageDisplayRoot()}`,
				),
			);
		} else {
			console.log(
				yellow(
					`Dry run: would write ${installResult.assetCount} Antigravity package assets under ${antigravityPackageDisplayRoot()}`,
				),
			);
		}

		for (const packageDir of installResult.pluginDisplayDirs) {
			console.log(dim(`  - ${packageDir}`));
		}

		console.log("");
		console.log(
			dim(
				validationLine(
					installResult.validation.status,
					installResult.validation.issue,
				),
			),
		);

		if (installResult.versionMarkerWritten) {
			console.log(dim("Version marker: current"));
		}

		if (installResult.warnings.length > 0) {
			console.log("");
			console.log(dim("Notes:"));
			for (const warning of installResult.warnings) {
				console.log(dim(`  - ${warning}`));
			}
		}

		console.log("");
		console.log(dim("Installed Antigravity scope:"));
		console.log(dim("  - Antigravity commands, skills, and rules"));
		console.log(dim("  - Antigravity hooks and MCP configuration"));
		console.log(dim("  - Support metadata and dynamic delegation definitions"));
		console.log("");
		console.log(dim("Next action:"));
		console.log(cyan("  rp1 verify antigravity"));
	});
