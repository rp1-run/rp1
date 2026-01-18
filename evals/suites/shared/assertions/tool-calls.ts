/**
 * Tool-call based assertions for eval tests.
 * Checks what tools the agent invoked rather than side effects.
 */

interface ToolCall {
	name: string;
	args?: Record<string, unknown>;
}

interface ProviderResponse {
	output?: {
		tool_calls?: ToolCall[];
	};
	toolCalls?: ToolCall[];
}

interface GradingResult {
	pass: boolean;
	score: number;
	reason: string;
}

/**
 * Extract tool calls from provider response.
 */
function getToolCalls(providerResponse?: ProviderResponse): ToolCall[] {
	return (
		providerResponse?.output?.tool_calls ??
		providerResponse?.toolCalls ??
		[]
	);
}

/**
 * Check if any Bash call contains a pattern.
 */
function hasBashCommand(calls: ToolCall[], pattern: string | RegExp): boolean {
	return calls.some((call) => {
		if (call.name?.toLowerCase() !== "bash") return false;
		const cmd = call.args?.command;
		if (typeof cmd !== "string") return false;
		return typeof pattern === "string"
			? cmd.includes(pattern)
			: pattern.test(cmd);
	});
}

/**
 * Assert that agent ran `git commit`.
 */
export function assertGitCommit(
	_output: string,
	{ providerResponse }: { providerResponse?: ProviderResponse },
): GradingResult {
	const calls = getToolCalls(providerResponse);
	const hasCommit = hasBashCommand(calls, "git commit");

	if (hasCommit) {
		return {
			pass: true,
			score: 1,
			reason: "Agent executed git commit",
		};
	}

	const bashCalls = calls
		.filter((c) => c.name?.toLowerCase() === "bash")
		.map((c) => c.args?.command)
		.filter(Boolean);

	return {
		pass: false,
		score: 0,
		reason: `No git commit found. Bash calls: ${bashCalls.length > 0 ? bashCalls.join("; ") : "none"}`,
	};
}

/**
 * Assert that agent did NOT run `git commit`.
 */
export function assertNoGitCommit(
	_output: string,
	{ providerResponse }: { providerResponse?: ProviderResponse },
): GradingResult {
	const calls = getToolCalls(providerResponse);
	const hasCommit = hasBashCommand(calls, "git commit");

	if (!hasCommit) {
		return {
			pass: true,
			score: 1,
			reason: "Agent did not execute git commit",
		};
	}

	return {
		pass: false,
		score: 0,
		reason: "Agent executed git commit when it should not have",
	};
}

/**
 * Assert that agent ran `git push`.
 */
export function assertGitPush(
	_output: string,
	{ providerResponse }: { providerResponse?: ProviderResponse },
): GradingResult {
	const calls = getToolCalls(providerResponse);
	const hasPush = hasBashCommand(calls, "git push");

	if (hasPush) {
		return {
			pass: true,
			score: 1,
			reason: "Agent executed git push",
		};
	}

	return {
		pass: false,
		score: 0,
		reason: "No git push found",
	};
}

/**
 * Assert that agent did NOT run `git push`.
 */
export function assertNoGitPush(
	_output: string,
	{ providerResponse }: { providerResponse?: ProviderResponse },
): GradingResult {
	const calls = getToolCalls(providerResponse);
	const hasPush = hasBashCommand(calls, "git push");

	if (!hasPush) {
		return {
			pass: true,
			score: 1,
			reason: "Agent did not execute git push",
		};
	}

	return {
		pass: false,
		score: 0,
		reason: "Agent executed git push when it should not have",
	};
}

/**
 * Assert that agent used a specific tool.
 */
export function assertToolUsed(toolName: string) {
	return (
		_output: string,
		{ providerResponse }: { providerResponse?: ProviderResponse },
	): GradingResult => {
		const calls = getToolCalls(providerResponse);
		const used = calls.some(
			(c) => c.name?.toLowerCase() === toolName.toLowerCase(),
		);

		if (used) {
			return {
				pass: true,
				score: 1,
				reason: `Agent used ${toolName} tool`,
			};
		}

		const toolsUsed = [...new Set(calls.map((c) => c.name))];
		return {
			pass: false,
			score: 0,
			reason: `Agent did not use ${toolName}. Tools used: ${toolsUsed.join(", ") || "none"}`,
		};
	};
}

/**
 * Assert that agent ran a Bash command matching a pattern.
 */
export function assertBashCommand(pattern: string | RegExp) {
	return (
		_output: string,
		{ providerResponse }: { providerResponse?: ProviderResponse },
	): GradingResult => {
		const calls = getToolCalls(providerResponse);
		const found = hasBashCommand(calls, pattern);

		if (found) {
			return {
				pass: true,
				score: 1,
				reason: `Agent ran Bash command matching: ${pattern}`,
			};
		}

		return {
			pass: false,
			score: 0,
			reason: `No Bash command matching: ${pattern}`,
		};
	};
}
