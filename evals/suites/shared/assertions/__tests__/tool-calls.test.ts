import { describe, expect, test } from "bun:test";
import {
	assertCanonicalToolCall,
	assertFileExists,
	assertGitCommitToolCall,
	assertKBLoad,
	assertNoBuildFastAgents,
	assertNoCanonicalToolCall,
	assertNoGitPushToolCall,
	assertNoToolCall,
	assertOutputContains,
	assertPostBuildPromptOptions,
	assertToolCall,
	assertToolCallCount,
	getBashCommands,
	getOrchestratorToolCalls,
	getSubAgentToolCalls,
	type ToolCall,
	type ToolCallEvalContext,
} from "../tool-calls.js";

function makeContext(
	toolCalls: ToolCall[],
	vars: Record<string, string> = {},
): ToolCallEvalContext {
	return {
		vars,
		providerResponse: {
			metadata: {
				toolCalls,
				bashCommands: toolCalls
					.filter((tc) => tc.name.toLowerCase() === "bash")
					.map((tc) => (tc.input as { command?: string })?.command ?? "")
					.filter((cmd) => cmd.length > 0),
				toolCallCount: toolCalls.length,
			},
		},
	};
}

/**
 * Create context matching stock provider shape (no bashCommands, no toolCallCount).
 */
function makeStockContext(
	toolCalls: ToolCall[],
	vars: Record<string, string> = {},
): ToolCallEvalContext {
	return {
		vars,
		providerResponse: {
			metadata: {
				toolCalls,
			},
		},
	};
}

function tc(
	name: string,
	input: unknown = {},
	canonical?: string,
	parentToolUseId?: string | null,
): ToolCall {
	return {
		id: `tc_${Math.random().toString(36).slice(2, 8)}`,
		name,
		canonical: canonical as ToolCall["canonical"],
		input,
		source: "stream_event",
		...(parentToolUseId !== undefined ? { parentToolUseId } : {}),
	};
}

describe("assertToolCall", () => {
	test("matches tool by name", () => {
		const ctx = makeContext([tc("Bash", { command: "git status" })]);
		const result = assertToolCall("Bash")("", ctx);
		expect(result.pass).toBe(true);
	});

	test("matches tool by name case-insensitively", () => {
		const ctx = makeContext([tc("bash", { command: "git status" })]);
		const result = assertToolCall("Bash")("", ctx);
		expect(result.pass).toBe(true);
	});

	test("matches with string matcher", () => {
		const ctx = makeContext([tc("Bash", { command: "git commit -m 'test'" })]);
		const result = assertToolCall("Bash", "git commit")("", ctx);
		expect(result.pass).toBe(true);
	});

	test("matches with regex matcher", () => {
		const ctx = makeContext([tc("Bash", { command: "git commit -m 'test'" })]);
		const result = assertToolCall("Bash", /git\s+commit/)("", ctx);
		expect(result.pass).toBe(true);
	});

	test("matches with function matcher", () => {
		const ctx = makeContext([
			tc("Write", { file_path: "/tmp/test.ts", content: "hello" }),
		]);
		const result = assertToolCall("Write", (input) =>
			input.file_path.endsWith(".ts"),
		)("", ctx);
		expect(result.pass).toBe(true);
	});

	test("fails when tool not found", () => {
		const ctx = makeContext([tc("Read", { file_path: "/tmp/test.ts" })]);
		const result = assertToolCall("Write")("", ctx);
		expect(result.pass).toBe(false);
	});

	test("fails when no tool calls captured", () => {
		const ctx = makeContext([]);
		const result = assertToolCall("Bash")("", ctx);
		expect(result.pass).toBe(false);
		expect(result.reason).toContain("No tool calls captured");
	});

	test("fails when matcher doesn't match", () => {
		const ctx = makeContext([tc("Bash", { command: "ls -la" })]);
		const result = assertToolCall("Bash", /git commit/)("", ctx);
		expect(result.pass).toBe(false);
	});
});

