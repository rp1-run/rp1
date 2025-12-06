#!/usr/bin/env node
import { Command } from "commander";
import { detectRuntime } from "../shared/runtime.js";
import { createLogger, LogLevel, type Logger } from "../shared/logger.js";
import { formatError, getExitCode, type CLIError } from "../shared/errors.js";
import pkg from "../package.json";

import { viewCommand } from "./commands/view.js";
import { buildCommand } from "./commands/build.js";
import { installCommand, verifyCommand, listCommand } from "./commands/install.js";

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
    outputError: (str, write) => write(`\x1b[31m${str}\x1b[0m`),
  });

program.hook("preAction", (thisCommand) => {
  const opts = thisCommand.opts();
  const isTTY = process.stdout.isTTY ?? false;

  const level = opts.trace || process.env.DEBUG === "*"
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
program.addCommand(buildCommand);
program.addCommand(installCommand);
program.addCommand(verifyCommand);
program.addCommand(listCommand);

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
