/**
 * Unit tests for the agent_tools Liquid filter.
 * Scoped specifiers survive verbatim, exact duplicates are removed, and
 * declaration order is preserved.
 */

import { describe, expect, test } from "bun:test";
import { agentTools } from "../../../build/filters/agent-tools.js";

describe("agentTools", () => {
	test("passes through bare tool names in declaration order", () => {
		expect(agentTools(["Read", "Grep", "Glob", "Bash"])).toBe(
			"Read, Grep, Glob, Bash",
		);
	});

	test("preserves a scoped Bash specifier instead of widening it to bare Bash", () => {
		expect(agentTools(["Read", "Write", "Glob", "Bash(rp1 *)"])).toBe(
			"Read, Write, Glob, Bash(rp1 *)",
		);
	});

	test("preserves several distinct scoped specifiers for the same tool", () => {
		expect(
			agentTools([
				"Read",
				"Bash(git log *)",
				"Bash(git show *)",
				"Bash(gh pr view *)",
			]),
		).toBe("Read, Bash(git log *), Bash(git show *), Bash(gh pr view *)");
	});

	test("keeps a bare tool and a scoped entry for that tool as declared", () => {
		expect(
			agentTools([
				"Read",
				"Write",
				"Edit",
				"Bash",
				"Glob",
				"Grep",
				"Bash(rp1 *)",
			]),
		).toBe("Read, Write, Edit, Bash, Glob, Grep, Bash(rp1 *)");
	});

	test("removes exact duplicates", () => {
		expect(agentTools(["Read", "Bash(rp1 *)", "Read", "Bash(rp1 *)"])).toBe(
			"Read, Bash(rp1 *)",
		);
	});

	test("returns an empty string for an empty list", () => {
		expect(agentTools([])).toBe("");
	});

	test("ignores blank entries and trims surrounding whitespace", () => {
		expect(agentTools([" Read ", "", "  ", "Glob"])).toBe("Read, Glob");
	});

	test("preserves the Skill tool name", () => {
		expect(agentTools(["Read", "Edit", "Grep", "Bash", "Skill"])).toBe(
			"Read, Edit, Grep, Bash, Skill",
		);
	});
});
