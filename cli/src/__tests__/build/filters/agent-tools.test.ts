/**
 * Unit tests for the agent_tools Liquid filter.
 * Scoped specifiers collapse to bare tool names, duplicates are removed,
 * and declaration order is preserved.
 */

import { describe, expect, test } from "bun:test";
import { agentTools } from "../../../build/filters/agent-tools.js";

describe("agentTools", () => {
	test("passes through bare tool names in declaration order", () => {
		expect(agentTools(["Read", "Grep", "Glob", "Bash"])).toBe(
			"Read, Grep, Glob, Bash",
		);
	});

	test("collapses a scoped Bash specifier to the bare tool name", () => {
		expect(agentTools(["Read", "Write", "Glob", "Bash(rp1 *)"])).toBe(
			"Read, Write, Glob, Bash",
		);
	});

	test("de-duplicates when a scoped entry collapses onto an existing tool", () => {
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
		).toBe("Read, Write, Edit, Bash, Glob, Grep");
	});

	test("collapses several scoped specifiers for the same tool to one entry", () => {
		expect(
			agentTools([
				"Read",
				"Bash(git log *)",
				"Bash(git show *)",
				"Bash(gh pr view *)",
			]),
		).toBe("Read, Bash");
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
