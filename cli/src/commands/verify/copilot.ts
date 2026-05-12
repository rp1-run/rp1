/**
 * Copilot CLI verification subcommand.
 * Verifies rp1 plugins are correctly installed in GitHub Copilot CLI.
 */

import { Command } from "commander";
import type { Logger } from "../../../shared/logger.js";
import { verifyCopilotInstallation } from "../../install/copilot/index.js";
import { colorFns } from "../../lib/colors.js";

const { green, yellow, red, dim, bold, cyan } = colorFns;

/**
 * Execute Copilot CLI verification.
 * Checks native install state, staged marketplace artifacts, and legacy footprints.
 */
export const executeVerifyCopilot = async (
	_logger: Logger,
): Promise<boolean> => {
	console.log(bold("\nVerifying Copilot CLI Plugins\n"));

	const result = await verifyCopilotInstallation();
	const stateLabel =
		result.state === "healthy_native"
			? green("healthy_native")
			: result.state === "mixed_native_and_legacy"
				? yellow("mixed_native_and_legacy")
				: red(result.state);
	const copilotLabel = result.copilotInstalled
		? green(result.copilotVersion ?? "unknown")
		: red("not found");
	const pluginListLabel = result.pluginListAvailable
		? green("available")
		: yellow("unavailable");

	console.log(`State: ${stateLabel}`);
	console.log(`Copilot CLI: ${copilotLabel}`);
	console.log(`Plugin List: ${pluginListLabel}`);
	console.log("");
	console.log("Plugins:");

	for (const plugin of result.plugins) {
		const status = plugin.installed
			? green("[OK]")
			: plugin.required
				? red("[MISS]")
				: yellow("[WARN]");
		const version = plugin.version ?? plugin.expectedVersion ?? "not reported";
		const nativeLocation = plugin.nativeInstalledLocation ?? "not found";
		const marketplaceLocation = plugin.marketplaceLocation ?? "not found";

		console.log(`  ${status} ${plugin.name} (${dim(version)})`);
		console.log(dim(`       native: ${nativeLocation}`));
		console.log(dim(`       staged: ${marketplaceLocation}`));

		for (const issue of plugin.issues) {
			console.log(yellow(`       - ${issue}`));
		}
	}

	if (result.legacyFootprints.length > 0) {
		console.log("");
		console.log(yellow("Legacy Footprints:"));
		for (const footprint of result.legacyFootprints) {
			console.log(yellow(`  - ${footprint}`));
		}
	}

	if (result.issues.length > 0) {
		console.log("");
		console.log(yellow("Issues Found:"));
		for (const issue of result.issues) {
			console.log(yellow(`  - ${issue}`));
		}
	}

	if (result.remediation.length > 0) {
		console.log("");
		console.log(dim("Remediation:"));
		for (const step of result.remediation) {
			console.log(dim(`  - ${step}`));
		}
	}

	if (result.verified) {
		console.log(green(bold("\nCopilot native installation verified")));
		if (result.state === "mixed_native_and_legacy") {
			console.log(
				yellow(
					"Native plugins are installed, but legacy Copilot files still need cleanup.",
				),
			);
		}
		return true;
	}

	console.log(red(bold("\nCopilot installation needs attention")));
	if (result.remediation.length === 0) {
		console.log(cyan("  rp1 install copilot"));
	}
	return false;
};

/**
 * Copilot verification subcommand.
 */
export const verifyCopilotSubcommand = new Command("copilot")
	.description("Verify rp1 installation in GitHub Copilot CLI")
	.addHelpText(
		"after",
		`
Examples:
  rp1 verify copilot    Verify Copilot CLI installation
`,
	)
	.action(async (_options, command) => {
		const logger = command.parent?.parent?._logger as Logger;
		if (!logger) {
			console.error("Logger not initialized");
			process.exit(1);
		}

		const ok = await executeVerifyCopilot(logger);
		if (!ok) process.exit(1);
	});
