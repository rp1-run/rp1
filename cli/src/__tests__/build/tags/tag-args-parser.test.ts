/**
 * Unit tests for the tag argument parser (parseTagArgs).
 * Covers positional args, named args, array values, edge cases.
 */

import { describe, expect, test } from "bun:test";
import { parseTagArgs } from "../../../build/tags/index.js";

describe("parseTagArgs", () => {
	describe("positional arguments", () => {
		test("parses a single double-quoted positional arg", () => {
			const result = parseTagArgs('"hello"');
			expect(result.positional).toEqual(["hello"]);
			expect(result.named).toEqual({});
		});

		test("parses a single single-quoted positional arg", () => {
			const result = parseTagArgs("'hello'");
			expect(result.positional).toEqual(["hello"]);
			expect(result.named).toEqual({});
		});

		test("parses multiple positional args separated by commas", () => {
			const result = parseTagArgs('"first", "second", "third"');
			expect(result.positional).toEqual(["first", "second", "third"]);
		});

		test("parses bare word positional args", () => {
			const result = parseTagArgs("background");
			expect(result.positional).toEqual(["background"]);
		});

		test("parses mixed quoted and bare word args", () => {
			const result = parseTagArgs('"rp1-dev:agent", "prompt text", background');
			expect(result.positional).toEqual([
				"rp1-dev:agent",
				"prompt text",
				"background",
			]);
		});

		test("handles empty string argument", () => {
			const result = parseTagArgs('""');
			expect(result.positional).toEqual([""]);
		});
	});

	describe("named arguments", () => {
		test("parses a named arg with single value", () => {
			const result = parseTagArgs('options: "yes"');
			expect(result.named).toEqual({ options: "yes" });
			expect(result.positional).toEqual([]);
		});

		test("parses a named arg with multiple values as array", () => {
			const result = parseTagArgs('options: "yes", "no", "maybe"');
			expect(result.named).toEqual({ options: ["yes", "no", "maybe"] });
		});

		test("parses positional args before named args", () => {
			const result = parseTagArgs(
				'"What is your choice?", options: "A", "B", "C"',
			);
			expect(result.positional).toEqual(["What is your choice?"]);
			expect(result.named).toEqual({ options: ["A", "B", "C"] });
		});
	});

	describe("edge cases", () => {
		test("handles empty input", () => {
			const result = parseTagArgs("");
			expect(result.positional).toEqual([]);
			expect(result.named).toEqual({});
		});

		test("handles whitespace-only input", () => {
			const result = parseTagArgs("   ");
			expect(result.positional).toEqual([]);
			expect(result.named).toEqual({});
		});

		test("handles escaped quotes inside double-quoted strings", () => {
			const result = parseTagArgs('"say \\"hello\\""');
			expect(result.positional).toEqual(['say "hello"']);
		});

		test("handles escaped quotes inside single-quoted strings", () => {
			const result = parseTagArgs("'say \\'hello\\''");
			expect(result.positional).toEqual(["say 'hello'"]);
		});

		test("handles args with spaces in quoted strings", () => {
			const result = parseTagArgs('"a long prompt with spaces"');
			expect(result.positional).toEqual(["a long prompt with spaces"]);
		});

		test("handles multiple bare words separated by spaces", () => {
			const result = parseTagArgs("foreground");
			expect(result.positional).toEqual(["foreground"]);
		});

		test("handles no space after comma", () => {
			const result = parseTagArgs('"a","b"');
			expect(result.positional).toEqual(["a", "b"]);
		});
	});
});
