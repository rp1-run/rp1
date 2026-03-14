/**
 * Unit tests for the verify parent command and subcommands.
 * Tests command structure, option parsing, and help text.
 */

import { describe, expect, test } from "bun:test";
import { Command } from "commander";

describe("verify command structure", () => {
	describe("verifyCommand", () => {
		test("exports verifyCommand", async () => {
			const { verifyCommand } = await import("../index.js");

			expect(verifyCommand).toBeInstanceOf(Command);
		});

		test("has correct command name", async () => {
			const { verifyCommand } = await import("../index.js");

			expect(verifyCommand.name()).toBe("verify");
		});

		test("has description", async () => {
			const { verifyCommand } = await import("../index.js");

			const description = verifyCommand.description();
			expect(description).toBeTruthy();
			expect(description.toLowerCase()).toContain("verify");
		});

		test("has three subcommands", async () => {
			const { verifyCommand } = await import("../index.js");

			const subcommands = verifyCommand.commands;
			expect(subcommands.length).toBe(3);
		});

		test("includes claude-code subcommand", async () => {
			const { verifyCommand } = await import("../index.js");

			const subcommand = verifyCommand.commands.find(
				(c) => c.name() === "claude-code",
			);
			expect(subcommand).toBeDefined();
		});

		test("includes opencode subcommand", async () => {
			const { verifyCommand } = await import("../index.js");

			const subcommand = verifyCommand.commands.find(
				(c) => c.name() === "opencode",
			);
			expect(subcommand).toBeDefined();
		});

		test("includes codex subcommand", async () => {
			const { verifyCommand } = await import("../index.js");

			const subcommand = verifyCommand.commands.find(
				(c) => c.name() === "codex",
			);
			expect(subcommand).toBeDefined();
		});

		test("help text includes subcommand list", async () => {
			const { verifyCommand } = await import("../index.js");

			const helpInfo = verifyCommand.helpInformation();
			expect(helpInfo).toContain("Commands:");
			expect(helpInfo).toContain("claude-code");
			expect(helpInfo).toContain("opencode");
			expect(helpInfo).toContain("codex");
		});
	});

	describe("verifyClaudeCodeSubcommand", () => {
		test("exports verifyClaudeCodeSubcommand", async () => {
			const { verifyClaudeCodeSubcommand } = await import("../index.js");

			expect(verifyClaudeCodeSubcommand).toBeInstanceOf(Command);
		});

		test("has correct command name", async () => {
			const { verifyClaudeCodeSubcommand } = await import("../index.js");

			expect(verifyClaudeCodeSubcommand.name()).toBe("claude-code");
		});

		test("has description mentioning Claude Code", async () => {
			const { verifyClaudeCodeSubcommand } = await import("../index.js");

			const description = verifyClaudeCodeSubcommand.description();
			expect(description.toLowerCase()).toContain("claude");
		});

		test("has no options (simple verification)", async () => {
			const { verifyClaudeCodeSubcommand } = await import("../index.js");

			const options = verifyClaudeCodeSubcommand.options;
			expect(options.length).toBe(0);
		});
	});

	describe("verifyOpenCodeSubcommand", () => {
		test("exports verifyOpenCodeSubcommand", async () => {
			const { verifyOpenCodeSubcommand } = await import("../index.js");

			expect(verifyOpenCodeSubcommand).toBeInstanceOf(Command);
		});

		test("has correct command name", async () => {
			const { verifyOpenCodeSubcommand } = await import("../index.js");

			expect(verifyOpenCodeSubcommand.name()).toBe("opencode");
		});

		test("has description mentioning OpenCode", async () => {
			const { verifyOpenCodeSubcommand } = await import("../index.js");

			const description = verifyOpenCodeSubcommand.description();
			expect(description.toLowerCase()).toContain("opencode");
		});

		test("accepts --artifacts-dir option", async () => {
			const { verifyOpenCodeSubcommand } = await import("../index.js");

			const options = verifyOpenCodeSubcommand.options;
			const artifactsOpt = options.find((o) => o.long === "--artifacts-dir");
			expect(artifactsOpt).toBeDefined();
		});
	});
});

describe("verify command function exports", () => {
	test("exports executeVerifyClaudeCode function", async () => {
		const { executeVerifyClaudeCode } = await import("../index.js");

		expect(typeof executeVerifyClaudeCode).toBe("function");
	});

	test("exports executeVerifyOpenCode function", async () => {
		const { executeVerifyOpenCode } = await import("../index.js");

		expect(typeof executeVerifyOpenCode).toBe("function");
	});
});

describe("verify command re-exports", () => {
	test("re-exports verifyClaudeCodeSubcommand", async () => {
		const verifyModule = await import("../index.js");

		expect(verifyModule.verifyClaudeCodeSubcommand).toBeDefined();
	});

	test("re-exports verifyOpenCodeSubcommand", async () => {
		const verifyModule = await import("../index.js");

		expect(verifyModule.verifyOpenCodeSubcommand).toBeDefined();
	});
});
