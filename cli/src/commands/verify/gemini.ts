import { Command } from "commander";
import type { Logger } from "../../../shared/logger.js";
import {
	type GeminiVerifyDeps,
	verifyGeminiSmokeSetup,
} from "../../install/gemini/index.js";
import { colorFns } from "../../lib/colors.js";

const { green, yellow, red, dim, bold, cyan } = colorFns;

export const executeVerifyGemini = async (
	_logger: Logger,
	deps?: GeminiVerifyDeps,
): Promise<boolean> => {
	console.log(bold("\nVerifying Gemini CLI Smoke Command\n"));

	const result = await verifyGeminiSmokeSetup(deps);
	const statusLabel = result.verified
		? green(result.status)
		: yellow(result.status);
	const binaryLabel = result.geminiInstalled
		? green(result.geminiVersion ?? "unknown")
		: red("not found");
	const commandLabel = result.commandInstalled
		? green("present")
		: red("missing");

	console.log(`Support: ${yellow("experimental")} (${dim("smoke-only")})`);
	console.log(`State: ${statusLabel}`);
	console.log("");
	console.log("+----------------+----------------------+--------+");
	console.log("| Component      | Value                | Status |");
	console.log("+----------------+----------------------+--------+");
	console.log(
		`| Gemini CLI     | ${(result.geminiVersion ?? "not found").padEnd(20)} | ${binaryLabel.padEnd(6)} |`,
	);
	console.log(
		`| Smoke command  | ${result.commandDisplayPath.padEnd(20)} | ${commandLabel.padEnd(6)} |`,
	);
	console.log("+----------------+----------------------+--------+");

	if (result.issues.length > 0) {
		console.log("");
		console.log(yellow("Issues Found:"));
		for (const issue of result.issues) {
			console.log(yellow(`  - ${issue}`));
		}
	}

	if (result.remediation.length > 0) {
		console.log("");
		console.log(dim("Next steps:"));
		for (const step of result.remediation) {
			console.log(dim(`  - ${step}`));
		}
	}

	if (result.verified) {
		console.log(green(bold("\nGemini experimental smoke command ready")));
		return true;
	}

	console.log(yellow(bold("\nGemini smoke path is degraded")));
	if (!result.commandInstalled) {
		console.log(cyan("  rp1 install gemini"));
	}
	return false;
};

export const verifyGeminiSubcommand = new Command("gemini")
	.description("Verify experimental Gemini CLI smoke command")
	.addHelpText(
		"after",
		`
Examples:
  rp1 verify gemini    Verify Gemini CLI experimental smoke setup
`,
	)
	.action(async (_options, command) => {
		const logger = command.parent?.parent?._logger as Logger;
		if (!logger) {
			console.error("Logger not initialized");
			process.exit(1);
		}

		const ok = await executeVerifyGemini(logger);
		if (!ok) process.exit(1);
	});
