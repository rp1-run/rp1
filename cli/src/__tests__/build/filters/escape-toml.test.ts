/**
 * Unit tests for the escape_toml Liquid filter.
 * Tests TOML escaping rules for double quotes and backslashes.
 */

import { describe, expect, test } from "bun:test";
import { escapeToml } from "../../../build/filters/escape-toml.js";

describe("escape_toml filter", () => {
	test("returns plain strings unchanged", () => {
		expect(escapeToml("simple value")).toBe("simple value");
	});

	test("escapes backslashes", () => {
		expect(escapeToml("path\\to\\file")).toBe("path\\\\to\\\\file");
	});

	test("escapes double quotes", () => {
		expect(escapeToml('say "hello"')).toBe('say \\"hello\\"');
	});

	test("escapes both backslashes and double quotes", () => {
		expect(escapeToml('path\\to "file"')).toBe('path\\\\to \\"file\\"');
	});

	test("handles strings with no special characters", () => {
		expect(escapeToml("no special chars")).toBe("no special chars");
	});

	test("handles empty strings", () => {
		expect(escapeToml("")).toBe("");
	});

	test("handles consecutive backslashes", () => {
		expect(escapeToml("\\\\")).toBe("\\\\\\\\");
	});

	test("handles consecutive double quotes", () => {
		expect(escapeToml('""')).toBe('\\"\\"');
	});

	test("preserves other special characters unchanged", () => {
		expect(escapeToml("value: [key] {obj} #comment")).toBe(
			"value: [key] {obj} #comment",
		);
	});
});
