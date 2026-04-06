/**
 * Unit tests for executeList with --json flag.
 * Verifies JSON output schema/content and that table output is unaffected.
 */

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import * as TE from "fp-ts/lib/TaskEither.js";
import { createLogger } from "../../../shared/logger.js";
import { expectTaskRight } from "../helpers/fp-ts-helpers.js";

const logger = createLogger({ level: "error", color: false });

const mockSkills = [
	{
		plugin: "rp1",
		name: "rp1-build",
		description: "End-to-end feature workflow",
	},
	{
		plugin: "rp1",
		name: "rp1-pr-review",
		description: "PR review with CI support",
	},
];

// Mock listInstalledSkills before importing executeList
mock.module("../../install/verifier.js", () => ({
	listInstalledSkills: () => TE.right(mockSkills),
	verifyInstallation: () => TE.right({}),
}));

// Dynamic import after mock setup
const { executeList } = await import("../../install/command.js");

describe("executeList", () => {
	let consoleLogs: string[];
	let originalLog: typeof console.log;

	beforeEach(() => {
		consoleLogs = [];
		originalLog = console.log;
		console.log = (...args: unknown[]) => {
			consoleLogs.push(args.map(String).join(" "));
		};
	});

	afterEach(() => {
		console.log = originalLog;
	});

	describe("--json output", () => {
		test("outputs valid JSON array with name, description, and plugin fields", async () => {
			await expectTaskRight(executeList([], logger, { json: true }));

			expect(consoleLogs).toHaveLength(1);
			const parsed = JSON.parse(consoleLogs[0]);
			expect(Array.isArray(parsed)).toBe(true);
			expect(parsed).toHaveLength(2);

			for (const skill of parsed) {
				expect(skill).toHaveProperty("name");
				expect(skill).toHaveProperty("description");
				expect(skill).toHaveProperty("plugin");
				expect(typeof skill.name).toBe("string");
				expect(typeof skill.description).toBe("string");
				expect(typeof skill.plugin).toBe("string");
			}

			expect(parsed[0].name).toBe("rp1-build");
			expect(parsed[0].description).toBe("End-to-end feature workflow");
			expect(parsed[0].plugin).toBe("rp1");
			expect(parsed[1].name).toBe("rp1-pr-review");
		});

		test("does not include table header or formatting in JSON mode", async () => {
			await expectTaskRight(executeList([], logger, { json: true }));

			expect(consoleLogs).toHaveLength(1);
			expect(consoleLogs[0]).toStartWith("[");
			expect(consoleLogs[0]).toEndWith("]");
		});
	});

	describe("table output (default)", () => {
		test("renders table with skills when json flag is not set", async () => {
			await expectTaskRight(executeList([], logger));

			const output = consoleLogs.join("\n");
			expect(output).toContain("Skill");
			expect(output).toContain("Description");
			expect(output).toContain("rp1-build");
			expect(output).toContain("End-to-end feature workflow");
			expect(output).toContain("Total: 2 skills");
		});

		test("table output is unchanged when json option is explicitly false", async () => {
			await expectTaskRight(executeList([], logger, { json: false }));

			const output = consoleLogs.join("\n");
			expect(output).toContain("┌");
			expect(output).toContain("rp1-build");
			expect(output).toContain("Total: 2 skills");
		});
	});
});

describe("executeList with empty skills", () => {
	let consoleLogs: string[];
	let originalLog: typeof console.log;

	beforeEach(() => {
		consoleLogs = [];
		originalLog = console.log;
		console.log = (...args: unknown[]) => {
			consoleLogs.push(args.map(String).join(" "));
		};
	});

	afterEach(() => {
		console.log = originalLog;
	});

	test("--json outputs empty array when no skills installed", async () => {
		// Re-mock with empty skills for this test
		mock.module("../../install/verifier.js", () => ({
			listInstalledSkills: () => TE.right([]),
			verifyInstallation: () => TE.right({}),
		}));
		const { executeList: executeListEmpty } = await import(
			"../../install/command.js"
		);

		await expectTaskRight(executeListEmpty([], logger, { json: true }));

		expect(consoleLogs).toHaveLength(1);
		const parsed = JSON.parse(consoleLogs[0]);
		expect(Array.isArray(parsed)).toBe(true);
		expect(parsed).toHaveLength(0);
	});
});
