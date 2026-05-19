/**
 * Unit tests for the install parent command and subcommands.
 * Tests command structure, option parsing, and help text.
 */

import { describe, expect, test } from "bun:test";
import { Command } from "commander";

describe("install command structure", () => {
	describe("installParentCommand", () => {
		test("exports installParentCommand", async () => {
			const { installParentCommand } = await import("../index.js");

			expect(installParentCommand).toBeInstanceOf(Command);
		});

		test("has correct command name", async () => {
			const { installParentCommand } = await import("../index.js");

			expect(installParentCommand.name()).toBe("install");
		});

		test("has description", async () => {
			const { installParentCommand } = await import("../index.js");

			const description = installParentCommand.description();
			expect(description).toBeTruthy();
			expect(description.toLowerCase()).toContain("install");
			expect(description.toLowerCase()).toContain("plugin");
		});

		test("has six subcommands", async () => {
			const { installParentCommand } = await import("../index.js");

			const subcommands = installParentCommand.commands;
			expect(subcommands.length).toBe(6);
		});

		test("includes claude-code subcommand", async () => {
			const { installParentCommand } = await import("../index.js");

			const subcommand = installParentCommand.commands.find(
				(c) => c.name() === "claude-code",
			);
			expect(subcommand).toBeDefined();
		});

		test("includes opencode subcommand", async () => {
			const { installParentCommand } = await import("../index.js");

			const subcommand = installParentCommand.commands.find(
				(c) => c.name() === "opencode",
			);
			expect(subcommand).toBeDefined();
		});

		test("includes all subcommand", async () => {
			const { installParentCommand } = await import("../index.js");

			const subcommand = installParentCommand.commands.find(
				(c) => c.name() === "all",
			);
			expect(subcommand).toBeDefined();
		});

		test("includes gemini subcommand", async () => {
			const { installParentCommand } = await import("../index.js");

			const subcommand = installParentCommand.commands.find(
				(c) => c.name() === "gemini",
			);
			expect(subcommand).toBeDefined();
		});

		test("help text includes subcommand list", async () => {
			const { installParentCommand } = await import("../index.js");

			const helpInfo = installParentCommand.helpInformation();
			expect(helpInfo).toContain("Commands:");
			expect(helpInfo).toContain("claude-code");
			expect(helpInfo).toContain("opencode");
			expect(helpInfo).toContain("gemini");
			expect(helpInfo).toContain("all");
		});

		test("has a default action handler for no-subcommand invocation", async () => {
			const { installParentCommand } = await import("../index.js");

			// Commander stores action handlers internally via _actionHandler
			// A command with .action() set will have a non-null _actionHandler
			expect(
				(installParentCommand as unknown as { _actionHandler: unknown })
					._actionHandler,
			).not.toBeNull();
		});

		test("accepts --dry-run option on parent command", async () => {
			const { installParentCommand } = await import("../index.js");

			const dryRunOpt = installParentCommand.options.find(
				(o) => o.long === "--dry-run",
			);
			expect(dryRunOpt).toBeDefined();
		});

		test("accepts -y/--yes option on parent command", async () => {
			const { installParentCommand } = await import("../index.js");

			const yesOpt = installParentCommand.options.find(
				(o) => o.short === "-y" || o.long === "--yes",
			);
			expect(yesOpt).toBeDefined();
		});

		test("accepts -p/--platform option on parent command", async () => {
			const { installParentCommand } = await import("../index.js");

			const platformOpt = installParentCommand.options.find(
				(o) => o.short === "-p" || o.long === "--platform",
			);
			expect(platformOpt).toBeDefined();
		});

		test("--platform option expects a value argument", async () => {
			const { installParentCommand } = await import("../index.js");

			const platformOpt = installParentCommand.options.find(
				(o) => o.long === "--platform",
			);
			expect(platformOpt).toBeDefined();
			expect(platformOpt?.required).toBe(true);
		});

		test("subcommands remain accessible alongside default action", async () => {
			const { installParentCommand } = await import("../index.js");

			const subcommandNames = installParentCommand.commands.map((c) =>
				c.name(),
			);
			expect(subcommandNames).toContain("claude-code");
			expect(subcommandNames).toContain("opencode");
			expect(subcommandNames).toContain("gemini");
			expect(subcommandNames).toContain("all");
		});

		test("each subcommand has its own action handler", async () => {
			const { installParentCommand } = await import("../index.js");

			for (const sub of installParentCommand.commands) {
				expect(
					(sub as unknown as { _actionHandler: unknown })._actionHandler,
				).not.toBeNull();
			}
		});

		test("parent command options are listed in help output", async () => {
			const { installParentCommand } = await import("../index.js");

			const helpInfo = installParentCommand.helpInformation();
			expect(helpInfo).toContain("--platform");
			expect(helpInfo).toContain("--dry-run");
			expect(helpInfo).toContain("-y, --yes");
		});
	});

	describe("installClaudeCodeSubcommand", () => {
		test("exports installClaudeCodeSubcommand", async () => {
			const { installClaudeCodeSubcommand } = await import("../index.js");

			expect(installClaudeCodeSubcommand).toBeInstanceOf(Command);
		});

		test("has correct command name", async () => {
			const { installClaudeCodeSubcommand } = await import("../index.js");

			expect(installClaudeCodeSubcommand.name()).toBe("claude-code");
		});

		test("has description mentioning Claude Code", async () => {
			const { installClaudeCodeSubcommand } = await import("../index.js");

			const description = installClaudeCodeSubcommand.description();
			expect(description.toLowerCase()).toContain("claude");
		});

		test("accepts --dry-run option", async () => {
			const { installClaudeCodeSubcommand } = await import("../index.js");

			const options = installClaudeCodeSubcommand.options;
			const dryRunOpt = options.find((o) => o.long === "--dry-run");
			expect(dryRunOpt).toBeDefined();
		});

		test("accepts -y/--yes option", async () => {
			const { installClaudeCodeSubcommand } = await import("../index.js");

			const options = installClaudeCodeSubcommand.options;
			const yesOpt = options.find(
				(o) => o.short === "-y" || o.long === "--yes",
			);
			expect(yesOpt).toBeDefined();
		});

		test("accepts -s/--scope option with default", async () => {
			const { installClaudeCodeSubcommand } = await import("../index.js");

			const options = installClaudeCodeSubcommand.options;
			const scopeOpt = options.find(
				(o) => o.short === "-s" || o.long === "--scope",
			);
			expect(scopeOpt).toBeDefined();
			expect(scopeOpt?.defaultValue).toBe("user");
		});

		test("help text includes scope option description", async () => {
			const { installClaudeCodeSubcommand } = await import("../index.js");

			const helpInfo = installClaudeCodeSubcommand.helpInformation();
			expect(helpInfo).toContain("-s, --scope");
			expect(helpInfo).toContain("user");
		});
	});

	describe("installOpenCodeSubcommand", () => {
		test("exports installOpenCodeSubcommand", async () => {
			const { installOpenCodeSubcommand } = await import("../index.js");

			expect(installOpenCodeSubcommand).toBeInstanceOf(Command);
		});

		test("has correct command name", async () => {
			const { installOpenCodeSubcommand } = await import("../index.js");

			expect(installOpenCodeSubcommand.name()).toBe("opencode");
		});

		test("has description mentioning OpenCode", async () => {
			const { installOpenCodeSubcommand } = await import("../index.js");

			const description = installOpenCodeSubcommand.description();
			expect(description.toLowerCase()).toContain("opencode");
		});

		test("accepts --dry-run option", async () => {
			const { installOpenCodeSubcommand } = await import("../index.js");

			const options = installOpenCodeSubcommand.options;
			const dryRunOpt = options.find((o) => o.long === "--dry-run");
			expect(dryRunOpt).toBeDefined();
		});

		test("accepts -y/--yes option", async () => {
			const { installOpenCodeSubcommand } = await import("../index.js");

			const options = installOpenCodeSubcommand.options;
			const yesOpt = options.find(
				(o) => o.short === "-y" || o.long === "--yes",
			);
			expect(yesOpt).toBeDefined();
		});
	});

	describe("installAllSubcommand", () => {
		test("exports installAllSubcommand", async () => {
			const { installAllSubcommand } = await import("../index.js");

			expect(installAllSubcommand).toBeInstanceOf(Command);
		});

		test("has correct command name", async () => {
			const { installAllSubcommand } = await import("../index.js");

			expect(installAllSubcommand.name()).toBe("all");
		});

		test("has description mentioning all tools", async () => {
			const { installAllSubcommand } = await import("../index.js");

			const description = installAllSubcommand.description();
			expect(description.toLowerCase()).toContain("all");
			expect(description.toLowerCase()).toContain("detect");
		});

		test("accepts --dry-run option", async () => {
			const { installAllSubcommand } = await import("../index.js");

			const options = installAllSubcommand.options;
			const dryRunOpt = options.find((o) => o.long === "--dry-run");
			expect(dryRunOpt).toBeDefined();
		});

		test("accepts -y/--yes option", async () => {
			const { installAllSubcommand } = await import("../index.js");

			const options = installAllSubcommand.options;
			const yesOpt = options.find(
				(o) => o.short === "-y" || o.long === "--yes",
			);
			expect(yesOpt).toBeDefined();
		});

		test("help text includes option descriptions", async () => {
			const { installAllSubcommand } = await import("../index.js");

			const helpInfo = installAllSubcommand.helpInformation();
			expect(helpInfo).toContain("--dry-run");
			expect(helpInfo).toContain("-y, --yes");
		});
	});

	describe("installGeminiSubcommand", () => {
		test("exports installGeminiSubcommand", async () => {
			const { installGeminiSubcommand } = await import("../index.js");

			expect(installGeminiSubcommand).toBeInstanceOf(Command);
		});

		test("has correct command name", async () => {
			const { installGeminiSubcommand } = await import("../index.js");

			expect(installGeminiSubcommand.name()).toBe("gemini");
		});

		test("has description marking Gemini as generated-bundle scoped", async () => {
			const { installGeminiSubcommand } = await import("../index.js");

			const description = installGeminiSubcommand.description();
			expect(description.toLowerCase()).toContain("generated");
			expect(description.toLowerCase()).toContain("gemini");
		});

		test("accepts --dry-run option", async () => {
			const { installGeminiSubcommand } = await import("../index.js");

			const dryRunOpt = installGeminiSubcommand.options.find(
				(o) => o.long === "--dry-run",
			);
			expect(dryRunOpt).toBeDefined();
		});
	});
});

