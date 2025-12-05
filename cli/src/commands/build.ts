/**
 * Build command registration.
 * Registers the build:opencode command with the CLI router.
 */

import type { Logger } from "../../shared/logger.js";
import type { CLIError } from "../../shared/errors.js";
import * as TE from "fp-ts/lib/TaskEither.js";
import { registerCommand } from "../router.js";
import { executeBuild } from "../build/index.js";

const execute = (
  args: string[],
  logger: Logger,
): TE.TaskEither<CLIError, void> => {
  return executeBuild(args, logger);
};

registerCommand({
  name: "build:opencode",
  description: "Build OpenCode artifacts from Claude Code sources",
  execute,
});

export { execute };
