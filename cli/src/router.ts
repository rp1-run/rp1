import { pipe } from "fp-ts/lib/function.js";
import * as TE from "fp-ts/lib/TaskEither.js";
import * as O from "fp-ts/lib/Option.js";
import * as A from "fp-ts/lib/Array.js";
import type { Logger } from "../shared/logger.js";
import { type CLIError, usageError } from "../shared/errors.js";
import pkg from "../package.json";

export interface Command {
  name: string;
  description: string;
  execute: (args: string[], logger: Logger) => TE.TaskEither<CLIError, void>;
}

const commands: Map<string, Command> = new Map();

export const registerCommand = (command: Command): void => {
  commands.set(command.name, command);
};

const findCommand = (name: string): O.Option<Command> =>
  O.fromNullable(commands.get(name));

const findSimilarCommand = (input: string): O.Option<string> =>
  pipe(
    Array.from(commands.keys()),
    A.findFirst((cmd) => cmd.startsWith(input.slice(0, 2))),
  );

export const route = (
  args: string[],
  logger: Logger,
): TE.TaskEither<CLIError, void> => {
  if (args.length === 0) {
    printHelp();
    return TE.right(undefined);
  }

  const commandName = args[0];

  if (commandName === "--help" || commandName === "-h") {
    printHelp();
    return TE.right(undefined);
  }

  if (commandName.startsWith("-")) {
    printHelp();
    return TE.right(undefined);
  }

  return pipe(
    findCommand(commandName),
    O.fold(
      () => {
        const suggestion = pipe(
          findSimilarCommand(commandName),
          O.map((cmd) => `Did you mean '${cmd}'?`),
          O.getOrElse(() => `Run 'rp1 --help' for available commands`),
        );
        return TE.left(
          usageError(`Unknown command: ${commandName}`, suggestion),
        );
      },
      (command) => command.execute(args.slice(1), logger),
    ),
  );
};

const printHelp = (): void => {
  const version = getVersion();
  const commandList = pipe(
    Array.from(commands.entries()),
    A.map(([name, cmd]) => `  ${name.padEnd(14)} ${cmd.description}`),
    (lines) => lines.join("\n"),
  );

  console.log(`
rp1 v${version} - AI-assisted development workflows

Usage:
  rp1 <command> [options]

Commands:
${commandList || "  view [path]    Launch the web-based documentation viewer"}

Global Options:
  -h, --help     Show this help message
  -V, --version  Show version number
  -v, --verbose  Enable debug logging
  --trace        Enable trace logging

Examples:
  rp1 view                    # View current project
  rp1 view /path/to/project   # View specific project
  rp1 view --no-open          # Start server without opening browser

Documentation: https://rp1.run
`);
};

const getVersion = (): string => pkg.version;
