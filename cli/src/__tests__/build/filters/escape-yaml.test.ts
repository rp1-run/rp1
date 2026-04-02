/**
 * Unit tests for the escape_yaml Liquid filter.
 * Tests special character handling and quoting rules.
 */

import { describe, expect, test } from "bun:test";
import { escapeYaml } from "../../../build/filters/escape-yaml.js";

describe("escape_yaml filter", () => {
	test("returns plain strings unchanged", () => {
		expect(escapeYaml("simple value")).toBe("simple value");
	});

	test("quotes strings with colons", () => {
		expect(escapeYaml("key: value")).toBe('"key: value"');
	});

	test("quotes strings with hash marks", () => {
		expect(escapeYaml("value # comment")).toBe('"value # comment"');
	});

	test("quotes strings with brackets", () => {
		expect(escapeYaml("[array]")).toBe('"[array]"');
		expect(escapeYaml("{object}")).toBe('"{object}"');
	});

	test("quotes strings with angle brackets", () => {
		expect(escapeYaml(">folded")).toBe('">folded"');
	});

	test("quotes strings with pipe", () => {
		expect(escapeYaml("|literal")).toBe('"|literal"');
	});

	test("quotes strings with asterisks", () => {
		expect(escapeYaml("*anchor")).toBe('"*anchor"');
	});

	test("quotes strings with ampersands", () => {
		expect(escapeYaml("&alias")).toBe('"&alias"');
	});

	test("quotes strings with exclamation marks", () => {
		expect(escapeYaml("!tag")).toBe('"!tag"');
	});

	test("quotes strings with percent signs", () => {
		expect(escapeYaml("100%")).toBe('"100%"');
	});

	test("quotes strings with at signs", () => {
		expect(escapeYaml("user@host")).toBe('"user@host"');
	});

	test("quotes strings with backticks", () => {
		expect(escapeYaml("`code`")).toBe('"`code`"');
	});

	test("quotes strings with single quotes", () => {
		expect(escapeYaml("it's")).toBe('"it\'s"');
	});

	test("quotes strings with commas", () => {
		expect(escapeYaml("a, b")).toBe('"a, b"');
	});

	test("escapes newlines in quoted strings", () => {
		expect(escapeYaml("line1\nline2")).toBe('"line1\\nline2"');
	});

	test("escapes carriage returns in quoted strings", () => {
		expect(escapeYaml("line1\rline2")).toBe('"line1\\rline2"');
	});

	test("escapes newlines that contain --- to prevent frontmatter breakage", () => {
		expect(escapeYaml("before\n---\nafter")).toBe('"before\\n---\\nafter"');
	});

	test("quotes strings starting with whitespace", () => {
		expect(escapeYaml(" leading space")).toBe('" leading space"');
	});

	test("quotes strings starting with dash", () => {
		expect(escapeYaml("-list item")).toBe('"-list item"');
	});

	test("quotes empty strings", () => {
		expect(escapeYaml("")).toBe('""');
	});

	test("quotes whitespace-only strings", () => {
		expect(escapeYaml("   ")).toBe('"   "');
	});

	test("escapes backslashes before quoting", () => {
		expect(escapeYaml("path\\to\\file")).toBe('"path\\\\to\\\\file"');
	});

	test("escapes double quotes before quoting", () => {
		expect(escapeYaml('say "hello"')).toBe('"say \\"hello\\""');
	});

	test("handles combined escaping", () => {
		expect(escapeYaml('path\\to "file"')).toBe('"path\\\\to \\"file\\""');
	});
});