describe("install command option parsing", () => {
	describe("option defaults", () => {
		test("--dry-run defaults to false (not set)", async () => {
			const { installClaudeCodeSubcommand } = await import("../index.js");

			const dryRunOpt = installClaudeCodeSubcommand.options.find(
				(o) => o.long === "--dry-run",
			);
			// Options without default value are undefined until explicitly set
			expect(dryRunOpt?.defaultValue).toBeUndefined();
		});

		test("--yes defaults to false (not set)", async () => {
			const { installClaudeCodeSubcommand } = await import("../index.js");

			const yesOpt = installClaudeCodeSubcommand.options.find(
				(o) => o.long === "--yes",
			);
			expect(yesOpt?.defaultValue).toBeUndefined();
		});

		test("--scope defaults to user", async () => {
			const { installClaudeCodeSubcommand } = await import("../index.js");

			const scopeOpt = installClaudeCodeSubcommand.options.find(
				(o) => o.long === "--scope",
			);
			expect(scopeOpt?.defaultValue).toBe("user");
		});
	});
});

describe("install command re-exports", () => {
	test("re-exports installClaudeCodeSubcommand", async () => {
		const installModule = await import("../index.js");

		expect(installModule.installClaudeCodeSubcommand).toBeDefined();
	});

	test("re-exports installOpenCodeSubcommand", async () => {
		const installModule = await import("../index.js");

		expect(installModule.installOpenCodeSubcommand).toBeDefined();
	});

	test("re-exports installAllSubcommand", async () => {
		const installModule = await import("../index.js");

		expect(installModule.installAllSubcommand).toBeDefined();
	});

	test("re-exports installGeminiSubcommand", async () => {
		const installModule = await import("../index.js");

		expect(installModule.installGeminiSubcommand).toBeDefined();
	});
});
