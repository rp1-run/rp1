/**
 * Install command registration.
 * Registers install:opencode, verify, and list commands with the CLI router.
 */

import type { Logger } from "../../shared/logger.js";
import type { CLIError } from "../../shared/errors.js";
import * as TE from "fp-ts/lib/TaskEither.js";
import { registerCommand } from "../router.js";
import {
  executeInstall,
  executeVerify,
  executeList,
} from "../install/index.js";

const executeInstallCommand = (
  args: string[],
  logger: Logger,
): TE.TaskEither<CLIError, void> => {
  return executeInstall(args, logger);
};

const executeVerifyCommand = (
  args: string[],
  logger: Logger,
): TE.TaskEither<CLIError, void> => {
  return executeVerify(args, logger);
};

const executeListCommand = (
  args: string[],
  logger: Logger,
): TE.TaskEither<CLIError, void> => {
  return executeList(args, logger);
};

registerCommand({
  name: "install:opencode",
  description: "Install rp1 plugins to OpenCode platform",
  execute: executeInstallCommand,
});

registerCommand({
  name: "verify:opencode",
  description: "Verify rp1 installation health",
  execute: executeVerifyCommand,
});

registerCommand({
  name: "list",
  description: "List installed rp1 commands",
  execute: executeListCommand,
});

export { executeInstallCommand, executeVerifyCommand, executeListCommand };
