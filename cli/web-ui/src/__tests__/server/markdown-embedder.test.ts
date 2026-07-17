/**
 * Unit tests for markdown embedding service.
 * Tests embedding, parsing, and removal of annotation markers.
 */

import { Database } from "bun:sqlite";
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
import { makeSourceAnchor } from "../../server/markdown-projection";
import type { CreateAnnotationRequest } from "../../types/annotations";

const SCHEMA_SQL = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schema_version (
    version INTEGER NOT NULL
);
INSERT INTO schema_version (version) VALUES (2);

CREATE TABLE IF NOT EXISTS runs (
    id TEXT PRIMARY KEY NOT NULL,
    flow TEXT NOT NULL,
    feature_id TEXT NOT NULL,
    project_path TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'not_started',
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS artifacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    doc_id TEXT UNIQUE NOT NULL,
    run_id TEXT REFERENCES runs(id),
    path TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'other',
    project_path TEXT NOT NULL,
    feature TEXT NOT NULL,
    step TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS annotations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    doc_id TEXT NOT NULL REFERENCES artifacts(doc_id),
    run_id TEXT REFERENCES runs(id),
    content TEXT NOT NULL,
    data TEXT,
    parent_id INTEGER REFERENCES annotations(id),
    status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'resolved')),
    author TEXT NOT NULL DEFAULT 'user',
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
`;

describe("markdown-embedder", () => {
	let testProjectPath: string;
	let db: Database;

	beforeEach(async () => {
		testProjectPath = join(tmpdir(), `embedder-test-${Date.now()}`);
		await mkdir(join(testProjectPath, ".rp1"), { recursive: true });

		db = new Database(":memory:");
		db.exec(SCHEMA_SQL);

		db.prepare(
			"INSERT INTO runs (id, flow, feature_id, project_path) VALUES (?, ?, ?, ?)",
		).run("run-1", "build", "feat-1", testProjectPath);
	});

	afterEach(async () => {
		db.close();
		await rm(testProjectPath, { recursive: true, force: true });
	});

	function seedArtifact(docId: string, path: string): void {
		db.prepare(
			"INSERT INTO artifacts (doc_id, run_id, path, type, project_path, feature) VALUES (?, ?, ?, ?, ?, ?)",
		).run(docId, "run-1", path, "markdown", testProjectPath, "feat-1");
	}

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
			const docId = "doc-embed-1";
			seedArtifact(docId, artifactPath);
			const fullPath = join(testProjectPath, artifactPath);
			await mkdir(join(testProjectPath, "docs"), { recursive: true });
			await writeFile(fullPath, "Hello world, this is a test document.");

			const request: CreateAnnotationRequest = {
				docId,
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

			const annotation = createAnnotation(db, request);
			await embedAnnotations(db, testProjectPath, artifactPath);

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

		test("does not embed a source-anchored annotation onto a surviving duplicate", async () => {
			const artifactPath = "docs/duplicate.md";
			const docId = "doc-embed-dup";
			seedArtifact(docId, artifactPath);
			const fullPath = join(testProjectPath, artifactPath);
			await mkdir(join(testProjectPath, "docs"), { recursive: true });

			// The annotation was anchored to the second occurrence...
			const original = "alpha shared text beta\n\ngamma shared text delta\n";
			const request: CreateAnnotationRequest = {
				docId,
				artifactPath,
				anchor: {
					type: "text-selection",
					startOffset: 0,
					endOffset: 11,
					selectedText: "shared text",
					contextBefore: "gamma ",
					contextAfter: " delta",
					source: makeSourceAnchor(original, 30, 41),
				},
				content: "Comment on the gamma occurrence",
			};
			createAnnotation(db, request);

			// ...whose paragraph was then deleted; a duplicate survives.
			await writeFile(
				fullPath,
				"alpha shared text beta\n\nrewritten closing paragraph\n",
			);
			await embedAnnotations(db, testProjectPath, artifactPath);

			const updatedContent = await readFile(fullPath, "utf-8");
			expect(updatedContent).not.toContain("rp1:annotation:");
		});

		test("skips orphaned annotations", async () => {
			const artifactPath = "test.md";
			const docId = "doc-orphan-1";
			seedArtifact(docId, artifactPath);
			const fullPath = join(testProjectPath, artifactPath);
			await writeFile(fullPath, "Different content");

			const request: CreateAnnotationRequest = {
				docId,
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

			createAnnotation(db, request);
			await embedAnnotations(db, testProjectPath, artifactPath);

			const updatedContent = await readFile(fullPath, "utf-8");
			expect(updatedContent).toBe("Different content");
		});

		test("handles multiple annotations on same file", async () => {
			const artifactPath = "multi.md";
			const docId = "doc-multi-1";
			seedArtifact(docId, artifactPath);
			const fullPath = join(testProjectPath, artifactPath);
			await writeFile(fullPath, "First word and second word here.");

			const request1: CreateAnnotationRequest = {
				docId,
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
				docId,
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

			const ann1 = createAnnotation(db, request1);
			const ann2 = createAnnotation(db, request2);
			await embedAnnotations(db, testProjectPath, artifactPath);

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

			await embedAnnotations(db, testProjectPath, artifactPath);

			const updatedContent = await readFile(fullPath, "utf-8");
			expect(updatedContent).not.toContain("rp1:annotation");
			expect(updatedContent).toContain("old text");
			expect(updatedContent).toContain("More content");
		});

		test("prevents duplicate markers on re-embed", async () => {
			const artifactPath = "dup.md";
			const docId = "doc-dup-1";
			seedArtifact(docId, artifactPath);
			const fullPath = join(testProjectPath, artifactPath);
			await writeFile(fullPath, "Test content here.");

			const request: CreateAnnotationRequest = {
				docId,
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

			const annotation = createAnnotation(db, request);

			await embedAnnotations(db, testProjectPath, artifactPath);
			await embedAnnotations(db, testProjectPath, artifactPath);

			const updatedContent = await readFile(fullPath, "utf-8");
			const startMarkerCount = (
				updatedContent.match(
					new RegExp(`rp1:annotation:${annotation.id}`, "g"),
				) || []
			).length;
			expect(startMarkerCount).toBe(2);
		});

		test("does nothing for non-existent file", async () => {
			await embedAnnotations(db, testProjectPath, "nonexistent.md");
		});

		test("handles hidden-anchor annotations", async () => {
			const artifactPath = "anchored.md";
			const docId = "doc-anchor-1";
			seedArtifact(docId, artifactPath);
			const fullPath = join(testProjectPath, artifactPath);
			await writeFile(
				fullPath,
				'# Document\n<a id="section-1"></a>\nSection content here.',
			);

			const request: CreateAnnotationRequest = {
				docId,
				artifactPath,
				anchor: {
					type: "hidden-anchor",
					anchorId: "section-1",
					anchorText: "Section 1",
				},
				content: "Anchor comment",
			};

			const annotation = createAnnotation(db, request);
			await embedAnnotations(db, testProjectPath, artifactPath);

			const updatedContent = await readFile(fullPath, "utf-8");
			expect(updatedContent).toContain(
				`<!-- rp1:annotation:${annotation.id} -->`,
			);
		});

		test("handles line-anchor annotations", async () => {
			const artifactPath = "code.ts";
			const docId = "doc-line-1";
			seedArtifact(docId, artifactPath);
			const fullPath = join(testProjectPath, artifactPath);
			await writeFile(
				fullPath,
				"import x from 'x';\nconst y = 1;\nexport default y;",
			);

			const request: CreateAnnotationRequest = {
				docId,
				artifactPath,
				anchor: {
					type: "line",
					lineNumber: 2,
					lineContent: "const y = 1;",
				},
				content: "Line comment",
			};

			const annotation = createAnnotation(db, request);
			await embedAnnotations(db, testProjectPath, artifactPath);

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