describe("assertNoToolCall", () => {
	test("passes when tool not present", () => {
		const ctx = makeContext([tc("Read")]);
		const result = assertNoToolCall("Write")("", ctx);
		expect(result.pass).toBe(true);
	});

	test("fails when tool is present", () => {
		const ctx = makeContext([tc("Write")]);
		const result = assertNoToolCall("Write")("", ctx);
		expect(result.pass).toBe(false);
	});

	test("passes when matcher doesn't match", () => {
		const ctx = makeContext([tc("Bash", { command: "ls" })]);
		const result = assertNoToolCall("Bash", /git push/)("", ctx);
		expect(result.pass).toBe(true);
	});

	test("fails when matcher matches", () => {
		const ctx = makeContext([tc("Bash", { command: "git push origin main" })]);
		const result = assertNoToolCall("Bash", /git push/)("", ctx);
		expect(result.pass).toBe(false);
	});

	test("case-insensitive: 'bash' matches 'Bash'", () => {
		const ctx = makeContext([tc("bash", { command: "git push" })]);
		const result = assertNoToolCall("Bash", /git push/)("", ctx);
		expect(result.pass).toBe(false);
	});
});

describe("assertToolCallCount", () => {
	test("passes on exact count", () => {
		const ctx = makeContext([tc("Bash"), tc("Bash"), tc("Read")]);
		const result = assertToolCallCount("Bash", 2)("", ctx);
		expect(result.pass).toBe(true);
	});

	test("fails on count mismatch", () => {
		const ctx = makeContext([tc("Bash")]);
		const result = assertToolCallCount("Bash", 2)("", ctx);
		expect(result.pass).toBe(false);
	});

	test("passes for zero count when none present", () => {
		const ctx = makeContext([tc("Read")]);
		const result = assertToolCallCount("Write", 0)("", ctx);
		expect(result.pass).toBe(true);
	});

	test("case-insensitive counting", () => {
		const ctx = makeContext([tc("bash"), tc("Bash"), tc("BASH")]);
		const result = assertToolCallCount("Bash", 3)("", ctx);
		expect(result.pass).toBe(true);
	});
});

describe("assertOutputContains", () => {
	test("matches string pattern", () => {
		const result = assertOutputContains("hello")("Hello World", {
			vars: {},
		});
		expect(result.pass).toBe(true);
	});

	test("matches regex pattern", () => {
		const result = assertOutputContains(/scope:\s*small/i)("Scope: Small", {
			vars: {},
		});
		expect(result.pass).toBe(true);
	});

	test("fails when pattern not found", () => {
		const result = assertOutputContains("missing")("Hello World", {
			vars: {},
		});
		expect(result.pass).toBe(false);
	});
});

describe("assertFileExists", () => {
	test("fails when WORKSPACE_DIR not set", () => {
		const result = assertFileExists("test.ts")("", { vars: {} });
		expect(result.pass).toBe(false);
		expect(result.reason).toContain("WORKSPACE_DIR not set");
	});

	test("fails when file does not exist", () => {
		const result = assertFileExists("nonexistent.ts")("", {
			vars: { WORKSPACE_DIR: "/tmp" },
		});
		expect(result.pass).toBe(false);
	});
});

describe("pre-built assertions", () => {
	test("assertGitCommitToolCall matches git commit", () => {
		const ctx = makeContext([tc("Bash", { command: "git commit -m 'test'" })]);
		const result = assertGitCommitToolCall("", ctx);
		expect(result.pass).toBe(true);
	});

	test("assertGitCommitToolCall matches git -C path commit", () => {
		const ctx = makeContext([
			tc("Bash", { command: "git -C /tmp/worktree commit -m 'test'" }),
		]);
		const result = assertGitCommitToolCall("", ctx);
		expect(result.pass).toBe(true);
	});

	test("assertNoGitPushToolCall passes when no push", () => {
		const ctx = makeContext([tc("Bash", { command: "git commit -m 'test'" })]);
		const result = assertNoGitPushToolCall("", ctx);
		expect(result.pass).toBe(true);
	});

	test("assertNoGitPushToolCall fails on git push", () => {
		const ctx = makeContext([tc("Bash", { command: "git push origin main" })]);
		const result = assertNoGitPushToolCall("", ctx);
		expect(result.pass).toBe(false);
	});
});

