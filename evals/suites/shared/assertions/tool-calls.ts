/**
 * Tool-call based assertions for eval tests.
 * Uses provider metadata to inspect tool calls made by the agent.
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

/**
 * Assert that agent made a git commit via tool call.
 * Handles git commands with flags before subcommand (e.g., git -C /path commit).
 */
export const assertGitCommitToolCall = assertToolCall("Bash", /\bgit\b.*\bcommit\b/);

/**
 * Assert that agent did NOT make a git commit via tool call.
 * Handles git commands with flags before subcommand (e.g., git -C /path commit).
 */
export const assertNoGitCommitToolCall = assertNoToolCall("Bash", /\bgit\b.*\bcommit\b/);

/**
 * Assert that agent executed a git push via tool call.
 * Handles git commands with flags before subcommand (e.g., git -C /path push).
 */
export const assertGitPushToolCall = assertToolCall("Bash", /\bgit\b.*\bpush\b/);

/**
 * Assert that agent did NOT execute a git push via tool call.
 * Handles git commands with flags before subcommand (e.g., git -C /path push).
 */
export const assertNoGitPushToolCall = assertNoToolCall("Bash", /\bgit\b.*\bpush\b/);

/**
 * Assert that agent created a worktree via rp1 agent-tools.
 */
export const assertWorktreeCreateToolCall = assertToolCall("Bash", /rp1\s+agent-tools\s+worktree\s+create/);
