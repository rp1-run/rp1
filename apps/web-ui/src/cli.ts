#!/usr/bin/env bun
import { resolve } from "path";
import { createServer } from "./server";
import { validateProject, formatProjectError } from "./server/project";
import { isLeft } from "./lib/fp";

const VERSION = "0.1.0";
const DEFAULT_PORT = 7710;

interface CliArgs {
  port: number;
  help: boolean;
  version: boolean;
  projectPath: string;
}

function parseArgs(args: string[]): CliArgs {
  const result: CliArgs = {
    port: DEFAULT_PORT,
    help: false,
    version: false,
    projectPath: process.cwd(),
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "--help" || arg === "-h") {
      result.help = true;
    } else if (arg === "--version" || arg === "-v") {
      result.version = true;
    } else if (arg === "--port" || arg === "-p") {
      const portStr = args[++i];
      const port = parseInt(portStr, 10);
      if (isNaN(port) || port < 1 || port > 65535) {
        console.error(`Invalid port: ${portStr}`);
        process.exit(1);
      }
      result.port = port;
    } else if (arg.startsWith("--port=")) {
      const portStr = arg.slice("--port=".length);
      const port = parseInt(portStr, 10);
      if (isNaN(port) || port < 1 || port > 65535) {
        console.error(`Invalid port: ${portStr}`);
        process.exit(1);
      }
      result.port = port;
    } else if (!arg.startsWith("-")) {
      result.projectPath = resolve(arg);
    }
  }

  return result;
}

function printHelp(): void {
  console.log(`
rp1-ui - Read-only markdown viewer for rp1 artifacts

Usage:
  rp1-ui [options] [project-path]

Options:
  -p, --port <port>  Port to run the server on (default: ${DEFAULT_PORT})
  -h, --help         Show this help message
  -v, --version      Show version number

Arguments:
  project-path       Path to the rp1 project (default: current directory)

Examples:
  rp1-ui                    # Start server for current directory
  rp1-ui --port 8080        # Start server on port 8080
  rp1-ui /path/to/project   # Start server for specific project
`);
}

function printVersion(): void {
  console.log(`rp1-ui version ${VERSION}`);
}

async function checkPortAvailable(port: number): Promise<boolean> {
  try {
    const server = Bun.serve({
      port,
      hostname: "127.0.0.1",
      fetch() {
        return new Response("test");
      },
    });
    server.stop();
    return true;
  } catch {
    return false;
  }
}

async function openBrowser(url: string): Promise<void> {
  const platform = process.platform;

  let command: string;
  let args: string[];

  switch (platform) {
    case "darwin":
      command = "open";
      args = [url];
      break;
    case "win32":
      command = "cmd";
      args = ["/c", "start", "", url];
      break;
    default:
      command = "xdg-open";
      args = [url];
      break;
  }

  try {
    const proc = Bun.spawn([command, ...args], {
      stdout: "ignore",
      stderr: "ignore",
    });
    await proc.exited;
  } catch (error) {
    console.warn(`Could not open browser automatically: ${error}`);
    console.log(`Please open ${url} in your browser`);
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  if (args.version) {
    printVersion();
    process.exit(0);
  }

  console.log(`Validating project: ${args.projectPath}`);

  const validationResult = await validateProject(args.projectPath)();

  if (isLeft(validationResult)) {
    console.error(`\nError: ${formatProjectError(validationResult.left)}`);
    console.error(`\nMake sure you're in a directory with a .rp1/ folder.`);
    process.exit(1);
  }

  const portAvailable = await checkPortAvailable(args.port);

  if (!portAvailable) {
    console.error(`\nError: Port ${args.port} is already in use.`);
    console.error(`\nTry using a different port:`);
    console.error(`  rp1-ui --port ${args.port + 1}`);
    process.exit(1);
  }

  const { stop } = createServer({
    port: args.port,
    projectPath: args.projectPath,
    isDev: process.env.NODE_ENV === "development",
  });

  const url = `http://127.0.0.1:${args.port}`;

  setTimeout(async () => {
    await openBrowser(url);
  }, 500);

  process.on("SIGINT", () => {
    console.log("\nShutting down...");
    stop();
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    console.log("\nShutting down...");
    stop();
    process.exit(0);
  });
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