describe("assertCanonicalToolCall", () => {
	test("matches by canonical name", () => {
		const ctx = makeContext([tc("Bash", { command: "ls" }, "shell")]);
		const result = assertCanonicalToolCall("shell")("", ctx);
		expect(result.pass).toBe(true);
	});

	test("matches lowercase opencode tool by canonical", () => {
		const ctx = makeContext([tc("bash", { command: "git status" }, "shell")]);
		const result = assertCanonicalToolCall("shell")("", ctx);
		expect(result.pass).toBe(true);
	});

	test("matches codex tool by canonical", () => {
		const ctx = makeContext([
			tc("functions.exec_command", { command: "ls" }, "shell"),
		]);
		const result = assertCanonicalToolCall("shell")("", ctx);
		expect(result.pass).toBe(true);
	});

	test("matches with string matcher on shell canonical", () => {
		const ctx = makeContext([
			tc("Bash", { command: "git commit -m 'feat'" }, "shell"),
		]);
		const result = assertCanonicalToolCall("shell", "git commit")("", ctx);
		expect(result.pass).toBe(true);
	});

	test("matches with regex matcher", () => {
		const ctx = makeContext([
			tc(
				"Bash",
				{ command: "rp1 agent-tools emit --type status_change" },
				"shell",
			),
		]);
		const result = assertCanonicalToolCall("shell", /rp1\s+agent-tools/)(
			"",
			ctx,
		);
		expect(result.pass).toBe(true);
	});

	test("fails when canonical not found", () => {
		const ctx = makeContext([tc("Bash", { command: "ls" }, "shell")]);
		const result = assertCanonicalToolCall("write")("", ctx);
		expect(result.pass).toBe(false);
	});

	test("fails with no tool calls", () => {
		const ctx = makeContext([]);
		const result = assertCanonicalToolCall("shell")("", ctx);
		expect(result.pass).toBe(false);
	});
});

describe("assertNoCanonicalToolCall", () => {
	test("passes when canonical not present", () => {
		const ctx = makeContext([tc("Read", {}, "read")]);
		const result = assertNoCanonicalToolCall("ask_user")("", ctx);
		expect(result.pass).toBe(true);
	});

	test("fails when canonical is present", () => {
		const ctx = makeContext([tc("AskUserQuestion", {}, "ask_user")]);
		const result = assertNoCanonicalToolCall("ask_user")("", ctx);
		expect(result.pass).toBe(false);
	});

	test("passes with matcher when no match", () => {
		const ctx = makeContext([tc("Bash", { command: "ls" }, "shell")]);
		const result = assertNoCanonicalToolCall("shell", /git push/)("", ctx);
		expect(result.pass).toBe(true);
	});
});

// ─────────────────────────────────────────────────────────────────────
// Stock provider metadata shape (no bashCommands, no toolCallCount)
// ─────────────────────────────────────────────────────────────────────

describe("stock provider metadata (no bashCommands)", () => {
	test("makeContext without bashCommands still works for assertToolCall", () => {
		const ctx = makeStockContext([tc("Bash", { command: "git status" })]);
		const result = assertToolCall("Bash")("", ctx);
		expect(result.pass).toBe(true);
	});

	test("assertNoToolCall works without bashCommands", () => {
		const ctx = makeStockContext([tc("Read", { file_path: "/tmp/a.ts" })]);
		const result = assertNoToolCall("Write")("", ctx);
		expect(result.pass).toBe(true);
	});

	test("assertToolCallCount works without bashCommands", () => {
		const ctx = makeStockContext([tc("Bash"), tc("Bash")]);
		const result = assertToolCallCount("Bash", 2)("", ctx);
		expect(result.pass).toBe(true);
	});
});

