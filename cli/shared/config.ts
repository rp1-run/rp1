import { resolve } from "path";
import { statSync } from "fs";
import { pipe } from "fp-ts/lib/function.js";
import * as E from "fp-ts/lib/Either.js";
import * as O from "fp-ts/lib/Option.js";
import { type CLIError, usageError, notFoundError } from "./errors.js";

export interface CLIConfig {
  rp1Root: string;
  verbose: boolean;
  trace: boolean;
}

export interface ViewConfig extends CLIConfig {
  port: number;
  openBrowser: boolean;
}

export const findRp1Root = (startPath: string = process.cwd()): O.Option<string> => {
  let current = resolve(startPath);
  const root = resolve("/");

  while (current !== root) {
    const rp1Path = resolve(current, ".rp1");
    try {
      const stat = statSync(rp1Path);
      if (stat.isDirectory()) {
        return O.some(current);
      }
    } catch {
      // Continue searching
    }
    current = resolve(current, "..");
  }

  return O.none;
};

const parsePort = (portStr: string): E.Either<CLIError, number> => {
  const port = parseInt(portStr, 10);
  return isNaN(port) || port < 1 || port > 65535
    ? E.left(usageError(`Invalid port: ${portStr}`, "Use a number between 1 and 65535"))
    : E.right(port);
};

export const parseViewArgs = (args: string[]): E.Either<CLIError, ViewConfig> => {
  const config: ViewConfig = {
    rp1Root: process.env.RP1_ROOT || "",
    port: 7710,
    openBrowser: true,
    verbose: false,
    trace: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "--no-open") {
      config.openBrowser = false;
    } else if (arg === "--port" || arg === "-p") {
      const portResult = parsePort(args[++i] || "");
      if (E.isLeft(portResult)) return portResult;
      config.port = portResult.right;
    } else if (arg.startsWith("--port=")) {
      const portResult = parsePort(arg.slice("--port=".length));
      if (E.isLeft(portResult)) return portResult;
      config.port = portResult.right;
    } else if (arg === "--verbose" || arg === "-v") {
      config.verbose = true;
    } else if (arg === "--trace") {
      config.trace = true;
    } else if (!arg.startsWith("-")) {
      config.rp1Root = resolve(arg);
    }
  }

  return E.right(config);
};

export const resolveRp1Root = (config: ViewConfig): E.Either<CLIError, ViewConfig> =>
  pipe(
    config.rp1Root,
    O.fromPredicate((root) => root.length > 0),
    O.alt(() => findRp1Root()),
    O.map((rp1Root) => ({ ...config, rp1Root })),
    E.fromOption(() =>
      notFoundError(
        ".rp1 directory",
        "Run this command from an rp1 project directory, or specify a path: rp1 view /path/to/project"
      )
    )
  );

export const loadViewConfig = (args: string[]): E.Either<CLIError, ViewConfig> =>
  pipe(parseViewArgs(args), E.chain(resolveRp1Root));
