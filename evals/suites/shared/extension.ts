/**
 * Shared promptfoo extension hooks
 * Provides workspace isolation for tests
 */

import { execSync } from "node:child_process";
import { rmSync, mkdirSync, writeFileSync } from "node:fs";

// Fixed workspace directory
export const WORKSPACE_DIR = "/tmp/rp1-eval-workspace";

// File where hooks write bash commands
export const BASH_COMMANDS_FILE = "/tmp/rp1-eval-bash-commands.txt";

/**
 * Reset the workspace: clean everything and reinitialize git
 */
function resetWorkspace(): void {
  // Remove everything in workspace
  try {
    rmSync(WORKSPACE_DIR, { recursive: true, force: true });
  } catch {
    // Ignore if doesn't exist
  }

  // Clear bash commands log
  try {
    writeFileSync(BASH_COMMANDS_FILE, "");
  } catch {
    // Ignore if can't write
  }

  // Recreate directory structure
  mkdirSync(WORKSPACE_DIR, { recursive: true });
  mkdirSync(`${WORKSPACE_DIR}/src`, { recursive: true });

  // Initialize git repo
  execSync("git init", { cwd: WORKSPACE_DIR, stdio: "pipe" });
  execSync('git config user.email "test@rp1-eval.local"', {
    cwd: WORKSPACE_DIR,
    stdio: "pipe",
  });
  execSync('git config user.name "rp1-eval"', {
    cwd: WORKSPACE_DIR,
    stdio: "pipe",
  });

  // Create initial files
  writeFileSync(`${WORKSPACE_DIR}/README.md`, "# Test Project\n");
  writeFileSync(
    `${WORKSPACE_DIR}/package.json`,
    JSON.stringify({ name: "test-project", version: "1.0.0" }, null, 2),
  );

  // Create .claude directory with hooks to capture bash commands
  mkdirSync(`${WORKSPACE_DIR}/.claude`, { recursive: true });
  writeFileSync(
    `${WORKSPACE_DIR}/.claude/hooks.json`,
    JSON.stringify(
      {
        hooks: {
          PostToolUse: [
            {
              matcher: "Bash",
              hooks: [
                {
                  type: "command",
                  command: `echo "$TOOL_INPUT" | jq -r '.command // empty' >> ${BASH_COMMANDS_FILE}`,
                },
              ],
            },
          ],
        },
      },
      null,
      2,
    ),
  );

  // Initial commit
  execSync("git add .", { cwd: WORKSPACE_DIR, stdio: "pipe" });
  execSync('git commit -m "Initial commit"', {
    cwd: WORKSPACE_DIR,
    stdio: "pipe",
  });
}

/**
 * Get commit count in workspace
 */
function getCommitCount(): number {
  try {
    const result = execSync("git rev-list --count HEAD", {
      cwd: WORKSPACE_DIR,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return parseInt(result.trim(), 10);
  } catch {
    return 0;
  }
}

/**
 * Get HEAD in workspace
 */
function getHead(): string {
  try {
    return execSync("git rev-parse HEAD", {
      cwd: WORKSPACE_DIR,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  } catch {
    return "";
  }
}

interface TestContext {
  test: {
    vars: Record<string, string>;
    description?: string;
  };
  result?: {
    success: boolean;
  };
}

export async function extensionHook(
  hookName: string,
  context: TestContext,
): Promise<TestContext | void> {
  if (hookName === "beforeEach") {
    // Reset workspace to clean state
    console.log(
      `[rp1-eval] Resetting workspace for "${context.test.description}"`,
    );
    resetWorkspace();

    // Record initial git state (should be 1 commit after reset)
    const head = getHead();
    const count = getCommitCount();

    context.test.vars.WORKSPACE_DIR = WORKSPACE_DIR;
    context.test.vars.GIT_HEAD_BEFORE = head;
    context.test.vars.GIT_COUNT_BEFORE = String(count);
    context.test.vars.BASH_COMMANDS_FILE = BASH_COMMANDS_FILE;

    console.log(
      `[rp1-eval] Workspace ready: HEAD=${head.slice(0, 7)}, commits=${count}`,
    );
    return context;
  }

  if (hookName === "afterEach") {
    // Log final state for debugging
    const headAfter = getHead();
    const countAfter = getCommitCount();
    const countBefore = parseInt(context.test.vars.GIT_COUNT_BEFORE || "0", 10);

    console.log(
      `[rp1-eval] After "${context.test.description}": HEAD=${headAfter.slice(0, 7)}, commits=${countAfter}, new=${countAfter - countBefore}`,
    );
  }
}