// ─────────────────────────────────────────────────────────────────────
// getBashCommands derivation
// ─────────────────────────────────────────────────────────────────────

describe("getBashCommands", () => {
	test("returns pre-computed bashCommands when available", () => {
		const ctx = makeContext([tc("Bash", { command: "git status" })]);
		const cmds = getBashCommands(ctx);
		expect(cmds).toEqual(["git status"]);
	});

	test("derives bash commands from tool calls when bashCommands absent", () => {
		const ctx = makeStockContext([
			tc("Bash", { command: "git status" }),
			tc("Read", { file_path: "/tmp/a.ts" }),
			tc("Bash", { command: "rp1 agent-tools emit --type status_change" }),
		]);
		const cmds = getBashCommands(ctx);
		expect(cmds).toEqual([
			"git status",
			"rp1 agent-tools emit --type status_change",
		]);
	});

	test("returns empty array when no bash calls and no bashCommands", () => {
		const ctx = makeStockContext([tc("Read", { file_path: "/tmp/a.ts" })]);
		const cmds = getBashCommands(ctx);
		expect(cmds).toEqual([]);
	});

	test("skips bash calls with empty/missing command", () => {
		const ctx = makeStockContext([
			tc("Bash", { command: "" }),
			tc("Bash", {}),
			tc("Bash", { command: "ls" }),
		]);
		const cmds = getBashCommands(ctx);
		expect(cmds).toEqual(["ls"]);
	});

	test("handles lowercase 'bash' tool name", () => {
		const ctx = makeStockContext([tc("bash", { command: "echo hi" })]);
		const cmds = getBashCommands(ctx);
		expect(cmds).toEqual(["echo hi"]);
	});
});

// ─────────────────────────────────────────────────────────────────────
// Canonical name computation on-the-fly
// ─────────────────────────────────────────────────────────────────────

describe("canonical name on-the-fly computation", () => {
	test("computes canonical for tool calls without explicit canonical", () => {
		const ctx = makeStockContext([tc("Bash", { command: "ls" })]);
		const result = assertCanonicalToolCall("shell")("", ctx);
		expect(result.pass).toBe(true);
	});

	test("preserves explicit canonical when provided", () => {
		const ctx = makeStockContext([tc("Bash", { command: "ls" }, "shell")]);
		const result = assertCanonicalToolCall("shell")("", ctx);
		expect(result.pass).toBe(true);
	});

	test("computes canonical for AskUserQuestion", () => {
		const ctx = makeStockContext([tc("AskUserQuestion", { questions: [] })]);
		const result = assertCanonicalToolCall("ask_user")("", ctx);
		expect(result.pass).toBe(true);
	});

	test("computes canonical for Read tool", () => {
		const ctx = makeStockContext([tc("Read", { file_path: "/tmp/test.ts" })]);
		const result = assertCanonicalToolCall("read")("", ctx);
		expect(result.pass).toBe(true);
	});

	test("computes canonical for Write tool", () => {
		const ctx = makeStockContext([
			tc("Write", { file_path: "/tmp/test.ts", content: "x" }),
		]);
		const result = assertCanonicalToolCall("write")("", ctx);
		expect(result.pass).toBe(true);
	});

	test("computes canonical for Agent/Task as subagent", () => {
		const ctx = makeStockContext([tc("Task", { agent: "speedrun-builder" })]);
		const result = assertCanonicalToolCall("subagent")("", ctx);
		expect(result.pass).toBe(true);
	});
});

// ─────────────────────────────────────────────────────────────────────
// parentToolUseId filtering
// ─────────────────────────────────────────────────────────────────────

