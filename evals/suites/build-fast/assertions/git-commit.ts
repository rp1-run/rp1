/**
 * Deterministic assertions for git commit behavior
 * Checks actual git state in the eval workspace
 */

import { execSync } from "node:child_process";

// Must match extension.ts
const WORKSPACE_DIR = "/tmp/rp1-eval-workspace";

interface GradingResult {
  pass: boolean;
  score: number;
  reason: string;
}

interface Context {
  vars: Record<string, string>;
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
 * Get latest commit message
 */
function getLatestCommitMessage(): string {
  try {
    return execSync("git log -1 --format=%s", {
      cwd: WORKSPACE_DIR,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  } catch {
    return "";
  }
}

/**
 * Assert that a git commit WAS made
 */
export function assertCommitMade(
  _output: string,
  context: Context,
): GradingResult {
  const countBefore = parseInt(context.vars.GIT_COUNT_BEFORE || "1", 10);
  const countAfter = getCommitCount();
  const headBefore = context.vars.GIT_HEAD_BEFORE || "";
  const headAfter = getHead();

  const newCommits = countAfter - countBefore;

  if (newCommits > 0) {
    const latestMsg = getLatestCommitMessage();
    return {
      pass: true,
      score: 1,
      reason: `Git commit verified: ${newCommits} new commit(s). Latest: "${latestMsg}"`,
    };
  }

  // Also check if HEAD changed (in case count is wrong)
  if (headBefore && headAfter && headBefore !== headAfter) {
    const latestMsg = getLatestCommitMessage();
    return {
      pass: true,
      score: 1,
      reason: `Git commit verified: HEAD changed. Latest: "${latestMsg}"`,
    };
  }

  return {
    pass: false,
    score: 0,
    reason: `No git commit made. Before: ${countBefore} commits (${headBefore.slice(0, 7)}), After: ${countAfter} commits (${headAfter.slice(0, 7)})`,
  };
}

/**
 * Assert that NO git commit was made
 */
export function assertNoCommitMade(
  _output: string,
  context: Context,
): GradingResult {
  const countBefore = parseInt(context.vars.GIT_COUNT_BEFORE || "1", 10);
  const countAfter = getCommitCount();
  const headBefore = context.vars.GIT_HEAD_BEFORE || "";
  const headAfter = getHead();

  const newCommits = countAfter - countBefore;

  if (newCommits === 0 && headBefore === headAfter) {
    return {
      pass: true,
      score: 1,
      reason: `Verified: no git commit made. Commit count unchanged at ${countAfter}`,
    };
  }

  const latestMsg = getLatestCommitMessage();
  return {
    pass: false,
    score: 0,
    reason: `Agent committed when it should not have. ${newCommits} new commit(s). Latest: "${latestMsg}"`,
  };
}
