/**
 * Unit tests for the teach-me widget library's DOM-free logic.
 *
 * The widgets themselves are vanilla custom elements whose rendering and
 * interactions (step/scrub, branch selection, state inspection, quiz
 * "Check answer") are verified end-to-end against the rendered `file://`
 * artifact by the T8 Puppeteer gate — that is the realistic seam and the design
 * routes widget behavior there.
 *
 * The one piece of widget logic that is pure and DOM-independent is the
 * code-walkthrough line-range parser, whose 1-based indexing, reversed-range
 * handling, clamping, and malformed-fragment tolerance are the most
 * regression-prone behavior in the set. These cases pin that contract.
 */

import { describe, expect, test } from "bun:test";
import { parseLineRange } from "../../teach-me/widgets/src/line-range.js";

describe("parseLineRange", () => {
	const sorted = (spec: string, max: number): number[] =>
		[...parseLineRange(spec, max)].sort((a, b) => a - b);

	test("parses a single line as a 1-based number", () => {
		expect(sorted("3", 10)).toEqual([3]);
	});

	test("parses an inclusive range", () => {
		expect(sorted("3-7", 10)).toEqual([3, 4, 5, 6, 7]);
	});

	test("parses a mixed list of singles and ranges", () => {
		expect(sorted("3,5,9-11", 20)).toEqual([3, 5, 9, 10, 11]);
	});

	test("clamps line numbers to the available range", () => {
		// max is 5, so 6 and 7 are dropped; 4-5 survive.
		expect(sorted("4-7", 5)).toEqual([4, 5]);
	});

	test("ignores line 0 and negative-yielding specs (1-based)", () => {
		// A leading "0" is not a valid 1-based line and must be excluded.
		expect(sorted("0", 5)).toEqual([]);
		expect(sorted("0-2", 5)).toEqual([1, 2]);
	});

	test("normalizes a reversed range", () => {
		expect(sorted("7-3", 10)).toEqual([3, 4, 5, 6, 7]);
	});

	test("tolerates whitespace around fragments", () => {
		expect(sorted(" 2 , 4-5 ", 10)).toEqual([2, 4, 5]);
	});

	test("ignores malformed fragments rather than throwing", () => {
		expect(sorted("foo,3,,-,4", 10)).toEqual([3, 4]);
	});

	test("returns an empty set for an entirely malformed spec", () => {
		expect(sorted("abc", 10)).toEqual([]);
	});

	test("deduplicates overlapping ranges", () => {
		expect(sorted("3-5,4-6", 10)).toEqual([3, 4, 5, 6]);
	});
});
