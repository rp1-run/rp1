import { describe, expect, test } from "bun:test";
import { injectEmitHarness } from "../../build/transforms.js";

describe("injectEmitHarness", () => {
	test("injects --harness after rp1 agent-tools emit with flags", () => {
		const input = `rp1 agent-tools emit --workflow build --type status_change`;
		const result = injectEmitHarness(input, "codex");
		expect(result).toBe(
			`rp1 agent-tools emit --harness codex --workflow build --type status_change`,
		);
	});

	test("handles multiline emit with backslash continuation", () => {
		const input = `rp1 agent-tools emit \\
  --workflow build \\
  --type status_change`;
		const result = injectEmitHarness(input, "claude-code");
		expect(result).toContain("rp1 agent-tools emit --harness claude-code \\");
	});

	test("does not double-inject when --harness already present", () => {
		const input = `rp1 agent-tools emit --harness opencode --workflow build`;
		const result = injectEmitHarness(input, "codex");
		expect(result).toBe(input);
	});

	test("transforms all emit calls in content", () => {
		const input = `Step 1:
rp1 agent-tools emit --type status_change
Step 2:
rp1 agent-tools emit --type artifact_registered`;
		const result = injectEmitHarness(input, "opencode");
		expect(result).toContain(
			"rp1 agent-tools emit --harness opencode --type status_change",
		);
		expect(result).toContain(
			"rp1 agent-tools emit --harness opencode --type artifact_registered",
		);
	});

	test("does not modify prose mentions", () => {
		const input = "This is about the rp1 agent-tools emit command.";
		const result = injectEmitHarness(input, "codex");
		expect(result).toBe(input);
	});

	test("does not inject into emit resume-run subcommand", () => {
		const input = `rp1 agent-tools emit resume-run --feature test`;
		const result = injectEmitHarness(input, "codex");
		expect(result).toBe(input);
	});

	test("injects when emit is at end of line", () => {
		const input = `rp1 agent-tools emit`;
		const result = injectEmitHarness(input, "codex");
		expect(result).toBe(`rp1 agent-tools emit --harness codex`);
	});
});
