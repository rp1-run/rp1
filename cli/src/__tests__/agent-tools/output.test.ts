/**
 * Unit tests for agent-tools output module.
 * Tests JSON output formatting and result envelope creation.
 */

import { describe, expect, test } from "bun:test";
import type { ToolError, ToolResult } from "../../agent-tools/models.js";
import {
	errorResult,
	formatOutput,
	successResult,
} from "../../agent-tools/output.js";

describe("output", () => {
	describe("successResult", () => {
		test("creates result with success true", () => {
			const result = successResult("test-tool", { value: 1 });

			expect(result.success).toBe(true);
		});

		test("includes tool name", () => {
			const result = successResult("mmd-validate", {});

			expect(result.tool).toBe("mmd-validate");
		});

		test("includes data payload", () => {
			const data = {
				diagrams: [],
				summary: { total: 0, valid: 0, invalid: 0 },
			};
			const result = successResult("mmd-validate", data);

			expect(result.data).toEqual(data);
		});

		test("does not include errors field", () => {
			const result = successResult("test", {});

			expect(result.errors).toBeUndefined();
		});

		test("preserves complex data structures", () => {
			const data = {
				diagrams: [
					{ index: 0, valid: true, diagramType: "flowchart", startLine: 5 },
					{ index: 1, valid: true, diagramType: "sequence", startLine: 15 },
				],
				summary: { total: 2, valid: 2, invalid: 0 },
			};
			const result = successResult("mmd-validate", data);

			expect(result.data.diagrams).toHaveLength(2);
			expect(result.data.summary.total).toBe(2);
		});
	});

	describe("errorResult", () => {
		test("creates result with success false", () => {
			const errors: readonly ToolError[] = [{ message: "Error" }];
			const result = errorResult("test-tool", {}, errors);

			expect(result.success).toBe(false);
		});

		test("includes tool name", () => {
			const result = errorResult("mmd-validate", {}, []);

			expect(result.tool).toBe("mmd-validate");
		});

		test("includes data payload", () => {
			const data = {
				diagrams: [],
				summary: { total: 0, valid: 0, invalid: 0 },
			};
			const result = errorResult("mmd-validate", data, []);

			expect(result.data).toEqual(data);
		});

		test("includes errors array", () => {
			const errors: readonly ToolError[] = [
				{ message: "Parse error", line: 5 },
				{ message: "Another error", line: 10, column: 3 },
			];
			const result = errorResult("test", {}, errors);

			expect(result.errors).toHaveLength(2);
			expect(result.errors?.[0].message).toBe("Parse error");
			expect(result.errors?.[1].column).toBe(3);
		});

		test("includes error with all fields", () => {
			const errors: readonly ToolError[] = [
				{
					message: "Unexpected token",
					line: 10,
					column: 5,
					context: "A --> --> B",
				},
			];
			const result = errorResult("mmd-validate", {}, errors);

			expect(result.errors?.[0]).toEqual({
				message: "Unexpected token",
				line: 10,
				column: 5,
				context: "A --> --> B",
			});
		});

		test("handles empty errors array", () => {
			const result = errorResult("test", {}, []);

			expect(result.errors).toEqual([]);
		});
	});

	describe("formatOutput", () => {
		test("returns valid JSON string", () => {
			const result = successResult("test", { value: 1 });
			const output = formatOutput(result);

			expect(() => JSON.parse(output)).not.toThrow();
		});

		test("uses 2-space indentation", () => {
			const result = successResult("test", { value: 1 });
			const output = formatOutput(result);

			expect(output).toContain("\n  ");
			const lines = output.split("\n");
			const indentedLines = lines.filter((l) => l.startsWith("  "));
			expect(indentedLines.length).toBeGreaterThan(0);
		});

		test("preserves all fields in output", () => {
			const result = successResult("mmd-validate", {
				diagrams: [{ index: 0, valid: true, startLine: 5 }],
				summary: { total: 1, valid: 1, invalid: 0 },
			});
			const output = formatOutput(result);
			const parsed = JSON.parse(output) as ToolResult<unknown>;

			expect(parsed.success).toBe(true);
			expect(parsed.tool).toBe("mmd-validate");
			expect(parsed.data).toEqual({
				diagrams: [{ index: 0, valid: true, startLine: 5 }],
				summary: { total: 1, valid: 1, invalid: 0 },
			});
		});

		test("formats error result correctly", () => {
			const errors: readonly ToolError[] = [{ message: "Error", line: 5 }];
			const result = errorResult("test", { failed: true }, errors);
			const output = formatOutput(result);
			const parsed = JSON.parse(output) as ToolResult<unknown>;

			expect(parsed.success).toBe(false);
			expect(parsed.errors).toHaveLength(1);
		});

		test("output matches expected JSON structure", () => {
			const result = successResult("mmd-validate", {
				diagrams: [],
				summary: { total: 0, valid: 0, invalid: 0 },
			});
			const output = formatOutput(result);

			const expectedStructure = {
				success: true,
				tool: "mmd-validate",
				data: {
					diagrams: [],
					summary: { total: 0, valid: 0, invalid: 0 },
				},
			};

			expect(JSON.parse(output)).toEqual(expectedStructure);
		});

		test("handles null and undefined values in data", () => {
			const result = successResult("test", {
				nullValue: null,
				undefinedValue: undefined,
			});
			const output = formatOutput(result);
			const parsed = JSON.parse(output) as ToolResult<{
				nullValue: null;
				undefinedValue?: undefined;
			}>;

			expect(parsed.data.nullValue).toBe(null);
			expect(parsed.data.undefinedValue).toBeUndefined();
		});

		test("handles special characters in strings", () => {
			const errors: readonly ToolError[] = [
				{ message: 'Error with "quotes" and\nnewlines' },
			];
			const result = errorResult("test", {}, errors);
			const output = formatOutput(result);

			expect(() => JSON.parse(output)).not.toThrow();
			const parsed = JSON.parse(output) as ToolResult<unknown>;
			expect(parsed.errors?.[0].message).toBe(
				'Error with "quotes" and\nnewlines',
			);
		});
	});
});