describe("getOrchestratorToolCalls", () => {
	test("returns calls with null parentToolUseId", () => {
		const ctx = makeStockContext([
			tc("Bash", { command: "ls" }, undefined, null),
			tc("Bash", { command: "git status" }, undefined, "parent-id-123"),
		]);
		const calls = getOrchestratorToolCalls(ctx);
		expect(calls.length).toBe(1);
		expect((calls[0].input as { command: string }).command).toBe("ls");
	});

	test("returns calls with undefined parentToolUseId", () => {
		const ctx = makeStockContext([
			tc("Bash", { command: "ls" }),
			tc("Bash", { command: "git status" }, undefined, "parent-id-123"),
		]);
		const calls = getOrchestratorToolCalls(ctx);
		expect(calls.length).toBe(1);
		expect((calls[0].input as { command: string }).command).toBe("ls");
	});

	test("returns all calls when none have parentToolUseId", () => {
		const ctx = makeStockContext([
			tc("Bash", { command: "ls" }),
			tc("Read", { file_path: "/tmp/a.ts" }),
		]);
		const calls = getOrchestratorToolCalls(ctx);
		expect(calls.length).toBe(2);
	});

	test("returns empty when all calls are sub-agent", () => {
		const ctx = makeStockContext([
			tc("Bash", { command: "ls" }, undefined, "parent-1"),
			tc("Read", { file_path: "/tmp/a.ts" }, undefined, "parent-2"),
		]);
		const calls = getOrchestratorToolCalls(ctx);
		expect(calls.length).toBe(0);
	});
});

describe("getSubAgentToolCalls", () => {
	test("returns calls with string parentToolUseId", () => {
		const ctx = makeStockContext([
			tc("Bash", { command: "ls" }, undefined, null),
			tc("Bash", { command: "git status" }, undefined, "parent-id-123"),
			tc("Read", { file_path: "/a.ts" }, undefined, "parent-id-456"),
		]);
		const calls = getSubAgentToolCalls(ctx);
		expect(calls.length).toBe(2);
	});

	test("returns empty when no sub-agent calls", () => {
		const ctx = makeStockContext([
			tc("Bash", { command: "ls" }),
			tc("Bash", { command: "git status" }, undefined, null),
		]);
		const calls = getSubAgentToolCalls(ctx);
		expect(calls.length).toBe(0);
	});
});

// ─────────────────────────────────────────────────────────────────────
// Domain assertions: assertNoBuildFastAgents
// ─────────────────────────────────────────────────────────────────────

describe("assertNoBuildFastAgents", () => {
	test("passes when no build-fast agents spawned", () => {
		const ctx = makeStockContext([
			tc("Task", { agent: "speedrun-builder" }),
			tc("Bash", { command: "ls" }),
		]);
		const result = assertNoBuildFastAgents("", ctx);
		expect(result.pass).toBe(true);
	});

	test("fails when build-fast-planner spawned", () => {
		const ctx = makeStockContext([tc("Task", { agent: "build-fast-planner" })]);
		const result = assertNoBuildFastAgents("", ctx);
		expect(result.pass).toBe(false);
		expect(result.reason).toContain("build-fast-planner");
	});

	test("fails when task-builder spawned", () => {
		const ctx = makeStockContext([
			tc("Agent", { agent: "task-builder", task: "T1" }),
		]);
		const result = assertNoBuildFastAgents("", ctx);
		expect(result.pass).toBe(false);
		expect(result.reason).toContain("task-builder");
	});

	test("passes with no subagent calls at all", () => {
		const ctx = makeStockContext([tc("Bash", { command: "ls" })]);
		const result = assertNoBuildFastAgents("", ctx);
		expect(result.pass).toBe(true);
	});
});

// ─────────────────────────────────────────────────────────────────────
// Domain assertions: assertPostBuildPromptOptions
// ─────────────────────────────────────────────────────────────────────

