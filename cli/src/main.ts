#!/usr/bin/env node
import { pipe } from "fp-ts/lib/function.js";
import * as TE from "fp-ts/lib/TaskEither.js";
import * as E from "fp-ts/lib/Either.js";
import { detectRuntime } from "../shared/runtime.js";
import { createLogger, LogLevel } from "../shared/logger.js";
import { type CLIError, formatError, getExitCode } from "../shared/errors.js";
import { route } from "./router.js";
import pkg from "../package.json";

import "./commands/view.js";
import "./commands/build.js";
import "./commands/install.js";

const getVersion = (): string => pkg.version;

const main: TE.TaskEither<CLIError, void> = pipe(
  TE.Do,
  TE.bind("runtime", () => TE.right(detectRuntime())),
  TE.bind("args", () => TE.right(process.argv.slice(2))),
  TE.bind("logger", ({ args }) => {
    const verbose = args.includes("--verbose") || args.includes("-v");
    const trace = args.includes("--trace") || process.env.DEBUG === "*";
    return TE.right(
      createLogger({
        level: trace
          ? LogLevel.TRACE
          : verbose
            ? LogLevel.DEBUG
            : LogLevel.INFO,
        color: process.stdout.isTTY ?? false,
      }),
    );
  }),
  TE.chainFirst(({ runtime, logger }) => {
    if (runtime.warning) {
      logger.warn(runtime.warning);
    }
    return TE.right(undefined);
  }),
  TE.chain(({ args, logger }) => {
    if (args.includes("--version") || args.includes("-V")) {
      console.log(getVersion());
      process.exit(0);
    }
    return route(args, logger);
  }),
);

main().then(
  E.fold(
    (error) => {
      console.error(formatError(error, process.stderr.isTTY ?? false));
      process.exit(getExitCode(error));
    },
    () => {},
  ),
);
