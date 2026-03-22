/**
 * Unit tests for isValidAnchor in annotations-api.
 * Covers backward compatibility with existing anchor types.
 */

import { describe, expect, test } from "bun:test";
import { isValidAnchor } from "../../server/routes/annotations-api";

describe("isValidAnchor", () => {
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
