/**
 * Unit tests for mmd-validate validator module.
 * Tests error location parsing and validation result mapping.
 * Browser interactions are not tested here as they depend on external library behavior.
 */

import { describe, expect, test } from "bun:test";
import type { DiagramBlock } from "../../../agent-tools/mmd-validate/models.js";
import { parseErrorLocation } from "../../../agent-tools/mmd-validate/validator.js";

describe("validator", () => {
	describe("parseErrorLocation", () => {
		const createBlock = (
			overrides: Partial<DiagramBlock> = {},
		): DiagramBlock => ({
			index: 0,
			content: "graph TD\n  A --> B",
			startLine: 10,
			endLine: 12,
			...overrides,
		});

		test("extracts line number from 'line X' pattern", () => {
			const error = { message: "Parse error on line 3" };
			const block = createBlock({ startLine: 10 });

			const result = parseErrorLocation(error, block);

			expect(result.line).toBe(12);
			expect(result.diagramIndex).toBe(0);
			expect(result.message).toBe("Parse error on line 3");
		});

		test("extracts line from 'line X column Y' pattern (column requires separate match)", () => {
			const error = {
				message: "Unexpected token at line 2 column 5",
			};
			const block = createBlock({ startLine: 10 });

			const result = parseErrorLocation(error, block);

			expect(result.line).toBe(11);
		});

		test("uses block start line when no line number in error", () => {
			const error = { message: "Invalid syntax" };
			const block = createBlock({ startLine: 15 });

			const result = parseErrorLocation(error, block);

			expect(result.line).toBe(15);
		});

		test("adds context from first non-empty line when no line number", () => {
			const error = { message: "Unknown error" };
			const block = createBlock({
				content: "\n  flowchart TD\n  A --> B",
			});

			const result = parseErrorLocation(error, block);

			expect(result.context).toBe("  flowchart TD");
		});

		test("truncates context to 80 characters", () => {
			const longLine =
				"A".repeat(100) +
				" --> B this is a very long line that should be truncated";
			const error = { message: "Error" };
			const block = createBlock({ content: longLine });

			const result = parseErrorLocation(error, block);

			expect(result.context?.length).toBe(80);
		});

		test("preserves diagram index from block", () => {
			const error = { message: "Error" };
			const block = createBlock({ index: 5 });

			const result = parseErrorLocation(error, block);

			expect(result.diagramIndex).toBe(5);
		});

		test("handles case-insensitive line pattern", () => {
			const error = { message: "Error on LINE 4" };
			const block = createBlock({ startLine: 10 });

			const result = parseErrorLocation(error, block);

			expect(result.line).toBe(13);
		});

		test("handles error with hash object", () => {
			const error = {
				message: "Parse error",
				hash: { loc: { first_line: 2 } },
			};
			const block = createBlock();

			const result = parseErrorLocation(error, block);

			expect(result.message).toBe("Parse error");
			expect(result.diagramIndex).toBe(0);
		});

		test("handles empty content block", () => {
			const error = { message: "Empty diagram" };
			const block = createBlock({ content: "" });

			const result = parseErrorLocation(error, block);

			expect(result.context).toBe("");
		});

		test("handles single line content", () => {
			const error = { message: "Invalid" };
			const block = createBlock({ content: "graph TD" });

			const result = parseErrorLocation(error, block);

			expect(result.context).toBe("graph TD");
		});

		test("calculates relative line offset correctly", () => {
			const error = { message: "Parse error on line 1" };
			const block = createBlock({ startLine: 10 });

			const result = parseErrorLocation(error, block);

			expect(result.line).toBe(10);
		});

		test("handles line 0 in error message", () => {
			const error = { message: "Error at line 0" };
			const block = createBlock({ startLine: 5 });

			const result = parseErrorLocation(error, block);

			expect(result.line).toBe(4);
		});

		test("matches first line number in message when multiple present", () => {
			const error = {
				message: "Error at line 3 column 10, but also mentions line 5",
			};
			const block = createBlock({ startLine: 10 });

			const result = parseErrorLocation(error, block);

			expect(result.line).toBe(12);
		});
	});
});
