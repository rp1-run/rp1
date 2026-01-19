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

// ============================================================================
// Tool Input Type Definitions
// ============================================================================

/**
 * Input type for Bash tool calls.
 */
export interface BashToolInput {
	command: string;
	description?: string;
}

/**
 * Input type for Write tool calls.
 */
export interface WriteToolInput {
	file_path: string;
	content: string;
}

/**
 * Input type for Read tool calls.
 */
export interface ReadToolInput {
	file_path: string;
	limit?: number;
	offset?: number;
}

/**
 * Input type for Edit tool calls.
 */
export interface EditToolInput {
	file_path: string;
	old_string: string;
	new_string: string;
}

/**
 * Input type for Glob tool calls.
 */
export interface GlobToolInput {
	pattern: string;
	path?: string;
}

/**
 * Input type for Grep tool calls.
 */
export interface GrepToolInput {
	pattern: string;
	path?: string;
	type?: string;
}

/**
 * Input type for AskUserQuestion tool calls.
 */
export interface AskUserQuestionInput {
	questions: Array<{
		question: string;
		options: Array<{ label: string }>;
	}>;
}

/**
 * Maps tool names to their corresponding input types.
 */
export interface ToolInputMap {
	Bash: BashToolInput;
	Write: WriteToolInput;
	Read: ReadToolInput;
	Edit: EditToolInput;
	Glob: GlobToolInput;
	Grep: GrepToolInput;
	AskUserQuestion: AskUserQuestionInput;
}

/**
 * Union type of all supported tool names.
 */
export type ToolName = keyof ToolInputMap;

/**
 * Generic matcher type for tool input assertions.
 * - string: matches against the target field (command for Bash, JSON.stringify for others)
 * - RegExp: matches against the target field
 * - function: receives strongly-typed input and returns boolean
 */
export type Matcher<T> = string | RegExp | ((input: T) => boolean);

// ============================================================================
// Tool Call Types (matches provider metadata structure)
// ============================================================================

/**
 * Represents a captured tool call from the provider.
 */
export interface ToolCall {
	readonly id: string;
	readonly name: string;
	input: unknown;
	readonly source?: "stream_event" | "assistant";
}

/**
 * Provider metadata containing captured tool calls.
 */
export interface ProviderMetadata {
	readonly toolCalls: readonly ToolCall[];
	readonly bashCommands: readonly string[];
	readonly toolCallCount: number;
}

/**
 * Extended context type that includes provider response metadata.
 */
export interface ToolCallEvalContext extends EvalContext {
	providerResponse?: {
		metadata?: ProviderMetadata;
	};
}

/**
 * Assertion function type returned by factory functions.
 */
export type AssertionFunction = (
	output: string,
	context: ToolCallEvalContext,
) => GradingResult;

// ============================================================================
// Generic Tool Call Assertion Functions
// ============================================================================

/**
 * Get tool calls from the provider metadata.
 */
function getToolCalls(context: ToolCallEvalContext): readonly ToolCall[] {
	return context.providerResponse?.metadata?.toolCalls ?? [];
}

/**
 * Check if a tool call matches the given matcher.
 * For Bash tool: string/RegExp matches against input.command
 * For other tools: string/RegExp matches against JSON.stringify(input)
 */
function matchesToolCall<T extends ToolName>(
	toolCall: ToolCall,
	toolName: T,
	matcher?: Matcher<ToolInputMap[T]>,
): boolean {
	if (toolCall.name !== toolName) {
		return false;
	}

	if (matcher === undefined) {
		return true;
	}

	const input = toolCall.input as ToolInputMap[T];

	if (typeof matcher === "function") {
		return matcher(input);
	}

	// For Bash, match against command field
	// For others, match against JSON.stringify(input)
	const targetString =
		toolName === "Bash"
			? (input as BashToolInput).command ?? ""
			: JSON.stringify(input);

	if (typeof matcher === "string") {
		return targetString.includes(matcher);
	}

	// RegExp
	return matcher.test(targetString);
}

