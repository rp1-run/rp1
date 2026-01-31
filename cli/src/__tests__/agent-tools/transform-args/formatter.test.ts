/**
 * Unit tests for output formatter.
 * Tests generation of VARIABLE=value output for prompt interpolation.
 */

import { describe, expect, test } from "bun:test";
import {
	escapeValue,
	formatLine,
	formatOutput,
	formatOutputWithWarnings,
	formatValue,
	needsQuoting,
} from "../../../agent-tools/transform-args/formatter.js";
import type { TransformResult } from "../../../agent-tools/transform-args/models.js";

describe("formatter", () => {
	describe("needsQuoting", () => {
		test("returns false for simple alphanumeric value", () => {
			expect(needsQuoting("hello")).toBe(false);
			expect(needsQuoting("test123")).toBe(false);
			expect(needsQuoting("my-feature")).toBe(false);
		});

		test("returns true for value with spaces", () => {
			expect(needsQuoting("hello world")).toBe(true);
			expect(needsQuoting("add login feature")).toBe(true);
		});

		test("returns true for empty string", () => {
			expect(needsQuoting("")).toBe(true);
		});

		test("returns true for value with double quote", () => {
			expect(needsQuoting('say "hello"')).toBe(true);
		});

		test("returns true for value with backslash", () => {
			expect(needsQuoting("path\\to\\file")).toBe(true);
		});

		test("returns true for value with dollar sign", () => {
			expect(needsQuoting("$HOME")).toBe(true);
		});

		test("returns true for value with backtick", () => {
			expect(needsQuoting("`echo hi`")).toBe(true);
		});

		test("returns true for value with shell metacharacters", () => {
			expect(needsQuoting("a | b")).toBe(true);
			expect(needsQuoting("a & b")).toBe(true);
			expect(needsQuoting("a; b")).toBe(true);
			expect(needsQuoting("a > b")).toBe(true);
			expect(needsQuoting("a < b")).toBe(true);
			expect(needsQuoting("file*")).toBe(true);
			expect(needsQuoting("file?")).toBe(true);
			expect(needsQuoting("[abc]")).toBe(true);
			expect(needsQuoting("(group)")).toBe(true);
			expect(needsQuoting("{a,b}")).toBe(true);
		});
	});

	describe("escapeValue", () => {
		test("escapes double quotes", () => {
			expect(escapeValue('say "hello"')).toBe('say \\"hello\\"');
		});

		test("escapes backslashes", () => {
			expect(escapeValue("path\\to\\file")).toBe("path\\\\to\\\\file");
		});

		test("escapes dollar signs", () => {
			expect(escapeValue("$HOME/$USER")).toBe("\\$HOME/\\$USER");
		});

		test("escapes backticks", () => {
			expect(escapeValue("`command`")).toBe("\\`command\\`");
		});

		test("handles mixed special characters", () => {
			expect(escapeValue('$VAR="value"')).toBe('\\$VAR=\\"value\\"');
		});
	});

	describe("formatValue", () => {
		test("formats simple value without quotes", () => {
			expect(formatValue("my-feature")).toBe("my-feature");
		});

		test("formats value with spaces in quotes", () => {
			expect(formatValue("add login feature")).toBe('"add login feature"');
		});

		test("formats empty string in quotes", () => {
			expect(formatValue("")).toBe('""');
		});

		test("formats boolean values as lowercase", () => {
			expect(formatValue("true")).toBe("true");
			expect(formatValue("TRUE")).toBe("true");
			expect(formatValue("True")).toBe("true");
			expect(formatValue("false")).toBe("false");
			expect(formatValue("FALSE")).toBe("false");
		});

		test("formats value with special chars escaped and quoted", () => {
			expect(formatValue('say "hello"')).toBe('"say \\"hello\\""');
			expect(formatValue("$HOME")).toBe('"\\$HOME"');
		});
	});

	describe("formatLine", () => {
		test("formats simple variable assignment", () => {
			expect(formatLine("FEATURE_ID", "my-feature")).toBe(
				"FEATURE_ID=my-feature",
			);
		});

		test("formats variable with quoted value", () => {
			expect(formatLine("REQUIREMENTS", "add login feature")).toBe(
				'REQUIREMENTS="add login feature"',
			);
		});

		test("formats boolean variable", () => {
			expect(formatLine("AFK", "true")).toBe("AFK=true");
			expect(formatLine("VERBOSE", "false")).toBe("VERBOSE=false");
		});

		test("formats variable with empty value", () => {
			expect(formatLine("EMPTY", "")).toBe('EMPTY=""');
		});
	});

	describe("formatOutput", () => {
		test("formats single variable", () => {
			const result: TransformResult = {
				variables: { FEATURE_ID: "my-feature" },
				warnings: [],
				schemaUsed: true,
							};

			expect(formatOutput(result)).toBe("FEATURE_ID=my-feature");
		});

		test("formats multiple variables sorted alphabetically", () => {
			const result: TransformResult = {
				variables: {
					VERBOSE: "false",
					AFK: "true",
					FEATURE_ID: "my-feature",
				},
				warnings: [],
				schemaUsed: true,
							};

			const output = formatOutput(result);
			const lines = output.split("\n");

			expect(lines).toEqual([
				"AFK=true",
				"FEATURE_ID=my-feature",
				"VERBOSE=false",
			]);
		});

		test("deterministic output for same input", () => {
			const result: TransformResult = {
				variables: {
					Z_VAR: "z",
					A_VAR: "a",
					M_VAR: "m",
				},
				warnings: [],
				schemaUsed: true,
							};

			const output1 = formatOutput(result);
			const output2 = formatOutput(result);

			expect(output1).toBe(output2);
			expect(output1).toBe("A_VAR=a\nM_VAR=m\nZ_VAR=z");
		});

		test("formats empty variables as empty string", () => {
			const result: TransformResult = {
				variables: {},
				warnings: [],
				schemaUsed: true,
							};

			expect(formatOutput(result)).toBe("");
		});

		test("formats complex values with proper quoting", () => {
			const result: TransformResult = {
				variables: {
					REQUIREMENTS: "add login with OAuth 2.0",
					FEATURE_ID: "auth-feature",
					PATH: "$HOME/project",
				},
				warnings: [],
				schemaUsed: true,
							};

			const output = formatOutput(result);
			const lines = output.split("\n");

			expect(lines[0]).toBe("FEATURE_ID=auth-feature");
			expect(lines[1]).toBe('PATH="\\$HOME/project"');
			expect(lines[2]).toBe('REQUIREMENTS="add login with OAuth 2.0"');
		});
	});

	describe("formatOutputWithWarnings", () => {
		test("formats output without warnings", () => {
			const result: TransformResult = {
				variables: { FEATURE_ID: "my-feature" },
				warnings: [],
				schemaUsed: true,
							};

			expect(formatOutputWithWarnings(result)).toBe("FEATURE_ID=my-feature");
		});

		test("includes single warning as comment", () => {
			const result: TransformResult = {
				variables: { ARG_1: "value" },
				warnings: ["Using fallback argument parsing"],
				schemaUsed: false,
							};

			const output = formatOutputWithWarnings(result);
			const lines = output.split("\n");

			expect(lines[0]).toBe("# Warning: Using fallback argument parsing");
			expect(lines[1]).toBe("");
			expect(lines[2]).toBe("ARG_1=value");
		});

		test("includes multiple warnings as comments", () => {
			const result: TransformResult = {
				variables: { ARG_1: "value" },
				warnings: [
					"Plugin command not found",
					"Using fallback argument parsing",
				],
				schemaUsed: false,
							};

			const output = formatOutputWithWarnings(result);
			const lines = output.split("\n");

			expect(lines[0]).toBe("# Warning: Plugin command not found");
			expect(lines[1]).toBe("# Warning: Using fallback argument parsing");
			expect(lines[2]).toBe("");
			expect(lines[3]).toBe("ARG_1=value");
		});

		test("handles warnings with empty variables", () => {
			const result: TransformResult = {
				variables: {},
				warnings: ["No arguments provided"],
				schemaUsed: false,
							};

			const output = formatOutputWithWarnings(result);
			const lines = output.split("\n");

			expect(lines[0]).toBe("# Warning: No arguments provided");
			expect(lines[1]).toBe("");
			expect(lines[2]).toBe("");
		});
	});
});
