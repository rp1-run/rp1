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
				content: "Line comment",
			};

			const annotation = await createAnnotation(testProjectPath, request);
			await embedAnnotations(testProjectPath, artifactPath);

			const updatedContent = await readFile(fullPath, "utf-8");
			expect(updatedContent).toContain(
				`<!-- rp1:annotation:${annotation.id} -->`,
			);
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
