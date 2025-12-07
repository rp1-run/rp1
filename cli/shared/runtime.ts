// Runtime detection for cross-runtime compatibility (Bun/Node.js)
// Bun types come from @types/bun in devDependencies

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

export function isStandaloneBinary(): boolean {
  const execPath = process.execPath.toLowerCase();
  const argv0 = process.argv[0]?.toLowerCase() || "";

  // Standalone binary: execPath ends with /rp1 or \rp1.exe
  if (execPath.endsWith("/rp1") || execPath.endsWith("\\rp1.exe")) {
    return true;
  }

  // Running via bun/node runtime means npm/bunx execution
  if (
    execPath.includes("bun") ||
    execPath.includes("node") ||
    argv0.includes("bun") ||
    argv0.includes("node")
  ) {
    return false;
  }

  return true;
}

export function showDeprecationWarning(): void {
  if (isStandaloneBinary()) {
    return;
  }

  if (process.env.RP1_NO_DEPRECATION_WARNING === "1") {
    return;
  }

  const yellow = "\x1b[33m";
  const bold = "\x1b[1m";
  const reset = "\x1b[0m";

  console.error(`
${yellow}${bold}⚠️  @rp1-run/rp1 has been deprecated.${reset}

Install the standalone binary instead:
  ${bold}macOS/Linux:${reset} brew install rp1-run/tap/rp1
  ${bold}Windows:${reset}     scoop bucket add rp1 https://github.com/rp1-run/scoop-bucket && scoop install rp1
  ${bold}CI/CD:${reset}       curl -fsSL https://rp1.run/install.sh | sh

Learn more: https://rp1.run/docs/installation

${yellow}Suppress this warning: RP1_NO_DEPRECATION_WARNING=1${reset}
`);
}
