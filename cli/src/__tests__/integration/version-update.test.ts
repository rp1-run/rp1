/**
 * Integration tests for version update CLI commands and hook output.
 * Tests end-to-end behavior of check-update, self-update commands
 * and the check-update.py hook script.
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { spawn } from "child_process";
import { join } from "path";
import { writeFile, mkdir, unlink, readFile } from "fs/promises";
import { existsSync } from "fs";
import { homedir } from "os";
import type { VersionCache } from "../../lib/cache.js";

/**
 * Path to the project root (cli directory).
 */
const CLI_ROOT = join(import.meta.dir, "../../../");

/**
 * Path to the plugins/base directory.
 */
const PLUGINS_BASE = join(CLI_ROOT, "../plugins/base");

/**
 * Path to the check-update.py hook script.
 */
const HOOK_SCRIPT_PATH = join(PLUGINS_BASE, "hooks/check-update.py");

/**
 * Path to the version cache file.
 */
const CONFIG_DIR = join(homedir(), ".config", "rp1");
const CACHE_PATH = join(CONFIG_DIR, "version-cache.json");

/**
 * Run a CLI command and return stdout, stderr, and exit code.
 */
async function runCliCommand(
  args: string[],
  timeout = 30000,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    const proc = spawn("bun", ["run", join(CLI_ROOT, "src/main.ts"), ...args], {
      cwd: CLI_ROOT,
      timeout,
      env: { ...process.env, NO_COLOR: "1" },
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    proc.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    proc.on("close", (code) => {
      resolve({
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        exitCode: code ?? 1,
      });
    });

    proc.on("error", (error) => {
      reject(error);
    });
  });
}

/**
 * Run the check-update.py hook script with provided input.
 */
async function runHookScript(
  input: object,
  timeout = 10000,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    const proc = spawn("python3", [HOOK_SCRIPT_PATH], {
      cwd: PLUGINS_BASE,
      timeout,
      env: { ...process.env },
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    proc.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    proc.on("close", (code) => {
      resolve({
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        exitCode: code ?? 1,
      });
    });

    proc.on("error", (error) => {
      reject(error);
    });

    proc.stdin.write(JSON.stringify(input));
    proc.stdin.end();
  });
}

/**
 * Write a test cache file with specific data.
 */
async function writeTestCache(
  data: Omit<VersionCache, "checkedAt"> & { checkedAt?: string },
): Promise<void> {
  if (!existsSync(CONFIG_DIR)) {
    await mkdir(CONFIG_DIR, { recursive: true });
  }

  const cacheData: VersionCache = {
    ...data,
    checkedAt: data.checkedAt ?? new Date().toISOString(),
  };
  await writeFile(CACHE_PATH, JSON.stringify(cacheData, null, 2));
}

/**
 * Remove the cache file if it exists.
 */
async function removeCache(): Promise<void> {
  if (existsSync(CACHE_PATH)) {
    await unlink(CACHE_PATH);
  }
}

async function readCache(): Promise<VersionCache | null> {
  if (!existsSync(CACHE_PATH)) {
    return null;
  }
  try {
    const content = await readFile(CACHE_PATH, "utf-8");
    return JSON.parse(content) as VersionCache;
  } catch {
    return null;
  }
}

