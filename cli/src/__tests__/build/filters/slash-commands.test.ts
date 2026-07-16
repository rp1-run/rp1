/**
 * Unit tests for the slash_commands Liquid filter.
 * Tests platform-specific slash command transformations.
 */

import { describe, expect, test } from "bun:test";
import { slashCommands } from "../../../build/filters/slash-commands.js";

const skillMap: ReadonlyMap<string, string> = new Map([
	["build", "dev"],
	["build-fast", "dev"],
	["speedrun", "dev"],
	["socratic-duel", "base"],
	["knowledge-build", "base"],
	["knowledge-load", "base"],
	["tersify-prompt", "utils"],
	["pr-review", "dev"],
]);

describe("slash_commands filter", () => {
	describe("claude-code (passthrough)", () => {
		test("returns content unchanged", () => {
			const content = "Run /rp1-base:knowledge-load for context.";
			expect(slashCommands(content, "claude-code")).toBe(content);
		});

		test("preserves plain slash commands unchanged", () => {
			const content = "Run /build to build.";
			expect(slashCommands(content, "claude-code", skillMap)).toBe(content);
		});
	});

	describe("opencode (command_invoke)", () => {
		test("transforms /rp1-base:cmd to command_invoke", () => {
			const content = "Run /rp1-base:knowledge-load to load.";
			const result = slashCommands(content, "opencode");
			expect(result).toContain('command_invoke("rp1-base:knowledge-load")');
		});

		test("transforms /rp1-dev:cmd to command_invoke", () => {
			const content = "Run /rp1-dev:feature-build to build.";
			const result = slashCommands(content, "opencode");
			expect(result).toContain('command_invoke("rp1-dev:feature-build")');
		});

		test("transforms multiple slash commands", () => {
			const content =
				"Run /rp1-base:knowledge-load then /rp1-dev:feature-build.";
			const result = slashCommands(content, "opencode");
			expect(result).toContain('command_invoke("rp1-base:knowledge-load")');
			expect(result).toContain('command_invoke("rp1-dev:feature-build")');
		});

		test("preserves content inside code blocks", () => {
			const content = [
				"Outside /rp1-base:cmd should change.",
				"",
				"```bash",
				"# Inside code block /rp1-base:cmd should NOT change",
				"```",
				"",
				"After block /rp1-dev:other should change.",
			].join("\n");

			const result = slashCommands(content, "opencode");
			expect(result).toContain('command_invoke("rp1-base:cmd")');
			expect(result).toContain("/rp1-base:cmd should NOT change");
			expect(result).toContain('command_invoke("rp1-dev:other")');
		});
	});

	describe("codex (plain slash to $ mention)", () => {
		test("transforms /skill to $rp1-{plugin}-{skill}", () => {
			const content = "Run /knowledge-build to build KB.";
			const result = slashCommands(content, "codex", skillMap);
			expect(result).toBe("Run $rp1-base-knowledge-build to build KB.");
		});

		test("transforms multiple plain references", () => {
			const content = "Use /build then /pr-review.";
			const result = slashCommands(content, "codex", skillMap);
			expect(result).toBe("Use $rp1-dev-build then $rp1-dev-pr-review.");
		});

		test("longest-match-first prevents partial matches", () => {
			const content = "Use /build-fast for speed, /build for full.";
			const result = slashCommands(content, "codex", skillMap);
			expect(result).toBe(
				"Use $rp1-dev-build-fast for speed, $rp1-dev-build for full.",
			);
		});

		test("negative lookahead prevents /build from matching /speedrun", () => {
			const content = "Use /speedrun here.";
			const result = slashCommands(content, "codex", skillMap);
			expect(result).toBe("Use $rp1-dev-speedrun here.");
			expect(result).not.toContain("$rp1-dev-build");
		});

		test("preserves references inside code blocks", () => {
			const content = [
				"Use /build outside.",
				"```",
				"/build inside code block",
				"```",
				"And /pr-review here.",
			].join("\n");

			const result = slashCommands(content, "codex", skillMap);
			expect(result).toContain("$rp1-dev-build");
			expect(result).toContain("/build inside code block");
			expect(result).toContain("$rp1-dev-pr-review");
		});

		test("does not transform unknown skill names", () => {
			const content = "Use /unknown-skill here.";
			const result = slashCommands(content, "codex", skillMap);
			expect(result).toBe("Use /unknown-skill here.");
		});

		test("preserves path segments that match skill names", () => {
			const content =
				"Read templates/socratic-duel/managed-debate-region.md, then run /socratic-duel.";
			const result = slashCommands(content, "codex", skillMap);
			expect(result).toBe(
				"Read templates/socratic-duel/managed-debate-region.md, then run $rp1-base-socratic-duel.",
			);
		});

		test("returns content unchanged with empty skill map", () => {
			const content = "Use /build for builds.";
			const result = slashCommands(content, "codex", new Map<string, string>());
			expect(result).toBe("Use /build for builds.");
		});

		test("returns content unchanged when no skill map provided", () => {
			const content = "Use /build for builds.";
			const result = slashCommands(content, "codex");
			expect(result).toBe("Use /build for builds.");
		});
	});

	describe("copilot (colon to slash separator)", () => {
		test("transforms /rp1-base:cmd to /rp1-base/cmd", () => {
			const content = "Run /rp1-base:knowledge-load to load.";
			const result = slashCommands(content, "copilot");
			expect(result).toBe("Run /rp1-base/knowledge-load to load.");
		});

		test("transforms /rp1-dev:cmd to /rp1-dev/cmd", () => {
			const content = "Run /rp1-dev:build to build.";
			const result = slashCommands(content, "copilot");
			expect(result).toBe("Run /rp1-dev/build to build.");
		});

		test("transforms multiple slash commands", () => {
			const content = "Run /rp1-base:knowledge-load then /rp1-dev:build.";
			const result = slashCommands(content, "copilot");
			expect(result).toBe("Run /rp1-base/knowledge-load then /rp1-dev/build.");
		});

		test("preserves content inside code blocks", () => {
			const content = [
				"Outside /rp1-base:cmd should change.",
				"",
				"```bash",
				"# Inside code block /rp1-base:cmd should NOT change",
				"```",
				"",
				"After block /rp1-dev:other should change.",
			].join("\n");

			const result = slashCommands(content, "copilot");
			expect(result).toContain("/rp1-base/cmd");
			expect(result).toContain("/rp1-base:cmd should NOT change");
			expect(result).toContain("/rp1-dev/other");
		});
	});
});
