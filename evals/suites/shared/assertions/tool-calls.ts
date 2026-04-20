/**
 * Tool-call based assertions for eval tests.
 * Uses provider metadata to inspect tool calls made by the agent.
 */

import { execSync } from "node:child_process";
import { type CanonicalTool, toCanonical } from "../tool-names.ts";

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
		PROMPT_NAME?: string;
		AGENT_TYPE?: string;
		COMPLEXITY?: string;
		PLUGIN?: string;
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
	readonly output?: unknown;
	readonly is_error?: boolean;
	readonly parentToolUseId?: string | null;
	readonly source?: "stream_event" | "assistant" | "opencode";
}

/**
 * Provider metadata containing captured tool calls.
 */
export interface ProviderMetadata {
	readonly toolCalls: readonly ToolCall[];
	readonly bashCommands?: readonly string[];
	readonly toolCallCount?: number;
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
 * Computes canonical names on-the-fly when not already provided.
 */
function getToolCalls(context: ToolCallEvalContext): readonly ToolCall[] {
	const raw = context.providerResponse?.metadata?.toolCalls ?? [];
	return raw.map((tc) => ({
		...tc,
		canonical: tc.canonical ?? toCanonical(tc.name),
	}));
}

/**
 * Derive bash commands from provider metadata.
 * Uses pre-computed bashCommands when available (custom provider),
 * otherwise extracts commands from Bash tool calls (stock provider).
 */
export function getBashCommands(
	context: ToolCallEvalContext,
): readonly string[] {
	if (context.providerResponse?.metadata?.bashCommands) {
		return context.providerResponse.metadata.bashCommands;
	}
	return getToolCalls(context)
		.filter((tc) => tc.name === "Bash" || tc.name === "bash")
		.map((tc) => (tc.input as { command?: string })?.command ?? "")
		.filter((cmd) => cmd.length > 0);
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

// ParentToolUseId filtering helpers (orchestrator vs sub-agent)

/**
 * Filter tool calls to top-level orchestrator calls only.
 * Returns calls where parentToolUseId is null or undefined (not nested).
 */
export function getOrchestratorToolCalls(
	context: ToolCallEvalContext,
): readonly ToolCall[] {
	return getToolCalls(context).filter(
		(tc) => tc.parentToolUseId === null || tc.parentToolUseId === undefined,
	);
}

/**
 * Filter tool calls to nested sub-agent calls only.
 * Returns calls where parentToolUseId is a non-null string.
 */
export function getSubAgentToolCalls(
	context: ToolCallEvalContext,
): readonly ToolCall[] {
	return getToolCalls(context).filter(
		(tc) => tc.parentToolUseId !== null && tc.parentToolUseId !== undefined,
	);
}

/**
 * Assert a tool was called at orchestrator level (parentToolUseId is null/undefined).
 */
export function assertOrchestratorToolCall<T extends ToolName>(
	toolName: T,
	matcher?: Matcher<ToolInputMap[T]>,
): AssertionFunction {
	return (_output: string, context: ToolCallEvalContext): GradingResult => {
		const toolCalls = getOrchestratorToolCalls(context);

		if (toolCalls.length === 0) {
			return {
				pass: false,
				score: 0,
				reason: "No orchestrator-level tool calls found",
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
				reason: `Found orchestrator-level ${toolName} tool call${matcherDesc}`,
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
				reason: `No orchestrator-level ${toolName} tool calls found. Orchestrator calls: ${toolCalls.length}`,
			};
		}

		return {
			pass: false,
			score: 0,
			reason: `Found ${toolNameCalls.length} orchestrator-level ${toolName} call(s), but none${matcherDesc}`,
		};
	};
}

/**
 * Assert a tool was called only by sub-agents (parentToolUseId is not null).
 */
export function assertSubAgentOnlyToolCall<T extends ToolName>(
	toolName: T,
	matcher?: Matcher<ToolInputMap[T]>,
): AssertionFunction {
	return (_output: string, context: ToolCallEvalContext): GradingResult => {
		const subAgentCalls = getSubAgentToolCalls(context);

		if (subAgentCalls.length === 0) {
			return {
				pass: false,
				score: 0,
				reason: "No sub-agent-level tool calls found",
			};
		}

		const matchingCall = subAgentCalls.find((tc) =>
			matchesToolCall(tc, toolName, matcher),
		);

		if (matchingCall) {
			const orchestratorCalls = getOrchestratorToolCalls(context);
			const orchestratorMatch = orchestratorCalls.find((tc) =>
				matchesToolCall(tc, toolName, matcher),
			);

			if (orchestratorMatch) {
				const matcherDesc =
					matcher !== undefined ? ` matching ${String(matcher)}` : "";
				return {
					pass: false,
					score: 0,
					reason: `${toolName}${matcherDesc} was called at both orchestrator and sub-agent level`,
				};
			}

			const matcherDesc =
				matcher !== undefined ? ` matching ${String(matcher)}` : "";
			return {
				pass: true,
				score: 1,
				reason: `Found sub-agent-only ${toolName} tool call${matcherDesc}`,
			};
		}

		const toolNameCalls = subAgentCalls.filter(
			(tc) => tc.name.toLowerCase() === toolName.toLowerCase(),
		);
		const matcherDesc =
			matcher !== undefined ? ` matching ${String(matcher)}` : "";

		if (toolNameCalls.length === 0) {
			return {
				pass: false,
				score: 0,
				reason: `No sub-agent-level ${toolName} tool calls found. Sub-agent calls: ${subAgentCalls.length}`,
			};
		}

		return {
			pass: false,
			score: 0,
			reason: `Found ${toolNameCalls.length} sub-agent-level ${toolName} call(s), but none${matcherDesc}`,
		};
	};
}

// Domain-specific assertions (rp1 workflow patterns)

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
		const cmds = getBashCommands(context);
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

// Pre-built instances for YAML file:// references

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

/** Assert prompt-pipeline-runner subagent was spawned. */
export const assertPipelineRunnerSpawned = assertSubagentSpawned(
	"prompt-pipeline-runner",
);

/** Assert prompt-pipeline-runner was spawned at orchestrator level (not from a nested sub-agent). */
export const assertOrchestratorSpawnedPipelineRunner: AssertionFunction = (
	_output,
	context,
) => {
	const orchestratorCalls = getOrchestratorToolCalls(context);
	const subagentNames = ["Task", "task", "Agent", "agent"];
	const found = orchestratorCalls.some(
		(tc) =>
			subagentNames.includes(tc.name) &&
			JSON.stringify(tc.input).includes("prompt-pipeline-runner"),
	);
	if (!found) {
		return {
			pass: false,
			score: 0,
			reason:
				"No orchestrator-level prompt-pipeline-runner spawn found (checked parentToolUseId)",
		};
	}
	return {
		pass: true,
		score: 1,
		reason: "prompt-pipeline-runner spawned at orchestrator level",
	};
};

/**
 * Assert the three mandatory /create-prompt artifacts exist on disk at the
 * PLUGIN-resolved directory and contain their required structural markers.
 */
export const assertCreatePromptFilesOnDisk: AssertionFunction = (
	_output,
	context,
) => {
	if (!context.vars?.WORKSPACE_DIR) {
		return { pass: false, score: 0, reason: "WORKSPACE_DIR not set in vars" };
	}
	if (!context.vars?.PROMPT_NAME) {
		return { pass: false, score: 0, reason: "PROMPT_NAME not set in vars" };
	}
	const dir = resolveCreatePromptDir(context);
	if (!dir) {
		return {
			pass: false,
			score: 0,
			reason: `Unrecognized PLUGIN=${context.vars?.PLUGIN}`,
		};
	}
	const required = [
		{ name: "SKILL.md", marker: /^---\s*$/m },
		{ name: "evals.yaml", marker: /file:\/\/\.\/SKILL\.md/ },
		{ name: "confidence-report.md", marker: /stage/i },
	];
	const missing: string[] = [];
	for (const { name, marker } of required) {
		const path = `${dir}/${name}`;
		try {
			execSync(`test -f "${path}"`, { stdio: ["pipe", "pipe", "pipe"] });
		} catch {
			missing.push(`${name} (missing file)`);
			continue;
		}
		try {
			const contents = execSync(`cat "${path}"`, { stdio: "pipe" }).toString();
			if (!marker.test(contents)) {
				missing.push(`${name} (missing marker ${marker})`);
			}
		} catch {
			missing.push(`${name} (unreadable)`);
		}
	}
	if (missing.length > 0) {
		return {
			pass: false,
			score: 0,
			reason: `create-prompt artifacts incomplete: ${missing.join(", ")}`,
		};
	}
	return {
		pass: true,
		score: 1,
		reason: `All three create-prompt artifacts present at ${dir}`,
	};
};

/**
 * Resolve the directory create-prompt writes into, honoring PLUGIN.
 * staging (default) -> {WORKSPACE_DIR}/{PROMPT_NAME}
 * rp1-base  -> {WORKSPACE_DIR}/plugins/base/skills/{PROMPT_NAME}
 * rp1-utils -> {WORKSPACE_DIR}/plugins/utils/skills/{PROMPT_NAME}
 * rp1-dev   -> {WORKSPACE_DIR}/plugins/dev/skills/{PROMPT_NAME}
 */
function resolveCreatePromptDir(context: EvalContext): string | null {
	const workspaceDir = context.vars?.WORKSPACE_DIR as string | undefined;
	const promptName = context.vars?.PROMPT_NAME as string | undefined;
	if (!workspaceDir || !promptName) return null;
	const plugin = (context.vars?.PLUGIN as string | undefined) ?? "staging";
	const pluginDir: Record<string, string> = {
		staging: "",
		"rp1-base": "plugins/base/skills/",
		"rp1-utils": "plugins/utils/skills/",
		"rp1-dev": "plugins/dev/skills/",
	};
	const subdir = pluginDir[plugin];
	if (subdir === undefined) return null;
	return `${workspaceDir}/${subdir}${promptName}`;
}

/**
 * Read a generated create-prompt artifact. Directory is resolved by
 * resolveCreatePromptDir (which honors PLUGIN). Returns null if missing.
 */
function readCreatePromptArtifact(
	context: EvalContext,
	fileName: string,
): string | null {
	const dir = resolveCreatePromptDir(context);
	if (!dir) return null;
	try {
		return execSync(`cat "${dir}/${fileName}"`, { stdio: "pipe" }).toString();
	} catch {
		return null;
	}
}

/**
 * The full constitutional primitive vocabulary (from constitution.md). Adding
 * a primitive here requires updating PROFILE_APPLICABLE and Stage 1.
 */
const ALL_PRIMITIVES = [
	"anti-loop",
	"output discipline",
	"role",
	"scope limits",
	"error degradation",
	"truth constraints",
	"transition guards",
	"orchestrator purity",
	"exploration bounds",
	"anti-bias",
] as const;

/**
 * Constitutional applicability set per AGENT_TYPE profile. Must track Stage 1
 * (constitutional-checklist) exactly; add primitives here when Stage 1 changes.
 */
const PROFILE_APPLICABLE: Record<string, readonly string[]> = {
	"leaf-worker": [
		"anti-loop",
		"output discipline",
		"role",
		"scope limits",
		"error degradation",
		"truth constraints",
		"transition guards",
	],
	orchestrator: [
		"role",
		"scope limits",
		"orchestrator purity",
		"error degradation",
		"transition guards",
	],
	"interactive-skill": [
		"output discipline",
		"role",
		"scope limits",
		"exploration bounds",
		"anti-bias",
	],
	"kb-investigator": [
		"role",
		"error degradation",
		"exploration bounds",
		"anti-bias",
		"truth constraints",
	],
};

/** Loose lower-case substring check (each primitive's distinctive word). */
function matchesPrimitive(body: string, primitive: string): boolean {
	const normalized = body.toLowerCase();
	switch (primitive) {
		case "anti-loop":
			return /anti-?loop/.test(normalized);
		case "output discipline":
			return /output\s+discipline/.test(normalized);
		case "role":
			return /\brole\b/.test(normalized);
		case "scope limits":
			return /scope\s+(limits|bound)/.test(normalized);
		case "error degradation":
			return /error\s+(degradation|handling)/.test(normalized);
		case "truth constraints":
			return /truth\s+constraint/.test(normalized);
		case "transition guards":
			return /transition\s+guard/.test(normalized);
		case "orchestrator purity":
			return /orchestrator\s+purity/.test(normalized);
		case "exploration bounds":
			return /exploration\s+bound/.test(normalized);
		case "anti-bias":
			return /anti-?bias/.test(normalized);
		default:
			return normalized.includes(primitive.toLowerCase());
	}
}

/**
 * Assert the generated SKILL.md contains a directive for every primitive in
 * the Stage-1 applicable set for the test's AGENT_TYPE, and carries fallibilist
 * overlay markers. Reads the actual file -- does not trust the agent's reply.
 */
export const assertCreatePromptConstitutional: AssertionFunction = (
	_output,
	context,
) => {
	const contents = readCreatePromptArtifact(context, "SKILL.md");
	if (contents === null) {
		return {
			pass: false,
			score: 0,
			reason: "Generated SKILL.md not readable at {WORKSPACE_DIR}/{PROMPT_NAME}/SKILL.md",
		};
	}
	if (!/^---\s*$/m.test(contents)) {
		return {
			pass: false,
			score: 0,
			reason: "Generated SKILL.md missing YAML frontmatter",
		};
	}
	const agentType =
		(context.vars?.AGENT_TYPE as string | undefined) ?? "leaf-worker";
	const applicable = PROFILE_APPLICABLE[agentType];
	if (!applicable) {
		return {
			pass: false,
			score: 0,
			reason: `Unknown AGENT_TYPE in test: ${agentType}`,
		};
	}
	const missing = applicable.filter((p) => !matchesPrimitive(contents, p));
	if (missing.length > 0) {
		return {
			pass: false,
			score: 0,
			reason: `SKILL.md missing directives for ${agentType} primitives: ${missing.join(", ")}`,
		};
	}
	// Stage 6 non-overreach check: primitives NOT in the profile's applicable
	// set must NOT appear in the generated body. Catches the opposite failure
	// mode from the missing-primitive check above.
	const applicableSet = new Set(applicable);
	const forbidden = ALL_PRIMITIVES.filter((p) => !applicableSet.has(p));
	const overreach = forbidden.filter((p) => matchesPrimitive(contents, p));
	if (overreach.length > 0) {
		return {
			pass: false,
			score: 0,
			reason: `SKILL.md overreaches ${agentType} profile with primitives outside the applicable set: ${overreach.join(", ")}`,
		};
	}
	// Stage 2 + Stage 6 require ALL five fallibilist overlay clauses
	// (conjectural, refut, hard-to-vary, self-immun, error-correction).
	const overlayMarkers: Array<{ name: string; rx: RegExp }> = [
		{ name: "conjectural", rx: /conjectur/i },
		{ name: "refut", rx: /refut/i },
		{ name: "hard-to-vary", rx: /hard-?to-?vary/i },
		{ name: "self-immun", rx: /self-?immun/i },
		{ name: "error-correction", rx: /error-?correction/i },
	];
	const missingOverlay = overlayMarkers
		.filter(({ rx }) => !rx.test(contents))
		.map(({ name }) => name);
	if (missingOverlay.length > 0) {
		return {
			pass: false,
			score: 0,
			reason: `SKILL.md missing fallibilist overlay clauses (Stage 2 requires all five): ${missingOverlay.join(", ")}`,
		};
	}
	return {
		pass: true,
		score: 1,
		reason: `SKILL.md covers all ${applicable.length} applicable primitives for ${agentType}, omits out-of-profile primitives, and carries all five overlay clauses`,
	};
};

/**
 * Assert the generated evals.yaml uses the documented contract: inline
 * providers (not nonexistent external YAML refs), sibling SKILL.md prompt
 * path, and a tests array.
 */
export const assertCreatePromptStructural: AssertionFunction = (
	_output,
	context,
) => {
	const contents = readCreatePromptArtifact(context, "evals.yaml");
	if (contents === null) {
		return {
			pass: false,
			score: 0,
			reason: "Generated evals.yaml not readable",
		};
	}
	const requiredKeys = ["description:", "providers:", "prompts:", "tests:"];
	const missingKeys = requiredKeys.filter((k) => !contents.includes(k));
	if (missingKeys.length > 0) {
		return {
			pass: false,
			score: 0,
			reason: `evals.yaml missing top-level keys: ${missingKeys.join(", ")}`,
		};
	}
	if (!/file:\/\/\.\/SKILL\.md/.test(contents)) {
		return {
			pass: false,
			score: 0,
			reason: "evals.yaml does not reference the sibling `file://./SKILL.md` prompt",
		};
	}
	if (/file:\/\/[^"\n]*providers[^"\n]*\.yaml/.test(contents)) {
		return {
			pass: false,
			score: 0,
			reason: "evals.yaml uses nonexistent external provider YAML refs; providers must be inline",
		};
	}
	if (!/\bid:\s*anthropic:/.test(contents)) {
		return {
			pass: false,
			score: 0,
			reason: "evals.yaml does not declare an inline provider with `id: anthropic:...`",
		};
	}
	return {
		pass: true,
		score: 1,
		reason: "evals.yaml uses sibling SKILL.md ref and inline providers",
	};
};

/**
 * Assert the generated confidence-report.md declares an epistemic stance,
 * embeds the 5-level confidence vocabulary, and scores every pipeline stage.
 */
export const assertCreatePromptEpistemic: AssertionFunction = (
	_output,
	context,
) => {
	const contents = readCreatePromptArtifact(context, "confidence-report.md");
	if (contents === null) {
		return {
			pass: false,
			score: 0,
			reason: "Generated confidence-report.md not readable",
		};
	}
	const stances = [
		/fallibilist\s+empirical/i,
		/interpretivism/i,
		/phenomenology/i,
		/constructivism/i,
		/pragmatism/i,
		/compare-?mode/i,
	];
	if (!stances.some((rx) => rx.test(contents))) {
		return {
			pass: false,
			score: 0,
			reason: "confidence-report.md does not name one of the six epistemic stances",
		};
	}
	// COMPLEXITY gates the confidence-scale expectation. simple = 3 levels
	// (Speculative, Supported, Settled). standard/complex = full 5 levels.
	// When the incoming test var is `auto` (or unset), parse the effective
	// complexity out of the Complexity Classification section of the
	// generated report (the runner records it there in Stage 0.5).
	const incomingComplexity =
		(context.vars?.COMPLEXITY as string | undefined) ?? "standard";
	let complexity = incomingComplexity;
	if (incomingComplexity === "auto") {
		const match = contents.match(
			/\*\*Complexity\*\*:\s*(simple|standard|complex)\b/i,
		);
		if (!match) {
			return {
				pass: false,
				score: 0,
				reason:
					"COMPLEXITY=auto but confidence-report.md has no `**Complexity**: <value>` line in the Complexity Classification section (runner Stage 0.5 did not record its decision)",
			};
		}
		complexity = match[1].toLowerCase();
	}
	const fullScale: Array<{ name: string; rx: RegExp }> = [
		{ name: "Speculative", rx: /\bspeculative\b/i },
		{ name: "Provisional", rx: /\bprovisional\b/i },
		{ name: "Supported", rx: /\bsupported\b/i },
		{ name: "Well-established", rx: /well-?established/i },
		{ name: "Settled", rx: /\bsettled\b/i },
	];
	const simpleScale: Array<{ name: string; rx: RegExp }> = [
		{ name: "Speculative", rx: /\bspeculative\b/i },
		{ name: "Supported", rx: /\bsupported\b/i },
		{ name: "Settled", rx: /\bsettled\b/i },
	];
	const requiredScale = complexity === "simple" ? simpleScale : fullScale;
	const scaleLabel = complexity === "simple" ? "3-level (simple)" : "5-level";
	const missingLevels = requiredScale
		.filter(({ rx }) => !rx.test(contents))
		.map(({ name }) => name);
	if (missingLevels.length > 0) {
		return {
			pass: false,
			score: 0,
			reason: `confidence-report.md missing confidence levels (${scaleLabel} required for COMPLEXITY=${complexity}): ${missingLevels.join(", ")}`,
		};
	}
	// Stage scoring: `simple` skips Stage 4 so popper-patterns scoring is not
	// required. All other stages are still mandatory.
	const requiredStages =
		complexity === "simple"
			? [
					"constitutional-checklist",
					"fallibilist-overlay",
					"epistemic-stance",
					"confidence-schema",
					"prompt-validation",
				]
			: [
					"constitutional-checklist",
					"fallibilist-overlay",
					"epistemic-stance",
					"popper-patterns",
					"confidence-schema",
					"prompt-validation",
				];
	const missingStages = requiredStages.filter((s) => !contents.includes(s));
	if (missingStages.length > 0) {
		return {
			pass: false,
			score: 0,
			reason: `confidence-report.md missing stage scores for: ${missingStages.join(", ")}`,
		};
	}
	return {
		pass: true,
		score: 1,
		reason: `confidence-report.md declares stance, ${scaleLabel} schema, and all ${requiredStages.length} required stage scores`,
	};
};

/**
 * Assert that /create-prompt registered all three mandatory artifacts
 * (SKILL.md, evals.yaml, confidence-report.md) via `rp1 agent-tools emit
 * --type artifact_registered`. Any one missing fails the assertion.
 */
export const assertCreatePromptThreeArtifacts: AssertionFunction = (
	_output,
	context,
) => {
	const tcs = getToolCalls(context);
	const emits = tcs.filter(
		(tc) =>
			tc.name === "Bash" &&
			typeof (tc.input as { command?: unknown }).command === "string" &&
			(tc.input as { command: string }).command.includes(
				"rp1 agent-tools emit",
			) &&
			(tc.input as { command: string }).command.includes(
				"--type artifact_registered",
			),
	);
	const expected = ["SKILL.md", "evals.yaml", "confidence-report.md"];
	const missing = expected.filter(
		(name) =>
			!emits.some((tc) =>
				(tc.input as { command: string }).command.includes(name),
			),
	);
	if (missing.length > 0) {
		return {
			pass: false,
			score: 0,
			reason: `Missing artifact_registered emit for: ${missing.join(", ")}`,
		};
	}
	return {
		pass: true,
		score: 1,
		reason: "All three create-prompt artifacts registered",
	};
};

/** Assert speedrun-builder was spawned at orchestrator level (parentToolUseId is null/undefined). */
export const assertOrchestratorSpawnedSpeedrunBuilder: AssertionFunction = (
	_output,
	context,
) => {
	const orchestratorCalls = getOrchestratorToolCalls(context);
	const subagentNames = ["Task", "task", "Agent", "agent"];
	const found = orchestratorCalls.some(
		(tc) =>
			subagentNames.includes(tc.name) &&
			JSON.stringify(tc.input).includes("speedrun-builder"),
	);
	if (!found) {
		return {
			pass: false,
			score: 0,
			reason:
				"No orchestrator-level speedrun-builder spawn found (checked parentToolUseId)",
		};
	}
	return {
		pass: true,
		score: 1,
		reason: "speedrun-builder spawned at orchestrator level",
	};
};

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

/** Assert no build-fast-planner or task-builder subagent was spawned. */
export const assertNoBuildFastAgents: AssertionFunction = (
	_output,
	context,
) => {
	const tcs = getToolCalls(context);
	const subagentNames = ["Task", "task", "Agent", "agent"];
	const buildFastAgents = tcs.filter((tc) => {
		if (!subagentNames.includes(tc.name)) return false;
		const input = JSON.stringify(tc.input);
		return (
			input.includes("build-fast-planner") || input.includes("task-builder")
		);
	});
	if (buildFastAgents.length > 0) {
		const names = buildFastAgents
			.map((tc) => {
				const input = JSON.stringify(tc.input);
				if (input.includes("build-fast-planner")) return "build-fast-planner";
				return "task-builder";
			})
			.join(", ");
		return {
			pass: false,
			score: 0,
			reason: `Found build-fast agent(s) spawned: ${names}`,
		};
	}
	return {
		pass: true,
		score: 1,
		reason: "No build-fast-planner or task-builder spawned",
	};
};

/** Assert AskUserQuestion was called with commit/refine/new/exit options (post-build prompt). Cross-provider: matches both AskUserQuestion and question. */
export const assertPostBuildPromptOptions: AssertionFunction = (
	output,
	context,
) => {
	const tcs = getToolCalls(context);
	const askCalls = tcs.filter(
		(tc) => tc.name === "AskUserQuestion" || tc.canonical === "ask_user",
	);
	const expectedOptions = ["commit", "refine", "new", "exit"];
	const MIN_MATCH = 3;

	for (const tc of askCalls) {
		const input = JSON.stringify(tc.input).toLowerCase();
		const matched = expectedOptions.filter((opt) => input.includes(opt));
		if (matched.length >= MIN_MATCH) {
			return {
				pass: true,
				score: 1,
				reason: `Post-build prompt found via AskUserQuestion (matched: ${matched.join(", ")})`,
			};
		}
	}

	// Fallback: check text output for post-build option keywords
	const outputLower = (typeof output === "string" ? output : "").toLowerCase();
	const outputMatched = expectedOptions.filter((opt) =>
		outputLower.includes(opt),
	);
	if (outputMatched.length >= MIN_MATCH) {
		return {
			pass: true,
			score: 1,
			reason: `Post-build prompt found in text output (matched: ${outputMatched.join(", ")})`,
		};
	}

	const askSummary = askCalls
		.map((tc) => {
			const matched = expectedOptions.filter((opt) =>
				JSON.stringify(tc.input).toLowerCase().includes(opt),
			);
			return `[${matched.join(",")}]`;
		})
		.join(", ");
	return {
		pass: false,
		score: 0,
		reason: `Post-build prompt needs ${MIN_MATCH}+ of [${expectedOptions.join("/")}]. Found ${askCalls.length} AskUserQuestion(s)${askSummary ? ` matching: ${askSummary}` : ""}, output matched: [${outputMatched.join(",")}]`,
	};
};

/** Assert Read tool was called on a `.rp1/context/` path (KB load). */
export const assertKBLoad: AssertionFunction = (_output, context) => {
	const tcs = getToolCalls(context);
	const kbReads = tcs.filter((tc) => {
		if (tc.name !== "Read" && tc.canonical !== "read") return false;
		const input = tc.input as { file_path?: string };
		return input.file_path?.includes(".rp1/context/") ?? false;
	});
	if (kbReads.length === 0) {
		return {
			pass: false,
			score: 0,
			reason: "No Read tool call on .rp1/context/ path found (KB not loaded)",
		};
	}
	return {
		pass: true,
		score: 1,
		reason: `KB loaded: ${kbReads.length} Read call(s) on .rp1/context/ paths`,
	};
};

/** Assert status_change emit with redirect was called (scope redirect). */
export const assertScopeRedirectStatus: AssertionFunction = (
	_output,
	context,
) => {
	const cmds = getBashCommands(context);
	const found = cmds.some(
		(cmd) =>
			cmd.includes("rp1 agent-tools emit") &&
			cmd.includes("--type status_change") &&
			cmd.includes("redirect"),
	);
	if (!found) {
		return {
			pass: false,
			score: 0,
			reason: "No status_change emit with redirect found in bash commands",
		};
	}
	return {
		pass: true,
		score: 1,
		reason: "Scope redirect status_change emit found",
	};
};

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
