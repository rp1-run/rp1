/**
 * Unit tests for arcade command registration and configuration.
 * Verifies the rename from `view` to `arcade` is complete and correct.
 */

import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { arcadeCommand } from "../../commands/arcade.js";

const cliSrcDir = join(fileURLToPath(import.meta.url), "..", "..", "..", "..");

describe("arcade command", () => {
	describe("command registration", () => {
		test("command name is 'arcade'", () => {
			expect(arcadeCommand.name()).toBe("arcade");
		});

		test("command has a description", () => {
			const description = arcadeCommand.description();
			expect(description.length).toBeGreaterThan(0);
			expect(description).toContain("dashboard");
		});

		test("description does not reference 'view'", () => {
			const description = arcadeCommand.description();
			expect(description.toLowerCase()).not.toContain("view command");
		});
	});

	describe("command options", () => {
		test("has --port option", () => {
			const portOption = arcadeCommand.options.find(
				(opt) => opt.long === "--port",
			);
			expect(portOption).toBeDefined();
			expect(portOption?.short).toBe("-p");
		});

		test("has --no-open option", () => {
			const noOpenOption = arcadeCommand.options.find(
				(opt) => opt.long === "--no-open",
			);
			expect(noOpenOption).toBeDefined();
		});

		test("has --stop option", () => {
			const stopOption = arcadeCommand.options.find(
				(opt) => opt.long === "--stop",
			);
			expect(stopOption).toBeDefined();
		});

		test("has --status option", () => {
			const statusOption = arcadeCommand.options.find(
				(opt) => opt.long === "--status",
			);
			expect(statusOption).toBeDefined();
		});

		test("has --restart option", () => {
			const restartOption = arcadeCommand.options.find(
				(opt) => opt.long === "--restart",
			);
			expect(restartOption).toBeDefined();
		});

		test("accepts [path] argument", () => {
			const args = arcadeCommand.registeredArguments;
			expect(args.length).toBeGreaterThanOrEqual(1);
			const pathArg = args.find((a) => a.name() === "path");
			expect(pathArg).toBeDefined();
			expect(pathArg?.required).toBe(false);
		});
	});

	describe("view command removal", () => {
		test("no view.ts file exists in commands directory", () => {
			const viewPath = join(cliSrcDir, "src", "commands", "view.ts");
			expect(existsSync(viewPath)).toBe(false);
		});

		test("no view.js file exists in commands directory", () => {
			const viewPath = join(cliSrcDir, "src", "commands", "view.js");
			expect(existsSync(viewPath)).toBe(false);
		});
	});

	describe("help text", () => {
		test("basic help text contains command description", () => {
			const helpText = arcadeCommand.helpInformation();
			expect(helpText).toContain("arcade");
			expect(helpText).toContain("dashboard");
		});

		test("basic help text does not reference 'view'", () => {
			const helpText = arcadeCommand.helpInformation();
			expect(helpText).not.toContain("rp1 view");
			expect(helpText).not.toContain("view command");
		});
	});
});
