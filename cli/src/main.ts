#!/usr/bin/env bun
import chalk from "chalk";
import { Command } from "commander";
import pkg from "../package.json";
import { type CLIError, formatError, getExitCode } from "../shared/errors.js";
import { createLogger, type Logger, LogLevel } from "../shared/logger.js";
import { detectRuntime } from "../shared/runtime.js";
import { checkUpdateCommand } from "./commands/check-update.js";
import { initCommand } from "./commands/init.js";
import {
	installClaudeCodeCommand,
	installCommand,
	listCommand,
	verifyCommand,
} from "./commands/install.js";
import { selfUpdateCommand } from "./commands/self-update.js";
import { viewCommand } from "./commands/view.js";

declare module "commander" {
	interface Command {
		_logger?: Logger;
		_isTTY?: boolean;
	}
}

const program = new Command()
	.name("rp1")
	.description("AI-assisted development workflows CLI")
	.version(pkg.version, "-V, --version", "Show version number")
	.option("-v, --verbose", "Enable debug logging")
	.option("--trace", "Enable trace logging")
	.helpOption("-h, --help", "Show this help message")
	.configureOutput({
		outputError: (str, write) => write(chalk.red(str)),
	});

program.hook("preAction", (thisCommand) => {
	const opts = thisCommand.opts();
	const isTTY = process.stdout.isTTY ?? false;

	const level =
		opts.trace || process.env.DEBUG === "*"
			? LogLevel.TRACE
			: opts.verbose
				? LogLevel.DEBUG
				: LogLevel.INFO;

	const logger = createLogger({
		level,
		color: isTTY,
	});

	const runtime = detectRuntime();
	if (runtime.warning) {
		logger.warn(runtime.warning);
	}

	thisCommand._logger = logger;
	thisCommand._isTTY = isTTY;
});

program.addCommand(viewCommand, { hidden: true });
program.addCommand(installCommand);
program.addCommand(installClaudeCodeCommand);
program.addCommand(verifyCommand);
program.addCommand(listCommand);
program.addCommand(initCommand);
program.addCommand(checkUpdateCommand);
program.addCommand(selfUpdateCommand);

const handleError = (error: CLIError): void => {
	const isTTY = process.stderr.isTTY ?? false;
	console.error(formatError(error, isTTY));
	process.exit(getExitCode(error));
};

program.parseAsync(process.argv).catch((error) => {
	if (error && typeof error === "object" && "code" in error) {
		handleError(error as CLIError);
	} else {
		console.error(error);
		process.exit(1);
	}
});
