import { describe, expect, test } from "bun:test";
import {
	assertCanonicalToolCall,
	assertFileExists,
	assertGitCommitToolCall,
	assertNoCanonicalToolCall,
	assertNoGitPushToolCall,
	assertNoToolCall,
	assertOutputContains,
	assertToolCall,
	assertToolCallCount,
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

function tc(name: string, input: unknown = {}, canonical?: string): ToolCall {
	return {
		id: `tc_${Math.random().toString(36).slice(2, 8)}`,
		name,
		canonical: canonical as ToolCall["canonical"],
		input,
		source: "stream_event",
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
			tc("Bash", { command: "rp1 agent-tools work update" }, "shell"),
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
