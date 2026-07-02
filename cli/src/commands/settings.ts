import chalk from "chalk";
import { Command } from "commander";

/**
 * Settings command for managing rp1 settings files.
 *
 * Subcommands:
 * - validate: Validate settings file syntax
 * - apply: Apply tier remappings to installed agent artifacts
 * - presets: List available tier remapping presets
 */
export const settingsCommand = new Command("settings")
	.description("Manage rp1 settings")
	.addHelpText(
		"after",
		`
Settings Files:
  Global: ~/.config/rp1/settings.toml
  Local:  .rp1/settings.toml (project-specific)

Subcommands:
  validate    Check settings files for TOML syntax errors
  apply       Apply tier remappings to installed agent artifacts
  presets     List available tier remapping presets

Examples:
  rp1 settings validate           Validate all settings files
  rp1 settings apply              Apply tier remappings from settings.toml
  rp1 settings apply --preset budget  Apply a named preset
  rp1 settings apply --dry-run    Preview changes without modifying files
  rp1 settings presets            List available presets
`,
	);

/**
 * Validate subcommand: checks TOML syntax in global and local settings files.
 *
 * Exit codes:
 * - 0: All files valid (or don't exist)
 * - 1: One or more files have syntax errors
 */
settingsCommand
	.command("validate")
	.description("Validate settings files for TOML syntax errors")
	.addHelpText(
		"after",
		`
Validates TOML syntax in both global and local settings files.
Missing files are not considered errors.

Exit codes:
  0    All files valid (or don't exist)
  1    One or more files have syntax errors

Examples:
  rp1 settings validate
`,
	)
	.action(async () => {
		const { validateSettings } = await import("../settings/validator.js");

		const result = await validateSettings();

		console.log(chalk.bold("Settings Validation Results"));
		console.log();

		// Report global file
		console.log(chalk.cyan("Global settings:"), result.globalFile.path);
		if (!result.globalFile.exists) {
			console.log(`  ${chalk.dim("(not found - skipped)")}`);
		} else if (result.globalFile.valid) {
			console.log(`  ${chalk.green("Valid")}`);
		} else {
			console.log(`  ${chalk.red("Invalid")}`);
			if (result.globalFile.error) {
				const lineInfo = result.globalFile.line
					? ` (line ${result.globalFile.line})`
					: "";
				console.log(
					`  ${chalk.red("Error:")} ${result.globalFile.error}${lineInfo}`,
				);
			}
		}

		console.log();

		// Report local file
		console.log(chalk.cyan("Local settings:"), result.localFile.path);
		if (!result.localFile.exists) {
			console.log(`  ${chalk.dim("(not found - skipped)")}`);
		} else if (result.localFile.valid) {
			console.log(`  ${chalk.green("Valid")}`);
		} else {
			console.log(`  ${chalk.red("Invalid")}`);
			if (result.localFile.error) {
				const lineInfo = result.localFile.line
					? ` (line ${result.localFile.line})`
					: "";
				console.log(
					`  ${chalk.red("Error:")} ${result.localFile.error}${lineInfo}`,
				);
			}
		}

		console.log();

		let overallValid = result.valid;

		// Tier remapping semantic validation (only when TOML syntax is valid)
		if (result.valid) {
			const { loadTierRemappings } = await import("../settings/loader.js");
			const { validateTierRemappings } = await import(
				"../settings/validator.js"
			);

			const tierConfig = await loadTierRemappings(process.cwd());
			const hasTierConfig =
				tierConfig.preset !== undefined ||
				Object.keys(tierConfig.platforms).length > 0;

			if (hasTierConfig) {
				console.log();
				console.log(chalk.bold("Tier Remapping Validation"));
				console.log();

				const tierResult = validateTierRemappings(tierConfig);

				for (const error of tierResult.errors) {
					console.log(`  ${chalk.red("Error:")} ${error}`);
				}
				for (const warning of tierResult.warnings) {
					console.log(`  ${chalk.yellow("Warning:")} ${warning}`);
				}
				for (const adjustment of tierResult.effortAdjustments) {
					console.log(`  ${chalk.yellow("Effort:")} ${adjustment}`);
				}

				if (!tierResult.valid) {
					overallValid = false;
				} else if (
					tierResult.warnings.length === 0 &&
					tierResult.effortAdjustments.length === 0
				) {
					console.log(`  ${chalk.green("Tier remappings are valid.")}`);
				}
			}
		}

		console.log();

		// Summary
		if (overallValid) {
			console.log(chalk.green("All settings files are valid."));
			process.exit(0);
		} else {
			console.log(chalk.red("Settings validation failed."));
			process.exit(1);
		}
	});

