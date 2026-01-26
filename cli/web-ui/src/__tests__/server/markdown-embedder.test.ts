/**
 * Unit tests for markdown embedding service.
 * Tests embedding, parsing, and removal of annotation markers.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAnnotation } from "../../server/annotation-service";
import {
	embedAnnotations,
	parseEmbeddedAnnotations,
	parseSuggestionMarker,
	removeEmbedding,
} from "../../server/markdown-embedder";
import type { CreateAnnotationRequest } from "../../types/annotations";

describe("markdown-embedder", () => {
	let testProjectPath: string;

	beforeEach(async () => {
		testProjectPath = join(tmpdir(), `embedder-test-${Date.now()}`);
		await mkdir(join(testProjectPath, ".rp1"), { recursive: true });
	});

	afterEach(async () => {
		await rm(testProjectPath, { recursive: true, force: true });
	});

	describe("parseEmbeddedAnnotations", () => {
		test("extracts annotation IDs from comment markers", () => {
			const content = `
# Document
<!-- rp1:annotation:ANN-123 -->
Some annotated text
<!-- /rp1:annotation:ANN-123 -->

More content
<!-- rp1:annotation:ANN-456 -->
Another annotation
<!-- /rp1:annotation:ANN-456 -->
`;
			const ids = parseEmbeddedAnnotations(content);
			expect(ids).toContain("ANN-123");
			expect(ids).toContain("ANN-456");
			expect(ids).toHaveLength(2);
		});

		test("extracts annotation IDs from suggestion markers", () => {
			const content = `
# Document
<!-- rp1:suggestion:ANN-789 original="old" suggested="new" -->
Some text
`;
			const ids = parseEmbeddedAnnotations(content);
			expect(ids).toContain("ANN-789");
			expect(ids).toHaveLength(1);
		});

		test("extracts mixed marker types", () => {
			const content = `
<!-- rp1:annotation:ANN-001 -->text<!-- /rp1:annotation:ANN-001 -->
<!-- rp1:suggestion:ANN-002 original="a" suggested="b" -->
`;
			const ids = parseEmbeddedAnnotations(content);
			expect(ids).toContain("ANN-001");
			expect(ids).toContain("ANN-002");
			expect(ids).toHaveLength(2);
		});

		test("returns empty array for content without markers", () => {
			const content = "# Just a regular document\nNo annotations here.";
			const ids = parseEmbeddedAnnotations(content);
			expect(ids).toEqual([]);
		});

		test("handles malformed or partial markers gracefully", () => {
			const content = `
<!-- rp1:annotation:ANN-VALID -->text<!-- /rp1:annotation:ANN-VALID -->
<!-- rp1:annotation: missing id -->
<!-- incomplete
`;
			const ids = parseEmbeddedAnnotations(content);
			expect(ids).toContain("ANN-VALID");
			expect(ids).toHaveLength(1);
		});
	});

	describe("parseSuggestionMarker", () => {
		test("extracts suggestion data from marker", () => {
			const content =
				'<!-- rp1:suggestion:ANN-123 original="old text" suggested="new text" -->';
			const result = parseSuggestionMarker(content, "ANN-123");
			expect(result).toEqual({
				originalText: "old text",
				suggestedText: "new text",
			});
		});

		test("handles escaped characters in suggestion", () => {
			const content =
				'<!-- rp1:suggestion:ANN-456 original="has &quot;quotes&quot;" suggested="also &quot;quotes&quot;" -->';
			const result = parseSuggestionMarker(content, "ANN-456");
			expect(result).toEqual({
				originalText: 'has "quotes"',
				suggestedText: 'also "quotes"',
			});
		});

		test("handles HTML comment escapes", () => {
			const content =
				'<!-- rp1:suggestion:ANN-789 original="before --&gt; after" suggested="has &lt;!-- comment" -->';
			const result = parseSuggestionMarker(content, "ANN-789");
			expect(result).toEqual({
				originalText: "before --> after",
				suggestedText: "has <!-- comment",
			});
		});

		test("returns null for non-existent annotation", () => {
			const content =
				'<!-- rp1:suggestion:ANN-123 original="a" suggested="b" -->';
			const result = parseSuggestionMarker(content, "ANN-999");
			expect(result).toBeNull();
		});

		test("returns null for content without suggestions", () => {
			const content = "Just regular content";
			const result = parseSuggestionMarker(content, "ANN-123");
			expect(result).toBeNull();
		});
	});

	describe("embedAnnotations", () => {
		test("embeds text-selection annotation with comment markers", async () => {
			const artifactPath = "docs/test.md";
			const fullPath = join(testProjectPath, artifactPath);
			await mkdir(join(testProjectPath, "docs"), { recursive: true });
			await writeFile(fullPath, "Hello world, this is a test document.");

			const request: CreateAnnotationRequest = {
				artifactPath,
				anchor: {
					type: "text-selection",
					startOffset: 0,
					endOffset: 5,
					selectedText: "Hello",
					contextBefore: "",
					contextAfter: " world",
				},
				annotationType: "comment",
				content: "Greeting annotation",
			};

			const annotation = await createAnnotation(testProjectPath, request);
			await embedAnnotations(testProjectPath, artifactPath);

			const updatedContent = await readFile(fullPath, "utf-8");
			expect(updatedContent).toContain(
				`<!-- rp1:annotation:${annotation.id} -->`,
			);
			expect(updatedContent).toContain(
				`<!-- /rp1:annotation:${annotation.id} -->`,
			);
			expect(updatedContent).toContain(
				`<!-- rp1:annotation:${annotation.id} -->Hello<!-- /rp1:annotation:${annotation.id} -->`,
			);
		});

		test("embeds suggestion annotation with suggestion marker", async () => {
			const artifactPath = "test.md";
			const fullPath = join(testProjectPath, artifactPath);
			await writeFile(fullPath, "The quick brown fox jumps.");

			const request: CreateAnnotationRequest = {
				artifactPath,
				anchor: {
					type: "text-selection",
					startOffset: 4,
					endOffset: 9,
					selectedText: "quick",
					contextBefore: "The ",
					contextAfter: " brown",
				},
				annotationType: "suggestion",
				content: "Change adjective",
				suggestion: {
					originalText: "quick",
					suggestedText: "slow",
				},
			};

			const annotation = await createAnnotation(testProjectPath, request);
			await embedAnnotations(testProjectPath, artifactPath);

			const updatedContent = await readFile(fullPath, "utf-8");
			expect(updatedContent).toContain(
				`<!-- rp1:suggestion:${annotation.id} original="quick" suggested="slow" -->`,
			);
		});

		test("skips orphaned annotations", async () => {
			const artifactPath = "test.md";
			const fullPath = join(testProjectPath, artifactPath);
			await writeFile(fullPath, "Different content");

			const request: CreateAnnotationRequest = {
				artifactPath,
				anchor: {
					type: "text-selection",
					startOffset: 0,
					endOffset: 5,
					selectedText: "missing text",
					contextBefore: "",
					contextAfter: "",
				},
				annotationType: "comment",
				content: "Will be orphaned",
			};

			await createAnnotation(testProjectPath, request);
			await embedAnnotations(testProjectPath, artifactPath);

			const updatedContent = await readFile(fullPath, "utf-8");
			expect(updatedContent).toBe("Different content");
		});

		test("handles multiple annotations on same file", async () => {
			const artifactPath = "multi.md";
			const fullPath = join(testProjectPath, artifactPath);
			await writeFile(fullPath, "First word and second word here.");

			const request1: CreateAnnotationRequest = {
				artifactPath,
				anchor: {
					type: "text-selection",
					startOffset: 0,
					endOffset: 5,
					selectedText: "First",
					contextBefore: "",
					contextAfter: " word",
				},
				annotationType: "comment",
				content: "First annotation",
			};

			const request2: CreateAnnotationRequest = {
				artifactPath,
				anchor: {
					type: "text-selection",
					startOffset: 16,
					endOffset: 22,
					selectedText: "second",
					contextBefore: "and ",
					contextAfter: " word",
				},
				annotationType: "comment",
				content: "Second annotation",
			};

			const ann1 = await createAnnotation(testProjectPath, request1);
			const ann2 = await createAnnotation(testProjectPath, request2);
			await embedAnnotations(testProjectPath, artifactPath);

			const updatedContent = await readFile(fullPath, "utf-8");
			expect(updatedContent).toContain(`<!-- rp1:annotation:${ann1.id} -->`);
			expect(updatedContent).toContain(`<!-- rp1:annotation:${ann2.id} -->`);
		});

		test("removes stale markers when no annotations exist", async () => {
			const artifactPath = "stale.md";
			const fullPath = join(testProjectPath, artifactPath);
			await writeFile(
				fullPath,
				"<!-- rp1:annotation:ANN-OLD -->old text<!-- /rp1:annotation:ANN-OLD -->\nMore content",
			);

			await embedAnnotations(testProjectPath, artifactPath);

			const updatedContent = await readFile(fullPath, "utf-8");
			expect(updatedContent).not.toContain("rp1:annotation");
			expect(updatedContent).toContain("old text");
			expect(updatedContent).toContain("More content");
		});

		test("prevents duplicate markers on re-embed", async () => {
			const artifactPath = "dup.md";
			const fullPath = join(testProjectPath, artifactPath);
			await writeFile(fullPath, "Test content here.");

			const request: CreateAnnotationRequest = {
				artifactPath,
				anchor: {
					type: "text-selection",
					startOffset: 0,
					endOffset: 4,
					selectedText: "Test",
					contextBefore: "",
					contextAfter: " content",
				},
				annotationType: "comment",
				content: "Test annotation",
			};

			const annotation = await createAnnotation(testProjectPath, request);

			// Embed twice
			await embedAnnotations(testProjectPath, artifactPath);
			await embedAnnotations(testProjectPath, artifactPath);

			const updatedContent = await readFile(fullPath, "utf-8");
			const startMarkerCount = (
				updatedContent.match(
					new RegExp(`rp1:annotation:${annotation.id}`, "g"),
				) || []
			).length;
			// Should have exactly 2 (start and end marker)
			expect(startMarkerCount).toBe(2);
		});

		test("does nothing for non-existent file", async () => {
			// Should not throw
			await embedAnnotations(testProjectPath, "nonexistent.md");
		});

		test("handles hidden-anchor annotations", async () => {
			const artifactPath = "anchored.md";
			const fullPath = join(testProjectPath, artifactPath);
			await writeFile(
				fullPath,
				'# Document\n<a id="section-1"></a>\nSection content here.',
			);

			const request: CreateAnnotationRequest = {
				artifactPath,
				anchor: {
					type: "hidden-anchor",
					anchorId: "section-1",
					anchorText: "Section 1",
				},
				annotationType: "comment",
				content: "Anchor comment",
			};

			const annotation = await createAnnotation(testProjectPath, request);
			await embedAnnotations(testProjectPath, artifactPath);

			const updatedContent = await readFile(fullPath, "utf-8");
			expect(updatedContent).toContain(
				`<!-- rp1:annotation:${annotation.id} -->`,
			);
		});

		test("handles line-anchor annotations", async () => {
			const artifactPath = "code.ts";
			const fullPath = join(testProjectPath, artifactPath);
			await writeFile(
				fullPath,
				"import x from 'x';\nconst y = 1;\nexport default y;",
			);

			const request: CreateAnnotationRequest = {
				artifactPath,
				anchor: {
					type: "line",
					lineNumber: 2,
					lineContent: "const y = 1;",
				},
				annotationType: "comment",
				content: "Line comment",
			};

			const annotation = await createAnnotation(testProjectPath, request);
			await embedAnnotations(testProjectPath, artifactPath);

			const updatedContent = await readFile(fullPath, "utf-8");
			expect(updatedContent).toContain(
				`<!-- rp1:annotation:${annotation.id} -->`,
			);
		});

		test("escapes special characters in suggestion markers", async () => {
			const artifactPath = "special.md";
			const fullPath = join(testProjectPath, artifactPath);
			await writeFile(fullPath, 'Text with "quotes" here.');

			const request: CreateAnnotationRequest = {
				artifactPath,
				anchor: {
					type: "text-selection",
					startOffset: 10,
					endOffset: 18,
					selectedText: '"quotes"',
					contextBefore: "with ",
					contextAfter: " here",
				},
				annotationType: "suggestion",
				content: "Change quotes",
				suggestion: {
					originalText: '"quotes"',
					suggestedText: "'single'",
				},
			};

			const annotation = await createAnnotation(testProjectPath, request);
			await embedAnnotations(testProjectPath, artifactPath);

			const updatedContent = await readFile(fullPath, "utf-8");
			expect(updatedContent).toContain(`rp1:suggestion:${annotation.id}`);
			expect(updatedContent).toContain("&quot;quotes&quot;");
		});
	});

	describe("removeEmbedding", () => {
		test("removes specific annotation markers", async () => {
			const artifactPath = "remove.md";
			const fullPath = join(testProjectPath, artifactPath);
			await writeFile(
				fullPath,
				`# Test
<!-- rp1:annotation:ANN-KEEP -->keep<!-- /rp1:annotation:ANN-KEEP -->
<!-- rp1:annotation:ANN-REMOVE -->remove<!-- /rp1:annotation:ANN-REMOVE -->
End`,
			);

			await removeEmbedding(testProjectPath, artifactPath, "ANN-REMOVE");

			const updatedContent = await readFile(fullPath, "utf-8");
			expect(updatedContent).toContain("ANN-KEEP");
			expect(updatedContent).not.toContain("ANN-REMOVE");
			expect(updatedContent).toContain("keep");
			expect(updatedContent).toContain("remove");
		});

		test("removes suggestion markers", async () => {
			const artifactPath = "sug.md";
			const fullPath = join(testProjectPath, artifactPath);
			await writeFile(
				fullPath,
				'Text <!-- rp1:suggestion:ANN-SUG original="a" suggested="b" --> here',
			);

			await removeEmbedding(testProjectPath, artifactPath, "ANN-SUG");

			const updatedContent = await readFile(fullPath, "utf-8");
			expect(updatedContent).not.toContain("rp1:suggestion");
			expect(updatedContent).toBe("Text  here");
		});

		test("does nothing for non-existent file", async () => {
			// Should not throw
			await removeEmbedding(testProjectPath, "nonexistent.md", "ANN-123");
		});

		test("does nothing if annotation not in file", async () => {
			const artifactPath = "unchanged.md";
			const fullPath = join(testProjectPath, artifactPath);
			const originalContent = "No annotations here.";
			await writeFile(fullPath, originalContent);

			await removeEmbedding(testProjectPath, artifactPath, "ANN-MISSING");

			const updatedContent = await readFile(fullPath, "utf-8");
			expect(updatedContent).toBe(originalContent);
		});
	});
});
