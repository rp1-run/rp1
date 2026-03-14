import { Command } from "commander";
import * as E from "fp-ts/lib/Either.js";
import { formatError, getExitCode } from "../../shared/errors.js";
import type { Logger } from "../../shared/logger.js";
import { executeBuild } from "../build/index.js";

export const buildCommand = new Command("build:opencode")
	.description("Build OpenCode artifacts from Claude Code sources")
	.option("-o, --output-dir <dir>", "Output directory", "dist/opencode")
	.option(
		"-p, --plugin <name>",
		"Build specific plugin (base, dev, utils, all)",
		"all",
	)
	.option("--json", "Output results as JSON for CI/CD")
	.option(
		"--lint",
		"Run build pipeline with lint validation only (no file output)",
	)
	.addHelpText(
		"after",
		`
Examples:
  rp1 build:opencode                    Build all plugins
  rp1 build:opencode --plugin dev       Build only dev plugin
  rp1 build:opencode -o ./output        Custom output directory
  rp1 build:opencode --json             JSON output for CI
  rp1 build:opencode --lint             Lint-only mode (no file output)
`,
	)
	.action(async (options, command) => {
		const logger = command.parent?._logger as Logger;
		if (!logger) {
			console.error("Logger not initialized");
			process.exit(1);
		}

		const args: string[] = [];
		if (options.outputDir !== "dist/opencode") {
			args.push("--output-dir", options.outputDir);
		}
		if (options.plugin !== "all") {
			args.push("--plugin", options.plugin);
		}
		if (options.json) {
			args.push("--json");
		}
		if (options.lint) {
			args.push("--lint");
		}

		const result = await executeBuild(args, logger)();

		if (E.isLeft(result)) {
			console.error(formatError(result.left, process.stderr.isTTY ?? false));
			process.exit(getExitCode(result.left));
		}
	});
