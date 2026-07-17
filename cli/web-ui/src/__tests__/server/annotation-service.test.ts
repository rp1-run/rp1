/**
 * Unit tests for annotation persistence service backed by SQLite.
 * Tests CRUD operations, threading, status transitions, doc_id/run_id filtering, and orphan detection.
 */

import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
	addReply,
	createAnnotation,
	deleteAnnotation,
	detectOrphanedAnnotations,
	getAnnotation,
	getAnnotations,
	reopenAnnotation,
	resolveAnnotation,
	updateAnnotation,
} from "../../server/annotation-service";
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

function makeTextAnchor(
	selectedText = "test text",
): CreateAnnotationRequest["anchor"] {
	return {
		type: "text-selection",
		startOffset: 0,
		endOffset: selectedText.length,
		selectedText,
		contextBefore: "",
		contextAfter: "",
	};
}

describe("annotation-service (SQLite)", () => {
	let db: Database;

	beforeEach(() => {
		db = new Database(":memory:");
		db.exec(SCHEMA_SQL);

		db.prepare(
			"INSERT INTO runs (id, flow, feature_id, project_path) VALUES (?, ?, ?, ?)",
		).run("run-1", "build", "feat-1", "/test");
		db.prepare(
			"INSERT INTO runs (id, flow, feature_id, project_path) VALUES (?, ?, ?, ?)",
		).run("run-2", "build", "feat-1", "/test");

		db.prepare(
			"INSERT INTO artifacts (doc_id, run_id, path, type, project_path, feature) VALUES (?, ?, ?, ?, ?, ?)",
		).run("doc-1", "run-1", "file1.md", "document", "/test", "feat-1");
		db.prepare(
			"INSERT INTO artifacts (doc_id, run_id, path, type, project_path, feature) VALUES (?, ?, ?, ?, ?, ?)",
		).run("doc-2", "run-1", "file2.md", "document", "/test", "feat-1");
		db.prepare(
			"INSERT INTO artifacts (doc_id, run_id, path, type, project_path, feature) VALUES (?, ?, ?, ?, ?, ?)",
		).run("doc-3", "run-2", "file3.md", "document", "/test", "feat-1");
	});

	afterEach(() => {
		db.close();
	});

	describe("getAnnotations", () => {
		test("returns empty array when no annotations exist", () => {
			const annotations = getAnnotations(db);
			expect(annotations).toEqual([]);
		});

		test("filters by doc_id", () => {
			const req1: CreateAnnotationRequest = {
				docId: "doc-1",
				anchor: makeTextAnchor("first"),
				content: "First comment",
			};
			const req2: CreateAnnotationRequest = {
				docId: "doc-2",
				anchor: makeTextAnchor("second"),
				content: "Second comment",
			};

			createAnnotation(db, req1);
			createAnnotation(db, req2);

			const doc1Annotations = getAnnotations(db, { docId: "doc-1" });
			expect(doc1Annotations).toHaveLength(1);
			expect(doc1Annotations[0].content).toBe("First comment");

			const doc2Annotations = getAnnotations(db, { docId: "doc-2" });
			expect(doc2Annotations).toHaveLength(1);
			expect(doc2Annotations[0].content).toBe("Second comment");
		});

		test("filters by run_id", () => {
			createAnnotation(db, {
				docId: "doc-1",
				anchor: makeTextAnchor(),
				content: "Run 1 comment",
				runId: "run-1",
			});
			createAnnotation(db, {
				docId: "doc-3",
				anchor: makeTextAnchor(),
				content: "Run 2 comment",
				runId: "run-2",
			});

			const run1Annotations = getAnnotations(db, { runId: "run-1" });
			expect(run1Annotations).toHaveLength(1);
			expect(run1Annotations[0].content).toBe("Run 1 comment");
		});

		test("filters by both doc_id and run_id", () => {
			createAnnotation(db, {
				docId: "doc-1",
				anchor: makeTextAnchor(),
				content: "Comment A",
				runId: "run-1",
			});
			createAnnotation(db, {
				docId: "doc-1",
				anchor: makeTextAnchor(),
				content: "Comment B",
			});

			const filtered = getAnnotations(db, { docId: "doc-1", runId: "run-1" });
			expect(filtered).toHaveLength(1);
			expect(filtered[0].content).toBe("Comment A");
		});

		test("excludes reply rows from listing", () => {
			const parent = createAnnotation(db, {
				docId: "doc-1",
				anchor: makeTextAnchor(),
				content: "Parent",
			});
			addReply(db, parent.id, { content: "Reply" });

			const all = getAnnotations(db);
			expect(all).toHaveLength(1);
			expect(all[0].content).toBe("Parent");
		});
	});

	describe("createAnnotation", () => {
		test("creates annotation with all required fields", () => {
			const request: CreateAnnotationRequest = {
				docId: "doc-1",
				artifactPath: "file1.md",
				anchor: {
					type: "text-selection",
					startOffset: 0,
					endOffset: 10,
					selectedText: "test text",
					contextBefore: "before",
					contextAfter: "after",
				},
				content: "My comment",
			};

			const annotation = createAnnotation(db, request);

			expect(Number(annotation.id)).toBeGreaterThan(0);
			expect(annotation.docId).toBe("doc-1");
			expect(annotation.artifactPath).toBe("file1.md");
			expect(annotation.content).toBe("My comment");
			expect(annotation.status).toBe("open");
			expect(annotation.author).toBe("user");
			expect(annotation.replies).toEqual([]);
			expect(annotation.orphaned).toBe(false);
			expect(annotation.createdAt).toBeTruthy();
			expect(annotation.updatedAt).toBeTruthy();
		});

		test("creates annotation with custom author", () => {
			const request: CreateAnnotationRequest = {
				docId: "doc-1",
				anchor: {
					type: "line",
					lineNumber: 5,
					lineContent: "const x = 1;",
				},
				content: "Line comment",
			};

			const annotation = createAnnotation(db, request, "alice");
			expect(annotation.author).toBe("alice");
		});

		test("creates annotation with run_id", () => {
			const request: CreateAnnotationRequest = {
				docId: "doc-1",
				anchor: makeTextAnchor(),
				content: "Run-scoped comment",
				runId: "run-1",
			};

			const annotation = createAnnotation(db, request);
			expect(annotation.runId).toBe("run-1");
		});

		test("stores anchor data in the database", () => {
			const request: CreateAnnotationRequest = {
				docId: "doc-1",
				anchor: {
					type: "hidden-anchor",
					anchorId: "section-1",
					anchorText: "Section 1",
				},
				content: "Anchor comment",
			};

			const annotation = createAnnotation(db, request);
			expect(annotation.anchor.type).toBe("hidden-anchor");
			expect((annotation.anchor as { anchorId: string }).anchorId).toBe(
				"section-1",
			);
		});
	});

	describe("getAnnotation", () => {
		test("returns annotation by ID", () => {
			const request: CreateAnnotationRequest = {
				docId: "doc-1",
				anchor: makeTextAnchor("hello"),
				content: "Get me",
			};

			const created = createAnnotation(db, request);
			const fetched = getAnnotation(db, created.id);

			expect(fetched).not.toBeNull();
			expect(fetched?.id).toBe(created.id);
			expect(fetched?.content).toBe("Get me");
		});

		test("returns null for non-existent ID", () => {
			const result = getAnnotation(db, "999");
			expect(result).toBeNull();
		});

		test("returns null for reply IDs (only root annotations)", () => {
			const parent = createAnnotation(db, {
				docId: "doc-1",
				anchor: makeTextAnchor(),
				content: "Parent",
			});
			const reply = addReply(db, parent.id, { content: "Reply" });

			const result = getAnnotation(db, reply.id);
			expect(result).toBeNull();
		});
	});

	describe("updateAnnotation", () => {
		test("updates annotation content", () => {
			const created = createAnnotation(db, {
				docId: "doc-1",
				anchor: makeTextAnchor("hello"),
				content: "Original",
			});

			const updated = updateAnnotation(db, created.id, {
				content: "Updated",
			});

			expect(updated.content).toBe("Updated");
			expect(updated.updatedAt).toBeTruthy();
		});

		test("updates orphaned status", () => {
			const created = createAnnotation(db, {
				docId: "doc-1",
				anchor: makeTextAnchor("hello"),
				content: "Test",
			});

			const updated = updateAnnotation(db, created.id, {
				orphaned: true,
			});

			expect(updated.orphaned).toBe(true);
		});

		test("throws for non-existent ID", () => {
			expect(() => updateAnnotation(db, "999", { content: "test" })).toThrow();
		});
	});

	describe("resolveAnnotation", () => {
		test("marks annotation as resolved", () => {
			const created = createAnnotation(db, {
				docId: "doc-1",
				anchor: makeTextAnchor("hello"),
				content: "Resolve me",
			});

			resolveAnnotation(db, created.id);

			const fetched = getAnnotation(db, created.id);
			expect(fetched?.status).toBe("resolved");
		});

		test("throws for non-existent ID", () => {
			expect(() => resolveAnnotation(db, "999")).toThrow();
		});
	});

	describe("reopenAnnotation", () => {
		test("reopens resolved annotation", () => {
			const created = createAnnotation(db, {
				docId: "doc-1",
				anchor: makeTextAnchor("hello"),
				content: "Reopen me",
			});

			resolveAnnotation(db, created.id);
			reopenAnnotation(db, created.id);

			const fetched = getAnnotation(db, created.id);
			expect(fetched?.status).toBe("open");
		});
	});

	describe("deleteAnnotation", () => {
		test("removes annotation from database", () => {
			const created = createAnnotation(db, {
				docId: "doc-1",
				anchor: makeTextAnchor("hello"),
				content: "Delete me",
			});

			deleteAnnotation(db, created.id);

			const fetched = getAnnotation(db, created.id);
			expect(fetched).toBeNull();

			const all = getAnnotations(db);
			expect(all).toHaveLength(0);
		});

		test("removes replies when deleting parent", () => {
			const parent = createAnnotation(db, {
				docId: "doc-1",
				anchor: makeTextAnchor("hello"),
				content: "Parent",
			});
			addReply(db, parent.id, { content: "Reply 1" });
			addReply(db, parent.id, { content: "Reply 2" });

			deleteAnnotation(db, parent.id);

			const row = db
				.prepare("SELECT COUNT(*) as count FROM annotations")
				.get() as { count: number };
			expect(row.count).toBe(0);
		});

		test("throws for non-existent ID", () => {
			expect(() => deleteAnnotation(db, "999")).toThrow();
		});
	});

	describe("addReply", () => {
		test("adds reply to annotation thread", () => {
			const created = createAnnotation(db, {
				docId: "doc-1",
				anchor: makeTextAnchor("hello"),
				content: "Original comment",
			});

			const reply = addReply(db, created.id, {
				content: "This is a reply",
			});

			expect(Number(reply.id)).toBeGreaterThan(0);
			expect(reply.content).toBe("This is a reply");
			expect(reply.author).toBe("user");

			const fetched = getAnnotation(db, created.id);
			expect(fetched?.replies).toHaveLength(1);
			expect(fetched?.replies[0].content).toBe("This is a reply");
		});

		test("supports multiple replies in chronological order", () => {
			const created = createAnnotation(db, {
				docId: "doc-1",
				anchor: makeTextAnchor("hello"),
				content: "Original",
			});

			addReply(db, created.id, { content: "Reply 1" });
			addReply(db, created.id, { content: "Reply 2" });
			addReply(db, created.id, { content: "Reply 3" });

			const fetched = getAnnotation(db, created.id);
			expect(fetched?.replies).toHaveLength(3);
			expect(fetched?.replies[0].content).toBe("Reply 1");
			expect(fetched?.replies[1].content).toBe("Reply 2");
			expect(fetched?.replies[2].content).toBe("Reply 3");
		});

		test("reply with custom author", () => {
			const created = createAnnotation(db, {
				docId: "doc-1",
				anchor: makeTextAnchor("hello"),
				content: "Comment",
			});

			const reply = addReply(
				db,
				created.id,
				{ content: "Agent reply" },
				"agent-assistant",
			);

			expect(reply.author).toBe("agent-assistant");
		});

		test("throws for non-existent annotation", () => {
			expect(() => addReply(db, "999", { content: "test" })).toThrow();
		});
	});

	describe("detectOrphanedAnnotations", () => {
		test("marks annotation as orphaned when text no longer found", () => {
			const created = createAnnotation(db, {
				docId: "doc-1",
				anchor: makeTextAnchor("original text"),
				content: "Comment on original",
			});
			expect(created.orphaned).toBe(false);

			detectOrphanedAnnotations(db, "doc-1", "completely different content");

			const fetched = getAnnotation(db, created.id);
			expect(fetched?.orphaned).toBe(true);
		});

		test("un-orphans annotation when text is restored", () => {
			const created = createAnnotation(db, {
				docId: "doc-1",
				anchor: makeTextAnchor("target text"),
				content: "Comment",
			});

			detectOrphanedAnnotations(db, "doc-1", "no match");
			let fetched = getAnnotation(db, created.id);
			expect(fetched?.orphaned).toBe(true);

			detectOrphanedAnnotations(db, "doc-1", "has the target text in it");
			fetched = getAnnotation(db, created.id);
			expect(fetched?.orphaned).toBe(false);
		});

		test("keeps rendered-text selections anchored across inline markdown syntax", () => {
			// Selection text is captured from the rendered DOM, so backticks,
			// bold markers, and table pipes present in the source are absent.
			const created = createAnnotation(db, {
				docId: "doc-1",
				anchor: makeTextAnchor(
					"THE single shared collaborator. Class members: putAudit, audit; exposes val logger = getLogger<Svc>() verbatim type argument",
				),
				content: "Comment",
			});

			detectOrphanedAnnotations(
				db,
				"doc-1",
				"| `Support.kt` | THE single shared collaborator. Class members: `putAudit`, `audit`; exposes `val logger = getLogger<Svc>()` **verbatim type argument** |",
			);

			const fetched = getAnnotation(db, created.id);
			expect(fetched?.orphaned).toBe(false);
		});

		test("keeps selections anchored across block boundaries and soft line wraps", () => {
			// DOM extraction concatenates block text without separators, while
			// the markdown source separates the same text with newlines.
			const created = createAnnotation(db, {
				docId: "doc-1",
				anchor: makeTextAnchor("REQ-001: Gate DiscoveryPriority: Must Have"),
				content: "Comment",
			});

			detectOrphanedAnnotations(
				db,
				"doc-1",
				"## REQ-001: Gate Discovery\n\nPriority: Must Have\n",
			);

			const fetched = getAnnotation(db, created.id);
			expect(fetched?.orphaned).toBe(false);
		});

		test("lazily migrates legacy anchors to source coordinates", () => {
			const created = createAnnotation(db, {
				docId: "doc-1",
				anchor: makeTextAnchor("exposes val logger verbatim"),
				content: "Comment",
			});

			detectOrphanedAnnotations(
				db,
				"doc-1",
				"Body that exposes `val logger` **verbatim** here.",
			);

			const fetched = getAnnotation(db, created.id);
			expect(fetched?.orphaned).toBe(false);
			const anchor = fetched?.anchor as {
				source?: { text: string };
			};
			expect(anchor.source).toBeDefined();
			expect(anchor.source?.text).toBe("exposes `val logger` **verbatim");
		});

		test("re-anchors source coordinates after the document is reformatted", () => {
			const created = createAnnotation(db, {
				docId: "doc-1",
				anchor: makeTextAnchor("exposes val logger verbatim"),
				content: "Comment",
			});

			// First pass stores source coordinates for the bold form.
			detectOrphanedAnnotations(
				db,
				"doc-1",
				"Body that exposes `val logger` **verbatim** here.",
			);

			// The document is reformatted: bold becomes italics. The stored
			// source slice is gone, but the rendered text still resolves.
			detectOrphanedAnnotations(
				db,
				"doc-1",
				"Body that exposes `val logger` _verbatim_ here.",
			);

			const fetched = getAnnotation(db, created.id);
			expect(fetched?.orphaned).toBe(false);
			const anchor = fetched?.anchor as {
				source?: { text: string };
			};
			expect(anchor.source?.text).toBe("exposes `val logger` _verbatim");
		});

		test("orphans annotations when the annotated occurrence is deleted and only a duplicate remains", () => {
			const created = createAnnotation(db, {
				docId: "doc-1",
				anchor: {
					type: "text-selection",
					startOffset: 0,
					endOffset: 11,
					selectedText: "shared text",
					contextBefore: "gamma ",
					contextAfter: " delta",
				},
				content: "Comment on the second occurrence",
			});

			// First pass anchors the annotation to the gamma occurrence.
			detectOrphanedAnnotations(
				db,
				"doc-1",
				"alpha shared text beta\n\ngamma shared text delta\n",
			);
			expect(getAnnotation(db, created.id)?.orphaned).toBe(false);

			// The annotated paragraph is deleted; identical text survives
			// elsewhere with a foreign neighborhood. The annotation must not
			// silently move to the duplicate.
			detectOrphanedAnnotations(
				db,
				"doc-1",
				"alpha shared text beta\n\nclosing line rewritten entirely\n",
			);
			expect(getAnnotation(db, created.id)?.orphaned).toBe(true);
		});

		test("re-anchors source coordinates when the annotated paragraph moves", () => {
			const created = createAnnotation(db, {
				docId: "doc-1",
				anchor: {
					type: "text-selection",
					startOffset: 0,
					endOffset: 11,
					selectedText: "shared text",
					contextBefore: "gamma ",
					contextAfter: " delta",
				},
				content: "Comment",
			});

			const original = "alpha shared text beta\n\ngamma shared text delta\n";
			detectOrphanedAnnotations(db, "doc-1", original);
			const before = getAnnotation(db, created.id)?.anchor as {
				source?: { start: number; text: string };
			};
			expect(before.source?.text).toBe("shared text");

			// Prepending a section shifts every offset; the occurrence itself
			// (with its neighborhood) is unchanged.
			const moved = `# New intro section\n\n${original}`;
			detectOrphanedAnnotations(db, "doc-1", moved);
			const fetched = getAnnotation(db, created.id);
			expect(fetched?.orphaned).toBe(false);
			const after = fetched?.anchor as {
				source?: { start: number; text: string };
			};
			expect(after.source?.text).toBe("shared text");
			expect(after.source?.start).toBe(
				(before.source?.start ?? 0) + "# New intro section\n\n".length,
			);
		});

		test("still orphans selections whose text is genuinely gone", () => {
			const created = createAnnotation(db, {
				docId: "doc-1",
				anchor: makeTextAnchor("this sentence was deleted"),
				content: "Comment",
			});

			detectOrphanedAnnotations(
				db,
				"doc-1",
				"# Doc\n\nEntirely rewritten body with `code` and **bold**.",
			);

			const fetched = getAnnotation(db, created.id);
			expect(fetched?.orphaned).toBe(true);
		});

		test("validates hidden anchors", () => {
			const created = createAnnotation(db, {
				docId: "doc-1",
				anchor: {
					type: "hidden-anchor",
					anchorId: "section-intro",
					anchorText: "Introduction",
				},
				content: "Comment on section",
			});

			detectOrphanedAnnotations(
				db,
				"doc-1",
				'Some text <a id="section-intro"></a> more text',
			);
			let fetched = getAnnotation(db, created.id);
			expect(fetched?.orphaned).toBe(false);

			detectOrphanedAnnotations(db, "doc-1", "No anchor here");
			fetched = getAnnotation(db, created.id);
			expect(fetched?.orphaned).toBe(true);
		});

		test("validates line anchors", () => {
			const created = createAnnotation(db, {
				docId: "doc-1",
				anchor: {
					type: "line",
					lineNumber: 2,
					lineContent: "const x = 1;",
				},
				content: "Line comment",
			});

			detectOrphanedAnnotations(
				db,
				"doc-1",
				"import x;\nconst x = 1;\nexport x;",
			);
			let fetched = getAnnotation(db, created.id);
			expect(fetched?.orphaned).toBe(false);

			detectOrphanedAnnotations(
				db,
				"doc-1",
				"import x;\nconst y = 2;\nexport y;",
			);
			fetched = getAnnotation(db, created.id);
			expect(fetched?.orphaned).toBe(true);
		});

		test("only affects annotations for specified doc_id", () => {
			const ann1 = createAnnotation(db, {
				docId: "doc-1",
				anchor: makeTextAnchor("hello"),
				content: "Doc 1 comment",
			});
			const ann2 = createAnnotation(db, {
				docId: "doc-2",
				anchor: makeTextAnchor("world"),
				content: "Doc 2 comment",
			});

			detectOrphanedAnnotations(db, "doc-1", "no match");

			const fetched1 = getAnnotation(db, ann1.id);
			const fetched2 = getAnnotation(db, ann2.id);

			expect(fetched1?.orphaned).toBe(true);
			expect(fetched2?.orphaned).toBe(false);
		});

		test("returns IDs of annotations whose orphaned flag was flipped", () => {
			const ann1 = createAnnotation(db, {
				docId: "doc-1",
				anchor: makeTextAnchor("hello"),
				content: "Will be orphaned",
			});
			const ann2 = createAnnotation(db, {
				docId: "doc-1",
				anchor: makeTextAnchor("world"),
				content: "Also orphaned",
			});

			const flipped = detectOrphanedAnnotations(db, "doc-1", "no match at all");
			expect(flipped).toHaveLength(2);
			expect(flipped).toContain(ann1.id);
			expect(flipped).toContain(ann2.id);
		});

		test("returns empty array when no flags change", () => {
			createAnnotation(db, {
				docId: "doc-1",
				anchor: makeTextAnchor("present text"),
				content: "Stays valid",
			});

			const flipped = detectOrphanedAnnotations(
				db,
				"doc-1",
				"this has present text in it",
			);
			expect(flipped).toEqual([]);
		});

		test("returns only flipped IDs on partial change", () => {
			const ann1 = createAnnotation(db, {
				docId: "doc-1",
				anchor: makeTextAnchor("hello"),
				content: "Will be orphaned",
			});
			createAnnotation(db, {
				docId: "doc-1",
				anchor: makeTextAnchor("goodbye"),
				content: "Stays valid",
			});

			const flipped = detectOrphanedAnnotations(
				db,
				"doc-1",
				"only goodbye here",
			);
			expect(flipped).toHaveLength(1);
			expect(flipped).toContain(ann1.id);
		});

		test("returns IDs when un-orphaning", () => {
			const ann = createAnnotation(db, {
				docId: "doc-1",
				anchor: makeTextAnchor("restorable"),
				content: "Will come back",
			});

			detectOrphanedAnnotations(db, "doc-1", "no match");
			expect(getAnnotation(db, ann.id)?.orphaned).toBe(true);

			const flipped = detectOrphanedAnnotations(
				db,
				"doc-1",
				"restorable content",
			);
			expect(flipped).toHaveLength(1);
			expect(flipped).toContain(ann.id);
			expect(getAnnotation(db, ann.id)?.orphaned).toBe(false);
		});
	});

	describe("status transitions", () => {
		test("open -> resolved -> open lifecycle", () => {
			const created = createAnnotation(db, {
				docId: "doc-1",
				anchor: makeTextAnchor(),
				content: "Lifecycle test",
			});
			expect(created.status).toBe("open");

			resolveAnnotation(db, created.id);
			let fetched = getAnnotation(db, created.id);
			expect(fetched?.status).toBe("resolved");

			reopenAnnotation(db, created.id);
			fetched = getAnnotation(db, created.id);
			expect(fetched?.status).toBe("open");
		});
	});
});