/**
 * Assert that a tool was called with an optional matching input.
 * Returns an assertion function for use in eval configs.
 *
 * @example
 * // Assert any Bash call
 * assertToolCall('Bash')
 *
 * // Assert Bash call with command containing "git commit"
 * assertToolCall('Bash', /git\s+commit/)
 *
 * // Assert Write call with typed input matcher
 * assertToolCall('Write', (input) => input.file_path.endsWith('.ts'))
 */
export function assertToolCall<T extends ToolName>(
	toolName: T,
	matcher?: Matcher<ToolInputMap[T]>,
): AssertionFunction {
	return (_output: string, context: ToolCallEvalContext): GradingResult => {
		const toolCalls = getToolCalls(context);

		if (toolCalls.length === 0) {
			return {
				pass: false,
				score: 0,
				reason: `No tool calls captured in provider metadata`,
			};
		}

		const matchingCall = toolCalls.find((tc) =>
			matchesToolCall(tc, toolName, matcher),
		);

		if (matchingCall) {
			const matcherDesc =
				matcher !== undefined ? ` matching ${String(matcher)}` : "";
			return {
				pass: true,
				score: 1,
				reason: `Found ${toolName} tool call${matcherDesc}`,
			};
		}

		const toolNameCalls = toolCalls.filter((tc) => tc.name === toolName);
		const matcherDesc =
			matcher !== undefined ? ` matching ${String(matcher)}` : "";

		if (toolNameCalls.length === 0) {
			return {
				pass: false,
				score: 0,
				reason: `No ${toolName} tool calls found. Total tool calls: ${toolCalls.length}`,
			};
		}

		return {
			pass: false,
			score: 0,
			reason: `Found ${toolNameCalls.length} ${toolName} call(s), but none${matcherDesc}`,
		};
	};
}

/**
 * Assert that a tool was NOT called, or not called with a matching input.
 * Returns an assertion function for use in eval configs.
 *
 * @example
 * // Assert no git push command
 * assertNoToolCall('Bash', /git\s+push/)
 *
 * // Assert Write was never called
 * assertNoToolCall('Write')
 */
export function assertNoToolCall<T extends ToolName>(
	toolName: T,
	matcher?: Matcher<ToolInputMap[T]>,
): AssertionFunction {
	return (_output: string, context: ToolCallEvalContext): GradingResult => {
		const toolCalls = getToolCalls(context);

		const matchingCall = toolCalls.find((tc) =>
			matchesToolCall(tc, toolName, matcher),
		);

		if (!matchingCall) {
			const matcherDesc =
				matcher !== undefined ? ` matching ${String(matcher)}` : "";
			return {
				pass: true,
				score: 1,
				reason: `No ${toolName} tool call${matcherDesc} found as expected`,
			};
		}

		const matcherDesc =
			matcher !== undefined ? ` matching ${String(matcher)}` : "";
		return {
			pass: false,
			score: 0,
			reason: `Found ${toolName} tool call${matcherDesc} when none was expected`,
		};
	};
}

/**
 * Assert that a tool was called an exact number of times.
 * Returns an assertion function for use in eval configs.
 *
 * @example
 * // Assert exactly 2 Bash calls
 * assertToolCallCount('Bash', 2)
 *
 * // Assert no Write calls
 * assertToolCallCount('Write', 0)
 */
export function assertToolCallCount<T extends ToolName>(
	toolName: T,
	count: number,
): AssertionFunction {
	return (_output: string, context: ToolCallEvalContext): GradingResult => {
		const toolCalls = getToolCalls(context);
		const toolNameCalls = toolCalls.filter((tc) => tc.name === toolName);
		const actualCount = toolNameCalls.length;

		if (actualCount === count) {
			return {
				pass: true,
				score: 1,
				reason: `${toolName} called exactly ${count} time(s) as expected`,
			};
		}

		return {
			pass: false,
			score: 0,
			reason: `Expected ${count} ${toolName} call(s), but found ${actualCount}`,
		};
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
