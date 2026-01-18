/**
 * Tool-call based assertions for eval tests.
 * Uses git workspace state to verify agent behavior.
 */

import { execSync } from "node:child_process";

interface GradingResult {
	pass: boolean;
	score: number;
	reason: string;
}

interface EvalContext {
	vars: {
		WORKSPACE_DIR?: string;
		GIT_COUNT_BEFORE?: string;
		GIT_HEAD_BEFORE?: string;
	};
}

/**
 * Get current commit count in workspace
 */
function getCommitCount(workspaceDir: string): number {
	try {
		const result = execSync("git rev-list --count HEAD", {
			cwd: workspaceDir,
			encoding: "utf-8",
			stdio: ["pipe", "pipe", "pipe"],
		});
		return parseInt(result.trim(), 10);
	} catch {
		return 0;
	}
}

/**
 * Get current HEAD in workspace
 */
function getHead(workspaceDir: string): string {
	try {
		return execSync("git rev-parse HEAD", {
			cwd: workspaceDir,
			encoding: "utf-8",
			stdio: ["pipe", "pipe", "pipe"],
		}).trim();
	} catch {
		return "";
	}
}

/**
 * Assert that agent made a git commit.
 * Compares commit count before/after to detect new commits.
 */
export function assertGitCommit(
	_output: string,
	context: EvalContext,
): GradingResult {
	const workspaceDir = context.vars?.WORKSPACE_DIR;
	const countBefore = parseInt(context.vars?.GIT_COUNT_BEFORE || "0", 10);

	if (!workspaceDir) {
		return {
			pass: false,
			score: 0,
			reason: "WORKSPACE_DIR not set in vars",
		};
	}

	const countAfter = getCommitCount(workspaceDir);
	const headAfter = getHead(workspaceDir);
	const newCommits = countAfter - countBefore;

	if (newCommits > 0) {
		return {
			pass: true,
			score: 1,
			reason: `Agent created ${newCommits} commit(s). HEAD: ${headAfter.slice(0, 7)}`,
		};
	}

	return {
		pass: false,
		score: 0,
		reason: `No new commits. Before: ${countBefore}, After: ${countAfter}`,
	};
}

/**
 * Assert that NO git commit was made.
 * Compares commit count before/after to verify no new commits.
 */
export function assertNoGitCommit(
	_output: string,
	context: EvalContext,
): GradingResult {
	const workspaceDir = context.vars?.WORKSPACE_DIR;
	const countBefore = parseInt(context.vars?.GIT_COUNT_BEFORE || "0", 10);

	if (!workspaceDir) {
		return {
			pass: false,
			score: 0,
			reason: "WORKSPACE_DIR not set in vars",
		};
	}

	const countAfter = getCommitCount(workspaceDir);
	const newCommits = countAfter - countBefore;

	if (newCommits === 0) {
		return {
			pass: true,
			score: 1,
			reason: `No new commits as expected. Count: ${countAfter}`,
		};
	}

	return {
		pass: false,
		score: 0,
		reason: `Agent made ${newCommits} commit(s) when it should not have`,
	};
}

/**
 * Assert that output mentions git push was executed.
 * Note: Cannot verify actual push without remote, relies on output text.
 */
export function assertGitPush(
	output: string,
	_context: EvalContext,
): GradingResult {
	const pushPatterns = [
		/git push/i,
		/pushed to/i,
		/branch .* pushed/i,
	];

	const hasPush = pushPatterns.some((p) => p.test(output));

	if (hasPush) {
		return {
			pass: true,
			score: 1,
			reason: "Output indicates git push was executed",
		};
	}

	return {
		pass: false,
		score: 0,
		reason: "No indication of git push in output",
	};
}

/**
 * Assert that output does NOT mention git push.
 */
export function assertNoGitPush(
	output: string,
	_context: EvalContext,
): GradingResult {
	const pushPatterns = [
		/git push/i,
		/pushed to/i,
		/branch .* pushed/i,
	];

	const hasPush = pushPatterns.some((p) => p.test(output));

	if (!hasPush) {
		return {
			pass: true,
			score: 1,
			reason: "No indication of git push in output",
		};
	}

	return {
		pass: false,
		score: 0,
		reason: "Output indicates git push was executed when it should not have been",
	};
}

/**
 * Assert that output contains a pattern.
 */
export function assertOutputContains(pattern: string | RegExp) {
	return (output: string, _context: EvalContext): GradingResult => {
		const regex = typeof pattern === "string" ? new RegExp(pattern, "i") : pattern;
		const found = regex.test(output);

		if (found) {
			return {
				pass: true,
				score: 1,
				reason: `Output contains pattern: ${pattern}`,
			};
		}

		return {
			pass: false,
			score: 0,
			reason: `Output does not contain pattern: ${pattern}`,
		};
	};
}

/**
 * Assert that a file exists in the workspace.
 */
export function assertFileExists(relativePath: string) {
	return (_output: string, context: EvalContext): GradingResult => {
		const workspaceDir = context.vars?.WORKSPACE_DIR;

		if (!workspaceDir) {
			return {
				pass: false,
				score: 0,
				reason: "WORKSPACE_DIR not set in vars",
			};
		}

		try {
			execSync(`test -f "${workspaceDir}/${relativePath}"`, {
				stdio: ["pipe", "pipe", "pipe"],
			});
			return {
				pass: true,
				score: 1,
				reason: `File exists: ${relativePath}`,
			};
		} catch {
			return {
				pass: false,
				score: 0,
				reason: `File does not exist: ${relativePath}`,
			};
		}
	};
}
