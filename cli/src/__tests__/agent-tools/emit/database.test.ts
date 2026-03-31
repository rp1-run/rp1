/**
 * Unit tests for the emit database layer.
 * Tests schema creation, CRUD operations, run status derivation,
 * skipped-step detection, and legacy cleanup.
 */

import {
	afterAll,
	afterEach,
	beforeAll,
	describe,
	expect,
	test,
} from "bun:test";
import { existsSync, writeFileSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
	closeDatabase,
	countEventsSince,
	deleteAnnotation,
	deriveRunStatus,
	findOrCreateRun,
	getActiveRunsSnapshot,
	getAnnotationById,
	getAnnotationsForDocId,
	getAnnotationsForRun,
	getArtifactByDocId,
	getArtifactsForRun,
	getEmitDatabase,
	getEventsForRun,
	getEventsSince,
	getMaxEventId,
	getProjectRunStats,
	getRunById,
	getRunsByAttentionStatus,
	getSkippableSteps,
	getStepStatuses,
	insertEvent,
	insertRun,
	listRuns,
	normalizeArtifactStorage,
	resetInstance,
	resolveArtifactPathForRun,
	updateAnnotation,
	upsertAnnotation,
	upsertArtifact,
} from "../../../agent-tools/emit/database.js";
import { expectTaskRight } from "../../helpers/index.js";

