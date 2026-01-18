/**
 * Tool-call based assertions for eval tests.
 * Uses git workspace state and hook-captured bash commands to verify agent behavior.
 */

import { execSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";

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
		BASH_COMMANDS_FILE?: string;
	};
}

/**
 * Read bash commands captured by hooks during test execution.
 */
function getBashCommands(bashCommandsFile?: string): string[] {
	if (!bashCommandsFile || !existsSync(bashCommandsFile)) {
		return [];
	}
	try {
		const content = readFileSync(bashCommandsFile, "utf-8");
		return content.split("\n").filter((line) => line.trim());
	} catch {
		return [];
	}
}

/**
 * Check if any bash command matches a pattern.
 */
function hasBashCommand(commands: string[], pattern: string | RegExp): boolean {
	const regex = typeof pattern === "string" ? new RegExp(pattern, "i") : pattern;
	return commands.some((cmd) => regex.test(cmd));
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
 * Checks both workspace state AND captured bash commands for verification.
 */
export function assertGitCommit(
	_output: string,
	context: EvalContext,
): GradingResult {
	const workspaceDir = context.vars?.WORKSPACE_DIR;
	const countBefore = parseInt(context.vars?.GIT_COUNT_BEFORE || "0", 10);
	const bashCommands = getBashCommands(context.vars?.BASH_COMMANDS_FILE);

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
	const hasGitCommitCommand = hasBashCommand(bashCommands, /git\s+commit/);

	// Primary check: did commit count increase?
	if (newCommits > 0) {
		const cmdInfo = hasGitCommitCommand ? " (git commit command captured)" : "";
		return {
			pass: true,
			score: 1,
			reason: `Agent created ${newCommits} commit(s). HEAD: ${headAfter.slice(0, 7)}${cmdInfo}`,
		};
	}

	// Fallback: check if git commit command was at least attempted
	if (hasGitCommitCommand) {
		return {
			pass: true,
			score: 0.5,
			reason: "Git commit command was executed but no new commits detected",
		};
	}

	return {
		pass: false,
		score: 0,
		reason: `No new commits. Before: ${countBefore}, After: ${countAfter}. Commands: ${bashCommands.length}`,
	};
}

/**
 * Assert that NO git commit was made.
 * Checks both workspace state AND captured bash commands for verification.
 */
export function assertNoGitCommit(
	_output: string,
	context: EvalContext,
): GradingResult {
	const workspaceDir = context.vars?.WORKSPACE_DIR;
	const countBefore = parseInt(context.vars?.GIT_COUNT_BEFORE || "0", 10);
	const bashCommands = getBashCommands(context.vars?.BASH_COMMANDS_FILE);

	if (!workspaceDir) {
		return {
			pass: false,
			score: 0,
			reason: "WORKSPACE_DIR not set in vars",
		};
	}

	const countAfter = getCommitCount(workspaceDir);
	const newCommits = countAfter - countBefore;
	const hasGitCommitCommand = hasBashCommand(bashCommands, /git\s+commit/);

	if (newCommits === 0 && !hasGitCommitCommand) {
		return {
			pass: true,
			score: 1,
			reason: `No new commits as expected. No git commit commands captured.`,
		};
	}

	if (newCommits === 0 && hasGitCommitCommand) {
		// Command was run but failed or was dry-run
		return {
			pass: true,
			score: 0.8,
			reason: `No new commits, but git commit command was captured (may have failed)`,
		};
	}

	return {
		pass: false,
		score: 0,
		reason: `Agent made ${newCommits} commit(s) when it should not have`,
	};
}

/**
 * Assert that git push command was executed.
 * Checks captured bash commands from hooks.
 */
export function assertGitPush(
	_output: string,
	context: EvalContext,
): GradingResult {
	const bashCommands = getBashCommands(context.vars?.BASH_COMMANDS_FILE);
	const hasGitPush = hasBashCommand(bashCommands, /git\s+push/);

	if (hasGitPush) {
		return {
			pass: true,
			score: 1,
			reason: "Git push command was executed",
		};
	}

	return {
		pass: false,
		score: 0,
		reason: `No git push command found. Commands captured: ${bashCommands.length}`,
	};
}

/**
 * Assert that NO git push command was executed.
 */
export function assertNoGitPush(
	_output: string,
	context: EvalContext,
): GradingResult {
	const bashCommands = getBashCommands(context.vars?.BASH_COMMANDS_FILE);
	const hasGitPush = hasBashCommand(bashCommands, /git\s+push/);

	if (!hasGitPush) {
		return {
			pass: true,
			score: 1,
			reason: "No git push command was executed",
		};
	}

	return {
		pass: false,
		score: 0,
		reason: "Git push command was executed when it should not have been",
	};
}

/**
 * Assert that a specific bash command pattern was executed.
 * Factory function that returns an assertion.
 */
export function assertBashCommandExecuted(pattern: string | RegExp) {
	return (_output: string, context: EvalContext): GradingResult => {
		const bashCommands = getBashCommands(context.vars?.BASH_COMMANDS_FILE);
		const found = hasBashCommand(bashCommands, pattern);

		if (found) {
			return {
				pass: true,
				score: 1,
				reason: `Bash command matching '${pattern}' was executed`,
			};
		}

		return {
			pass: false,
			score: 0,
			reason: `No bash command matching '${pattern}' found. Commands: ${bashCommands.join("; ").slice(0, 200)}`,
		};
	};
}

/**
 * Assert that a specific bash command pattern was NOT executed.
 */
export function assertNoBashCommand(pattern: string | RegExp) {
	return (_output: string, context: EvalContext): GradingResult => {
		const bashCommands = getBashCommands(context.vars?.BASH_COMMANDS_FILE);
		const found = hasBashCommand(bashCommands, pattern);

		if (!found) {
			return {
				pass: true,
				score: 1,
				reason: `No bash command matching '${pattern}' was executed`,
			};
		}

		return {
			pass: false,
			score: 0,
			reason: `Bash command matching '${pattern}' was executed when it should not have been`,
		};
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
