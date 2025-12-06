import { Command } from "commander";
import * as E from "fp-ts/lib/Either.js";
import type { Logger } from "../../shared/logger.js";
import { formatError, getExitCode } from "../../shared/errors.js";
import { executeInit } from "../init/index.js";

export const initCommand = new Command("init")
  .description("Initialize rp1 knowledge in CLAUDE.md or AGENTS.md")
  .addHelpText(
    "after",
    `
Auto-detects CLAUDE.md or AGENTS.md and injects rp1 KB loading patterns.
Creates CLAUDE.md if neither file exists.
`,
  )
  .action(async (_options, command) => {
    const logger = command.parent?._logger as Logger;
    if (!logger) {
      console.error("Logger not initialized");
      process.exit(1);
    }

    const result = await executeInit({}, logger)();

    if (E.isLeft(result)) {
      console.error(formatError(result.left, process.stderr.isTTY ?? false));
      process.exit(getExitCode(result.left));
    }

    const { action, filePath, linesInjected } = result.right;
    logger.success(
      `${capitalize(action)} rp1 knowledge (${linesInjected} lines) in ${filePath}`,
    );
  });

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
