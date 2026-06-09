import { Command } from "commander";
import * as E from "fp-ts/lib/Either.js";
import { formatError, getExitCode } from "../../../shared/errors.js";
import type { Logger } from "../../../shared/logger.js";
import {
	gooseAgentsDisplayRoot,
	goosePluginsDisplayRoot,
	gooseRecipesDisplayRoot,
	gooseSkillsDisplayRoot,
	installGooseBundleAssets,
} from "../../install/goose/index.js";
import { colorFns } from "../../lib/colors.js";

const { green, yellow, dim, bold, cyan } = colorFns;

export const installGooseSubcommand = new Command("goose")
	.description("Install rp1 Goose skills, agents, recipes, and metadata")
	.option("--dry-run", "Show the Goose asset paths without writing")
	.addHelpText(
		"after",
		`
Examples:
  rp1 install goose            Install Goose assets
  rp1 install goose --dry-run  Preview Goose asset installation
`,
	)
	.action(async (options, command) => {
		const logger = command.parent?.parent?._logger as Logger;
		if (!logger) {
			console.error("Logger not initialized");
			process.exit(1);
		}

		const result = await installGooseBundleAssets({
			dryRun: options.dryRun ?? command.parent?.opts()?.dryRun ?? false,
		})();

		if (E.isLeft(result)) {
			console.error(formatError(result.left, process.stderr.isTTY ?? false));
			process.exit(getExitCode(result.left));
		}

		const installResult = result.right;

		console.log("");
		console.log(bold("Goose asset setup"));
		console.log("");

		if (installResult.assetsWritten) {
			console.log(
				green(
					`Installed ${installResult.assetCount} Goose assets under ~/.agents`,
				),
			);
		} else {
			console.log(
				yellow(
					`Dry run: would write ${installResult.assetCount} Goose assets under ~/.agents`,
				),
			);
		}

		console.log(
			dim(
				`  - Skills: ${installResult.skillCount} -> ${gooseSkillsDisplayRoot()}`,
			),
		);
		console.log(
			dim(
				`  - Agents: ${installResult.agentCount} -> ${gooseAgentsDisplayRoot()}`,
			),
		);
		console.log(
			dim(
				`  - Recipes: ${installResult.recipeCount} -> ${gooseRecipesDisplayRoot()}`,
			),
		);
		console.log(
			dim(
				`  - Metadata: ${installResult.metadataCount} -> ${goosePluginsDisplayRoot()}`,
			),
		);

		for (const packageDir of installResult.pluginDisplayDirs) {
			console.log(dim(`  - ${packageDir}`));
		}

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
		console.log(dim("Installed Goose scope:"));
		console.log(dim("  - Goose-discoverable skills and agents"));
		console.log(dim("  - Recipe entrypoints for `goose run --recipe <name>`"));
		console.log(dim("  - rp1 support metadata under Goose plugin locations"));
		console.log("");
		console.log(dim("Next action:"));
		console.log(cyan("  rp1 verify goose"));
	});
