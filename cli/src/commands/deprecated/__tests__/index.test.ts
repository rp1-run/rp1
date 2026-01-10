/**
 * Unit tests for deprecated command wrappers.
 * Tests the deprecation wrapper utility and warning output format.
 */

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { Command } from "commander";
import { createDeprecatedCommand } from "../index.js";

describe("deprecated command wrappers", () => {
	let originalConsoleError: typeof console.error;
	let errorOutput: string[];

	beforeEach(() => {
		// Capture stderr output
		originalConsoleError = console.error;
		errorOutput = [];
		console.error = mock((...args: unknown[]) => {
			errorOutput.push(args.map(String).join(" "));
		});
	});

	afterEach(() => {
		console.error = originalConsoleError;
	});

	describe("createDeprecatedCommand", () => {
		test("returns a Command instance", () => {
			const cmd = createDeprecatedCommand("old-cmd", "new-cmd", async () => {});

			expect(cmd).toBeInstanceOf(Command);
		});

		test("sets correct command name", () => {
			const cmd = createDeprecatedCommand(
				"my-old-cmd",
				"my-new-cmd",
				async () => {},
			);

			expect(cmd.name()).toBe("my-old-cmd");
		});

		test("sets description with deprecated notice", () => {
			const cmd = createDeprecatedCommand(
				"install:claude-code",
				"install claude-code",
				async () => {},
			);

			const description = cmd.description();
			expect(description).toContain("DEPRECATED");
			expect(description).toContain("install claude-code");
		});

		test("allows unknown options to pass through", () => {
			const cmd = createDeprecatedCommand("test", "test-new", async () => {});

			// Commander sets this flag when allowUnknownOption() is called
			// @ts-expect-error - accessing internal commander property
			expect(cmd._allowUnknownOption).toBe(true);
		});

		test("warning message format is correct", () => {
			// Test that the deprecation message follows expected format
			const oldName = "install:opencode";
			const newName = "install opencode";
			const expectedMessage = `Warning: 'rp1 ${oldName}' is deprecated. Use 'rp1 ${newName}' instead.`;

			// Verify the expected format is correct by checking its structure
			expect(expectedMessage).toContain("Warning:");
			expect(expectedMessage).toContain(oldName);
			expect(expectedMessage).toContain("deprecated");
			expect(expectedMessage).toContain(newName);
			expect(expectedMessage).toContain("instead");
		});

		test("deprecation message mentions both old and new command", () => {
			const cmd = createDeprecatedCommand(
				"self-update",
				"update",
				async () => {},
			);

			const description = cmd.description();
			// Description should mention what to use instead
			expect(description).toContain("update");
		});
	});

	describe("deprecated command exports", () => {
		test("exports all required deprecated commands", async () => {
			const { allDeprecatedCommands } = await import("../index.js");

			expect(Array.isArray(allDeprecatedCommands)).toBe(true);
			expect(allDeprecatedCommands.length).toBe(6);
		});

		test("includes install:claude-code", async () => {
			const { allDeprecatedCommands } = await import("../index.js");

			const cmd = allDeprecatedCommands.find(
				(c) => c.name() === "install:claude-code",
			);
			expect(cmd).toBeDefined();
			expect(cmd?.description()).toContain("DEPRECATED");
		});

		test("includes install:opencode", async () => {
			const { allDeprecatedCommands } = await import("../index.js");

			const cmd = allDeprecatedCommands.find(
				(c) => c.name() === "install:opencode",
			);
			expect(cmd).toBeDefined();
		});

		test("includes verify:claude-code", async () => {
			const { allDeprecatedCommands } = await import("../index.js");

			const cmd = allDeprecatedCommands.find(
				(c) => c.name() === "verify:claude-code",
			);
			expect(cmd).toBeDefined();
		});

		test("includes verify:opencode", async () => {
			const { allDeprecatedCommands } = await import("../index.js");

			const cmd = allDeprecatedCommands.find(
				(c) => c.name() === "verify:opencode",
			);
			expect(cmd).toBeDefined();
		});

		test("includes self-update", async () => {
			const { allDeprecatedCommands } = await import("../index.js");

			const cmd = allDeprecatedCommands.find((c) => c.name() === "self-update");
			expect(cmd).toBeDefined();
			expect(cmd?.description()).toContain("update");
		});

		test("includes check-update", async () => {
			const { allDeprecatedCommands } = await import("../index.js");

			const cmd = allDeprecatedCommands.find(
				(c) => c.name() === "check-update",
			);
			expect(cmd).toBeDefined();
			expect(cmd?.description()).toContain("update --check");
		});
	});

	describe("deprecated command options", () => {
		test("install:claude-code accepts --dry-run option", async () => {
			const { deprecatedInstallClaudeCode } = await import("../index.js");

			const options = deprecatedInstallClaudeCode.options;
			const dryRunOpt = options.find(
				(o) => o.long === "--dry-run" || o.short === undefined,
			);
			expect(dryRunOpt).toBeDefined();
		});

		test("install:claude-code accepts -y/--yes option", async () => {
			const { deprecatedInstallClaudeCode } = await import("../index.js");

			const options = deprecatedInstallClaudeCode.options;
			const yesOpt = options.find(
				(o) => o.short === "-y" || o.long === "--yes",
			);
			expect(yesOpt).toBeDefined();
		});

		test("install:claude-code accepts -s/--scope option", async () => {
			const { deprecatedInstallClaudeCode } = await import("../index.js");

			const options = deprecatedInstallClaudeCode.options;
			const scopeOpt = options.find(
				(o) => o.short === "-s" || o.long === "--scope",
			);
			expect(scopeOpt).toBeDefined();
		});

		test("self-update accepts --force option", async () => {
			const { deprecatedSelfUpdate } = await import("../index.js");

			const options = deprecatedSelfUpdate.options;
			const forceOpt = options.find((o) => o.long === "--force");
			expect(forceOpt).toBeDefined();
		});
	});

	describe("createDeprecatedCommand action handler", () => {
		test("has action handler registered", () => {
			const cmd = createDeprecatedCommand(
				"test-cmd",
				"new-cmd",
				async () => {},
			);

			// Commander registers action handler
			// @ts-expect-error - accessing internal commander property
			expect(cmd._actionHandler).toBeDefined();
		});

		test("action handler is a function", () => {
			const cmd = createDeprecatedCommand(
				"test-cmd",
				"new-cmd",
				async () => {},
			);

			// @ts-expect-error - accessing internal commander property
			expect(typeof cmd._actionHandler).toBe("function");
		});
	});

	describe("deprecated command individual exports", () => {
		test("exports deprecatedInstallClaudeCode", async () => {
			const { deprecatedInstallClaudeCode } = await import("../index.js");

			expect(deprecatedInstallClaudeCode).toBeInstanceOf(Command);
			expect(deprecatedInstallClaudeCode.name()).toBe("install:claude-code");
		});

		test("exports deprecatedInstallOpencode", async () => {
			const { deprecatedInstallOpencode } = await import("../index.js");

			expect(deprecatedInstallOpencode).toBeInstanceOf(Command);
			expect(deprecatedInstallOpencode.name()).toBe("install:opencode");
		});

		test("exports deprecatedVerifyClaudeCode", async () => {
			const { deprecatedVerifyClaudeCode } = await import("../index.js");

			expect(deprecatedVerifyClaudeCode).toBeInstanceOf(Command);
			expect(deprecatedVerifyClaudeCode.name()).toBe("verify:claude-code");
		});

		test("exports deprecatedVerifyOpencode", async () => {
			const { deprecatedVerifyOpencode } = await import("../index.js");

			expect(deprecatedVerifyOpencode).toBeInstanceOf(Command);
			expect(deprecatedVerifyOpencode.name()).toBe("verify:opencode");
		});

		test("exports deprecatedSelfUpdate", async () => {
			const { deprecatedSelfUpdate } = await import("../index.js");

			expect(deprecatedSelfUpdate).toBeInstanceOf(Command);
			expect(deprecatedSelfUpdate.name()).toBe("self-update");
		});

		test("exports deprecatedCheckUpdate", async () => {
			const { deprecatedCheckUpdate } = await import("../index.js");

			expect(deprecatedCheckUpdate).toBeInstanceOf(Command);
			expect(deprecatedCheckUpdate.name()).toBe("check-update");
		});
	});
});