/**
 * Apply subcommand: apply tier remappings to installed agent artifacts.
 *
 * Orchestrates: load config -> validate -> discover -> rewrite -> report.
 * Supports --preset for direct preset application and --dry-run for preview.
 */
settingsCommand
	.command("apply")
	.description("Apply tier remappings to installed agent artifacts")
	.option("--preset <name>", "Apply a named preset directly")
	.option("--dry-run", "Preview changes without modifying files", false)
	.addHelpText(
		"after",
		`
Applies model tier remappings from settings.toml (or a named preset)
to all installed agent artifacts. Only platforms with declared remappings
are modified.

Options:
  --preset <name>  Apply a named preset (budget, standard, premium)
  --dry-run        Preview changes without modifying files

Examples:
  rp1 settings apply                  Apply from settings.toml
  rp1 settings apply --preset budget  Apply the budget preset
  rp1 settings apply --dry-run        Preview what would change
`,
	)
	.action(async (options: { preset?: string; dryRun: boolean }) => {
		const { applyTierRemappings } = await import("../settings/apply.js");

		const result = await applyTierRemappings({
			projectRoot: process.cwd(),
			preset: options.preset,
			dryRun: options.dryRun,
		});

		// Report warnings
		for (const warning of result.warnings) {
			console.log(`${chalk.yellow("Warning:")} ${warning}`);
		}

		// Report effort adjustments
		for (const adjustment of result.effortAdjustments) {
			console.log(
				`${chalk.yellow("Effort adjusted:")} ${adjustment.agentName} — ${adjustment.reason}`,
			);
		}

		// Report protected agent warnings
		for (const warning of result.protectedWarnings) {
			console.log(`${chalk.yellow("Protected agent:")} ${warning.message}`);
		}

		console.log();

		if (result.dryRun) {
			if (result.agentsModified > 0) {
				console.log(
					chalk.cyan(
						`[dry-run] Would modify ${result.agentsModified} agent artifact(s).`,
					),
				);
			} else {
				console.log(
					chalk.dim("No agents would be modified with the current remappings."),
				);
			}
		} else if (result.applied) {
			console.log(
				chalk.green(
					`Applied tier remappings to ${result.agentsModified} agent artifact(s).`,
				),
			);
		} else {
			console.log(
				chalk.dim("No agents were modified. Check your [models] settings."),
			);
		}
	});

/**
 * Presets subcommand: list available tier remapping presets.
 */
settingsCommand
	.command("presets")
	.description("List available tier remapping presets")
	.addHelpText(
		"after",
		`
Displays all available presets with their tier-to-model mappings.
Use with 'rp1 settings apply --preset <name>' to apply a preset.

Examples:
  rp1 settings presets
`,
	)
	.action(async () => {
		const { listPresets } = await import("../settings/presets.js");

		const presets = listPresets();

		console.log(chalk.bold("Available Presets"));
		console.log();

		for (const preset of presets) {
			console.log(`  ${chalk.cyan(preset.name)} — ${preset.description}`);

			for (const [platform, tierMap] of Object.entries(preset.platforms)) {
				console.log(`    ${chalk.dim(platform)}:`);
				for (const [tier, model] of Object.entries(tierMap)) {
					console.log(`      ${tier}: ${model}`);
				}
			}
			console.log();
		}

		console.log(
			chalk.dim("Apply a preset: rp1 settings apply --preset <name>"),
		);
	});
