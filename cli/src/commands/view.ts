import * as TE from "fp-ts/lib/TaskEither.js";
import type { Logger } from "../../shared/logger.js";
import { type CLIError, usageError } from "../../shared/errors.js";
import { registerCommand } from "../router.js";

const execute = (
  _args: string[],
  logger: Logger
): TE.TaskEither<CLIError, void> => {
  logger.info("View command will be implemented in Milestone 2");
  return TE.left(
    usageError(
      "View command not yet implemented",
      "This command will be available after Milestone 2 is complete"
    )
  );
};

registerCommand({
  name: "view",
  description: "Launch the web-based documentation viewer",
  execute,
});

export { execute };
