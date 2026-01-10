/**
 * Unit tests for the update command and subcommands.
 * Tests command structure, option parsing, help text, and exported functions.
 */

import { describe, expect, test } from "bun:test";
import { Command } from "commander";

describe("update command structure", () => {
	describe("updateCommand", () => {
		test("exports updateCommand", async () => {
			const { updateCommand } = await import("../index.js");

			expect(updateCommand).toBeInstanceOf(Command);
		});

		test("has correct command name", async () => {
			const { updateCommand } = await import("../index.js");

			expect(updateCommand.name()).toBe("update");
		});

		test("has description", async () => {
			const { updateCommand } = await import("../index.js");

			const description = updateCommand.description();
			expect(description).toBeTruthy();
			expect(description.toLowerCase()).toContain("update");
		});

		test("has plugins subcommand", async () => {
			const { updateCommand } = await import("../index.js");

			const subcommands = updateCommand.commands;
			const pluginsCmd = subcommands.find((c) => c.name() === "plugins");
			expect(pluginsCmd).toBeDefined();
		});

		test("accepts --check option", async () => {
			const { updateCommand } = await import("../index.js");

			const options = updateCommand.options;
			const checkOpt = options.find((o) => o.long === "--check");
			expect(checkOpt).toBeDefined();
		});

		test("accepts --dry-run option", async () => {
			const { updateCommand } = await import("../index.js");

			const options = updateCommand.options;
			const dryRunOpt = options.find((o) => o.long === "--dry-run");
			expect(dryRunOpt).toBeDefined();
		});

		test("accepts --force option", async () => {
			const { updateCommand } = await import("../index.js");

			const options = updateCommand.options;
			const forceOpt = options.find((o) => o.long === "--force");
			expect(forceOpt).toBeDefined();
		});

		test("accepts -y/--yes option", async () => {
			const { updateCommand } = await import("../index.js");

			const options = updateCommand.options;
			const yesOpt = options.find(
				(o) => o.short === "-y" || o.long === "--yes",
			);
			expect(yesOpt).toBeDefined();
		});

		test("help text includes options and subcommands", async () => {
			const { updateCommand } = await import("../index.js");

			const helpInfo = updateCommand.helpInformation();
			expect(helpInfo).toContain("--check");
			expect(helpInfo).toContain("--dry-run");
			expect(helpInfo).toContain("--force");
			expect(helpInfo).toContain("-y, --yes");
			expect(helpInfo).toContain("plugins");
		});
	});

	describe("pluginsSubcommand", () => {
		test("exports pluginsSubcommand", async () => {
			const { pluginsSubcommand } = await import("../plugins.js");

			expect(pluginsSubcommand).toBeInstanceOf(Command);
		});

		test("has correct command name", async () => {
			const { pluginsSubcommand } = await import("../plugins.js");

			expect(pluginsSubcommand.name()).toBe("plugins");
		});

		test("has description mentioning plugins", async () => {
			const { pluginsSubcommand } = await import("../plugins.js");

			const description = pluginsSubcommand.description();
			expect(description.toLowerCase()).toContain("plugin");
		});

		test("accepts optional tool argument", async () => {
			const { pluginsSubcommand } = await import("../plugins.js");

			// @ts-expect-error - accessing internal commander property
			const args = pluginsSubcommand._args;
			expect(args.length).toBe(1);
			expect(args[0].required).toBe(false);
		});

		test("accepts --dry-run option", async () => {
			const { pluginsSubcommand } = await import("../plugins.js");

			const options = pluginsSubcommand.options;
			const dryRunOpt = options.find((o) => o.long === "--dry-run");
			expect(dryRunOpt).toBeDefined();
		});

		test("accepts -y/--yes option", async () => {
			const { pluginsSubcommand } = await import("../plugins.js");

			const options = pluginsSubcommand.options;
			const yesOpt = options.find(
				(o) => o.short === "-y" || o.long === "--yes",
			);
			expect(yesOpt).toBeDefined();
		});

		test("help text includes tool options", async () => {
			const { pluginsSubcommand } = await import("../plugins.js");

			const helpInfo = pluginsSubcommand.helpInformation();
			expect(helpInfo).toContain("all");
			expect(helpInfo).toContain("claude-code");
			expect(helpInfo).toContain("opencode");
		});
	});
});

describe("update command option defaults", () => {
	test("--check defaults to false", async () => {
		const { updateCommand } = await import("../index.js");

		const checkOpt = updateCommand.options.find((o) => o.long === "--check");
		expect(checkOpt?.defaultValue).toBe(false);
	});

	test("--dry-run defaults to false", async () => {
		const { updateCommand } = await import("../index.js");

		const dryRunOpt = updateCommand.options.find((o) => o.long === "--dry-run");
		expect(dryRunOpt?.defaultValue).toBe(false);
	});

	test("--force defaults to false", async () => {
		const { updateCommand } = await import("../index.js");

		const forceOpt = updateCommand.options.find((o) => o.long === "--force");
		expect(forceOpt?.defaultValue).toBe(false);
	});

	test("--yes defaults to false", async () => {
		const { updateCommand } = await import("../index.js");

		const yesOpt = updateCommand.options.find((o) => o.long === "--yes");
		expect(yesOpt?.defaultValue).toBe(false);
	});
});

describe("update command function exports", () => {
	test("exports formatCheckOutput function", async () => {
		const { formatCheckOutput } = await import("../index.js");

		expect(typeof formatCheckOutput).toBe("function");
	});

	test("exports executeSelfUpdate function", async () => {
		const { executeSelfUpdate } = await import("../index.js");

		expect(typeof executeSelfUpdate).toBe("function");
	});

	test("exports executeUpdateAction function", async () => {
		const { executeUpdateAction } = await import("../index.js");

		expect(typeof executeUpdateAction).toBe("function");
	});
});

describe("update command integration with plugins subcommand", () => {
	test("plugins subcommand is registered on updateCommand", async () => {
		const { updateCommand } = await import("../index.js");

		const pluginsCmd = updateCommand.commands.find(
			(c) => c.name() === "plugins",
		);
		expect(pluginsCmd).toBeDefined();
		expect(pluginsCmd?.name()).toBe("plugins");
	});

	test("plugins subcommand has correct parent relationship", async () => {
		const { updateCommand } = await import("../index.js");

		const pluginsCmd = updateCommand.commands.find(
			(c) => c.name() === "plugins",
		);
		// Parent is set when added via addCommand
		expect(pluginsCmd?.parent).toBe(updateCommand);
	});
});

describe("update plugins tool argument validation", () => {
	test("help text documents valid tool values", async () => {
		const { pluginsSubcommand } = await import("../plugins.js");

		const helpInfo = pluginsSubcommand.helpInformation();

		// Valid values should be documented
		expect(helpInfo).toContain("all");
		expect(helpInfo).toContain("claude-code");
		expect(helpInfo).toContain("opencode");
	});

	test("argument description mentions default", async () => {
		const { pluginsSubcommand } = await import("../plugins.js");

		// @ts-expect-error - accessing internal commander property
		const args = pluginsSubcommand._args;
		const toolArg = args[0];

		// Default behavior is "all" when no tool specified
		expect(toolArg.description.toLowerCase()).toContain("all");
	});
});
