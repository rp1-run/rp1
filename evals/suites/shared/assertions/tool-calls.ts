/**
 * Tool-call based assertions for eval tests.
 * Uses provider metadata to inspect tool calls made by the agent.
 */

import { execSync } from "node:child_process";
import type { CanonicalTool } from "../tool-names.js";

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
	readonly canonical?: CanonicalTool;
	input: unknown;
	readonly source?: "stream_event" | "assistant" | "opencode";
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
	if (toolCall.name.toLowerCase() !== toolName.toLowerCase()) {
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
			? ((input as BashToolInput).command ?? "")
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

		const toolNameCalls = toolCalls.filter(
			(tc) => tc.name.toLowerCase() === toolName.toLowerCase(),
		);
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
		const toolNameCalls = toolCalls.filter(
			(tc) => tc.name.toLowerCase() === toolName.toLowerCase(),
		);
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
		const regex =
			typeof pattern === "string" ? new RegExp(pattern, "i") : pattern;
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
export const assertGitCommitToolCall = assertToolCall(
	"Bash",
	/\bgit\b.*\bcommit\b/,
);

/**
 * Assert that agent did NOT make a git commit via tool call.
 * Handles git commands with flags before subcommand (e.g., git -C /path commit).
 */
export const assertNoGitCommitToolCall = assertNoToolCall(
	"Bash",
	/\bgit\b.*\bcommit\b/,
);

/**
 * Assert that agent executed a git push via tool call.
 * Handles git commands with flags before subcommand (e.g., git -C /path push).
 */
export const assertGitPushToolCall = assertToolCall(
	"Bash",
	/\bgit\b.*\bpush\b/,
);

/**
 * Assert that agent did NOT execute a git push via tool call.
 * Handles git commands with flags before subcommand (e.g., git -C /path push).
 */
export const assertNoGitPushToolCall = assertNoToolCall(
	"Bash",
	/\bgit\b.*\bpush\b/,
);

/**
 * Assert that agent created a worktree via rp1 agent-tools.
 */
export const assertWorktreeCreateToolCall = assertToolCall(
	"Bash",
	/rp1\s+agent-tools\s+worktree\s+create/,
);

/**
 * Assert that a tool was called using its canonical name.
 * Matches across providers (e.g., "shell" matches Bash, bash, functions.exec_command).
 */
export function assertCanonicalToolCall(
	canonicalName: CanonicalTool,
	matcher?: Matcher<Record<string, unknown>>,
): AssertionFunction {
	return (_output: string, context: ToolCallEvalContext): GradingResult => {
		const toolCalls = getToolCalls(context);

		if (toolCalls.length === 0) {
			return {
				pass: false,
				score: 0,
				reason: "No tool calls captured in provider metadata",
			};
		}

		const matchingCall = toolCalls.find((tc) => {
			if (tc.canonical !== canonicalName) return false;
			if (matcher === undefined) return true;

			const input = tc.input as Record<string, unknown>;
			if (typeof matcher === "function") return matcher(input);

			const targetString =
				canonicalName === "shell"
					? ((input as { command?: string }).command ?? "")
					: JSON.stringify(input);

			if (typeof matcher === "string") return targetString.includes(matcher);
			return matcher.test(targetString);
		});

		if (matchingCall) {
			const matcherDesc =
				matcher !== undefined ? ` matching ${String(matcher)}` : "";
			return {
				pass: true,
				score: 1,
				reason: `Found canonical ${canonicalName} tool call${matcherDesc}`,
			};
		}

		const canonicalCalls = toolCalls.filter(
			(tc) => tc.canonical === canonicalName,
		);
		const matcherDesc =
			matcher !== undefined ? ` matching ${String(matcher)}` : "";

		if (canonicalCalls.length === 0) {
			return {
				pass: false,
				score: 0,
				reason: `No canonical ${canonicalName} tool calls found. Total tool calls: ${toolCalls.length}`,
			};
		}

		return {
			pass: false,
			score: 0,
			reason: `Found ${canonicalCalls.length} canonical ${canonicalName} call(s), but none${matcherDesc}`,
		};
	};
}

// ─────────────────────────────────────────────────────────────────────
// Domain-specific assertions (rp1 workflow patterns)
// ─────────────────────────────────────────────────────────────────────

/** Assert emit status_change was called with --run-id flag. */
export const assertWorkStatusUpdate = assertToolCall(
	"Bash",
	(input) =>
		input.command.includes("rp1 agent-tools emit") &&
		input.command.includes("--type status_change") &&
		input.command.includes("--run-id"),
);

/** Assert artifact registration was called via bash. */
export const assertArtifactRegistration = assertToolCall(
	"Bash",
	(input) =>
		input.command.includes("rp1 agent-tools emit") &&
		input.command.includes("--type artifact_registered") &&
		input.command.includes("--run-id"),
);

/** Assert no artifact registration (e.g., large scope redirects). */
export const assertNoArtifactRegistration = assertNoToolCall(
	"Bash",
	/rp1\s+agent-tools\s+emit.*--type\s+artifact_registered/,
);

/** Assert a specific subagent was spawned (name in tool call input). */
export function assertSubagentSpawned(agentName: string): AssertionFunction {
	return (_output, context) => {
		const tcs = getToolCalls(context);
		const subagentNames = ["Task", "task", "Agent", "agent"];
		const found = tcs.some(
			(tc) =>
				subagentNames.includes(tc.name) &&
				JSON.stringify(tc.input).includes(agentName),
		);
		if (!found)
			return {
				pass: false,
				score: 0,
				reason: `No ${agentName} subagent spawn found`,
			};
		return { pass: true, score: 1, reason: `${agentName} spawned` };
	};
}

/** Assert first subagent spawned matches expected name. */
export function assertFirstSubagent(expectedName: string): AssertionFunction {
	return (_output, context) => {
		const tcs = getToolCalls(context);
		const subagentNames = ["Task", "task", "Agent", "agent"];
		const subagentCalls = tcs.filter((tc) => subagentNames.includes(tc.name));
		const first = subagentCalls[0];
		if (!first)
			return { pass: false, score: 0, reason: "No subagent calls found" };
		const input = JSON.stringify(first.input);
		if (!input.includes(expectedName))
			return {
				pass: false,
				score: 0,
				reason: `First subagent did not match ${expectedName}`,
			};
		return { pass: true, score: 1, reason: `${expectedName} spawned first` };
	};
}

/** Assert no Write/Edit tool calls (e.g., large scope redirects). */
export const assertNoWriteEdit: AssertionFunction = (_output, context) => {
	const tcs = getToolCalls(context);
	const found = tcs.find((tc) =>
		["write", "edit"].includes(tc.name.toLowerCase()),
	);
	if (found)
		return {
			pass: false,
			score: 0,
			reason: `Found ${found.name} tool call — should not implement`,
		};
	return { pass: true, score: 1, reason: "No Write/Edit tool calls found" };
};

/** Assert no AskUserQuestion calls (AFK mode). Cross-provider: matches both AskUserQuestion and question. */
export const assertNoAskUser: AssertionFunction = (_output, context) => {
	const tcs = getToolCalls(context);
	const found = tcs.find(
		(tc) => tc.name === "AskUserQuestion" || tc.canonical === "ask_user",
	);
	if (found)
		return {
			pass: false,
			score: 0,
			reason: `Found ${found.name} tool call when none was expected (AFK mode)`,
		};
	return { pass: true, score: 1, reason: "No AskUserQuestion calls found" };
};

/** Assert AskUserQuestion checkpoint with Continue/Revise/Stop options. Cross-provider: matches both AskUserQuestion and question. */
export const assertAskUserCheckpoint: AssertionFunction = (
	_output,
	context,
) => {
	const tcs = getToolCalls(context);
	const askCalls = tcs.filter(
		(tc) => tc.name === "AskUserQuestion" || tc.canonical === "ask_user",
	);
	const hasPlanReview = askCalls.some((tc) => {
		const input = JSON.stringify(tc.input);
		return (
			input.includes("Continue") &&
			(input.includes("Revise") || input.includes("Stop"))
		);
	});
	if (!hasPlanReview)
		return {
			pass: false,
			score: 0,
			reason:
				"No plan review checkpoint (AskUserQuestion with Continue/Revise/Stop)",
		};
	return { pass: true, score: 1, reason: "Plan review checkpoint fired" };
};

/** Assert post-implementation checkpoint (Done/Add options). Cross-provider: matches both AskUserQuestion and question. */
export const assertPostImplCheckpoint: AssertionFunction = (
	_output,
	context,
) => {
	const tcs = getToolCalls(context);
	const askCalls = tcs.filter(
		(tc) => tc.name === "AskUserQuestion" || tc.canonical === "ask_user",
	);
	const hasPostImpl = askCalls.some((tc) => {
		const input = JSON.stringify(tc.input);
		return input.includes("Done") && input.includes("Add");
	});
	if (!hasPostImpl)
		return {
			pass: false,
			score: 0,
			reason:
				"No post-implementation checkpoint (AskUserQuestion with Done/Add)",
		};
	return {
		pass: true,
		score: 1,
		reason: "Post-implementation checkpoint fired",
	};
};

/** Assert worktree cleanup was called. */
export const assertWorktreeCleanupToolCall = assertToolCall(
	"Bash",
	/rp1\s+agent-tools\s+worktree\s+cleanup/,
);

/**
 * Assert PROHIBITED git commands not present.
 * Configurable list of prohibited patterns.
 */
export function assertNoProhibitedCommands(
	prohibited?: Array<{ pattern: RegExp; label: string }>,
): AssertionFunction {
	const defaults = [
		{ pattern: /\bgit\s+init\b/, label: "git init" },
		{ pattern: /\bgit\s+rebase\b/, label: "git rebase" },
		{ pattern: /\bgit\s+reset\s+--hard\b/, label: "git reset --hard" },
		{ pattern: /\bgit\s+push\b/, label: "git push" },
		{ pattern: /\bgit\b.*\bcommit\b/, label: "git commit" },
	];
	const rules = prohibited ?? defaults;

	return (_output, context) => {
		const cmds = context.providerResponse?.metadata?.bashCommands ?? [];
		for (const { pattern, label } of rules) {
			const found = cmds.find((c) => pattern.test(c));
			if (found)
				return {
					pass: false,
					score: 0,
					reason: `Prohibited command found: ${label}`,
				};
		}
		return { pass: true, score: 1, reason: "No prohibited commands found" };
	};
}

/**
 * Assert that a tool was NOT called using its canonical name.
 * Matches across providers (e.g., "ask_user" matches AskUserQuestion, question).
 */
export function assertNoCanonicalToolCall(
	canonicalName: CanonicalTool,
	matcher?: Matcher<Record<string, unknown>>,
): AssertionFunction {
	return (_output: string, context: ToolCallEvalContext): GradingResult => {
		const toolCalls = getToolCalls(context);

		const matchingCall = toolCalls.find((tc) => {
			if (tc.canonical !== canonicalName) return false;
			if (matcher === undefined) return true;

			const input = tc.input as Record<string, unknown>;
			if (typeof matcher === "function") return matcher(input);

			const targetString =
				canonicalName === "shell"
					? ((input as { command?: string }).command ?? "")
					: JSON.stringify(input);

			if (typeof matcher === "string") return targetString.includes(matcher);
			return matcher.test(targetString);
		});

		if (!matchingCall) {
			const matcherDesc =
				matcher !== undefined ? ` matching ${String(matcher)}` : "";
			return {
				pass: true,
				score: 1,
				reason: `No canonical ${canonicalName} tool call${matcherDesc} found as expected`,
			};
		}

		const matcherDesc =
			matcher !== undefined ? ` matching ${String(matcher)}` : "";
		return {
			pass: false,
			score: 0,
			reason: `Found canonical ${canonicalName} tool call${matcherDesc} when none was expected`,
		};
	};
}

// ─────────────────────────────────────────────────────────────────────
// Pre-built instances for YAML file:// references
// ─────────────────────────────────────────────────────────────────────

/** Assert task-builder subagent was spawned. */
export const assertTaskBuilderSpawned = assertSubagentSpawned("task-builder");

/** Assert task-reviewer subagent was spawned. */
export const assertTaskReviewerSpawned = assertSubagentSpawned("task-reviewer");

/** Assert speedrun-builder subagent was spawned. */
export const assertSpeedrunBuilderSpawned =
	assertSubagentSpawned("speedrun-builder");

/** Assert build-fast-planner subagent was spawned. */
export const assertBuildFastPlannerSpawned =
	assertSubagentSpawned("build-fast-planner");

/** Assert artifact-detector spawned first. */
export const assertArtifactDetectorFirst =
	assertFirstSubagent("artifact-detector");

/** Default prohibited commands (no git init/rebase/reset --hard/push/commit). */
export const assertDefaultProhibited = assertNoProhibitedCommands();

/** Prohibited commands for build workflow (allows commit/push when flags set). */
export const assertBuildProhibited = assertNoProhibitedCommands([
	{ pattern: /git push (--force|-f)/, label: "git push --force" },
	{ pattern: /\bgit\s+reset\s+--hard\b/, label: "git reset --hard" },
	{ pattern: /\bgit\s+rebase\b/, label: "git rebase" },
	{ pattern: /\bgit\s+init\b/, label: "git init" },
]);

/** Assert a general sub-agent was spawned (not a named rp1-dev agent like build-fast-planner or task-builder). */
export const assertGeneralSubagentSpawned: AssertionFunction = (
	_output,
	context,
) => {
	const tcs = getToolCalls(context);
	const subagentNames = ["Task", "task", "Agent", "agent"];
	const subagentCalls = tcs.filter((tc) => subagentNames.includes(tc.name));
	if (subagentCalls.length === 0) {
		return { pass: false, score: 0, reason: "No sub-agent spawned" };
	}
	const usesNamedAgent = subagentCalls.some((tc) => {
		const input = JSON.stringify(tc.input);
		return (
			input.includes("build-fast-planner") || input.includes("task-builder")
		);
	});
	if (usesNamedAgent) {
		return {
			pass: false,
			score: 0,
			reason: "Used named build-fast agents instead of general sub-agent",
		};
	}
	return {
		pass: true,
		score: 1,
		reason: "General sub-agent spawned correctly",
	};
};

/** Assert no sub-agent was spawned for implementation (scope redirect case). */
export const assertNoImplSubagentSpawned: AssertionFunction = (
	_output,
	context,
) => {
	const tcs = getToolCalls(context);
	const subagentNames = ["Task", "task", "Agent", "agent"];
	const implAgents = tcs.filter((tc) => {
		if (!subagentNames.includes(tc.name)) return false;
		const input = JSON.stringify(tc.input);
		return input.toLowerCase().includes("implement");
	});
	if (implAgents.length > 0) {
		return {
			pass: false,
			score: 0,
			reason: "Sub-agent spawned for implementation despite medium/large scope",
		};
	}
	return {
		pass: true,
		score: 1,
		reason: "No implementation sub-agent spawned for medium/large request",
	};
};
