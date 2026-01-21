/**
 * Shared promptfoo extension hooks
 * Provides workspace isolation for tests with local git remote support
 *
 * Creates:
 * - /tmp/rp1-eval-workspace: Working directory with bun project
 * - /tmp/rp1-eval-remote.git: Bare git repo acting as local "remote"
 *
 * This allows agents to safely push/commit without affecting real repos.
 */

import { execSync } from "node:child_process";
import { rmSync, mkdirSync, writeFileSync, copyFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// Fixed workspace directories
export const WORKSPACE_DIR = "/tmp/rp1-eval-workspace";
export const REMOTE_DIR = "/tmp/rp1-eval-remote.git";

// Path to fixture project template
const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = join(__dirname, "fixtures", "bun-project");

/**
 * Recursively copy directory contents
 */
function copyDirSync(src: string, dest: string): void {
  mkdirSync(dest, { recursive: true });
  const entries = readdirSync(src);
  for (const entry of entries) {
    const srcPath = join(src, entry);
    const destPath = join(dest, entry);
    const stat = statSync(srcPath);
    if (stat.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      copyFileSync(srcPath, destPath);
    }
  }
}

/**
 * Create a bare git repo to act as a local remote.
 * This allows agents to push without network access.
 */
function createBareRemote(): void {
  rmSync(REMOTE_DIR, { recursive: true, force: true });
  mkdirSync(REMOTE_DIR, { recursive: true });
  execSync("git init --bare", { cwd: REMOTE_DIR, stdio: "pipe" });
}

/**
 * Reset the workspace: clean everything and reinitialize git with local remote
 */
function resetWorkspace(): void {
  // Remove everything in workspace
  try {
    rmSync(WORKSPACE_DIR, { recursive: true, force: true });
  } catch {
    // Ignore if doesn't exist
  }

  // Create bare remote first
  createBareRemote();

  // Recreate directory structure
  mkdirSync(WORKSPACE_DIR, { recursive: true });

  // Copy fixture project if it exists, otherwise create minimal structure
  try {
    copyDirSync(FIXTURE_DIR, WORKSPACE_DIR);
  } catch {
    // Fallback: create minimal bun project structure
    mkdirSync(`${WORKSPACE_DIR}/src`, { recursive: true });
    writeFileSync(`${WORKSPACE_DIR}/README.md`, "# Test Project\n");
    writeFileSync(
      `${WORKSPACE_DIR}/package.json`,
      JSON.stringify(
        {
          name: "rp1-eval-project",
          version: "1.0.0",
          type: "module",
          scripts: {
            dev: "bun run src/index.ts",
            test: "bun test",
            lint: "echo 'No linter configured'",
            format: "echo 'No formatter configured'",
          },
          devDependencies: {
            "@types/bun": "latest",
          },
        },
        null,
        2,
      ),
    );
    writeFileSync(
      `${WORKSPACE_DIR}/src/index.ts`,
      '// Entry point\nconsole.log("Hello from rp1-eval-project");\n',
    );
    writeFileSync(
      `${WORKSPACE_DIR}/tsconfig.json`,
      JSON.stringify(
        {
          compilerOptions: {
            target: "ES2022",
            module: "ESNext",
            moduleResolution: "bundler",
            strict: true,
            skipLibCheck: true,
            types: ["bun-types"],
          },
          include: ["src/**/*"],
        },
        null,
        2,
      ),
    );
  }

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

  // Set up local remote - this allows agents to push safely
  execSync(`git remote add origin ${REMOTE_DIR}`, {
    cwd: WORKSPACE_DIR,
    stdio: "pipe",
  });

  // Initial commit
  execSync("git add .", { cwd: WORKSPACE_DIR, stdio: "pipe" });
  execSync('git commit -m "Initial commit"', {
    cwd: WORKSPACE_DIR,
    stdio: "pipe",
  });

  // Push to local remote to establish tracking
  execSync("git push -u origin main", {
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

/**
 * Get remote HEAD for comparison
 */
function getRemoteHead(): string {
  try {
    return execSync("git rev-parse refs/heads/main", {
      cwd: REMOTE_DIR,
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
    const remoteHead = getRemoteHead();

    context.test.vars.WORKSPACE_DIR = WORKSPACE_DIR;
    context.test.vars.REMOTE_DIR = REMOTE_DIR;
    context.test.vars.GIT_HEAD_BEFORE = head;
    context.test.vars.GIT_COUNT_BEFORE = String(count);
    context.test.vars.GIT_REMOTE_HEAD_BEFORE = remoteHead;

    console.log(
      `[rp1-eval] Workspace ready: HEAD=${head.slice(0, 7)}, commits=${count}, remote=${remoteHead.slice(0, 7)}`,
    );
    return context;
  }

  if (hookName === "afterEach") {
    // Log final state for debugging
    const headAfter = getHead();
    const countAfter = getCommitCount();
    const countBefore = parseInt(context.test.vars.GIT_COUNT_BEFORE || "0", 10);
    const remoteHeadAfter = getRemoteHead();
    const remoteHeadBefore = context.test.vars.GIT_REMOTE_HEAD_BEFORE || "";

    const remotePushed = remoteHeadAfter !== remoteHeadBefore;

    console.log(
      `[rp1-eval] After "${context.test.description}": HEAD=${headAfter.slice(0, 7)}, commits=${countAfter}, new=${countAfter - countBefore}, pushed=${remotePushed}`,
    );
  }
}
