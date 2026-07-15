import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import {
	GLOBAL_INSTRUCTION_PATH_MAP,
	resolveGlobalInstructionPath,
} from "../../init/global-path-map.js";

describe("GLOBAL_INSTRUCTION_PATH_MAP", () => {
	test("contains entries for all five supported harnesses", () => {
		const expected = [
			"claude-code",
			"codex",
			"opencode",
			"copilot",
			"antigravity",
		];
		expect(Object.keys(GLOBAL_INSTRUCTION_PATH_MAP).sort()).toEqual(
			expected.sort(),
		);
	});

	test("each entry is a function accepting a home directory string", () => {
		for (const [_id, resolver] of Object.entries(GLOBAL_INSTRUCTION_PATH_MAP)) {
			expect(typeof resolver).toBe("function");
			expect(typeof resolver("/home/test")).toBe("string");
		}
	});
});

describe("resolveGlobalInstructionPath", () => {
	const home = "/fake/home";

	test("claude-code resolves to ~/.claude/CLAUDE.md", () => {
		const result = resolveGlobalInstructionPath("claude-code", home);
		expect(result).toBe(join(home, ".claude", "CLAUDE.md"));
	});

	test("codex resolves to ~/.codex/AGENTS.md", () => {
		const result = resolveGlobalInstructionPath("codex", home);
		expect(result).toBe(join(home, ".codex", "AGENTS.md"));
	});

	test("opencode resolves to ~/.config/opencode/AGENTS.md", () => {
		const result = resolveGlobalInstructionPath("opencode", home);
		expect(result).toBe(join(home, ".config", "opencode", "AGENTS.md"));
	});

	test("copilot resolves to ~/.copilot/copilot-instructions.md", () => {
		const result = resolveGlobalInstructionPath("copilot", home);
		expect(result).toBe(join(home, ".copilot", "copilot-instructions.md"));
	});

	test("antigravity resolves to ~/.gemini/AGENTS.md", () => {
		const result = resolveGlobalInstructionPath("antigravity", home);
		expect(result).toBe(join(home, ".gemini", "AGENTS.md"));
	});

	test("returns null for unknown harness ID", () => {
		expect(resolveGlobalInstructionPath("unknown-harness", home)).toBeNull();
	});

	test("returns null for empty string harness ID", () => {
		expect(resolveGlobalInstructionPath("", home)).toBeNull();
	});

	test("homeDir override changes the base path for all harnesses", () => {
		const customHome = "/custom/home/dir";
		const result = resolveGlobalInstructionPath("claude-code", customHome);
		expect(result).toBe(join(customHome, ".claude", "CLAUDE.md"));
		expect(result).not.toContain("/fake/home");
	});

	test("uses os.homedir() when no homeDir provided", () => {
		const result = resolveGlobalInstructionPath("claude-code");
		expect(result).not.toBeNull();
		expect(result!.endsWith(join(".claude", "CLAUDE.md"))).toBe(true);
	});
});