describe("assertPostBuildPromptOptions", () => {
	test("passes when AskUserQuestion has commit/refine/new/exit options", () => {
		const ctx = makeStockContext([
			tc("AskUserQuestion", {
				questions: [
					{
						question: "What next?",
						options: [
							{ label: "Commit changes" },
							{ label: "Refine implementation" },
							{ label: "New task" },
							{ label: "Exit" },
						],
					},
				],
			}),
		]);
		const result = assertPostBuildPromptOptions("", ctx);
		expect(result.pass).toBe(true);
	});

	test("passes with 3 of 4 options (MIN_MATCH threshold)", () => {
		const ctx = makeStockContext([
			tc("AskUserQuestion", {
				questions: [
					{
						question: "What next?",
						options: [
							{ label: "Commit & move on" },
							{ label: "Refine" },
							{ label: "Exit session" },
						],
					},
				],
			}),
		]);
		const result = assertPostBuildPromptOptions("", ctx);
		expect(result.pass).toBe(true);
	});

	test("fails when only 2 of 4 options match", () => {
		const ctx = makeStockContext([
			tc("AskUserQuestion", {
				questions: [
					{
						question: "What next?",
						options: [{ label: "Commit" }, { label: "Exit" }],
					},
				],
			}),
		]);
		const result = assertPostBuildPromptOptions("", ctx);
		expect(result.pass).toBe(false);
	});

	test("fails when no AskUserQuestion calls and no output match", () => {
		const ctx = makeStockContext([tc("Bash", { command: "ls" })]);
		const result = assertPostBuildPromptOptions("", ctx);
		expect(result.pass).toBe(false);
	});

	test("falls back to text output when no AskUserQuestion", () => {
		const ctx = makeStockContext([tc("Bash", { command: "ls" })]);
		const output =
			"Options:\n- Commit & move on\n- Refine\n- New task\n- Exit";
		const result = assertPostBuildPromptOptions(output, ctx);
		expect(result.pass).toBe(true);
		expect(result.reason).toContain("text output");
	});

	test("matches case-insensitively", () => {
		const ctx = makeStockContext([
			tc("AskUserQuestion", {
				questions: [
					{
						question: "Options",
						options: [
							{ label: "COMMIT" },
							{ label: "REFINE" },
							{ label: "NEW" },
							{ label: "EXIT" },
						],
					},
				],
			}),
		]);
		const result = assertPostBuildPromptOptions("", ctx);
		expect(result.pass).toBe(true);
	});
});

// ─────────────────────────────────────────────────────────────────────
// Domain assertions: assertKBLoad
// ─────────────────────────────────────────────────────────────────────

describe("assertKBLoad", () => {
	test("passes when Read called on .rp1/context/ path", () => {
		const ctx = makeStockContext([
			tc("Read", { file_path: "/project/.rp1/context/index.md" }),
		]);
		const result = assertKBLoad("", ctx);
		expect(result.pass).toBe(true);
	});

	test("fails when no Read on .rp1/context/", () => {
		const ctx = makeStockContext([
			tc("Read", { file_path: "/project/src/main.ts" }),
		]);
		const result = assertKBLoad("", ctx);
		expect(result.pass).toBe(false);
	});

	test("fails with no Read calls at all", () => {
		const ctx = makeStockContext([tc("Bash", { command: "ls" })]);
		const result = assertKBLoad("", ctx);
		expect(result.pass).toBe(false);
	});

	test("counts multiple KB reads", () => {
		const ctx = makeStockContext([
			tc("Read", { file_path: "/p/.rp1/context/index.md" }),
			tc("Read", { file_path: "/p/.rp1/context/patterns.md" }),
		]);
		const result = assertKBLoad("", ctx);
		expect(result.pass).toBe(true);
		expect(result.reason).toContain("2 Read call(s)");
	});
});
