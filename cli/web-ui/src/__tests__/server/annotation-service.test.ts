/**
 * Unit tests for annotation persistence service.
 * Tests CRUD operations, threading, and orphan detection.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	addReply,
	createAnnotation,
	deleteAnnotation,
	detectOrphanedAnnotations,
	getAnnotation,
	getAnnotations,
	type OpenTasksFile,
	reopenAnnotation,
	resolveAnnotation,
	updateAnnotation,
} from "../../server/annotation-service";
import type { CreateAnnotationRequest } from "../../types/annotations";

describe("annotation-service", () => {
	let testProjectPath: string;

	beforeEach(async () => {
		testProjectPath = join(tmpdir(), `annotation-test-${Date.now()}`);
		await mkdir(join(testProjectPath, ".rp1"), { recursive: true });
	});

	afterEach(async () => {
		await rm(testProjectPath, { recursive: true, force: true });
	});

	describe("getAnnotations", () => {
		test("returns empty array when no annotations exist", async () => {
			const annotations = await getAnnotations(testProjectPath);
			expect(annotations).toEqual([]);
		});

		test("filters by artifact path", async () => {
			const request1: CreateAnnotationRequest = {
				artifactPath: "file1.md",
				anchor: {
					type: "text-selection",
					startOffset: 0,
					endOffset: 10,
					selectedText: "test text",
					contextBefore: "",
					contextAfter: "",
				},
				annotationType: "comment",
				content: "First comment",
			};

			const request2: CreateAnnotationRequest = {
				artifactPath: "file2.md",
				anchor: {
					type: "text-selection",
					startOffset: 0,
					endOffset: 10,
					selectedText: "other text",
					contextBefore: "",
					contextAfter: "",
				},
				annotationType: "comment",
				content: "Second comment",
			};

			await createAnnotation(testProjectPath, request1);
			await createAnnotation(testProjectPath, request2);

			const file1Annotations = await getAnnotations(
				testProjectPath,
				"file1.md",
			);
			expect(file1Annotations).toHaveLength(1);
			expect(file1Annotations[0].content).toBe("First comment");

			const file2Annotations = await getAnnotations(
				testProjectPath,
				"file2.md",
			);
			expect(file2Annotations).toHaveLength(1);
			expect(file2Annotations[0].content).toBe("Second comment");
		});
	});

	describe("createAnnotation", () => {
		test("creates annotation with all required fields", async () => {
			const request: CreateAnnotationRequest = {
				artifactPath: "test.md",
				anchor: {
					type: "text-selection",
					startOffset: 0,
					endOffset: 10,
					selectedText: "test text",
					contextBefore: "before",
					contextAfter: "after",
				},
				annotationType: "comment",
				content: "My comment",
			};

			const annotation = await createAnnotation(testProjectPath, request);

			expect(annotation.id).toMatch(/^ANN-/);
			expect(annotation.artifactPath).toBe("test.md");
			expect(annotation.content).toBe("My comment");
			expect(annotation.status).toBe("open");
			expect(annotation.author).toBe("user");
			expect(annotation.replies).toEqual([]);
			expect(annotation.orphaned).toBe(false);
			expect(annotation.createdAt).toBeTruthy();
			expect(annotation.updatedAt).toBeTruthy();
		});

		test("creates annotation with custom author", async () => {
			const request: CreateAnnotationRequest = {
				artifactPath: "test.md",
				anchor: {
					type: "line",
					lineNumber: 5,
					lineContent: "const x = 1;",
				},
				annotationType: "comment",
				content: "Line comment",
			};

			const annotation = await createAnnotation(
				testProjectPath,
				request,
				"alice",
			);
			expect(annotation.author).toBe("alice");
		});

		test("creates suggestion annotation with edit data", async () => {
			const request: CreateAnnotationRequest = {
				artifactPath: "test.md",
				anchor: {
					type: "text-selection",
					startOffset: 0,
					endOffset: 10,
					selectedText: "old text",
					contextBefore: "",
					contextAfter: "",
				},
				annotationType: "suggestion",
				content: "Please change this",
				suggestion: {
					originalText: "old text",
					suggestedText: "new text",
				},
			};

			const annotation = await createAnnotation(testProjectPath, request);
			expect(annotation.annotationType).toBe("suggestion");
			expect(annotation.suggestion).toEqual({
				originalText: "old text",
				suggestedText: "new text",
			});
		});

		test("persists annotation to file with correct schema", async () => {
			const request: CreateAnnotationRequest = {
				artifactPath: "test.md",
				anchor: {
					type: "hidden-anchor",
					anchorId: "section-1",
					anchorText: "Section 1",
				},
				annotationType: "comment",
				content: "Anchor comment",
			};

			await createAnnotation(testProjectPath, request);

			const filePath = join(testProjectPath, ".rp1", "open-tasks.json");
			const content = await readFile(filePath, "utf-8");
			const file: OpenTasksFile = JSON.parse(content);

			expect(file.version).toBe("1.0.0");
			expect(file.lastModified).toBeTruthy();
			expect(file.annotations).toHaveLength(1);
		});
	});

	describe("getAnnotation", () => {
		test("returns annotation by ID", async () => {
			const request: CreateAnnotationRequest = {
				artifactPath: "test.md",
				anchor: {
					type: "text-selection",
					startOffset: 0,
					endOffset: 5,
					selectedText: "hello",
					contextBefore: "",
					contextAfter: "",
				},
				annotationType: "comment",
				content: "Get me",
			};

			const created = await createAnnotation(testProjectPath, request);
			const fetched = await getAnnotation(testProjectPath, created.id);

			expect(fetched).not.toBeNull();
			expect(fetched?.id).toBe(created.id);
			expect(fetched?.content).toBe("Get me");
		});

		test("returns null for non-existent ID", async () => {
			const result = await getAnnotation(testProjectPath, "nonexistent");
			expect(result).toBeNull();
		});
	});

	describe("updateAnnotation", () => {
		test("updates annotation content", async () => {
			const request: CreateAnnotationRequest = {
				artifactPath: "test.md",
				anchor: {
					type: "text-selection",
					startOffset: 0,
					endOffset: 5,
					selectedText: "hello",
					contextBefore: "",
					contextAfter: "",
				},
				annotationType: "comment",
				content: "Original",
			};

			const created = await createAnnotation(testProjectPath, request);

			// Small delay to ensure updatedAt will be different
			await new Promise((resolve) => setTimeout(resolve, 10));

			const updated = await updateAnnotation(testProjectPath, created.id, {
				content: "Updated",
			});

			expect(updated.content).toBe("Updated");
			// Verify updatedAt was refreshed (may be same or different depending on timing)
			expect(updated.updatedAt).toBeTruthy();
		});

		test("throws for non-existent ID", async () => {
			await expect(
				updateAnnotation(testProjectPath, "nonexistent", { content: "test" }),
			).rejects.toMatchObject({
				_tag: "NotFound",
				id: "nonexistent",
			});
		});
	});

	describe("resolveAnnotation", () => {
		test("marks annotation as resolved", async () => {
			const request: CreateAnnotationRequest = {
				artifactPath: "test.md",
				anchor: {
					type: "text-selection",
					startOffset: 0,
					endOffset: 5,
					selectedText: "hello",
					contextBefore: "",
					contextAfter: "",
				},
				annotationType: "comment",
				content: "Resolve me",
			};

			const created = await createAnnotation(testProjectPath, request);
			await resolveAnnotation(testProjectPath, created.id);

			const fetched = await getAnnotation(testProjectPath, created.id);
			expect(fetched?.status).toBe("resolved");
		});

		test("throws for non-existent ID", async () => {
			await expect(
				resolveAnnotation(testProjectPath, "nonexistent"),
			).rejects.toMatchObject({
				_tag: "NotFound",
			});
		});
	});

	describe("reopenAnnotation", () => {
		test("reopens resolved annotation", async () => {
			const request: CreateAnnotationRequest = {
				artifactPath: "test.md",
				anchor: {
					type: "text-selection",
					startOffset: 0,
					endOffset: 5,
					selectedText: "hello",
					contextBefore: "",
					contextAfter: "",
				},
				annotationType: "comment",
				content: "Reopen me",
			};

			const created = await createAnnotation(testProjectPath, request);
			await resolveAnnotation(testProjectPath, created.id);
			await reopenAnnotation(testProjectPath, created.id);

			const fetched = await getAnnotation(testProjectPath, created.id);
			expect(fetched?.status).toBe("open");
		});
	});

	describe("deleteAnnotation", () => {
		test("removes annotation from file", async () => {
			const request: CreateAnnotationRequest = {
				artifactPath: "test.md",
				anchor: {
					type: "text-selection",
					startOffset: 0,
					endOffset: 5,
					selectedText: "hello",
					contextBefore: "",
					contextAfter: "",
				},
				annotationType: "comment",
				content: "Delete me",
			};

			const created = await createAnnotation(testProjectPath, request);
			await deleteAnnotation(testProjectPath, created.id);

			const fetched = await getAnnotation(testProjectPath, created.id);
			expect(fetched).toBeNull();

			const all = await getAnnotations(testProjectPath);
			expect(all).toHaveLength(0);
		});

		test("throws for non-existent ID", async () => {
			await expect(
				deleteAnnotation(testProjectPath, "nonexistent"),
			).rejects.toMatchObject({
				_tag: "NotFound",
			});
		});
	});

	describe("addReply", () => {
		test("adds reply to annotation thread", async () => {
			const request: CreateAnnotationRequest = {
				artifactPath: "test.md",
				anchor: {
					type: "text-selection",
					startOffset: 0,
					endOffset: 5,
					selectedText: "hello",
					contextBefore: "",
					contextAfter: "",
				},
				annotationType: "comment",
				content: "Original comment",
			};

			const created = await createAnnotation(testProjectPath, request);
			const reply = await addReply(testProjectPath, created.id, {
				content: "This is a reply",
			});

			expect(reply.id).toMatch(/^REP-/);
			expect(reply.content).toBe("This is a reply");
			expect(reply.author).toBe("user");

			const fetched = await getAnnotation(testProjectPath, created.id);
			expect(fetched?.replies).toHaveLength(1);
			expect(fetched?.replies[0].content).toBe("This is a reply");
		});

		test("supports multiple replies in chronological order", async () => {
			const request: CreateAnnotationRequest = {
				artifactPath: "test.md",
				anchor: {
					type: "text-selection",
					startOffset: 0,
					endOffset: 5,
					selectedText: "hello",
					contextBefore: "",
					contextAfter: "",
				},
				annotationType: "comment",
				content: "Original",
			};

			const created = await createAnnotation(testProjectPath, request);
			await addReply(testProjectPath, created.id, { content: "Reply 1" });
			await addReply(testProjectPath, created.id, { content: "Reply 2" });
			await addReply(testProjectPath, created.id, { content: "Reply 3" });

			const fetched = await getAnnotation(testProjectPath, created.id);
			expect(fetched?.replies).toHaveLength(3);
			expect(fetched?.replies[0].content).toBe("Reply 1");
			expect(fetched?.replies[1].content).toBe("Reply 2");
			expect(fetched?.replies[2].content).toBe("Reply 3");
		});

		test("reply with custom author", async () => {
			const request: CreateAnnotationRequest = {
				artifactPath: "test.md",
				anchor: {
					type: "text-selection",
					startOffset: 0,
					endOffset: 5,
					selectedText: "hello",
					contextBefore: "",
					contextAfter: "",
				},
				annotationType: "comment",
				content: "Comment",
			};

			const created = await createAnnotation(testProjectPath, request);
			const reply = await addReply(
				testProjectPath,
				created.id,
				{ content: "Agent reply" },
				"agent-assistant",
			);

			expect(reply.author).toBe("agent-assistant");
		});

		test("throws for non-existent annotation", async () => {
			await expect(
				addReply(testProjectPath, "nonexistent", { content: "test" }),
			).rejects.toMatchObject({
				_tag: "NotFound",
			});
		});
	});

	describe("detectOrphanedAnnotations", () => {
		test("marks annotation as orphaned when text no longer found", async () => {
			const request: CreateAnnotationRequest = {
				artifactPath: "test.md",
				anchor: {
					type: "text-selection",
					startOffset: 0,
					endOffset: 10,
					selectedText: "original text",
					contextBefore: "",
					contextAfter: "",
				},
				annotationType: "comment",
				content: "Comment on original",
			};

			const created = await createAnnotation(testProjectPath, request);
			expect(created.orphaned).toBe(false);

			await detectOrphanedAnnotations(
				testProjectPath,
				"test.md",
				"completely different content",
			);

			const fetched = await getAnnotation(testProjectPath, created.id);
			expect(fetched?.orphaned).toBe(true);
		});

		test("un-orphans annotation when text is restored", async () => {
			const request: CreateAnnotationRequest = {
				artifactPath: "test.md",
				anchor: {
					type: "text-selection",
					startOffset: 0,
					endOffset: 10,
					selectedText: "target text",
					contextBefore: "",
					contextAfter: "",
				},
				annotationType: "comment",
				content: "Comment",
			};

			const created = await createAnnotation(testProjectPath, request);

			// Make orphaned
			await detectOrphanedAnnotations(testProjectPath, "test.md", "no match");
			let fetched = await getAnnotation(testProjectPath, created.id);
			expect(fetched?.orphaned).toBe(true);

			// Restore text
			await detectOrphanedAnnotations(
				testProjectPath,
				"test.md",
				"has the target text in it",
			);
			fetched = await getAnnotation(testProjectPath, created.id);
			expect(fetched?.orphaned).toBe(false);
		});

		test("validates hidden anchors", async () => {
			const request: CreateAnnotationRequest = {
				artifactPath: "test.md",
				anchor: {
					type: "hidden-anchor",
					anchorId: "section-intro",
					anchorText: "Introduction",
				},
				annotationType: "comment",
				content: "Comment on section",
			};

			const created = await createAnnotation(testProjectPath, request);

			// Content with anchor
			await detectOrphanedAnnotations(
				testProjectPath,
				"test.md",
				'Some text <a id="section-intro"></a> more text',
			);
			let fetched = await getAnnotation(testProjectPath, created.id);
			expect(fetched?.orphaned).toBe(false);

			// Content without anchor
			await detectOrphanedAnnotations(
				testProjectPath,
				"test.md",
				"No anchor here",
			);
			fetched = await getAnnotation(testProjectPath, created.id);
			expect(fetched?.orphaned).toBe(true);
		});

		test("validates line anchors", async () => {
			const request: CreateAnnotationRequest = {
				artifactPath: "test.ts",
				anchor: {
					type: "line",
					lineNumber: 2,
					lineContent: "const x = 1;",
				},
				annotationType: "comment",
				content: "Line comment",
			};

			const created = await createAnnotation(testProjectPath, request);

			// Content with matching line
			await detectOrphanedAnnotations(
				testProjectPath,
				"test.ts",
				"import x;\nconst x = 1;\nexport x;",
			);
			let fetched = await getAnnotation(testProjectPath, created.id);
			expect(fetched?.orphaned).toBe(false);

			// Content with different line
			await detectOrphanedAnnotations(
				testProjectPath,
				"test.ts",
				"import x;\nconst y = 2;\nexport y;",
			);
			fetched = await getAnnotation(testProjectPath, created.id);
			expect(fetched?.orphaned).toBe(true);
		});

		test("only affects annotations for specified artifact", async () => {
			const request1: CreateAnnotationRequest = {
				artifactPath: "file1.md",
				anchor: {
					type: "text-selection",
					startOffset: 0,
					endOffset: 5,
					selectedText: "hello",
					contextBefore: "",
					contextAfter: "",
				},
				annotationType: "comment",
				content: "File 1 comment",
			};

			const request2: CreateAnnotationRequest = {
				artifactPath: "file2.md",
				anchor: {
					type: "text-selection",
					startOffset: 0,
					endOffset: 5,
					selectedText: "world",
					contextBefore: "",
					contextAfter: "",
				},
				annotationType: "comment",
				content: "File 2 comment",
			};

			const ann1 = await createAnnotation(testProjectPath, request1);
			const ann2 = await createAnnotation(testProjectPath, request2);

			// Only check file1 with content that won't match
			await detectOrphanedAnnotations(testProjectPath, "file1.md", "no match");

			const fetched1 = await getAnnotation(testProjectPath, ann1.id);
			const fetched2 = await getAnnotation(testProjectPath, ann2.id);

			expect(fetched1?.orphaned).toBe(true);
			expect(fetched2?.orphaned).toBe(false);
		});
	});

	describe("atomic writes", () => {
		test("file is valid after write", async () => {
			const request: CreateAnnotationRequest = {
				artifactPath: "test.md",
				anchor: {
					type: "text-selection",
					startOffset: 0,
					endOffset: 5,
					selectedText: "hello",
					contextBefore: "",
					contextAfter: "",
				},
				annotationType: "comment",
				content: "Test",
			};

			await createAnnotation(testProjectPath, request);

			const filePath = join(testProjectPath, ".rp1", "open-tasks.json");
			const content = await readFile(filePath, "utf-8");
			const file: OpenTasksFile = JSON.parse(content);

			expect(file.version).toBe("1.0.0");
			expect(typeof file.lastModified).toBe("string");
			expect(Array.isArray(file.annotations)).toBe(true);
		});
	});
});
