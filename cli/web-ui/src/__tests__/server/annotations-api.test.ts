/**
 * Unit tests for isValidAnchor in annotations-api.
 * Covers edit-diff anchor validation, malformed rejection,
 * and backward compatibility with existing anchor types.
 */

import { describe, expect, test } from "bun:test";
import { isValidAnchor } from "../../server/routes/annotations-api";

describe("isValidAnchor", () => {
	describe("edit-diff anchors", () => {
		test("accepts valid edit-diff anchor with diffs and baselineHash", () => {
			const anchor = {
				type: "edit-diff",
				diffs: [
					{ type: "added", line: 1, before: null, after: "new line" },
					{
						type: "modified",
						line: 3,
						before: "old text",
						after: "new text",
					},
					{ type: "deleted", line: 5, before: "removed", after: null },
				],
				baselineHash: "abc123def456",
			};
			expect(isValidAnchor(anchor)).toBe(true);
		});

		test("accepts edit-diff anchor with empty diffs array", () => {
			const anchor = {
				type: "edit-diff",
				diffs: [],
				baselineHash: "abc123",
			};
			expect(isValidAnchor(anchor)).toBe(true);
		});

		test("accepts edit-diff anchor with unchanged diff entries", () => {
			const anchor = {
				type: "edit-diff",
				diffs: [{ type: "unchanged", line: 1, before: "same", after: "same" }],
				baselineHash: "hash",
			};
			expect(isValidAnchor(anchor)).toBe(true);
		});

		test("rejects edit-diff anchor missing diffs", () => {
			const anchor = {
				type: "edit-diff",
				baselineHash: "abc123",
			};
			expect(isValidAnchor(anchor)).toBe(false);
		});

		test("rejects edit-diff anchor missing baselineHash", () => {
			const anchor = {
				type: "edit-diff",
				diffs: [{ type: "added", line: 1, before: null, after: "text" }],
			};
			expect(isValidAnchor(anchor)).toBe(false);
		});

		test("rejects edit-diff anchor with non-array diffs", () => {
			const anchor = {
				type: "edit-diff",
				diffs: "not-an-array",
				baselineHash: "abc123",
			};
			expect(isValidAnchor(anchor)).toBe(false);
		});

		test("rejects edit-diff anchor with non-string baselineHash", () => {
			const anchor = {
				type: "edit-diff",
				diffs: [],
				baselineHash: 12345,
			};
			expect(isValidAnchor(anchor)).toBe(false);
		});

		test("rejects edit-diff anchor with malformed diff entry missing type", () => {
			const anchor = {
				type: "edit-diff",
				diffs: [{ line: 1, before: null, after: "text" }],
				baselineHash: "abc123",
			};
			expect(isValidAnchor(anchor)).toBe(false);
		});

		test("rejects edit-diff anchor with invalid diff entry type value", () => {
			const anchor = {
				type: "edit-diff",
				diffs: [{ type: "unknown", line: 1, before: null, after: "text" }],
				baselineHash: "abc123",
			};
			expect(isValidAnchor(anchor)).toBe(false);
		});

		test("rejects edit-diff anchor with non-number line in diff entry", () => {
			const anchor = {
				type: "edit-diff",
				diffs: [{ type: "added", line: "1", before: null, after: "text" }],
				baselineHash: "abc123",
			};
			expect(isValidAnchor(anchor)).toBe(false);
		});

		test("rejects edit-diff anchor with non-null non-string before", () => {
			const anchor = {
				type: "edit-diff",
				diffs: [{ type: "modified", line: 1, before: 42, after: "text" }],
				baselineHash: "abc123",
			};
			expect(isValidAnchor(anchor)).toBe(false);
		});

		test("rejects edit-diff anchor with non-null non-string after", () => {
			const anchor = {
				type: "edit-diff",
				diffs: [{ type: "added", line: 1, before: null, after: true }],
				baselineHash: "abc123",
			};
			expect(isValidAnchor(anchor)).toBe(false);
		});
	});

	describe("backward compatibility with existing anchor types", () => {
		test("accepts valid text-selection anchor", () => {
			const anchor = {
				type: "text-selection",
				startOffset: 0,
				endOffset: 10,
				selectedText: "hello",
				contextBefore: "say ",
				contextAfter: " world",
			};
			expect(isValidAnchor(anchor)).toBe(true);
		});

		test("accepts valid hidden-anchor", () => {
			const anchor = {
				type: "hidden-anchor",
				anchorId: "anchor-1",
				anchorText: "section header",
			};
			expect(isValidAnchor(anchor)).toBe(true);
		});

		test("accepts valid line anchor", () => {
			const anchor = {
				type: "line",
				lineNumber: 42,
				lineContent: "const x = 1;",
			};
			expect(isValidAnchor(anchor)).toBe(true);
		});

		test("rejects unknown anchor type", () => {
			const anchor = {
				type: "unknown-type",
				data: "something",
			};
			expect(isValidAnchor(anchor)).toBe(false);
		});

		test("rejects null", () => {
			expect(isValidAnchor(null)).toBe(false);
		});

		test("rejects non-object", () => {
			expect(isValidAnchor("string")).toBe(false);
		});
	});
});