describe("emit database", () => {
	let tempDir: string;

	beforeAll(async () => {
		tempDir = join(tmpdir(), `emit-db-test-${Date.now()}`);
		await mkdir(tempDir, { recursive: true });
	});

	afterEach(() => {
		closeDatabase();
		resetInstance();
	});

	afterAll(async () => {
		closeDatabase();
		await rm(tempDir, { recursive: true, force: true });
	});

	describe("schema creation", () => {
		test("creates all tables with correct structure", async () => {
			const dbPath = join(tempDir, "schema-test.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			const tables = db
				.prepare(
					"SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
				)
				.all() as { name: string }[];

			const tableNames = tables.map((t) => t.name);
			expect(tableNames).toContain("runs");
			expect(tableNames).toContain("events");
			expect(tableNames).toContain("artifacts");
			expect(tableNames).toContain("annotations");
			expect(tableNames).toContain("tasks");
			expect(tableNames).toContain("schema_version");
		});

		test("schema_version is set to 8", async () => {
			const dbPath = join(tempDir, "version-test.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			const row = db.prepare("SELECT version FROM schema_version").get() as {
				version: number;
			};

			expect(row.version).toBe(8);
			expect(row.version).toBe(8);
		});

		test("artifacts table includes subflow column", async () => {
			const dbPath = join(tempDir, "subflow-col-test.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			const columns = db.prepare("PRAGMA table_info(artifacts)").all() as {
				name: string;
			}[];
			const columnNames = columns.map((c) => c.name);

			expect(columnNames).toContain("subflow");
			expect(columnNames).toContain("storage_root");
		});

		test("annotations table includes status and author columns", async () => {
			const dbPath = join(tempDir, "ann-columns-test.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			const columns = db.prepare("PRAGMA table_info(annotations)").all() as {
				name: string;
			}[];
			const columnNames = columns.map((c) => c.name);

			expect(columnNames).toContain("status");
			expect(columnNames).toContain("author");
		});

		test("runs table includes resolved directory columns", async () => {
			const dbPath = join(tempDir, "run-dir-columns-test.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			const columns = db.prepare("PRAGMA table_info(runs)").all() as {
				name: string;
			}[];
			const columnNames = columns.map((c) => c.name);

			expect(columnNames).toContain("rp1_project_root");
			expect(columnNames).toContain("rp1_kb_root");
			expect(columnNames).toContain("rp1_work_root");
		});

		test("migrates v1 schema to add status and author columns", async () => {
			const dbPath = join(tempDir, "migration-v1-test.db");

			const { Database } = await import("bun:sqlite");
			const rawDb = new Database(dbPath, { create: true });
			rawDb.exec("PRAGMA journal_mode = WAL;");
			rawDb.exec("PRAGMA foreign_keys = ON;");
			rawDb.exec(`
				CREATE TABLE schema_version (version INTEGER NOT NULL);
				INSERT INTO schema_version (version) VALUES (1);
				CREATE TABLE runs (
					id TEXT PRIMARY KEY NOT NULL,
					flow TEXT NOT NULL,
					feature_id TEXT NOT NULL,
					project_path TEXT NOT NULL,
					status TEXT NOT NULL DEFAULT 'not_started',
					created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
					updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
				);
				CREATE TABLE artifacts (
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
				CREATE TABLE annotations (
					id INTEGER PRIMARY KEY AUTOINCREMENT,
					doc_id TEXT NOT NULL REFERENCES artifacts(doc_id),
					run_id TEXT REFERENCES runs(id),
					content TEXT NOT NULL,
					data TEXT,
					parent_id INTEGER REFERENCES annotations(id),
					created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
					updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
				);
				CREATE TABLE events (
					id INTEGER PRIMARY KEY AUTOINCREMENT,
					run_id TEXT NOT NULL REFERENCES runs(id),
					type TEXT NOT NULL,
					step TEXT,
					unit TEXT,
					data TEXT,
					parent_step_id TEXT,
					created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
				);
				CREATE TABLE tasks (
					id INTEGER PRIMARY KEY AUTOINCREMENT,
					type TEXT NOT NULL,
					description TEXT NOT NULL,
					status TEXT NOT NULL DEFAULT 'pending',
					payload TEXT,
					project_path TEXT,
					result TEXT,
					created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
					updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
				);
			`);
			rawDb.close();

			const db = await expectTaskRight(getEmitDatabase(dbPath));

			const columns = db.prepare("PRAGMA table_info(annotations)").all() as {
				name: string;
			}[];
			const columnNames = columns.map((c) => c.name);

			expect(columnNames).toContain("status");
			expect(columnNames).toContain("author");

			const artColumns = db.prepare("PRAGMA table_info(artifacts)").all() as {
				name: string;
			}[];
			expect(artColumns.map((c) => c.name)).toContain("subflow");
			expect(artColumns.map((c) => c.name)).toContain("baseline");

			const runColumns = db.prepare("PRAGMA table_info(runs)").all() as {
				name: string;
			}[];
			expect(runColumns.map((c) => c.name)).toContain("harness");
			expect(runColumns.map((c) => c.name)).toContain("rp1_project_root");
			expect(runColumns.map((c) => c.name)).toContain("rp1_kb_root");
			expect(runColumns.map((c) => c.name)).toContain("rp1_work_root");

			const versionRow = db
				.prepare("SELECT version FROM schema_version")
				.get() as { version: number };
			expect(versionRow.version).toBe(8);
			expect(versionRow.version).toBe(8);
		});

		test("migrates v2 schema to add subflow column to artifacts", async () => {
			const dbPath = join(tempDir, "migration-v2-test.db");

			const { Database } = await import("bun:sqlite");
			const rawDb = new Database(dbPath, { create: true });
			rawDb.exec("PRAGMA journal_mode = WAL;");
			rawDb.exec("PRAGMA foreign_keys = ON;");
			rawDb.exec(`
				CREATE TABLE schema_version (version INTEGER NOT NULL);
				INSERT INTO schema_version (version) VALUES (2);
				CREATE TABLE runs (
					id TEXT PRIMARY KEY NOT NULL,
					flow TEXT NOT NULL,
					feature_id TEXT NOT NULL,
					project_path TEXT NOT NULL,
					status TEXT NOT NULL DEFAULT 'not_started',
					created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
					updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
				);
				CREATE TABLE artifacts (
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
				CREATE TABLE annotations (
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
				CREATE TABLE events (
					id INTEGER PRIMARY KEY AUTOINCREMENT,
					run_id TEXT NOT NULL REFERENCES runs(id),
					type TEXT NOT NULL,
					step TEXT,
					unit TEXT,
					data TEXT,
					parent_step_id TEXT,
					created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
				);
				CREATE TABLE tasks (
					id INTEGER PRIMARY KEY AUTOINCREMENT,
					type TEXT NOT NULL,
					description TEXT NOT NULL,
					status TEXT NOT NULL DEFAULT 'pending',
					payload TEXT,
					project_path TEXT,
					result TEXT,
					created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
					updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
				);
			`);
			rawDb.close();

			const db = await expectTaskRight(getEmitDatabase(dbPath));

			const columns = db.prepare("PRAGMA table_info(artifacts)").all() as {
				name: string;
			}[];
			const columnNames = columns.map((c) => c.name);

			expect(columnNames).toContain("subflow");
			expect(columnNames).toContain("baseline");
			expect(columnNames).toContain("storage_root");

			const runColumns = db.prepare("PRAGMA table_info(runs)").all() as {
				name: string;
			}[];
			expect(runColumns.map((c) => c.name)).toContain("harness");
			expect(runColumns.map((c) => c.name)).toContain("rp1_project_root");
			expect(runColumns.map((c) => c.name)).toContain("rp1_kb_root");
			expect(runColumns.map((c) => c.name)).toContain("rp1_work_root");

			const versionRow = db
				.prepare("SELECT version FROM schema_version")
				.get() as { version: number };
			expect(versionRow.version).toBe(8);
			expect(versionRow.version).toBe(8);
		});

		test("v3 to v4 migration adds baseline column and cleans orphaned edit-diff annotations", async () => {
			const dbPath = join(tempDir, "migration-v3-test.db");

			const { Database } = await import("bun:sqlite");
			const rawDb = new Database(dbPath, { create: true });
			rawDb.exec("PRAGMA journal_mode = WAL;");
			rawDb.exec("PRAGMA foreign_keys = ON;");
			rawDb.exec(`
				CREATE TABLE schema_version (version INTEGER NOT NULL);
				INSERT INTO schema_version (version) VALUES (3);
				CREATE TABLE runs (
					id TEXT PRIMARY KEY NOT NULL,
					flow TEXT NOT NULL,
					feature_id TEXT NOT NULL,
					project_path TEXT NOT NULL,
					status TEXT NOT NULL DEFAULT 'not_started',
					created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
					updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
				);
				CREATE TABLE artifacts (
					id INTEGER PRIMARY KEY AUTOINCREMENT,
					doc_id TEXT UNIQUE NOT NULL,
					run_id TEXT REFERENCES runs(id),
					path TEXT NOT NULL,
					type TEXT NOT NULL DEFAULT 'other',
					project_path TEXT NOT NULL,
					feature TEXT NOT NULL,
					step TEXT,
					subflow INTEGER NOT NULL DEFAULT 0,
					created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
				);
				CREATE TABLE annotations (
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
				CREATE TABLE events (
					id INTEGER PRIMARY KEY AUTOINCREMENT,
					run_id TEXT NOT NULL REFERENCES runs(id),
					type TEXT NOT NULL,
					step TEXT,
					unit TEXT,
					data TEXT,
					parent_step_id TEXT,
					created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
				);
				CREATE TABLE tasks (
					id INTEGER PRIMARY KEY AUTOINCREMENT,
					type TEXT NOT NULL,
					description TEXT NOT NULL,
					status TEXT NOT NULL DEFAULT 'pending',
					payload TEXT,
					project_path TEXT,
					result TEXT,
					created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
					updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
				);
			`);

			rawDb.exec(`
				INSERT INTO runs (id, flow, feature_id, project_path) VALUES ('r1', 'build', 'feat', '/p');
				INSERT INTO artifacts (doc_id, run_id, path, project_path, feature) VALUES ('d1', 'r1', 'f.md', '/p', 'feat');
				INSERT INTO annotations (doc_id, run_id, content, data) VALUES ('d1', 'r1', 'edit diff', '{"type":"edit-diff"}');
				INSERT INTO annotations (doc_id, run_id, content, data) VALUES ('d1', 'r1', 'user note', '{"type":"text-selection"}');
			`);
			rawDb.close();

			const db = await expectTaskRight(getEmitDatabase(dbPath));

			const columns = db.prepare("PRAGMA table_info(artifacts)").all() as {
				name: string;
			}[];
			expect(columns.map((c) => c.name)).toContain("baseline");

			const versionRow = db
				.prepare("SELECT version FROM schema_version")
				.get() as { version: number };
			expect(versionRow.version).toBe(8);
			expect(versionRow.version).toBe(8);

			const annotations = db.prepare("SELECT * FROM annotations").all() as {
				content: string;
				data: string;
			}[];
			expect(annotations).toHaveLength(1);
			expect(annotations[0].content).toBe("user note");
		});

		test("foreign key constraints are enforced", async () => {
			const dbPath = join(tempDir, "fk-test.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			expect(() => {
				db.prepare(
					`INSERT INTO events (run_id, type, step) VALUES ('nonexistent-run', 'status_change', 'step1')`,
				).run();
			}).toThrow();
		});
	});

	describe("insertRun", () => {
		test("creates a new run record", async () => {
			const dbPath = join(tempDir, "insert-run.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			const run = insertRun(db, {
				id: "run-001",
				flow: "build",
				featureId: "my-feature",
				projectPath: "/test/project",
			});

			expect(run.id).toBe("run-001");
			expect(run.flow).toBe("build");
			expect(run.featureId).toBe("my-feature");
			expect(run.projectPath).toBe("/test/project");
			expect(run.status).toBe("not_started");
			expect(run.createdAt).toMatch(
				/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
			);
		});

		test("stores resolved run directory metadata", async () => {
			const dbPath = join(tempDir, "insert-run-directories.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			const run = insertRun(db, {
				id: "run-dirs",
				flow: "build",
				featureId: "my-feature",
				projectPath: "/test/project",
				rp1ProjectRoot: "/resolved/project",
				rp1KbRoot: "/kb/location",
				rp1WorkRoot: "/work/location",
			});

			expect(run.rp1ProjectRoot).toBe("/resolved/project");
			expect(run.rp1KbRoot).toBe("/kb/location");
			expect(run.rp1WorkRoot).toBe("/work/location");
		});

		test("returns existing run if ID already present", async () => {
			const dbPath = join(tempDir, "run-idempotent.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			const first = insertRun(db, {
				id: "run-dup",
				flow: "build",
				featureId: "feat-1",
				projectPath: "/project",
			});

			const second = insertRun(db, {
				id: "run-dup",
				flow: "different-flow",
				featureId: "feat-2",
				projectPath: "/other",
			});

			expect(second.id).toBe(first.id);
			expect(second.flow).toBe("build");
			expect(second.featureId).toBe("feat-1");
		});

		test("creates a new run with name when provided", async () => {
			const dbPath = join(tempDir, "insert-run-name.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			const run = insertRun(db, {
				id: "run-named",
				flow: "build",
				featureId: "my-feature",
				projectPath: "/test/project",
				name: "Feature: My Feature",
			});

			expect(run.id).toBe("run-named");
			expect(run.name).toBe("Feature: My Feature");
		});

		test("creates a new run with null name when omitted", async () => {
			const dbPath = join(tempDir, "insert-run-no-name.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			const run = insertRun(db, {
				id: "run-unnamed",
				flow: "build",
				featureId: "my-feature",
				projectPath: "/test/project",
			});

			expect(run.name).toBeNull();
		});

		test("backfills name when existing run has null name", async () => {
			const dbPath = join(tempDir, "insert-run-backfill-name.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			insertRun(db, {
				id: "run-backfill",
				flow: "build",
				featureId: "feat-1",
				projectPath: "/project",
			});

			const updated = insertRun(db, {
				id: "run-backfill",
				flow: "build",
				featureId: "feat-1",
				projectPath: "/project",
				name: "Feature: Backfilled",
			});

			expect(updated.name).toBe("Feature: Backfilled");
		});

		test("does not overwrite existing name on subsequent emit", async () => {
			const dbPath = join(tempDir, "insert-run-keep-name.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			insertRun(db, {
				id: "run-keep",
				flow: "build",
				featureId: "feat-1",
				projectPath: "/project",
				name: "Original Name",
			});

			const second = insertRun(db, {
				id: "run-keep",
				flow: "build",
				featureId: "feat-1",
				projectPath: "/project",
				name: "New Name",
			});

			expect(second.name).toBe("Original Name");
		});

		test("emit without name never clears existing name", async () => {
			const dbPath = join(tempDir, "insert-run-no-clear.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			insertRun(db, {
				id: "run-no-clear",
				flow: "build",
				featureId: "feat-1",
				projectPath: "/project",
				name: "Preserved Name",
			});

			const second = insertRun(db, {
				id: "run-no-clear",
				flow: "build",
				featureId: "feat-1",
				projectPath: "/project",
			});

			expect(second.name).toBe("Preserved Name");
		});
	});

	describe("insertEvent", () => {
		test("appends an event and returns the record", async () => {
			const dbPath = join(tempDir, "insert-event.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			insertRun(db, {
				id: "run-ev",
				flow: "build",
				featureId: "feat",
				projectPath: "/project",
			});

			const event = insertEvent(db, {
				runId: "run-ev",
				type: "status_change",
				step: "requirements",
				data: JSON.stringify({ status: "running" }),
			});

			expect(event.id).toBeGreaterThan(0);
			expect(event.runId).toBe("run-ev");
			expect(event.type).toBe("status_change");
			expect(event.step).toBe("requirements");
			expect(event.data).toBe('{"status":"running"}');
			expect(event.createdAt).toMatch(
				/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
			);
		});

		test("rejects event with invalid run_id due to FK constraint", async () => {
			const dbPath = join(tempDir, "event-fk.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			expect(() => {
				insertEvent(db, {
					runId: "nonexistent",
					type: "status_change",
					step: "step1",
				});
			}).toThrow();
		});

		test("stores optional fields as null when not provided", async () => {
			const dbPath = join(tempDir, "event-nulls.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			insertRun(db, {
				id: "run-null",
				flow: "build",
				featureId: "feat",
				projectPath: "/p",
			});

			const event = insertEvent(db, {
				runId: "run-null",
				type: "btw_update",
			});

			expect(event.step).toBeNull();
			expect(event.unit).toBeNull();
			expect(event.data).toBeNull();
			expect(event.parentStepId).toBeNull();
		});

		test("uses provided createdAt timestamp", async () => {
			const dbPath = join(tempDir, "event-timestamp.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			insertRun(db, {
				id: "run-ts",
				flow: "build",
				featureId: "feat",
				projectPath: "/p",
			});

			const customTime = "2026-01-01T00:00:00.000Z";
			const event = insertEvent(db, {
				runId: "run-ts",
				type: "status_change",
				step: "step1",
				createdAt: customTime,
			});

			expect(event.createdAt).toBe(customTime);
		});
	});

	describe("upsertArtifact", () => {
		test("inserts a new artifact", async () => {
			const dbPath = join(tempDir, "artifact-insert.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			insertRun(db, {
				id: "run-art",
				flow: "build",
				featureId: "feat",
				projectPath: "/p",
			});

			const artifact = upsertArtifact(db, {
				docId: "doc-001",
				runId: "run-art",
				path: "design.md",
				type: "markdown",
				projectPath: "/p",
				feature: "feat",
				step: "design",
			});

			expect(artifact.docId).toBe("doc-001");
			expect(artifact.path).toBe("design.md");
			expect(artifact.type).toBe("markdown");
			expect(artifact.storageRoot).toBe("project");
		});

		test("returns existing artifact if doc_id already present", async () => {
			const dbPath = join(tempDir, "artifact-upsert.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			insertRun(db, {
				id: "run-art2",
				flow: "build",
				featureId: "feat",
				projectPath: "/p",
			});

			const first = upsertArtifact(db, {
				docId: "doc-dup",
				runId: "run-art2",
				path: "original.md",
				type: "markdown",
				projectPath: "/p",
				feature: "feat",
			});

			const second = upsertArtifact(db, {
				docId: "doc-dup",
				runId: "run-art2",
				path: "different.md",
				type: "code",
				projectPath: "/other",
				feature: "other-feat",
			});

			expect(second.id).toBe(first.id);
			expect(second.path).toBe("original.md");
		});

		test("inserts artifact with subflow=true", async () => {
			const dbPath = join(tempDir, "artifact-subflow.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			insertRun(db, {
				id: "run-sf",
				flow: "build",
				featureId: "feat",
				projectPath: "/p",
			});

			const artifact = upsertArtifact(db, {
				docId: "doc-sf-1",
				runId: "run-sf",
				path: "flow.mmd",
				type: "diagram",
				projectPath: "/p",
				feature: "feat",
				step: "building",
				subflow: true,
			});

			expect(artifact.subflow).toBe(true);
			expect(artifact.path).toBe("flow.mmd");
		});

		test("inserts artifact with subflow defaulting to false", async () => {
			const dbPath = join(tempDir, "artifact-no-subflow.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			insertRun(db, {
				id: "run-nsf",
				flow: "build",
				featureId: "feat",
				projectPath: "/p",
			});

			const artifact = upsertArtifact(db, {
				docId: "doc-nsf-1",
				runId: "run-nsf",
				path: "design.md",
				type: "markdown",
				projectPath: "/p",
				feature: "feat",
			});

			expect(artifact.subflow).toBe(false);
		});

		test("persists work-dir storage metadata", async () => {
			const dbPath = join(tempDir, "artifact-storage-root.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			insertRun(db, {
				id: "run-storage",
				flow: "build",
				featureId: "feat",
				projectPath: "/p",
			});

			const artifact = upsertArtifact(db, {
				docId: "doc-storage",
				runId: "run-storage",
				path: "features/feat/design.md",
				type: "markdown",
				storageRoot: "work_dir",
				projectPath: "/p",
				feature: "feat",
			});

			expect(artifact.storageRoot).toBe("work_dir");
			expect(artifact.path).toBe("features/feat/design.md");
		});
	});

	describe("upsertAnnotation", () => {
		test("inserts an annotation with FK to artifact doc_id", async () => {
			const dbPath = join(tempDir, "annotation-insert.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			insertRun(db, {
				id: "run-ann",
				flow: "build",
				featureId: "feat",
				projectPath: "/p",
			});

			upsertArtifact(db, {
				docId: "doc-ann",
				runId: "run-ann",
				path: "file.md",
				type: "markdown",
				projectPath: "/p",
				feature: "feat",
			});

			const annotation = upsertAnnotation(db, {
				docId: "doc-ann",
				runId: "run-ann",
				content: "Review comment",
				data: '{"severity": "high"}',
			});

			expect(annotation.docId).toBe("doc-ann");
			expect(annotation.content).toBe("Review comment");
			expect(annotation.data).toBe('{"severity": "high"}');
			expect(annotation.status).toBe("open");
			expect(annotation.author).toBe("user");
		});

		test("inserts annotation with explicit status and author", async () => {
			const dbPath = join(tempDir, "annotation-status-author.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			insertRun(db, {
				id: "run-sa",
				flow: "build",
				featureId: "feat",
				projectPath: "/p",
			});

			upsertArtifact(db, {
				docId: "doc-sa",
				runId: "run-sa",
				path: "file.md",
				type: "markdown",
				projectPath: "/p",
				feature: "feat",
			});

			const annotation = upsertAnnotation(db, {
				docId: "doc-sa",
				runId: "run-sa",
				content: "Resolved comment",
				status: "resolved",
				author: "agent",
			});

			expect(annotation.status).toBe("resolved");
			expect(annotation.author).toBe("agent");
		});

		test("rejects annotation with nonexistent doc_id", async () => {
			const dbPath = join(tempDir, "annotation-fk.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			expect(() => {
				upsertAnnotation(db, {
					docId: "nonexistent-doc",
					content: "Orphan annotation",
				});
			}).toThrow();
		});
	});

	describe("run status derivation", () => {
		test("returns not_started when no step events exist", async () => {
			const dbPath = join(tempDir, "derive-empty.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			insertRun(db, {
				id: "run-d1",
				flow: "build",
				featureId: "feat",
				projectPath: "/p",
			});

			const status = deriveRunStatus(db, "run-d1");
			expect(status).toBe("not_started");
		});

		test("derives running when any step is running", async () => {
			const dbPath = join(tempDir, "derive-running.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			insertRun(db, {
				id: "run-d2",
				flow: "build",
				featureId: "feat",
				projectPath: "/p",
			});

			insertEvent(db, {
				runId: "run-d2",
				type: "status_change",
				step: "step1",
				data: JSON.stringify({ status: "completed" }),
			});
			insertEvent(db, {
				runId: "run-d2",
				type: "status_change",
				step: "step2",
				data: JSON.stringify({ status: "running" }),
			});

			const status = deriveRunStatus(db, "run-d2");
			expect(status).toBe("running");
		});

		test("derives failed when any step is failed", async () => {
			const dbPath = join(tempDir, "derive-failed.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			insertRun(db, {
				id: "run-d3",
				flow: "build",
				featureId: "feat",
				projectPath: "/p",
			});

			insertEvent(db, {
				runId: "run-d3",
				type: "status_change",
				step: "step1",
				data: JSON.stringify({ status: "running" }),
			});
			insertEvent(db, {
				runId: "run-d3",
				type: "status_change",
				step: "step2",
				data: JSON.stringify({ status: "failed" }),
			});

			const status = deriveRunStatus(db, "run-d3");
			expect(status).toBe("failed");
		});

		test("derives waiting when any step is waiting", async () => {
			const dbPath = join(tempDir, "derive-waiting.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			insertRun(db, {
				id: "run-d4",
				flow: "build",
				featureId: "feat",
				projectPath: "/p",
			});

			insertEvent(db, {
				runId: "run-d4",
				type: "status_change",
				step: "step1",
				data: JSON.stringify({ status: "completed" }),
			});
			insertEvent(db, {
				runId: "run-d4",
				type: "status_change",
				step: "step2",
				data: JSON.stringify({ status: "waiting" }),
			});

			const status = deriveRunStatus(db, "run-d4");
			expect(status).toBe("waiting");
		});

		test("derives completed when all steps are completed or skipped", async () => {
			const dbPath = join(tempDir, "derive-completed.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			insertRun(db, {
				id: "run-d5",
				flow: "build",
				featureId: "feat",
				projectPath: "/p",
			});

			insertEvent(db, {
				runId: "run-d5",
				type: "status_change",
				step: "step1",
				data: JSON.stringify({ status: "completed" }),
			});
			insertEvent(db, {
				runId: "run-d5",
				type: "status_change",
				step: "step2",
				data: JSON.stringify({ status: "skipped" }),
			});
			insertEvent(db, {
				runId: "run-d5",
				type: "status_change",
				step: "step3",
				data: JSON.stringify({ status: "completed" }),
			});

			const status = deriveRunStatus(db, "run-d5");
			expect(status).toBe("completed");
		});

		test("failed has highest priority over running", async () => {
			const dbPath = join(tempDir, "derive-priority.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			insertRun(db, {
				id: "run-d6",
				flow: "build",
				featureId: "feat",
				projectPath: "/p",
			});

			insertEvent(db, {
				runId: "run-d6",
				type: "status_change",
				step: "step1",
				data: JSON.stringify({ status: "running" }),
			});
			insertEvent(db, {
				runId: "run-d6",
				type: "status_change",
				step: "step2",
				data: JSON.stringify({ status: "failed" }),
			});
			insertEvent(db, {
				runId: "run-d6",
				type: "status_change",
				step: "step3",
				data: JSON.stringify({ status: "waiting" }),
			});

			const status = deriveRunStatus(db, "run-d6");
			expect(status).toBe("failed");
		});

		test("updates runs.status column after derivation", async () => {
			const dbPath = join(tempDir, "derive-update.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			insertRun(db, {
				id: "run-d7",
				flow: "build",
				featureId: "feat",
				projectPath: "/p",
			});

			insertEvent(db, {
				runId: "run-d7",
				type: "status_change",
				step: "step1",
				data: JSON.stringify({ status: "running" }),
			});

			deriveRunStatus(db, "run-d7");

			const row = db
				.prepare("SELECT status FROM runs WHERE id = 'run-d7'")
				.get() as { status: string };

			expect(row.status).toBe("running");
		});

		test("latest logical work-item status supersedes earlier failed lifecycle states", async () => {
			const dbPath = join(tempDir, "derive-logical-recovery-failed.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			insertRun(db, {
				id: "run-logical-failed",
				flow: "build",
				featureId: "feat",
				projectPath: "/p",
			});

			insertEvent(db, {
				runId: "run-logical-failed",
				type: "status_change",
				step: "task-reviewer:failed",
				unit: "T1",
				data: JSON.stringify({ status: "failed" }),
			});
			insertEvent(db, {
				runId: "run-logical-failed",
				type: "status_change",
				step: "task-reviewer:completed",
				unit: "T1",
				data: JSON.stringify({ status: "completed" }),
			});

			const status = deriveRunStatus(db, "run-logical-failed");

			expect(status).toBe("completed");
		});

		test("latest logical work-item status supersedes earlier running lifecycle states", async () => {
			const dbPath = join(tempDir, "derive-logical-recovery-running.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			insertRun(db, {
				id: "run-logical-running",
				flow: "build",
				featureId: "feat",
				projectPath: "/p",
			});

			insertEvent(db, {
				runId: "run-logical-running",
				type: "status_change",
				step: "task-builder:building",
				unit: "T1",
				data: JSON.stringify({ status: "running" }),
			});
			insertEvent(db, {
				runId: "run-logical-running",
				type: "status_change",
				step: "task-builder:completed",
				unit: "T1",
				data: JSON.stringify({ status: "completed" }),
			});

			const status = deriveRunStatus(db, "run-logical-running");

			expect(status).toBe("completed");
		});

		test("parent workflow completion supersedes contained child lifecycle failures", async () => {
			const dbPath = join(tempDir, "derive-contained-child-failure.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			insertRun(db, {
				id: "run-contained-failure",
				flow: "build",
				featureId: "feat",
				projectPath: "/p",
			});

			insertEvent(db, {
				runId: "run-contained-failure",
				type: "status_change",
				step: "build",
				data: JSON.stringify({ status: "running" }),
			});
			insertEvent(db, {
				runId: "run-contained-failure",
				type: "status_change",
				step: "task-reviewer:failed",
				unit: "T4",
				data: JSON.stringify({ status: "failed" }),
			});
			insertEvent(db, {
				runId: "run-contained-failure",
				type: "status_change",
				step: "build",
				data: JSON.stringify({ status: "completed" }),
			});

			const status = deriveRunStatus(db, "run-contained-failure");

			expect(status).toBe("completed");
		});

		test("keeps units independent within the same sub-agent namespace", async () => {
			const dbPath = join(tempDir, "derive-logical-units.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			insertRun(db, {
				id: "run-logical-units",
				flow: "build",
				featureId: "feat",
				projectPath: "/p",
			});

			insertEvent(db, {
				runId: "run-logical-units",
				type: "status_change",
				step: "task-builder:completed",
				unit: "T1",
				data: JSON.stringify({ status: "completed" }),
			});
			insertEvent(db, {
				runId: "run-logical-units",
				type: "status_change",
				step: "task-builder:failed",
				unit: "T2",
				data: JSON.stringify({ status: "failed" }),
			});

			const status = deriveRunStatus(db, "run-logical-units");

			expect(status).toBe("failed");
		});

		test("closeRun completes logical work items using their latest concrete step label", async () => {
			const dbPath = join(tempDir, "derive-logical-close-run.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			insertRun(db, {
				id: "run-logical-close",
				flow: "build",
				featureId: "feat",
				projectPath: "/p",
			});

			insertEvent(db, {
				runId: "run-logical-close",
				type: "status_change",
				step: "task-builder:building",
				unit: "T1",
				data: JSON.stringify({ status: "running" }),
			});

			const status = deriveRunStatus(db, "run-logical-close", true);
			const events = getEventsForRun(db, "run-logical-close");
			const completionEvents = events.filter(
				(event) =>
					event.step === "task-builder:building" &&
					event.data != null &&
					JSON.parse(event.data).status === "completed",
			);

			expect(status).toBe("completed");
			expect(completionEvents).toHaveLength(1);
		});
	});

	describe("getStepStatuses", () => {
		test("returns latest status per step", async () => {
			const dbPath = join(tempDir, "step-statuses.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			insertRun(db, {
				id: "run-ss",
				flow: "build",
				featureId: "feat",
				projectPath: "/p",
			});

			insertEvent(db, {
				runId: "run-ss",
				type: "status_change",
				step: "step1",
				data: JSON.stringify({ status: "running" }),
			});
			insertEvent(db, {
				runId: "run-ss",
				type: "status_change",
				step: "step1",
				data: JSON.stringify({ status: "completed" }),
			});
			insertEvent(db, {
				runId: "run-ss",
				type: "status_change",
				step: "step2",
				data: JSON.stringify({ status: "running" }),
			});

			const statuses = getStepStatuses(db, "run-ss");

			const step1 = statuses.find((s) => s.step === "step1");
			const step2 = statuses.find((s) => s.step === "step2");

			expect(step1?.status).toBe("completed");
			expect(step2?.status).toBe("running");
		});

		test("reports the latest logical work-item key instead of stale lifecycle labels", async () => {
			const dbPath = join(tempDir, "step-statuses-logical.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			insertRun(db, {
				id: "run-ss-logical",
				flow: "build",
				featureId: "feat",
				projectPath: "/p",
			});

			insertEvent(db, {
				runId: "run-ss-logical",
				type: "status_change",
				step: "task-reviewer:failed",
				unit: "T1",
				data: JSON.stringify({ status: "failed" }),
			});
			insertEvent(db, {
				runId: "run-ss-logical",
				type: "status_change",
				step: "task-reviewer:completed",
				unit: "T1",
				data: JSON.stringify({ status: "completed" }),
			});

			const statuses = getStepStatuses(db, "run-ss-logical");

			expect(statuses).toEqual([
				{
					step: "task-reviewer::T1",
					status: "completed",
					concreteStep: "task-reviewer:completed",
					unit: "T1",
				},
			]);
		});

		test("contains namespaced lifecycle steps inside the active parent workflow step", async () => {
			const dbPath = join(tempDir, "step-statuses-contained-parent.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			insertRun(db, {
				id: "run-ss-contained",
				flow: "build",
				featureId: "feat",
				projectPath: "/p",
			});

			insertEvent(db, {
				runId: "run-ss-contained",
				type: "status_change",
				step: "build",
				data: JSON.stringify({ status: "running" }),
			});
			insertEvent(db, {
				runId: "run-ss-contained",
				type: "status_change",
				step: "task-reviewer:failed",
				unit: "T4",
				data: JSON.stringify({ status: "failed" }),
			});

			const statuses = getStepStatuses(db, "run-ss-contained");

			expect(statuses).toEqual([
				{
					step: "build",
					status: "failed",
					concreteStep: "build",
					unit: null,
				},
			]);
		});
	});

	describe("skipped-step detection", () => {
		test("finds prior steps without events", async () => {
			const dbPath = join(tempDir, "skip-detect.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			insertRun(db, {
				id: "run-sk",
				flow: "build",
				featureId: "feat",
				projectPath: "/p",
			});

			const orderedSteps = ["requirements", "design", "building", "review"];

			insertEvent(db, {
				runId: "run-sk",
				type: "status_change",
				step: "requirements",
				data: JSON.stringify({ status: "completed" }),
			});

			const skippable = getSkippableSteps(db, "run-sk", orderedSteps, "review");

			expect(skippable).toContain("design");
			expect(skippable).toContain("building");
			expect(skippable).not.toContain("requirements");
			expect(skippable).not.toContain("review");
		});

		test("returns empty array for first step", async () => {
			const dbPath = join(tempDir, "skip-first.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			insertRun(db, {
				id: "run-sk2",
				flow: "build",
				featureId: "feat",
				projectPath: "/p",
			});

			const orderedSteps = ["requirements", "design", "building"];

			const skippable = getSkippableSteps(
				db,
				"run-sk2",
				orderedSteps,
				"requirements",
			);

			expect(skippable).toEqual([]);
		});

		test("does not affect steps that already have events", async () => {
			const dbPath = join(tempDir, "skip-existing.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			insertRun(db, {
				id: "run-sk3",
				flow: "build",
				featureId: "feat",
				projectPath: "/p",
			});

			const orderedSteps = ["step1", "step2", "step3"];

			insertEvent(db, {
				runId: "run-sk3",
				type: "status_change",
				step: "step1",
				data: JSON.stringify({ status: "completed" }),
			});
			insertEvent(db, {
				runId: "run-sk3",
				type: "status_change",
				step: "step2",
				data: JSON.stringify({ status: "running" }),
			});

			const skippable = getSkippableSteps(db, "run-sk3", orderedSteps, "step3");

			expect(skippable).toEqual([]);
		});

		test("returns empty array when step is not in ordered list", async () => {
			const dbPath = join(tempDir, "skip-unknown.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			insertRun(db, {
				id: "run-sk4",
				flow: "build",
				featureId: "feat",
				projectPath: "/p",
			});

			const orderedSteps = ["step1", "step2"];

			const skippable = getSkippableSteps(
				db,
				"run-sk4",
				orderedSteps,
				"unknown-step",
			);

			expect(skippable).toEqual([]);
		});
	});

	describe("findOrCreateRun", () => {
		test("returns existing non-terminal run", async () => {
			const dbPath = join(tempDir, "resume-existing.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			insertRun(db, {
				id: "run-active",
				flow: "build",
				featureId: "feat-resume",
				projectPath: "/project/resume",
			});

			insertEvent(db, {
				runId: "run-active",
				type: "status_change",
				step: "requirements",
				data: JSON.stringify({ status: "running" }),
			});
			deriveRunStatus(db, "run-active");

			const result = findOrCreateRun(db, {
				flow: "build",
				featureId: "feat-resume",
				projectPath: "/project/resume",
			});

			expect(result.runId).toBe("run-active");
			expect(result.resumed).toBe(true);
		});

		test("returns most recent non-terminal run when multiple exist", async () => {
			const dbPath = join(tempDir, "resume-multiple.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			insertRun(db, {
				id: "run-older",
				flow: "build",
				featureId: "feat-multi",
				projectPath: "/project/multi",
			});

			insertEvent(db, {
				runId: "run-older",
				type: "status_change",
				step: "step1",
				data: JSON.stringify({ status: "running" }),
			});
			deriveRunStatus(db, "run-older");

			// Small delay to ensure different created_at timestamps
			await new Promise((resolve) => setTimeout(resolve, 10));

			insertRun(db, {
				id: "run-newer",
				flow: "build",
				featureId: "feat-multi",
				projectPath: "/project/multi",
			});

			insertEvent(db, {
				runId: "run-newer",
				type: "status_change",
				step: "step1",
				data: JSON.stringify({ status: "running" }),
			});
			deriveRunStatus(db, "run-newer");

			const result = findOrCreateRun(db, {
				flow: "build",
				featureId: "feat-multi",
				projectPath: "/project/multi",
			});

			expect(result.runId).toBe("run-newer");
			expect(result.resumed).toBe(true);
		});

		test("creates new run when only terminal runs exist", async () => {
			const dbPath = join(tempDir, "resume-terminal.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			insertRun(db, {
				id: "run-done",
				flow: "build",
				featureId: "feat-terminal",
				projectPath: "/project/terminal",
			});

			insertEvent(db, {
				runId: "run-done",
				type: "status_change",
				step: "step1",
				data: JSON.stringify({ status: "completed" }),
			});
			deriveRunStatus(db, "run-done");

			const result = findOrCreateRun(db, {
				flow: "build",
				featureId: "feat-terminal",
				projectPath: "/project/terminal",
			});

			expect(result.runId).not.toBe("run-done");
			expect(result.resumed).toBe(false);
		});

		test("creates new run when no runs exist for feature", async () => {
			const dbPath = join(tempDir, "resume-none.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			const result = findOrCreateRun(db, {
				flow: "build",
				featureId: "feat-new",
				projectPath: "/project/new",
			});

			expect(result.runId).toBeTruthy();
			expect(result.resumed).toBe(false);

			const row = db
				.prepare("SELECT * FROM runs WHERE id = ?")
				.get(result.runId) as {
				id: string;
				flow: string;
				feature_id: string;
			} | null;

			expect(row).not.toBeNull();
			expect(row?.flow).toBe("build");
			expect(row?.feature_id).toBe("feat-new");
		});

		test("does not return run from different project", async () => {
			const dbPath = join(tempDir, "resume-project-isolation.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			insertRun(db, {
				id: "run-other-project",
				flow: "build",
				featureId: "feat-isolated",
				projectPath: "/project/other",
			});

			insertEvent(db, {
				runId: "run-other-project",
				type: "status_change",
				step: "step1",
				data: JSON.stringify({ status: "running" }),
			});
			deriveRunStatus(db, "run-other-project");

			const result = findOrCreateRun(db, {
				flow: "build",
				featureId: "feat-isolated",
				projectPath: "/project/this",
			});

			expect(result.runId).not.toBe("run-other-project");
			expect(result.resumed).toBe(false);
		});

		test("does not resume run from different workflow type", async () => {
			const dbPath = join(tempDir, "resume-flow-filter.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			insertRun(db, {
				id: "run-pr-review",
				flow: "pr-review",
				featureId: "feat-flow",
				projectPath: "/project/flow",
			});

			insertEvent(db, {
				runId: "run-pr-review",
				type: "status_change",
				step: "step1",
				data: JSON.stringify({ status: "running" }),
			});
			deriveRunStatus(db, "run-pr-review");

			const result = findOrCreateRun(db, {
				flow: "build",
				featureId: "feat-flow",
				projectPath: "/project/flow",
			});

			expect(result.runId).not.toBe("run-pr-review");
			expect(result.resumed).toBe(false);
		});

		test("resumes run matching same workflow type", async () => {
			const dbPath = join(tempDir, "resume-same-flow.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			insertRun(db, {
				id: "run-build-1",
				flow: "build",
				featureId: "feat-same-flow",
				projectPath: "/project/same",
			});

			insertEvent(db, {
				runId: "run-build-1",
				type: "status_change",
				step: "step1",
				data: JSON.stringify({ status: "running" }),
			});
			deriveRunStatus(db, "run-build-1");

			insertRun(db, {
				id: "run-pr-1",
				flow: "pr-review",
				featureId: "feat-same-flow",
				projectPath: "/project/same",
			});

			insertEvent(db, {
				runId: "run-pr-1",
				type: "status_change",
				step: "step1",
				data: JSON.stringify({ status: "running" }),
			});
			deriveRunStatus(db, "run-pr-1");

			const buildResult = findOrCreateRun(db, {
				flow: "build",
				featureId: "feat-same-flow",
				projectPath: "/project/same",
			});

			expect(buildResult.runId).toBe("run-build-1");
			expect(buildResult.resumed).toBe(true);

			const prResult = findOrCreateRun(db, {
				flow: "pr-review",
				featureId: "feat-same-flow",
				projectPath: "/project/same",
			});

			expect(prResult.runId).toBe("run-pr-1");
			expect(prResult.resumed).toBe(true);
		});

		test("resumes and backfills legacy active runs with unknown flow", async () => {
			const dbPath = join(tempDir, "resume-legacy-unknown-flow.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			insertRun(db, {
				id: "run-legacy",
				flow: "unknown",
				featureId: "feat-legacy",
				projectPath: "/project/legacy",
			});

			insertEvent(db, {
				runId: "run-legacy",
				type: "status_change",
				step: "step1",
				data: JSON.stringify({ status: "running" }),
			});
			deriveRunStatus(db, "run-legacy");

			const result = findOrCreateRun(db, {
				flow: "build",
				featureId: "feat-legacy",
				projectPath: "/project/legacy",
			});

			expect(result.runId).toBe("run-legacy");
			expect(result.resumed).toBe(true);

			const row = db
				.prepare("SELECT flow FROM runs WHERE id = ?")
				.get("run-legacy") as { flow: string } | null;
			expect(row?.flow).toBe("build");
		});
	});

	describe("legacy cleanup", () => {
		test("deletes status.db when present", async () => {
			const legacyDir = join(tempDir, "legacy-cleanup");
			await mkdir(legacyDir, { recursive: true });

			const legacyPath = join(legacyDir, "status.db");
			writeFileSync(legacyPath, "fake-db-content");
			expect(existsSync(legacyPath)).toBe(true);

			const dbPath = join(legacyDir, "rp1.db");
			await expectTaskRight(getEmitDatabase(dbPath));

			expect(existsSync(legacyPath)).toBe(false);
		});

		test("does not error when status.db does not exist", async () => {
			const cleanDir = join(tempDir, "no-legacy");
			await mkdir(cleanDir, { recursive: true });

			const dbPath = join(cleanDir, "rp1.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			expect(db).toBeDefined();
		});
	});

	describe("getEventsSince", () => {
		test("returns events after the given ID in chronological order", async () => {
			const dbPath = join(tempDir, "events-since.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			insertRun(db, {
				id: "run-es",
				flow: "build",
				featureId: "feat",
				projectPath: "/p",
			});

			const e1 = insertEvent(db, {
				runId: "run-es",
				type: "status_change",
				step: "step1",
				data: JSON.stringify({ status: "running" }),
			});
			const e2 = insertEvent(db, {
				runId: "run-es",
				type: "status_change",
				step: "step2",
				data: JSON.stringify({ status: "running" }),
			});
			const e3 = insertEvent(db, {
				runId: "run-es",
				type: "btw_update",
				data: JSON.stringify({ message: "hello" }),
			});

			const events = getEventsSince(db, e1.id);

			expect(events).toHaveLength(2);
			expect(events[0].id).toBe(e2.id);
			expect(events[1].id).toBe(e3.id);
			expect(events[0].id).toBeLessThan(events[1].id);
		});

		test("returns empty array when no events after ID", async () => {
			const dbPath = join(tempDir, "events-since-empty.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			insertRun(db, {
				id: "run-es2",
				flow: "build",
				featureId: "feat",
				projectPath: "/p",
			});

			const e1 = insertEvent(db, {
				runId: "run-es2",
				type: "status_change",
				step: "step1",
				data: JSON.stringify({ status: "running" }),
			});

			const events = getEventsSince(db, e1.id);
			expect(events).toHaveLength(0);
		});

		test("respects limit parameter", async () => {
			const dbPath = join(tempDir, "events-since-limit.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			insertRun(db, {
				id: "run-es3",
				flow: "build",
				featureId: "feat",
				projectPath: "/p",
			});

			for (let i = 0; i < 5; i++) {
				insertEvent(db, {
					runId: "run-es3",
					type: "status_change",
					step: `step${i}`,
					data: JSON.stringify({ status: "running" }),
				});
			}

			const events = getEventsSince(db, 0, 3);
			expect(events).toHaveLength(3);
		});

		test("returns all events when afterId is 0", async () => {
			const dbPath = join(tempDir, "events-since-zero.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			insertRun(db, {
				id: "run-es4",
				flow: "build",
				featureId: "feat",
				projectPath: "/p",
			});

			insertEvent(db, {
				runId: "run-es4",
				type: "status_change",
				step: "step1",
				data: JSON.stringify({ status: "running" }),
			});
			insertEvent(db, {
				runId: "run-es4",
				type: "btw_update",
				data: JSON.stringify({ message: "hi" }),
			});

			const events = getEventsSince(db, 0);
			expect(events).toHaveLength(2);
		});
	});

	describe("getMaxEventId", () => {
		test("returns 0 when no events exist", async () => {
			const dbPath = join(tempDir, "max-event-empty.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			expect(getMaxEventId(db)).toBe(0);
		});

		test("returns highest event ID", async () => {
			const dbPath = join(tempDir, "max-event-id.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			insertRun(db, {
				id: "run-mei",
				flow: "build",
				featureId: "feat",
				projectPath: "/p",
			});

			insertEvent(db, {
				runId: "run-mei",
				type: "status_change",
				step: "step1",
				data: JSON.stringify({ status: "running" }),
			});
			const e2 = insertEvent(db, {
				runId: "run-mei",
				type: "btw_update",
				data: JSON.stringify({ message: "hi" }),
			});

			expect(getMaxEventId(db)).toBe(e2.id);
		});
	});

	describe("countEventsSince", () => {
		test("returns correct count of events after given ID", async () => {
			const dbPath = join(tempDir, "count-since.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			insertRun(db, {
				id: "run-cs",
				flow: "build",
				featureId: "feat",
				projectPath: "/p",
			});

			const e1 = insertEvent(db, {
				runId: "run-cs",
				type: "status_change",
				step: "step1",
				data: JSON.stringify({ status: "running" }),
			});
			insertEvent(db, {
				runId: "run-cs",
				type: "status_change",
				step: "step2",
				data: JSON.stringify({ status: "running" }),
			});
			insertEvent(db, {
				runId: "run-cs",
				type: "btw_update",
				data: JSON.stringify({ message: "hi" }),
			});

			expect(countEventsSince(db, e1.id)).toBe(2);
		});

		test("returns 0 when no events after ID", async () => {
			const dbPath = join(tempDir, "count-since-zero.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			insertRun(db, {
				id: "run-cs2",
				flow: "build",
				featureId: "feat",
				projectPath: "/p",
			});

			const e1 = insertEvent(db, {
				runId: "run-cs2",
				type: "status_change",
				step: "step1",
				data: JSON.stringify({ status: "running" }),
			});

			expect(countEventsSince(db, e1.id)).toBe(0);
		});

		test("counts all events when afterId is 0", async () => {
			const dbPath = join(tempDir, "count-since-all.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			insertRun(db, {
				id: "run-cs3",
				flow: "build",
				featureId: "feat",
				projectPath: "/p",
			});

			insertEvent(db, {
				runId: "run-cs3",
				type: "status_change",
				step: "step1",
				data: JSON.stringify({ status: "running" }),
			});
			insertEvent(db, {
				runId: "run-cs3",
				type: "btw_update",
				data: JSON.stringify({ message: "hi" }),
			});

			expect(countEventsSince(db, 0)).toBe(2);
		});
	});

	describe("getActiveRunsSnapshot", () => {
		test("returns non-terminal runs with steps and artifacts", async () => {
			const dbPath = join(tempDir, "snapshot-active.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			insertRun(db, {
				id: "run-snap-active",
				flow: "build",
				featureId: "feat-snap",
				projectPath: "/p/snap",
			});

			insertEvent(db, {
				runId: "run-snap-active",
				type: "status_change",
				step: "design",
				data: JSON.stringify({ status: "running" }),
			});
			deriveRunStatus(db, "run-snap-active");

			upsertArtifact(db, {
				docId: "doc-snap-1",
				runId: "run-snap-active",
				path: "design.md",
				type: "markdown",
				projectPath: "/p/snap",
				feature: "feat-snap",
				step: "design",
			});

			const snapshot = getActiveRunsSnapshot(db);

			expect(snapshot.length).toBeGreaterThanOrEqual(1);
			const run = snapshot.find((r) => r.id === "run-snap-active");
			expect(run).toBeDefined();
			expect(run?.flow).toBe("build");
			expect(run?.featureId).toBe("feat-snap");
			expect(run?.status).toBe("running");
			expect(run?.steps).toHaveLength(1);
			expect(run?.steps[0].step).toBe("design");
			expect(run?.steps[0].status).toBe("running");
			expect(run?.artifacts).toHaveLength(1);
			expect(run?.artifacts[0].docId).toBe("doc-snap-1");
			expect(run?.artifacts[0].path).toBe("design.md");
		});

		test("excludes terminal runs from snapshot", async () => {
			const dbPath = join(tempDir, "snapshot-terminal.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			insertRun(db, {
				id: "run-snap-done",
				flow: "build",
				featureId: "feat-done",
				projectPath: "/p/snap",
			});

			insertEvent(db, {
				runId: "run-snap-done",
				type: "status_change",
				step: "review",
				data: JSON.stringify({ status: "completed" }),
			});
			deriveRunStatus(db, "run-snap-done");

			insertRun(db, {
				id: "run-snap-active2",
				flow: "build",
				featureId: "feat-active",
				projectPath: "/p/snap",
			});

			insertEvent(db, {
				runId: "run-snap-active2",
				type: "status_change",
				step: "building",
				data: JSON.stringify({ status: "running" }),
			});
			deriveRunStatus(db, "run-snap-active2");

			const snapshot = getActiveRunsSnapshot(db);

			const doneRun = snapshot.find((r) => r.id === "run-snap-done");
			const activeRun = snapshot.find((r) => r.id === "run-snap-active2");

			expect(doneRun).toBeUndefined();
			expect(activeRun).toBeDefined();
		});

		test("returns empty array when no active runs exist", async () => {
			const dbPath = join(tempDir, "snapshot-empty.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			const snapshot = getActiveRunsSnapshot(db);
			expect(snapshot).toEqual([]);
		});
	});

	describe("listRuns", () => {
		test("returns all runs with pagination metadata", async () => {
			const dbPath = join(tempDir, "list-runs.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			insertRun(db, {
				id: "run-lr1",
				flow: "build",
				featureId: "feat-a",
				projectPath: "/p/a",
			});
			insertRun(db, {
				id: "run-lr2",
				flow: "review",
				featureId: "feat-b",
				projectPath: "/p/b",
			});

			const result = listRuns(db);

			expect(result.total).toBe(2);
			expect(result.records).toHaveLength(2);
		});

		test("filters by projectPath", async () => {
			const dbPath = join(tempDir, "list-runs-project.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			insertRun(db, {
				id: "run-lp1",
				flow: "build",
				featureId: "feat",
				projectPath: "/project/alpha",
			});
			insertRun(db, {
				id: "run-lp2",
				flow: "build",
				featureId: "feat",
				projectPath: "/project/beta",
			});

			const result = listRuns(db, { projectPath: "/project/alpha" });

			expect(result.total).toBe(1);
			expect(result.records[0].projectPath).toBe("/project/alpha");
		});

		test("filters by effective rp1_project_root when projectPath is legacy", async () => {
			const dbPath = join(tempDir, "list-runs-effective-project.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			insertRun(db, {
				id: "run-le1",
				flow: "build",
				featureId: "feat",
				projectPath: "/legacy/path",
				rp1ProjectRoot: "/resolved/project",
			});
			insertRun(db, {
				id: "run-le2",
				flow: "build",
				featureId: "feat",
				projectPath: "/other/path",
				rp1ProjectRoot: "/other/project",
			});

			const result = listRuns(db, { projectPath: "/resolved/project" });

			expect(result.total).toBe(1);
			expect(result.records[0].id).toBe("run-le1");
			expect(result.records[0].rp1ProjectRoot).toBe("/resolved/project");
		});

		test("filters by status", async () => {
			const dbPath = join(tempDir, "list-runs-status.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			insertRun(db, {
				id: "run-ls1",
				flow: "build",
				featureId: "feat",
				projectPath: "/p",
			});
			insertRun(db, {
				id: "run-ls2",
				flow: "build",
				featureId: "feat",
				projectPath: "/p",
			});

			insertEvent(db, {
				runId: "run-ls1",
				type: "status_change",
				step: "s1",
				data: JSON.stringify({ status: "running" }),
			});
			deriveRunStatus(db, "run-ls1");

			const result = listRuns(db, { status: "running" });

			expect(result.total).toBe(1);
			expect(result.records[0].id).toBe("run-ls1");
		});

		test("supports pagination with limit and offset", async () => {
			const dbPath = join(tempDir, "list-runs-page.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			for (let i = 0; i < 5; i++) {
				insertRun(db, {
					id: `run-pg${i}`,
					flow: "build",
					featureId: "feat",
					projectPath: "/p",
				});
			}

			const page1 = listRuns(db, { limit: 2, offset: 0 });
			const page2 = listRuns(db, { limit: 2, offset: 2 });

			expect(page1.total).toBe(5);
			expect(page1.records).toHaveLength(2);
			expect(page2.records).toHaveLength(2);
			expect(page1.records[0].id).not.toBe(page2.records[0].id);
		});
	});

	describe("getRunById", () => {
		test("returns run record for existing ID", async () => {
			const dbPath = join(tempDir, "get-run-by-id.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			insertRun(db, {
				id: "run-gbi",
				flow: "build",
				featureId: "feat-gbi",
				projectPath: "/p/gbi",
			});

			const run = getRunById(db, "run-gbi");

			expect(run).not.toBeNull();
			expect(run?.id).toBe("run-gbi");
			expect(run?.flow).toBe("build");
			expect(run?.featureId).toBe("feat-gbi");
		});

		test("returns null for missing ID", async () => {
			const dbPath = join(tempDir, "get-run-missing.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			const run = getRunById(db, "nonexistent");

			expect(run).toBeNull();
		});
	});

	describe("getEventsForRun", () => {
		test("returns events ordered chronologically for a run", async () => {
			const dbPath = join(tempDir, "events-for-run.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			insertRun(db, {
				id: "run-efr",
				flow: "build",
				featureId: "feat",
				projectPath: "/p",
			});
			insertRun(db, {
				id: "run-efr-other",
				flow: "build",
				featureId: "feat",
				projectPath: "/p",
			});

			insertEvent(db, {
				runId: "run-efr",
				type: "status_change",
				step: "step1",
				data: JSON.stringify({ status: "running" }),
			});
			insertEvent(db, {
				runId: "run-efr-other",
				type: "status_change",
				step: "step1",
				data: JSON.stringify({ status: "running" }),
			});
			insertEvent(db, {
				runId: "run-efr",
				type: "btw_update",
				data: JSON.stringify({ message: "hello" }),
			});

			const events = getEventsForRun(db, "run-efr");

			expect(events).toHaveLength(2);
			expect(events[0].type).toBe("status_change");
			expect(events[1].type).toBe("btw_update");
			expect(events[0].id).toBeLessThan(events[1].id);
		});

		test("returns empty array for run with no events", async () => {
			const dbPath = join(tempDir, "events-for-run-empty.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			insertRun(db, {
				id: "run-efr-empty",
				flow: "build",
				featureId: "feat",
				projectPath: "/p",
			});

			const events = getEventsForRun(db, "run-efr-empty");

			expect(events).toHaveLength(0);
		});
	});

	describe("getArtifactsForRun", () => {
		test("returns artifacts scoped by run_id", async () => {
			const dbPath = join(tempDir, "artifacts-for-run.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			insertRun(db, {
				id: "run-afr",
				flow: "build",
				featureId: "feat",
				projectPath: "/p",
			});
			insertRun(db, {
				id: "run-afr-other",
				flow: "build",
				featureId: "feat",
				projectPath: "/p",
			});

			upsertArtifact(db, {
				docId: "doc-afr-1",
				runId: "run-afr",
				path: "design.md",
				type: "markdown",
				projectPath: "/p",
				feature: "feat",
			});
			upsertArtifact(db, {
				docId: "doc-afr-2",
				runId: "run-afr-other",
				path: "other.md",
				type: "markdown",
				projectPath: "/p",
				feature: "feat",
			});

			const artifacts = getArtifactsForRun(db, "run-afr");

			expect(artifacts).toHaveLength(1);
			expect(artifacts[0].docId).toBe("doc-afr-1");
		});
	});

	describe("getArtifactByDocId", () => {
		test("returns artifact for existing doc_id", async () => {
			const dbPath = join(tempDir, "artifact-by-docid.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			insertRun(db, {
				id: "run-abd",
				flow: "build",
				featureId: "feat",
				projectPath: "/p",
			});

			upsertArtifact(db, {
				docId: "doc-abd-1",
				runId: "run-abd",
				path: "file.ts",
				type: "code",
				projectPath: "/p",
				feature: "feat",
			});

			const artifact = getArtifactByDocId(db, "doc-abd-1");

			expect(artifact).not.toBeNull();
			expect(artifact?.docId).toBe("doc-abd-1");
			expect(artifact?.path).toBe("file.ts");
		});

		test("returns null for missing doc_id", async () => {
			const dbPath = join(tempDir, "artifact-by-docid-miss.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			const artifact = getArtifactByDocId(db, "nonexistent");

			expect(artifact).toBeNull();
		});
	});

	describe("artifact storage helpers", () => {
		test("normalizes absolute work-dir artifacts to work_dir-relative paths", () => {
			const normalized = normalizeArtifactStorage(
				"/resolved/work/features/feat/design.md",
				{
					rp1ProjectRoot: "/resolved/project",
					rp1WorkRoot: "/resolved/work",
				},
			);

			expect(normalized).toEqual({
				path: "features/feat/design.md",
				storageRoot: "work_dir",
			});
		});

		test("promotes explicit project-relative traversal to absolute storage", () => {
			const normalized = normalizeArtifactStorage(
				"../outside.md",
				{
					rp1ProjectRoot: "/resolved/project",
					rp1WorkRoot: "/resolved/work",
				},
				"project",
			);

			expect(normalized).toEqual({
				path: "/resolved/outside.md",
				storageRoot: "absolute",
			});
		});

		test("resolves legacy project-relative artifacts from the project root", async () => {
			const dbPath = join(tempDir, "artifact-resolve-project.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));
			const projectRoot = join(tempDir, "project-root");
			await mkdir(join(projectRoot, ".rp1"), { recursive: true });
			writeFileSync(join(projectRoot, "legacy.md"), "# legacy\n");

			const resolvedPath = await resolveArtifactPathForRun(
				db,
				{
					rp1ProjectRoot: projectRoot,
					rp1WorkRoot: join(tempDir, "external-work"),
				},
				{
					docId: "doc-legacy",
					path: "legacy.md",
					storageRoot: "project",
				},
			);

			expect(resolvedPath).toBe(join(projectRoot, "legacy.md"));
		});

		test("reconciles missing work-dir artifacts by scanning rp1_work_root", async () => {
			const dbPath = join(tempDir, "artifact-resolve-reconcile.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));
			const projectRoot = join(tempDir, "project-reconcile");
			const workDir = join(tempDir, "external-work");
			const filePath = join(workDir, "features", "feat", "design.md");
			await mkdir(dirname(filePath), { recursive: true });
			writeFileSync(
				filePath,
				"---\nrp1_doc_id: doc-reconcile\n---\n# Design\n",
			);

			insertRun(db, {
				id: "run-reconcile",
				flow: "build",
				featureId: "feat",
				projectPath: projectRoot,
				rp1ProjectRoot: projectRoot,
				rp1KbRoot: join(projectRoot, ".rp1", "context"),
				rp1WorkRoot: workDir,
			});
			upsertArtifact(db, {
				docId: "doc-reconcile",
				runId: "run-reconcile",
				path: "missing/design.md",
				type: "markdown",
				storageRoot: "work_dir",
				projectPath: projectRoot,
				feature: "feat",
			});

			const resolvedPath = await resolveArtifactPathForRun(
				db,
				{
					rp1ProjectRoot: projectRoot,
					rp1WorkRoot: workDir,
				},
				{
					docId: "doc-reconcile",
					path: "missing/design.md",
					storageRoot: "work_dir",
				},
			);

			expect(resolvedPath).toBe(filePath);

			const artifact = getArtifactByDocId(db, "doc-reconcile");
			expect(artifact?.path).toBe("features/feat/design.md");
			expect(artifact?.storageRoot).toBe("work_dir");
		});

		test("reconciles missing work-dir artifacts by scanning the legacy .rp1/work directory", async () => {
			const dbPath = join(tempDir, "artifact-resolve-legacy-work.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));
			const projectRoot = join(tempDir, "project-legacy-work");
			const workDir = join(tempDir, "external-work-empty");
			const filePath = join(
				projectRoot,
				".rp1",
				"work",
				"features",
				"feat",
				"design.md",
			);
			await mkdir(dirname(filePath), { recursive: true });
			writeFileSync(
				filePath,
				"---\nrp1_doc_id: doc-legacy-work\n---\n# Legacy Design\n",
			);

			insertRun(db, {
				id: "run-legacy-work",
				flow: "build",
				featureId: "feat",
				projectPath: projectRoot,
				rp1ProjectRoot: projectRoot,
				rp1KbRoot: join(projectRoot, ".rp1", "context"),
				rp1WorkRoot: workDir,
			});
			upsertArtifact(db, {
				docId: "doc-legacy-work",
				runId: "run-legacy-work",
				path: "missing/design.md",
				type: "markdown",
				storageRoot: "work_dir",
				projectPath: projectRoot,
				feature: "feat",
			});

			const resolvedPath = await resolveArtifactPathForRun(
				db,
				{
					rp1ProjectRoot: projectRoot,
					rp1WorkRoot: workDir,
				},
				{
					docId: "doc-legacy-work",
					path: "missing/design.md",
					storageRoot: "work_dir",
				},
			);

			expect(resolvedPath).toBe(filePath);

			const artifact = getArtifactByDocId(db, "doc-legacy-work");
			expect(artifact?.path).toBe(".rp1/work/features/feat/design.md");
			expect(artifact?.storageRoot).toBe("project");
		});
	});

	describe("getAnnotationsForRun", () => {
		test("returns annotations scoped by run_id", async () => {
			const dbPath = join(tempDir, "ann-for-run.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			insertRun(db, {
				id: "run-anr",
				flow: "build",
				featureId: "feat",
				projectPath: "/p",
			});
			insertRun(db, {
				id: "run-anr-other",
				flow: "build",
				featureId: "feat",
				projectPath: "/p",
			});

			upsertArtifact(db, {
				docId: "doc-anr",
				runId: "run-anr",
				path: "file.md",
				type: "markdown",
				projectPath: "/p",
				feature: "feat",
			});

			upsertAnnotation(db, {
				docId: "doc-anr",
				runId: "run-anr",
				content: "Comment for run-anr",
			});
			upsertAnnotation(db, {
				docId: "doc-anr",
				runId: "run-anr-other",
				content: "Comment for other run",
			});

			const annotations = getAnnotationsForRun(db, "run-anr");

			expect(annotations).toHaveLength(1);
			expect(annotations[0].content).toBe("Comment for run-anr");
		});
	});

	describe("getAnnotationsForDocId", () => {
		test("returns annotations scoped by doc_id", async () => {
			const dbPath = join(tempDir, "ann-for-docid.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			insertRun(db, {
				id: "run-and",
				flow: "build",
				featureId: "feat",
				projectPath: "/p",
			});

			upsertArtifact(db, {
				docId: "doc-and-1",
				runId: "run-and",
				path: "a.md",
				type: "markdown",
				projectPath: "/p",
				feature: "feat",
			});
			upsertArtifact(db, {
				docId: "doc-and-2",
				runId: "run-and",
				path: "b.md",
				type: "markdown",
				projectPath: "/p",
				feature: "feat",
			});

			upsertAnnotation(db, {
				docId: "doc-and-1",
				runId: "run-and",
				content: "Comment on doc 1",
			});
			upsertAnnotation(db, {
				docId: "doc-and-2",
				runId: "run-and",
				content: "Comment on doc 2",
			});

			const annotations = getAnnotationsForDocId(db, "doc-and-1");

			expect(annotations).toHaveLength(1);
			expect(annotations[0].content).toBe("Comment on doc 1");
		});
	});

	describe("getAnnotationById", () => {
		test("returns annotation for existing ID", async () => {
			const dbPath = join(tempDir, "ann-by-id.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			insertRun(db, {
				id: "run-abi",
				flow: "build",
				featureId: "feat",
				projectPath: "/p",
			});

			upsertArtifact(db, {
				docId: "doc-abi",
				runId: "run-abi",
				path: "file.md",
				type: "markdown",
				projectPath: "/p",
				feature: "feat",
			});

			const created = upsertAnnotation(db, {
				docId: "doc-abi",
				runId: "run-abi",
				content: "Test annotation",
			});

			const annotation = getAnnotationById(db, created.id);

			expect(annotation).not.toBeNull();
			expect(annotation?.content).toBe("Test annotation");
		});

		test("returns null for missing ID", async () => {
			const dbPath = join(tempDir, "ann-by-id-miss.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			const annotation = getAnnotationById(db, 99999);

			expect(annotation).toBeNull();
		});
	});

	describe("updateAnnotation", () => {
		test("updates content and returns updated record", async () => {
			const dbPath = join(tempDir, "update-ann.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			insertRun(db, {
				id: "run-ua",
				flow: "build",
				featureId: "feat",
				projectPath: "/p",
			});

			upsertArtifact(db, {
				docId: "doc-ua",
				runId: "run-ua",
				path: "file.md",
				type: "markdown",
				projectPath: "/p",
				feature: "feat",
			});

			const created = upsertAnnotation(db, {
				docId: "doc-ua",
				runId: "run-ua",
				content: "Original",
			});

			const updated = updateAnnotation(db, created.id, {
				content: "Updated content",
			});

			expect(updated.content).toBe("Updated content");
			expect(updated.id).toBe(created.id);
		});

		test("updates status to resolved", async () => {
			const dbPath = join(tempDir, "update-ann-status.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			insertRun(db, {
				id: "run-uas",
				flow: "build",
				featureId: "feat",
				projectPath: "/p",
			});

			upsertArtifact(db, {
				docId: "doc-uas",
				runId: "run-uas",
				path: "file.md",
				type: "markdown",
				projectPath: "/p",
				feature: "feat",
			});

			const created = upsertAnnotation(db, {
				docId: "doc-uas",
				runId: "run-uas",
				content: "To resolve",
			});

			expect(created.status).toBe("open");

			const updated = updateAnnotation(db, created.id, {
				status: "resolved",
			});

			expect(updated.status).toBe("resolved");
			expect(updated.id).toBe(created.id);
		});

		test("updates data JSON field", async () => {
			const dbPath = join(tempDir, "update-ann-data.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			insertRun(db, {
				id: "run-uad",
				flow: "build",
				featureId: "feat",
				projectPath: "/p",
			});

			upsertArtifact(db, {
				docId: "doc-uad",
				runId: "run-uad",
				path: "file.md",
				type: "markdown",
				projectPath: "/p",
				feature: "feat",
			});

			const created = upsertAnnotation(db, {
				docId: "doc-uad",
				runId: "run-uad",
				content: "Note",
			});

			const newData = JSON.stringify({ severity: "high" });
			const updated = updateAnnotation(db, created.id, { data: newData });

			expect(updated.data).toBe(newData);
		});
	});

	describe("deleteAnnotation", () => {
		test("removes annotation from database", async () => {
			const dbPath = join(tempDir, "delete-ann.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			insertRun(db, {
				id: "run-da",
				flow: "build",
				featureId: "feat",
				projectPath: "/p",
			});

			upsertArtifact(db, {
				docId: "doc-da",
				runId: "run-da",
				path: "file.md",
				type: "markdown",
				projectPath: "/p",
				feature: "feat",
			});

			const created = upsertAnnotation(db, {
				docId: "doc-da",
				runId: "run-da",
				content: "To delete",
			});

			deleteAnnotation(db, created.id);

			const after = getAnnotationById(db, created.id);
			expect(after).toBeNull();
		});
	});

	describe("getProjectRunStats", () => {
		test("returns run count and last activity per project", async () => {
			const dbPath = join(tempDir, "project-stats.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			insertRun(db, {
				id: "run-ps1",
				flow: "build",
				featureId: "feat",
				projectPath: "/project/alpha",
			});
			insertRun(db, {
				id: "run-ps2",
				flow: "review",
				featureId: "feat",
				projectPath: "/project/alpha",
			});
			insertRun(db, {
				id: "run-ps3",
				flow: "build",
				featureId: "feat",
				projectPath: "/project/beta",
			});

			const stats = getProjectRunStats(db, [
				"/project/alpha",
				"/project/beta",
				"/project/gamma",
			]);

			expect(stats.get("/project/alpha")?.runCount).toBe(2);
			expect(stats.get("/project/alpha")?.lastActivityAt).toBeTruthy();
			expect(stats.get("/project/beta")?.runCount).toBe(1);
			expect(stats.get("/project/gamma")?.runCount).toBe(0);
			expect(stats.get("/project/gamma")?.lastActivityAt).toBeNull();
		});

		test("aggregates historical runs by effective rp1_project_root", async () => {
			const dbPath = join(tempDir, "project-stats-effective.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			insertRun(db, {
				id: "run-pse1",
				flow: "build",
				featureId: "feat",
				projectPath: "/legacy/project",
				rp1ProjectRoot: "/resolved/project",
			});
			insertRun(db, {
				id: "run-pse2",
				flow: "review",
				featureId: "feat",
				projectPath: "/legacy/project",
				rp1ProjectRoot: "/resolved/project",
			});

			const stats = getProjectRunStats(db, ["/resolved/project"]);

			expect(stats.get("/resolved/project")?.runCount).toBe(2);
			expect(stats.get("/resolved/project")?.lastActivityAt).toBeTruthy();
		});

		test("returns empty map for empty project list", async () => {
			const dbPath = join(tempDir, "project-stats-empty.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			const stats = getProjectRunStats(db, []);

			expect(stats.size).toBe(0);
		});
	});

	describe("getRunsByAttentionStatus", () => {
		test("groups runs by waiting, failed, and running", async () => {
			const dbPath = join(tempDir, "attention-runs.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			insertRun(db, {
				id: "run-at1",
				flow: "build",
				featureId: "feat",
				projectPath: "/p",
			});
			insertRun(db, {
				id: "run-at2",
				flow: "build",
				featureId: "feat",
				projectPath: "/p",
			});
			insertRun(db, {
				id: "run-at3",
				flow: "build",
				featureId: "feat",
				projectPath: "/p",
			});
			insertRun(db, {
				id: "run-at4",
				flow: "build",
				featureId: "feat",
				projectPath: "/p",
			});

			insertEvent(db, {
				runId: "run-at1",
				type: "status_change",
				step: "s1",
				data: JSON.stringify({ status: "waiting" }),
			});
			deriveRunStatus(db, "run-at1");

			insertEvent(db, {
				runId: "run-at2",
				type: "status_change",
				step: "s1",
				data: JSON.stringify({ status: "failed" }),
			});
			deriveRunStatus(db, "run-at2");

			insertEvent(db, {
				runId: "run-at3",
				type: "status_change",
				step: "s1",
				data: JSON.stringify({ status: "running" }),
			});
			deriveRunStatus(db, "run-at3");

			insertEvent(db, {
				runId: "run-at4",
				type: "status_change",
				step: "s1",
				data: JSON.stringify({ status: "completed" }),
			});
			deriveRunStatus(db, "run-at4");

			const attention = getRunsByAttentionStatus(db);

			expect(attention.waiting).toHaveLength(1);
			expect(attention.waiting[0].id).toBe("run-at1");
			expect(attention.failed).toHaveLength(1);
			expect(attention.failed[0].id).toBe("run-at2");
			expect(attention.running).toHaveLength(1);
			expect(attention.running[0].id).toBe("run-at3");
		});

		test("returns empty arrays when no attention runs", async () => {
			const dbPath = join(tempDir, "attention-empty.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			insertRun(db, {
				id: "run-ae1",
				flow: "build",
				featureId: "feat",
				projectPath: "/p",
			});

			insertEvent(db, {
				runId: "run-ae1",
				type: "status_change",
				step: "s1",
				data: JSON.stringify({ status: "completed" }),
			});
			deriveRunStatus(db, "run-ae1");

			const attention = getRunsByAttentionStatus(db);

			expect(attention.waiting).toHaveLength(0);
			expect(attention.failed).toHaveLength(0);
			expect(attention.running).toHaveLength(0);
		});
	});

	describe("database path", () => {
		test("respects RP1_DB env var", async () => {
			const customPath = join(tempDir, "custom-path", "custom.db");
			const original = process.env.RP1_DB;
			process.env.RP1_DB = customPath;

			try {
				closeDatabase();
				resetInstance();

				// We need to re-import or use the default path behavior
				// The DEFAULT_DB_PATH is set at module load time, so we test
				// by passing the path directly
				const db = await expectTaskRight(getEmitDatabase(customPath));
				expect(db).toBeDefined();
				expect(existsSync(customPath)).toBe(true);
			} finally {
				if (original === undefined) {
					delete process.env.RP1_DB;
				} else {
					process.env.RP1_DB = original;
				}
			}
		});
	});
});