describe("integration: version-update", () => {
  beforeEach(async () => {
    await removeCache();
  });

  afterEach(async () => {
    await removeCache();
  });

  describe("rp1 check-update --json", () => {
    test(
      "response structure includes all required fields",
      async () => {
        await writeTestCache({
          latestVersion: "99.0.0",
          releaseUrl: "https://github.com/rp1-run/rp1/releases/tag/v99.0.0",
          ttlHours: 24,
        });

        const { stdout, exitCode } = await runCliCommand([
          "check-update",
          "--json",
        ]);

        expect(exitCode).toBe(0);

        const result = JSON.parse(stdout);

        expect(result).toHaveProperty("current_version");
        expect(result).toHaveProperty("latest_version");
        expect(result).toHaveProperty("update_available");
        expect(result).toHaveProperty("release_url");
        expect(result).toHaveProperty("error");
        expect(result).toHaveProperty("cached");
        expect(result).toHaveProperty("cache_age_hours");
        expect(result).toHaveProperty("cache_expires_in_hours");
      },
      { timeout: 30000 },
    );

    test(
      "response structure includes cache fields when using cached result",
      async () => {
        await writeTestCache({
          latestVersion: "88.0.0",
          releaseUrl: "https://github.com/rp1-run/rp1/releases/tag/v88.0.0",
          ttlHours: 24,
        });

        const { stdout, exitCode } = await runCliCommand([
          "check-update",
          "--json",
        ]);

        expect(exitCode).toBe(0);

        const result = JSON.parse(stdout);

        expect(result.cached).toBe(true);
        expect(typeof result.cache_age_hours).toBe("number");
        expect(typeof result.cache_expires_in_hours).toBe("number");
        expect(result.cache_age_hours).toBeGreaterThanOrEqual(0);
        expect(result.cache_expires_in_hours).toBeGreaterThan(0);
      },
      { timeout: 30000 },
    );

    test(
      "returns snake_case field names in JSON output",
      async () => {
        await writeTestCache({
          latestVersion: "77.0.0",
          releaseUrl: "https://github.com/rp1-run/rp1/releases/tag/v77.0.0",
          ttlHours: 24,
        });

        const { stdout, exitCode } = await runCliCommand([
          "check-update",
          "--json",
        ]);

        expect(exitCode).toBe(0);

        const result = JSON.parse(stdout);

        expect(result).toHaveProperty("current_version");
        expect(result).toHaveProperty("latest_version");
        expect(result).toHaveProperty("update_available");
        expect(result).toHaveProperty("release_url");
        expect(result).toHaveProperty("cache_age_hours");
        expect(result).toHaveProperty("cache_expires_in_hours");

        expect(result).not.toHaveProperty("currentVersion");
        expect(result).not.toHaveProperty("latestVersion");
        expect(result).not.toHaveProperty("updateAvailable");
      },
      { timeout: 30000 },
    );
  });

  describe("rp1 check-update --force", () => {
    test(
      "bypasses cache and performs fresh check",
      async () => {
        await writeTestCache({
          latestVersion: "1.2.3",
          releaseUrl: "https://github.com/rp1-run/rp1/releases/tag/v1.2.3",
          ttlHours: 24,
        });

        const { stdout, exitCode } = await runCliCommand([
          "check-update",
          "--json",
          "--force",
        ]);

        const result = JSON.parse(stdout);

        if (exitCode === 0 && result.latest_version !== null) {
          expect(result.cached).toBe(false);
        }
        expect(result).toHaveProperty("cached");
        expect(result).toHaveProperty("update_available");
      },
      { timeout: 30000 },
    );

    test(
      "updates cache after force fetch",
      async () => {
        const oldTime = new Date();
        oldTime.setHours(oldTime.getHours() - 12);

        await writeTestCache({
          latestVersion: "0.0.1",
          releaseUrl: "https://example.com/old",
          ttlHours: 24,
          checkedAt: oldTime.toISOString(),
        });

        const { exitCode, stdout } = await runCliCommand([
          "check-update",
          "--json",
          "--force",
        ]);

        const result = JSON.parse(stdout);

        if (exitCode === 0 && result.latest_version !== null && !result.error) {
          const cache = await readCache();

          if (cache && result.cached === false) {
            const cacheTime = new Date(cache.checkedAt);
            const now = new Date();
            const ageMs = now.getTime() - cacheTime.getTime();
            const ageMinutes = ageMs / (1000 * 60);

            expect(ageMinutes).toBeLessThan(1);
          }
        }
      },
      { timeout: 30000 },
    );
  });

  describe("rp1 check-update --cache-ttl", () => {
    test(
      "respects custom TTL - cache with 1h TTL expired after 2 hours",
      async () => {
        const twoHoursAgo = new Date();
        twoHoursAgo.setHours(twoHoursAgo.getHours() - 2);

        await writeTestCache({
          latestVersion: "5.5.5",
          releaseUrl: "https://github.com/rp1-run/rp1/releases/tag/v5.5.5",
          ttlHours: 1,
          checkedAt: twoHoursAgo.toISOString(),
        });

        const { stdout, exitCode } = await runCliCommand([
          "check-update",
          "--json",
        ]);

        const result = JSON.parse(stdout);

        if (exitCode === 0 && result.latest_version !== null && !result.error) {
          expect(result.cached).toBe(false);
        }
      },
      { timeout: 30000 },
    );

    test(
      "uses cache when within custom TTL",
      async () => {
        const thirtyMinutesAgo = new Date();
        thirtyMinutesAgo.setMinutes(thirtyMinutesAgo.getMinutes() - 30);

        await writeTestCache({
          latestVersion: "6.6.6",
          releaseUrl: "https://github.com/rp1-run/rp1/releases/tag/v6.6.6",
          ttlHours: 1,
          checkedAt: thirtyMinutesAgo.toISOString(),
        });

        const { stdout, exitCode } = await runCliCommand([
          "check-update",
          "--json",
          "--cache-ttl",
          "1",
        ]);

        expect(exitCode).toBe(0);

        const result = JSON.parse(stdout);

        expect(result.cached).toBe(true);
        expect(result.latest_version).toBe("6.6.6");
      },
      { timeout: 30000 },
    );
  });

  describe("check-update.py hook", () => {
    test(
      "produces output when source is startup and update available",
      async () => {
        await writeTestCache({
          latestVersion: "999.0.0",
          releaseUrl: "https://github.com/rp1-run/rp1/releases/tag/v999.0.0",
          ttlHours: 24,
        });

        const hookInput = {
          session_id: "test-session-123",
          source: "startup",
          hook_event_name: "SessionStart",
        };

        const { stdout, exitCode } = await runHookScript(hookInput);

        expect(exitCode).toBe(0);

        if (stdout.length > 0) {
          const result = JSON.parse(stdout);

          expect(result).toHaveProperty("systemMessage");
          expect(result).toHaveProperty("hookSpecificOutput");
          expect(result.hookSpecificOutput).toHaveProperty("hookEventName");
          expect(result.hookSpecificOutput).toHaveProperty("additionalContext");
          expect(result.hookSpecificOutput.hookEventName).toBe("SessionStart");

          expect(result.systemMessage).toContain("999.0.0");
          expect(result.systemMessage).toContain("/self-update");
        }
      },
      { timeout: 30000 },
    );

    test(
      "produces no output when source is resume",
      async () => {
        await writeTestCache({
          latestVersion: "999.0.0",
          releaseUrl: "https://github.com/rp1-run/rp1/releases/tag/v999.0.0",
          ttlHours: 24,
        });

        const hookInput = {
          session_id: "test-session-456",
          source: "resume",
          hook_event_name: "SessionStart",
        };

        const { stdout, exitCode } = await runHookScript(hookInput);

        expect(exitCode).toBe(0);
        expect(stdout).toBe("");
      },
      { timeout: 30000 },
    );

    test(
      "produces no output when source is clear",
      async () => {
        await writeTestCache({
          latestVersion: "999.0.0",
          releaseUrl: "https://github.com/rp1-run/rp1/releases/tag/v999.0.0",
          ttlHours: 24,
        });

        const hookInput = {
          session_id: "test-session-789",
          source: "clear",
          hook_event_name: "SessionStart",
        };

        const { stdout, exitCode } = await runHookScript(hookInput);

        expect(exitCode).toBe(0);
        expect(stdout).toBe("");
      },
      { timeout: 30000 },
    );

    test(
      "produces no output when source is compact",
      async () => {
        await writeTestCache({
          latestVersion: "999.0.0",
          releaseUrl: "https://github.com/rp1-run/rp1/releases/tag/v999.0.0",
          ttlHours: 24,
        });

        const hookInput = {
          session_id: "test-session-012",
          source: "compact",
          hook_event_name: "SessionStart",
        };

        const { stdout, exitCode } = await runHookScript(hookInput);

        expect(exitCode).toBe(0);
        expect(stdout).toBe("");
      },
      { timeout: 30000 },
    );

    test(
      "exits gracefully with invalid JSON input",
      async () => {
        const proc = spawn("python3", [HOOK_SCRIPT_PATH], {
          cwd: PLUGINS_BASE,
          timeout: 10000,
        });

        return new Promise<void>((resolve) => {
          let exitCode: number | null = null;

          proc.on("close", (code) => {
            exitCode = code;
            expect(exitCode).toBe(0);
            resolve();
          });

          proc.stdin.write("{ invalid json }}}");
          proc.stdin.end();
        });
      },
      { timeout: 30000 },
    );
  });

  describe("JSON output format matches Claude Code schema", () => {
    test(
      "hook output has correct structure",
      async () => {
        await writeTestCache({
          latestVersion: "100.0.0",
          releaseUrl: "https://github.com/rp1-run/rp1/releases/tag/v100.0.0",
          ttlHours: 24,
        });

        const hookInput = {
          session_id: "schema-test",
          source: "startup",
          hook_event_name: "SessionStart",
        };

        const { stdout, exitCode } = await runHookScript(hookInput);

        expect(exitCode).toBe(0);

        if (stdout.length > 0) {
          const result = JSON.parse(stdout);

          expect(result.hookSpecificOutput).toBeDefined();
          expect(typeof result.hookSpecificOutput.hookEventName).toBe("string");
          expect(typeof result.hookSpecificOutput.additionalContext).toBe(
            "string",
          );

          expect(typeof result.systemMessage).toBe("string");
        }
      },
      { timeout: 30000 },
    );

    test(
      "CLI JSON output has correct structure for API consumers",
      async () => {
        await writeTestCache({
          latestVersion: "50.0.0",
          releaseUrl: "https://github.com/rp1-run/rp1/releases/tag/v50.0.0",
          ttlHours: 24,
        });

        const { stdout, exitCode } = await runCliCommand([
          "check-update",
          "--json",
        ]);

        expect(exitCode).toBe(0);

        const result = JSON.parse(stdout);

        expect(typeof result.current_version).toBe("string");
        expect(
          result.latest_version === null ||
            typeof result.latest_version === "string",
        ).toBe(true);
        expect(typeof result.update_available).toBe("boolean");
        expect(
          result.release_url === null || typeof result.release_url === "string",
        ).toBe(true);
        expect(
          result.error === null || typeof result.error === "string",
        ).toBe(true);
        expect(typeof result.cached).toBe("boolean");
        expect(
          result.cache_age_hours === null ||
            typeof result.cache_age_hours === "number",
        ).toBe(true);
        expect(
          result.cache_expires_in_hours === null ||
            typeof result.cache_expires_in_hours === "number",
        ).toBe(true);
      },
      { timeout: 30000 },
    );
  });

  describe("rp1 self-update --dry-run", () => {
    test(
      "shows detection output without executing update",
      async () => {
        const { stdout, stderr, exitCode } = await runCliCommand([
          "self-update",
          "--dry-run",
        ]);

        expect([0, 2]).toContain(exitCode);

        const output = stdout + stderr;

        expect(output).toContain("Detecting installation method");

        const hasDetectionResult =
          output.includes("Homebrew") ||
          output.includes("Scoop") ||
          output.includes("manual");
        expect(hasDetectionResult).toBe(true);

        // For dry-run with package manager, should show what would be done
        if (exitCode === 0 && output.includes("Dry run mode")) {
          expect(output).toContain("Installation method:");
          expect(output).toContain("Current version:");
          expect(output).toContain("Update command:");
        }
      },
      { timeout: 30000 },
    );

    test(
      "shows installation method in dry-run output",
      async () => {
        const { stdout, stderr, exitCode } = await runCliCommand([
          "self-update",
          "--dry-run",
        ]);

        const output = stdout + stderr;

        const methods = ["Homebrew", "Scoop", "manual"];
        const foundMethod = methods.some((m) => output.includes(m));
        expect(foundMethod).toBe(true);

        if (exitCode === 0) {
          const showsDryRunInfo = output.includes("without --dry-run");
          const showsUpToDate = output.includes("already on the latest version");
          expect(showsDryRunInfo || showsUpToDate).toBe(true);
        }

        if (exitCode === 2) {
          expect(output).toContain("github.com/rp1-run/rp1/releases");
        }
      },
      { timeout: 30000 },
    );

    test(
      "does not execute actual package manager commands in dry-run",
      async () => {
        const startTime = Date.now();

        const { exitCode } = await runCliCommand(["self-update", "--dry-run"]);

        const endTime = Date.now();
        const duration = endTime - startTime;

        expect(duration).toBeLessThan(15000);

        expect([0, 2]).toContain(exitCode);
      },
      { timeout: 30000 },
    );
  });
});
