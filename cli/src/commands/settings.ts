import chalk from "chalk";
import { Command } from "commander";

/**
 * Settings command for managing rp1 settings files.
 *
 * Subcommands:
 * - validate: Validate settings file syntax
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

Examples:
  rp1 settings validate    Validate all settings files
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
		// Lazy-load validateSettings to avoid loading transform-args module on every CLI startup
		const { validateSettings } = await import(
			"../agent-tools/transform-args/index.js"
		);

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

		// Summary
		if (result.valid) {
			console.log(chalk.green("All settings files are valid."));
			process.exit(0);
		} else {
			console.log(chalk.red("Settings validation failed."));
			process.exit(1);
		}
	});
