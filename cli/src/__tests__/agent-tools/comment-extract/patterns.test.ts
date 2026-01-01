/**
 * Unit tests for comment-extract patterns module.
 * Tests pattern definitions and utility functions.
 */

import { describe, expect, test } from "bun:test";
import {
	getPatterns,
	isSupportedExtension,
	PATTERNS,
} from "../../../agent-tools/comment-extract/patterns.js";

describe("comment-extract patterns", () => {
	describe("PATTERNS constant", () => {
		test("includes JavaScript/TypeScript extensions", () => {
			expect(PATTERNS[".js"]).toBeDefined();
			expect(PATTERNS[".ts"]).toBeDefined();
			expect(PATTERNS[".tsx"]).toBeDefined();
			expect(PATTERNS[".jsx"]).toBeDefined();
		});

		test("includes Python extension", () => {
			expect(PATTERNS[".py"]).toBeDefined();
		});

		test("includes common web extensions", () => {
			expect(PATTERNS[".html"]).toBeDefined();
			expect(PATTERNS[".css"]).toBeDefined();
			expect(PATTERNS[".vue"]).toBeDefined();
			expect(PATTERNS[".svelte"]).toBeDefined();
		});

		test("JavaScript has // single and /* */ multi patterns", () => {
			const js = PATTERNS[".js"];
			expect(js.single).toHaveLength(1);
			expect(js.multi).toHaveLength(1);
			expect(js.single[0].source).toBe("\\/\\/");
			expect(js.multi[0][0].source).toBe("\\/\\*");
			expect(js.multi[0][1].source).toBe("\\*\\/");
		});

		test("Python has # single and no multi patterns", () => {
			const py = PATTERNS[".py"];
			expect(py.single).toHaveLength(1);
			expect(py.multi).toHaveLength(0);
			expect(py.single[0].source).toBe("#(?!!)");
		});

		test("HTML has only <!-- --> multi pattern", () => {
			const html = PATTERNS[".html"];
			expect(html.single).toHaveLength(0);
			expect(html.multi).toHaveLength(1);
			expect(html.multi[0][0].source).toBe("<!--");
			expect(html.multi[0][1].source).toBe("-->");
		});

		test("Vue has both C-style and HTML comment patterns", () => {
			const vue = PATTERNS[".vue"];
			expect(vue.single).toHaveLength(1);
			expect(vue.multi).toHaveLength(2);
		});

		test("PHP has both // and # single patterns", () => {
			const php = PATTERNS[".php"];
			expect(php.single).toHaveLength(2);
		});
	});

	describe("isSupportedExtension", () => {
		test("returns true for supported extensions", () => {
			expect(isSupportedExtension(".js")).toBe(true);
			expect(isSupportedExtension(".ts")).toBe(true);
			expect(isSupportedExtension(".py")).toBe(true);
			expect(isSupportedExtension(".go")).toBe(true);
			expect(isSupportedExtension(".rs")).toBe(true);
		});

		test("returns false for unsupported extensions", () => {
			expect(isSupportedExtension(".md")).toBe(false);
			expect(isSupportedExtension(".json")).toBe(false);
			expect(isSupportedExtension(".txt")).toBe(false);
			expect(isSupportedExtension(".exe")).toBe(false);
		});

		test("returns false for empty string", () => {
			expect(isSupportedExtension("")).toBe(false);
		});

		test("is case sensitive (extensions should be lowercase)", () => {
			expect(isSupportedExtension(".JS")).toBe(false);
			expect(isSupportedExtension(".Py")).toBe(false);
		});
	});

	describe("getPatterns", () => {
		test("returns patterns for supported extensions", () => {
			const jsPatterns = getPatterns(".js");
			expect(jsPatterns).toBeDefined();
			expect(jsPatterns?.single).toBeDefined();
			expect(jsPatterns?.multi).toBeDefined();
		});

		test("returns undefined for unsupported extensions", () => {
			expect(getPatterns(".md")).toBeUndefined();
			expect(getPatterns(".json")).toBeUndefined();
		});

		test("patterns match expected comment syntax", () => {
			const tsPatterns = getPatterns(".ts");
			expect(tsPatterns).toBeDefined();
			if (!tsPatterns) return;

			// Single-line // comment
			const singlePattern = tsPatterns.single[0];
			expect(singlePattern.test("// comment")).toBe(true);
			expect(singlePattern.test("not a comment")).toBe(false);

			// Multi-line /* */ comment
			const [multiStart, multiEnd] = tsPatterns.multi[0];
			expect(multiStart.test("/* start")).toBe(true);
			expect(multiEnd.test("end */")).toBe(true);
		});

		test("Python pattern excludes shebang", () => {
			const pyPatterns = getPatterns(".py");
			expect(pyPatterns).toBeDefined();
			if (!pyPatterns) return;

			const pattern = pyPatterns.single[0];
			expect(pattern.test("# comment")).toBe(true);
			expect(pattern.test("#!")).toBe(false);
			expect(pattern.test("#!/usr/bin/env python")).toBe(false);
		});

		test("Shell pattern excludes shebang", () => {
			const shPatterns = getPatterns(".sh");
			expect(shPatterns).toBeDefined();
			if (!shPatterns) return;

			const pattern = shPatterns.single[0];
			expect(pattern.test("# comment")).toBe(true);
			expect(pattern.test("#!")).toBe(false);
		});
	});

	describe("pattern regex correctness", () => {
		test("C-style single line comments match correctly", () => {
			const pattern = PATTERNS[".js"].single[0];
			expect("// this is a comment".match(pattern)).toBeTruthy();
			expect("code // inline comment".match(pattern)).toBeTruthy();
			expect("http://url.com".match(pattern)).toBeTruthy(); // Will match, but extraction handles this
		});

		test("C-style multi-line comments match correctly", () => {
			const [start, end] = PATTERNS[".js"].multi[0];
			expect(start.test("/* start")).toBe(true);
			expect(start.test("/** jsdoc")).toBe(true);
			expect(end.test("*/")).toBe(true);
			expect(end.test("end */")).toBe(true);
		});

		test("YAML/Ruby hash comments match correctly", () => {
			const pattern = PATTERNS[".yml"].single[0];
			expect(pattern.test("# comment")).toBe(true);
			expect(pattern.test("  # indented")).toBe(true);
		});

		test("HTML comments match correctly", () => {
			const [start, end] = PATTERNS[".html"].multi[0];
			expect(start.test("<!-- comment")).toBe(true);
			expect(end.test("-->")).toBe(true);
		});
	});
});
