import { join } from "path";
import { statSync } from "fs";
import { spawn } from "child_process";
import { Command } from "commander";
import { pipe } from "fp-ts/lib/function.js";
import * as TE from "fp-ts/lib/TaskEither.js";
import * as T from "fp-ts/lib/Task.js";
import * as E from "fp-ts/lib/Either.js";
import type { Logger } from "../../shared/logger.js";
import { loadViewConfig, type ViewConfig } from "../../shared/config.js";
import {
  type CLIError,
  notFoundError,
  portInUseError,
  runtimeError,
  tryCatchTE,
  formatError,
  getExitCode,
} from "../../shared/errors.js";
import { isBun } from "../../shared/runtime.js";

const directoryExists = (path: string): boolean => {
  try {
    const stat = statSync(path);
    return stat.isDirectory();
  } catch {
    return false;
  }
};

const validateProject = (
  projectPath: string,
  logger: Logger,
): TE.TaskEither<CLIError, string> => {
  logger.debug(`Validating project structure at: ${projectPath}`);

  const rp1Path = join(projectPath, ".rp1");
  if (!directoryExists(rp1Path)) {
    return TE.left(
      notFoundError(
        `.rp1 directory at ${projectPath}`,
        "Make sure you are in an rp1 project directory or specify the correct path",
      ),
    );
  }

  const contextPath = join(rp1Path, "context");
  if (!directoryExists(contextPath)) {
    logger.debug(`.rp1/context/ not found - KB may not be built yet`);
  }

  return TE.right(projectPath);
};

const checkPortAvailable = (
  port: number,
  logger: Logger,
): TE.TaskEither<CLIError, number> =>
  tryCatchTE(
    async () => {
      logger.debug(`Checking if port ${port} is available`);

      if (isBun()) {
        // Use globalThis.Bun to avoid ReferenceError when running under Node.js
        // The isBun() check ensures this code path only runs when Bun is available
        const BunRuntime = globalThis.Bun as typeof Bun;
        const server = BunRuntime.serve({
          port,
          hostname: "127.0.0.1",
          fetch() {
            return new Response("test");
          },
        });
        server.stop();
        return port;
      } else {
        const net = await import("net");
        return new Promise<number>((resolve, reject) => {
          const server = net.createServer();
          server.once("error", () => reject(new Error("Port in use")));
          server.once("listening", () => {
            server.close();
            resolve(port);
          });
          server.listen(port, "127.0.0.1");
        });
      }
    },
    () => portInUseError(port),
  );

const openBrowser =
  (url: string, logger: Logger): T.Task<void> =>
  async () => {
    const platform = process.platform;
    const [command, args]: [string, string[]] =
      platform === "darwin"
        ? ["open", [url]]
        : platform === "win32"
          ? ["cmd", ["/c", "start", "", url]]
          : ["xdg-open", [url]];

    logger.debug(`Opening browser with: ${command} ${args.join(" ")}`);

    try {
      if (isBun()) {
        // Use globalThis.Bun to avoid ReferenceError when running under Node.js
        const BunRuntime = globalThis.Bun as typeof Bun;
        const proc = BunRuntime.spawn([command, ...args], {
          stdout: "ignore",
          stderr: "ignore",
        });
        await proc.exited;
      } else {
        const proc = spawn(command, args, {
          detached: true,
          stdio: "ignore",
        });
        proc.unref();
      }
    } catch {
      logger.warn(`Could not open browser automatically. Please open ${url}`);
    }
  };

const setupShutdownHandlers = (stop: () => void, logger: Logger): void => {
  const shutdown = () => {
    logger.info("Shutting down...");
    stop();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
};

const startServer = (
  config: ViewConfig,
  logger: Logger,
): TE.TaskEither<CLIError, void> =>
  tryCatchTE(
    async () => {
      const { createServer } = await import("../../web-ui/src/server.js");

      const { stop } = createServer({
        port: config.port,
        projectPath: config.rp1Root,
        isDev: false,
      });

      const url = `http://127.0.0.1:${config.port}`;

      if (config.openBrowser) {
        logger.debug("Opening browser in 500ms");
        setTimeout(() => openBrowser(url, logger)(), 500);
      } else {
        logger.info(`Server running at ${url}`);
        logger.info("Press Ctrl+C to stop");
      }

      setupShutdownHandlers(stop, logger);

      await new Promise(() => {});
    },
    (e) => runtimeError(`Failed to start server: ${e}`),
  );

const execute = (
  args: string[],
  logger: Logger,
): TE.TaskEither<CLIError, void> => {
  return pipe(
    loadViewConfig(args),
    TE.fromEither,
    TE.chainFirst((config) => {
      logger.debug(
        `Config: rp1Root=${config.rp1Root}, port=${config.port}, openBrowser=${config.openBrowser}`,
      );
      return TE.right(undefined);
    }),
    TE.chain((config) =>
      pipe(
        validateProject(config.rp1Root, logger),
        TE.map(() => config),
      ),
    ),
    TE.chain((config) =>
      pipe(
        checkPortAvailable(config.port, logger),
        TE.map(() => config),
      ),
    ),
    TE.chain((config) => startServer(config, logger)),
  );
};

export const viewCommand = new Command("view")
  .description("Launch the web-based documentation viewer (requires Bun)")
  .argument("[path]", "Path to project directory", process.cwd())
  .option("-p, --port <port>", "Port to run server on", "7710")
  .option("--no-open", "Start server without opening browser")
  .addHelpText("after", `
Examples:
  rp1 view                      View current project
  rp1 view /path/to/project     View specific project
  rp1 view --port 8080          Use custom port
  rp1 view --no-open            Don't auto-open browser

Environment:
  RP1_ROOT                      Set default project path

Note: This command requires Bun runtime. Install from https://bun.sh
`)
  .action(async (path, options, command) => {
    // Check for Bun runtime early - the web-ui server requires Bun APIs
    if (!isBun()) {
      console.error("\x1b[31mError: The 'view' command requires Bun runtime.\x1b[0m");
      console.error("\nThe web UI server uses Bun-specific APIs that are not available in Node.js.");
      console.error("\nTo fix this:");
      console.error("  1. Install Bun: curl -fsSL https://bun.sh/install | bash");
      console.error("  2. Run with Bun: bun rp1 view");
      console.error("\nOther rp1 commands work with Node.js.");
      process.exit(1);
    }

    const logger = command.parent?._logger;
    if (!logger) {
      console.error("Logger not initialized");
      process.exit(1);
    }

    const args: string[] = [];
    if (path && path !== process.cwd()) {
      args.push(path);
    }
    if (options.port !== "7710") {
      args.push("--port", options.port);
    }
    if (!options.open) {
      args.push("--no-open");
    }

    const result = await execute(args, logger)();

    if (E.isLeft(result)) {
      console.error(formatError(result.left, process.stderr.isTTY ?? false));
      process.exit(getExitCode(result.left));
    }
  });
