import { describe, expect, test } from "bun:test";
import {
	needsTruncation,
	TRUNCATION_CHARS,
	TRUNCATION_LINES,
	truncateContent,
} from "../../lib/content-truncation";

describe("needsTruncation", () => {
	test("returns false for short single-line content", () => {
		expect(needsTruncation("Hello world")).toBe(false);
	});

	test("returns false for content at exactly the line limit", () => {
		const content = "line1\nline2\nline3";
		expect(content.split("\n").length).toBe(TRUNCATION_LINES);
		expect(needsTruncation(content)).toBe(false);
	});

	test("returns true when line count exceeds limit", () => {
		const content = "line1\nline2\nline3\nline4";
		expect(needsTruncation(content)).toBe(true);
	});

	test("returns false for content at exactly the character limit", () => {
		const content = "a".repeat(TRUNCATION_CHARS);
		expect(needsTruncation(content)).toBe(false);
	});

	test("returns true when character count exceeds limit", () => {
		const content = "a".repeat(TRUNCATION_CHARS + 1);
		expect(needsTruncation(content)).toBe(true);
	});

	test("returns true when lines exceed limit even if chars are under", () => {
		const content = "a\nb\nc\nd";
		expect(content.length).toBeLessThan(TRUNCATION_CHARS);
		expect(needsTruncation(content)).toBe(true);
	});

	test("returns true when chars exceed limit even if lines are under", () => {
		const content = "a".repeat(TRUNCATION_CHARS + 1);
		expect(content.split("\n").length).toBeLessThanOrEqual(TRUNCATION_LINES);
		expect(needsTruncation(content)).toBe(true);
	});

	test("returns false for empty string", () => {
		expect(needsTruncation("")).toBe(false);
	});
});

describe("truncateContent", () => {
	test("returns content unchanged when no truncation needed", () => {
		expect(truncateContent("Hello world")).toBe("Hello world");
	});

	test("truncates by line count and appends typographic ellipsis", () => {
		const content = "line1\nline2\nline3\nline4\nline5";
		const result = truncateContent(content);
		expect(result).toBe("line1\nline2\nline3\u2026");
	});

	test("truncates by character count and appends typographic ellipsis", () => {
		const content = "a".repeat(TRUNCATION_CHARS + 50);
		const result = truncateContent(content);
		expect(result).toBe(`${"a".repeat(TRUNCATION_CHARS)}\u2026`);
	});

	test("line truncation takes priority over character truncation", () => {
		const content = "short\nshort\nshort\nshort";
		const result = truncateContent(content);
		expect(result).toBe("short\nshort\nshort\u2026");
	});

	test("uses typographic ellipsis character, not three dots", () => {
		const content = "line1\nline2\nline3\nline4";
		const result = truncateContent(content);
		expect(result).not.toContain("...");
		expect(result).toContain("\u2026");
	});

	test("returns empty string unchanged", () => {
		expect(truncateContent("")).toBe("");
	});
});
