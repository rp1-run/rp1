// Bun global type declaration for cross-runtime compatibility
// When running under Node.js, Bun will be undefined
// Use globalThis.Bun instead of direct Bun reference to avoid ReferenceError
declare const Bun:
  | {
      version: string;
      serve: (options: {
        port: number;
        hostname?: string;
        fetch: (req: Request) => Response | Promise<Response>;
      }) => { stop: () => void };
      spawn: (
        command: string[],
        options?: { stdout?: "ignore" | "pipe"; stderr?: "ignore" | "pipe" }
      ) => { exited: Promise<number> };
    }
  | undefined;

declare global {
  // eslint-disable-next-line no-var
  var Bun: typeof Bun;
}

export interface RuntimeInfo {
  runtime: "bun" | "node";
  version: string;
  warning?: string;
}

export function detectRuntime(): RuntimeInfo {
  if (typeof Bun !== "undefined") {
    return {
      runtime: "bun",
      version: Bun.version,
    };
  }

  return {
    runtime: "node",
    version: process.version,
    warning:
      "Running under Node.js. Some features may have reduced performance. Install Bun for best experience: https://bun.sh",
  };
}

export function isBun(): boolean {
  return typeof Bun !== "undefined";
}
