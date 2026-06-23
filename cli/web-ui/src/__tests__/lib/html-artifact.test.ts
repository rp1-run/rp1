import { describe, expect, test } from "bun:test";
import { isHtmlArtifact } from "../../lib/html-artifact";

describe("isHtmlArtifact", () => {
	test("classifies .html and .htm paths as HTML artifacts", () => {
		expect(isHtmlArtifact("lesson.html")).toBe(true);
		expect(isHtmlArtifact("lesson.htm")).toBe(true);
		expect(isHtmlArtifact("features/foo/lesson.html")).toBe(true);
	});

	test("is case-insensitive on the extension", () => {
		expect(isHtmlArtifact("lesson.HTML")).toBe(true);
		expect(isHtmlArtifact("lesson.Htm")).toBe(true);
	});

	test("classifies non-HTML paths as not HTML artifacts", () => {
		expect(isHtmlArtifact("notes.md")).toBe(false);
		expect(isHtmlArtifact("main.ts")).toBe(false);
		expect(isHtmlArtifact("output.txt")).toBe(false);
	});

	test("classifies extension-less paths as not HTML artifacts", () => {
		expect(isHtmlArtifact("README")).toBe(false);
		expect(isHtmlArtifact("")).toBe(false);
	});

	test("requires the dot so a bare html/htm segment is not an HTML artifact", () => {
		expect(isHtmlArtifact("html")).toBe(false);
		expect(isHtmlArtifact("htm")).toBe(false);
	});
});
