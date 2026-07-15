/**
 * Unit tests for the emit database layer.
 * Tests schema creation, CRUD operations, run status derivation,
 * skipped-step detection, and legacy cleanup.
 */

import type { Database } from "bun:sqlite";
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
	deleteActivitySearchRun,
	deleteAnnotation,
	deriveRunStatus,
	endRun,
	ensureSocraticDuelSchema,
	findOrCreateRun,
	findOrCreateWorkflowRun,
	getActiveRunsSnapshot,
	getAnnotationById,
	getAnnotationsForDocId,
	getAnnotationsForRun,
	getArtifactByDocId,
	getArtifactsForRun,
	getEffectiveStepStatuses,
	getEmitDatabase,
	getEventsForRun,
	getEventsSince,
	getMaxEventId,
	getProjectRunStats,
	getProjectRunStatsByIds,
	getRecentEventsForRun,
	getRunById,
	getRunsByAttentionStatus,
	getRunWithLastEventById,
	getSkippableSteps,
	getStepStatuses,
	INACTIVE_REAPER_STATUS_CHANGE,
	insertEvent,
	insertRun,
	LATEST_SCHEMA_VERSION,
	listActivitySearchRefreshCandidates,
	listRuns,
	normalizeArtifactStorage,
	queryActivitySearchRuns,
	reclassifyInactiveRuns,
	resetInstance,
	resolveArtifactPathForRun,
	updateAnnotation,
	upsertActivitySearchRun,
	upsertAnnotation,
	upsertArtifact,
} from "../../../agent-tools/emit/database.js";
import { expectRight, expectTaskRight } from "../../helpers/index.js";

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
			expect(tableNames).toContain("activity_search_runs");
			expect(tableNames).toContain("socratic_duels");
			expect(tableNames).toContain("socratic_duel_participants");
			expect(tableNames).not.toContain("socratic_duel_turns");
		});

		test("schema_version is set to LATEST_SCHEMA_VERSION", async () => {
			const dbPath = join(tempDir, "version-test.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			const row = db.prepare("SELECT version FROM schema_version").get() as {
				version: number;
			};

			expect(row.version).toBe(LATEST_SCHEMA_VERSION);
		});

		test("applyMigrations fast path skips per-version work on current schema", async () => {
			const dbPath = join(tempDir, "fast-path-test.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			const versionBefore = (
				db.prepare("SELECT version FROM schema_version").get() as {
					version: number;
				}
			).version;
			expect(versionBefore).toBe(LATEST_SCHEMA_VERSION);

			closeDatabase();
			resetInstance();

			const db2 = await expectTaskRight(getEmitDatabase(dbPath));

			const versionAfter = (
				db2.prepare("SELECT version FROM schema_version").get() as {
					version: number;
				}
			).version;
			expect(versionAfter).toBe(LATEST_SCHEMA_VERSION);

			const tables = db2
				.prepare(
					"SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
				)
				.all() as { name: string }[];
			const tableNames = tables.map((t) => t.name);
			expect(tableNames).toContain("runs");
			expect(tableNames).toContain("events");
			expect(tableNames).toContain("artifacts");
		});

		test("activity_search_runs table includes search columns, indexes, and run FK", async () => {
			const dbPath = join(tempDir, "activity-search-schema-test.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			const columns = db
				.prepare("PRAGMA table_info(activity_search_runs)")
				.all() as {
				name: string;
			}[];
			expect(columns.map((column) => column.name)).toEqual(
				expect.arrayContaining([
					"run_id",
					"project_id",
					"project_root",
					"flow",
					"status",
					"activity_at",
					"source_event_id",
					"source_run_updated_at",
					"search_text",
					"indexed_at",
				]),
			);

			const indexes = db
				.prepare("PRAGMA index_list(activity_search_runs)")
				.all() as { name: string }[];
			expect(indexes.map((index) => index.name)).toEqual(
				expect.arrayContaining([
					"idx_activity_search_project_activity",
					"idx_activity_search_root_activity",
					"idx_activity_search_status_activity",
					"idx_activity_search_activity",
				]),
			);

			const fks = db
				.prepare("PRAGMA foreign_key_list(activity_search_runs)")
				.all() as { table: string; from: string; to: string }[];
			expect(fks).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						table: "runs",
						from: "run_id",
						to: "id",
					}),
				]),
			);
		});

		test("artifacts table includes subflow column", async () => {
			const dbPath = join(tempDir, "subflow-col-test.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			const columns = db.prepare("PRAGMA table_info(artifacts)").all() as {
				name: string;
				dflt_value: string | null;
			}[];
			const columnNames = columns.map((c) => c.name);

			expect(columnNames).toContain("subflow");
			expect(columnNames).toContain("storage_root");
			expect(
				columns.find((column) => column.name === "storage_root")?.dflt_value,
			).toBe("'work_dir'");
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
			expect(columnNames).toContain("run_policy");
			expect(columnNames).toContain("work_identity");
			expect(columnNames).toContain("bootstrap_context");

			const indexes = db.prepare("PRAGMA index_list(runs)").all() as {
				name: string;
			}[];
			expect(indexes.map((index) => index.name)).toContain(
				"idx_runs_status_updated",
			);
		});

		test("creates Socratic Duel lock coordination columns and indexes", async () => {
			const dbPath = join(tempDir, "socratic-duel-schema-test.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			const duelColumns = db
				.prepare("PRAGMA table_info(socratic_duels)")
				.all() as {
				name: string;
			}[];
			const participantColumns = db
				.prepare("PRAGMA table_info(socratic_duel_participants)")
				.all() as { name: string }[];

			const duelColumnNames = duelColumns.map((column) => column.name);
			expect(duelColumnNames).toEqual(
				expect.arrayContaining([
					"id",
					"target_path",
					"target_key",
					"topic",
					"topic_slug",
					"debate_path",
					"status",
					"current_owner_id",
					"lease_token",
					"lease_expires_at",
					"created_at",
					"updated_at",
				]),
			);
			for (const forbiddenColumn of [
				"max_turns",
				"next_turn_number",
				"candidate_convergence",
				"conclusion_summary",
			]) {
				expect(duelColumnNames).not.toContain(forbiddenColumn);
			}
			expect(participantColumns.map((column) => column.name)).toEqual(
				expect.arrayContaining([
					"id",
					"duel_id",
					"display_name",
					"harness",
					"model_id",
					"joined_at",
					"last_seen_at",
				]),
			);

			const duelIndexes = db
				.prepare("PRAGMA index_list(socratic_duels)")
				.all() as {
				name: string;
			}[];
			const participantIndexes = db
				.prepare("PRAGMA index_list(socratic_duel_participants)")
				.all() as { name: string }[];

			expect(duelIndexes.map((index) => index.name)).toEqual(
				expect.arrayContaining([
					"idx_socratic_duels_target_status",
					"idx_socratic_duels_active_target",
					"idx_socratic_duels_lease",
				]),
			);
			expect(participantIndexes.map((index) => index.name)).toContain(
				"idx_socratic_duel_participants_identity",
			);
			expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
		});

		test("Socratic Duel schema helper is idempotent for coordinator modules", async () => {
			const dbPath = join(tempDir, "socratic-duel-helper-test.db");
			const { Database } = await import("bun:sqlite");
			const rawDb = new Database(dbPath, { create: true });

			ensureSocraticDuelSchema(rawDb);
			ensureSocraticDuelSchema(rawDb);

			const table = rawDb
				.prepare(
					"SELECT name FROM sqlite_master WHERE type='table' AND name='socratic_duels'",
				)
				.get() as { name: string } | null;

			expect(table?.name).toBe("socratic_duels");
			rawDb.close();
		});

		test("migrates v13 schema to add Socratic Duel tables without rewriting runs", async () => {
			const dbPath = join(tempDir, "migration-v13-socratic-duel-test.db");
			const { Database } = await import("bun:sqlite");
			const rawDb = new Database(dbPath, { create: true });
			rawDb.exec("PRAGMA journal_mode = WAL;");
			rawDb.exec("PRAGMA foreign_keys = ON;");
			rawDb.exec(`
				CREATE TABLE schema_version (version INTEGER NOT NULL);
				INSERT INTO schema_version (version) VALUES (13);
				CREATE TABLE runs (
					id TEXT PRIMARY KEY NOT NULL,
					flow TEXT NOT NULL,
					feature_id TEXT NOT NULL,
					project_path TEXT NOT NULL,
					rp1_project_root TEXT NOT NULL,
					rp1_kb_root TEXT NOT NULL,
					rp1_work_root TEXT NOT NULL,
					project_id TEXT DEFAULT NULL,
					run_policy TEXT DEFAULT NULL CHECK(run_policy IN ('fresh', 'resumable')),
					work_identity TEXT DEFAULT NULL,
					bootstrap_context TEXT DEFAULT NULL,
					name TEXT DEFAULT NULL,
					harness TEXT DEFAULT NULL,
					status TEXT NOT NULL DEFAULT 'not_started',
					created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
					updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
				);
				INSERT INTO runs (
					id, flow, feature_id, project_path, rp1_project_root, rp1_kb_root,
					rp1_work_root, project_id, run_policy, work_identity, bootstrap_context,
					name, harness, status
				) VALUES (
					'run-v13', 'build', 'feature-v13', '/project', '/project',
					'/project/.rp1/context', '/project/.rp1/work', 'project-v13',
					'resumable', 'FEATURE_ID=feature-v13', '{"preserved":true}',
					'Feature V13', 'codex', 'running'
				);
			`);
			rawDb.close();

			const db = await expectTaskRight(getEmitDatabase(dbPath));

			const versionRow = db
				.prepare("SELECT version FROM schema_version")
				.get() as { version: number };
			expect(versionRow.version).toBe(18);

			const runRow = db
				.prepare(
					"SELECT flow, feature_id, project_id, bootstrap_context FROM runs WHERE id = ?",
				)
				.get("run-v13") as {
				flow: string;
				feature_id: string;
				project_id: string;
				bootstrap_context: string;
			} | null;
			expect(runRow).toEqual({
				flow: "build",
				feature_id: "feature-v13",
				project_id: "project-v13",
				bootstrap_context: '{"preserved":true}',
			});

			const duelTable = db
				.prepare(
					"SELECT name FROM sqlite_master WHERE type='table' AND name='socratic_duels'",
				)
				.get() as { name: string } | null;
			expect(duelTable?.name).toBe("socratic_duels");
			const turnTable = db
				.prepare(
					"SELECT name FROM sqlite_master WHERE type='table' AND name='socratic_duel_turns'",
				)
				.get() as { name: string } | null;
			expect(turnTable).toBeNull();
		});

		test("migrates v14 Socratic Duel content schema to lock-only schema", async () => {
			const dbPath = join(tempDir, "migration-v14-socratic-duel-lock-test.db");
			const { Database } = await import("bun:sqlite");
			const rawDb = new Database(dbPath, { create: true });
			rawDb.exec("PRAGMA journal_mode = WAL;");
			rawDb.exec("PRAGMA foreign_keys = ON;");
			rawDb.exec(`
				CREATE TABLE schema_version (version INTEGER NOT NULL);
				INSERT INTO schema_version (version) VALUES (14);
				CREATE TABLE runs (
					id TEXT PRIMARY KEY NOT NULL,
					flow TEXT NOT NULL,
					feature_id TEXT NOT NULL,
					project_path TEXT NOT NULL,
					rp1_project_root TEXT NOT NULL,
					rp1_kb_root TEXT NOT NULL,
					rp1_work_root TEXT NOT NULL,
					project_id TEXT DEFAULT NULL,
					run_policy TEXT DEFAULT NULL CHECK(run_policy IN ('fresh', 'resumable')),
					work_identity TEXT DEFAULT NULL,
					bootstrap_context TEXT DEFAULT NULL,
					name TEXT DEFAULT NULL,
					harness TEXT DEFAULT NULL,
					status TEXT NOT NULL DEFAULT 'not_started',
					created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
					updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
				);
				CREATE TABLE socratic_duels (
					id TEXT PRIMARY KEY NOT NULL,
					target_path TEXT NOT NULL,
					target_key TEXT NOT NULL,
					status TEXT NOT NULL DEFAULT 'ACTIVE',
					max_turns INTEGER NOT NULL DEFAULT 6,
					next_turn_number INTEGER NOT NULL DEFAULT 1,
					current_owner_id TEXT DEFAULT NULL,
					lease_expires_at TEXT DEFAULT NULL,
					candidate_convergence INTEGER NOT NULL DEFAULT 0,
					conclusion_summary TEXT DEFAULT NULL,
					created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
					updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
				);
				CREATE TABLE socratic_duel_participants (
					id TEXT PRIMARY KEY NOT NULL,
					duel_id TEXT NOT NULL,
					display_name TEXT NOT NULL,
					harness TEXT NOT NULL,
					model_id TEXT NOT NULL,
					joined_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
					last_seen_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
				);
				CREATE TABLE socratic_duel_turns (
					id TEXT PRIMARY KEY NOT NULL,
					duel_id TEXT NOT NULL,
					turn_number INTEGER NOT NULL,
					participant_id TEXT NOT NULL,
					stance TEXT NOT NULL,
					turn_hash TEXT NOT NULL,
					prior_region_hash TEXT NOT NULL,
					content_json TEXT NOT NULL,
					accepted_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
				);
				INSERT INTO socratic_duels (
					id, target_path, target_key, status, current_owner_id, lease_expires_at
				) VALUES (
					'duel-v14', '/tmp/target.md', '/tmp/target.md', 'ACCEPTED_CONSENSUS',
					'participant-v14', '2099-01-01T00:00:00.000Z'
				);
				INSERT INTO socratic_duel_participants (
					id, duel_id, display_name, harness, model_id
				) VALUES (
					'participant-v14', 'duel-v14', 'Codex', 'codex', 'gpt-5'
				);
			`);
			rawDb.close();

			const db = await expectTaskRight(getEmitDatabase(dbPath));

			const versionRow = db
				.prepare("SELECT version FROM schema_version")
				.get() as { version: number };
			expect(versionRow.version).toBe(18);

			const duelColumns = db
				.prepare("PRAGMA table_info(socratic_duels)")
				.all() as { name: string }[];
			expect(duelColumns.map((column) => column.name)).toEqual(
				expect.arrayContaining([
					"id",
					"target_path",
					"target_key",
					"topic",
					"topic_slug",
					"debate_path",
					"status",
					"current_owner_id",
					"lease_token",
					"lease_expires_at",
				]),
			);
			expect(duelColumns.map((column) => column.name)).not.toContain(
				"candidate_convergence",
			);

			const migratedDuel = db
				.prepare(
					"SELECT status, current_owner_id, lease_token, lease_expires_at FROM socratic_duels WHERE id = 'duel-v14'",
				)
				.get() as {
				status: string;
				current_owner_id: string | null;
				lease_token: string | null;
				lease_expires_at: string | null;
			};
			expect(migratedDuel).toEqual({
				status: "CLOSED",
				current_owner_id: null,
				lease_token: null,
				lease_expires_at: null,
			});
			expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);

			const turnTable = db
				.prepare(
					"SELECT name FROM sqlite_master WHERE type='table' AND name='socratic_duel_turns'",
				)
				.get() as { name: string } | null;
			expect(turnTable).toBeNull();
		});

		test("migrates v15 Socratic Duel rows to add nullable debate metadata", async () => {
			const dbPath = join(
				tempDir,
				"migration-v15-socratic-duel-metadata-test.db",
			);
			const { Database } = await import("bun:sqlite");
			const rawDb = new Database(dbPath, { create: true });
			rawDb.exec("PRAGMA journal_mode = WAL;");
			rawDb.exec("PRAGMA foreign_keys = ON;");
			rawDb.exec(`
				CREATE TABLE schema_version (version INTEGER NOT NULL);
				INSERT INTO schema_version (version) VALUES (15);
				CREATE TABLE runs (
					id TEXT PRIMARY KEY NOT NULL,
					flow TEXT NOT NULL,
					feature_id TEXT NOT NULL,
					project_path TEXT NOT NULL,
					rp1_project_root TEXT NOT NULL,
					rp1_kb_root TEXT NOT NULL,
					rp1_work_root TEXT NOT NULL,
					project_id TEXT DEFAULT NULL,
					run_policy TEXT DEFAULT NULL CHECK(run_policy IN ('fresh', 'resumable')),
					work_identity TEXT DEFAULT NULL,
					bootstrap_context TEXT DEFAULT NULL,
					name TEXT DEFAULT NULL,
					harness TEXT DEFAULT NULL,
					status TEXT NOT NULL DEFAULT 'not_started',
					created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
					updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
				);
				CREATE TABLE socratic_duels (
					id TEXT PRIMARY KEY NOT NULL,
					target_path TEXT NOT NULL,
					target_key TEXT NOT NULL,
					status TEXT NOT NULL DEFAULT 'ACTIVE',
					current_owner_id TEXT DEFAULT NULL,
					lease_token TEXT DEFAULT NULL,
					lease_expires_at TEXT DEFAULT NULL,
					created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
					updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
				);
				CREATE TABLE socratic_duel_participants (
					id TEXT PRIMARY KEY NOT NULL,
					duel_id TEXT NOT NULL,
					display_name TEXT NOT NULL,
					harness TEXT NOT NULL,
					model_id TEXT NOT NULL,
					joined_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
					last_seen_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
				);
				INSERT INTO socratic_duels (
					id, target_path, target_key, status, current_owner_id, lease_token, lease_expires_at
				) VALUES (
					'duel-v15', '/tmp/target.md', '/tmp/target.md', 'ACTIVE',
					'participant-v15', 'lease-v15', '2099-01-01T00:00:00.000Z'
				);
				INSERT INTO socratic_duel_participants (
					id, duel_id, display_name, harness, model_id
				) VALUES (
					'participant-v15', 'duel-v15', 'Codex', 'codex', 'gpt-5'
				);
			`);
			rawDb.close();

			const db = await expectTaskRight(getEmitDatabase(dbPath));

			const versionRow = db
				.prepare("SELECT version FROM schema_version")
				.get() as { version: number };
			expect(versionRow.version).toBe(18);

			const migratedDuel = db
				.prepare(
					"SELECT target_path, target_key, status, current_owner_id, lease_token, topic, topic_slug, debate_path FROM socratic_duels WHERE id = 'duel-v15'",
				)
				.get() as {
				target_path: string;
				target_key: string;
				status: string;
				current_owner_id: string | null;
				lease_token: string | null;
				topic: string | null;
				topic_slug: string | null;
				debate_path: string | null;
			};
			expect(migratedDuel).toEqual({
				target_path: "/tmp/target.md",
				target_key: "/tmp/target.md",
				status: "ACTIVE",
				current_owner_id: "participant-v15",
				lease_token: "lease-v15",
				topic: null,
				topic_slug: null,
				debate_path: null,
			});
			expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
		});

		test("migrates v16 schema to add activity search table without rewriting history rows", async () => {
			const dbPath = join(tempDir, "migration-v16-activity-search-test.db");
			const { Database } = await import("bun:sqlite");
			const rawDb = new Database(dbPath, { create: true });
			rawDb.exec("PRAGMA journal_mode = WAL;");
			rawDb.exec("PRAGMA foreign_keys = ON;");
			rawDb.exec(`
				CREATE TABLE schema_version (version INTEGER NOT NULL);
				INSERT INTO schema_version (version) VALUES (16);
				CREATE TABLE runs (
					id TEXT PRIMARY KEY NOT NULL,
					flow TEXT NOT NULL,
					feature_id TEXT NOT NULL,
					project_path TEXT NOT NULL,
					rp1_project_root TEXT NOT NULL,
					rp1_kb_root TEXT NOT NULL,
					rp1_work_root TEXT NOT NULL,
					project_id TEXT DEFAULT NULL,
					run_policy TEXT DEFAULT NULL CHECK(run_policy IN ('fresh', 'resumable')),
					work_identity TEXT DEFAULT NULL,
					bootstrap_context TEXT DEFAULT NULL,
					name TEXT DEFAULT NULL,
					harness TEXT DEFAULT NULL,
					status TEXT NOT NULL DEFAULT 'not_started',
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
				CREATE TABLE artifacts (
					id INTEGER PRIMARY KEY AUTOINCREMENT,
					doc_id TEXT UNIQUE NOT NULL,
					run_id TEXT REFERENCES runs(id),
					path TEXT NOT NULL,
					type TEXT NOT NULL DEFAULT 'other',
					storage_root TEXT NOT NULL DEFAULT 'work_dir',
					project_path TEXT NOT NULL,
					project_id TEXT DEFAULT NULL,
					feature TEXT NOT NULL,
					step TEXT,
					subflow INTEGER NOT NULL DEFAULT 0,
					baseline TEXT DEFAULT NULL,
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
				CREATE TABLE notifications (
					id INTEGER PRIMARY KEY AUTOINCREMENT,
					message TEXT NOT NULL,
					source_type TEXT NOT NULL DEFAULT 'run',
					source_id TEXT,
					route TEXT,
					project_id TEXT,
					dismissed INTEGER NOT NULL DEFAULT 0,
					created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
				);
				INSERT INTO runs (
					id, flow, feature_id, project_path, rp1_project_root,
					rp1_kb_root, rp1_work_root, project_id, status, created_at, updated_at
				) VALUES (
					'run-v16', 'build', 'feature-v16', '/project', '/project',
					'/project/.rp1/context', '/project/.rp1/work', 'project-v16',
					'completed', '2026-01-01T00:00:00.000Z', '2026-01-02T00:00:00.000Z'
				);
				INSERT INTO events (
					run_id, type, step, data, created_at
				) VALUES (
					'run-v16', 'status_change', 'task', '{"status":"completed"}',
					'2026-01-02T00:00:00.000Z'
				);
				INSERT INTO artifacts (
					doc_id, run_id, path, project_path, project_id, feature
				) VALUES (
					'doc-v16', 'run-v16', 'features/feature-v16/tasks.md',
					'/project', 'project-v16', 'feature-v16'
				);
				INSERT INTO annotations (
					doc_id, run_id, content
				) VALUES (
					'doc-v16', 'run-v16', 'preserved note'
				);
				INSERT INTO notifications (
					message, source_id, project_id
				) VALUES (
					'preserved notification', 'run-v16', 'project-v16'
				);
			`);
			rawDb.close();

			const db = await expectTaskRight(getEmitDatabase(dbPath));

			const versionRow = db
				.prepare("SELECT version FROM schema_version")
				.get() as { version: number };
			expect(versionRow.version).toBe(18);
			expect(
				db
					.prepare(
						"SELECT name FROM sqlite_master WHERE type='table' AND name='activity_search_runs'",
					)
					.get(),
			).not.toBeNull();

			const counts = {
				runs: (
					db.prepare("SELECT COUNT(*) AS count FROM runs").get() as {
						count: number;
					}
				).count,
				events: (
					db.prepare("SELECT COUNT(*) AS count FROM events").get() as {
						count: number;
					}
				).count,
				artifacts: (
					db.prepare("SELECT COUNT(*) AS count FROM artifacts").get() as {
						count: number;
					}
				).count,
				annotations: (
					db.prepare("SELECT COUNT(*) AS count FROM annotations").get() as {
						count: number;
					}
				).count,
				notifications: (
					db.prepare("SELECT COUNT(*) AS count FROM notifications").get() as {
						count: number;
					}
				).count,
			};
			expect(counts).toEqual({
				runs: 1,
				events: 1,
				artifacts: 1,
				annotations: 1,
				notifications: 1,
			});

			const runRow = db
				.prepare("SELECT created_at, updated_at FROM runs WHERE id = 'run-v16'")
				.get() as { created_at: string; updated_at: string };
			expect(runRow).toEqual({
				created_at: "2026-01-01T00:00:00.000Z",
				updated_at: "2026-01-02T00:00:00.000Z",
			});
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
			expect(versionRow.version).toBe(18);
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
			expect(versionRow.version).toBe(18);
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
			expect(versionRow.version).toBe(18);

			const annotations = db.prepare("SELECT * FROM annotations").all() as {
				content: string;
				data: string;
			}[];
			expect(annotations).toHaveLength(1);
			expect(annotations[0].content).toBe("user note");
		});

		test("migrates v11 schema to widen runs status constraint and preserve legacy run rows", async () => {
			const dbPath = join(tempDir, "migration-v11-test.db");

			const { Database } = await import("bun:sqlite");
			const rawDb = new Database(dbPath, { create: true });
			rawDb.exec("PRAGMA journal_mode = WAL;");
			rawDb.exec("PRAGMA foreign_keys = ON;");
			rawDb.exec(`
				CREATE TABLE schema_version (version INTEGER NOT NULL);
				INSERT INTO schema_version (version) VALUES (11);
				CREATE TABLE runs (
					id TEXT PRIMARY KEY NOT NULL,
					flow TEXT NOT NULL,
					feature_id TEXT NOT NULL,
					project_path TEXT NOT NULL,
					rp1_project_root TEXT NOT NULL,
					rp1_kb_root TEXT NOT NULL,
					rp1_work_root TEXT NOT NULL,
					project_id TEXT DEFAULT NULL,
					run_policy TEXT DEFAULT NULL CHECK(run_policy IN ('fresh', 'resumable')),
					work_identity TEXT DEFAULT NULL,
					bootstrap_context TEXT DEFAULT NULL,
					name TEXT DEFAULT NULL,
					harness TEXT DEFAULT NULL,
					status TEXT NOT NULL DEFAULT 'not_started'
						CHECK(status IN ('not_started', 'running', 'waiting', 'completed', 'failed', 'skipped')),
					created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
					updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
				);
				CREATE INDEX idx_runs_project ON runs(project_path);
				CREATE INDEX idx_runs_feature ON runs(project_path, feature_id);
				CREATE INDEX idx_runs_status ON runs(status);
				CREATE INDEX idx_runs_feature_status ON runs(project_path, feature_id, status);
				CREATE INDEX idx_runs_project_id ON runs(project_id);
				CREATE INDEX idx_runs_project_work_identity_status ON runs(project_id, flow, work_identity, status);
				CREATE INDEX idx_runs_root_work_identity_status ON runs(rp1_project_root, flow, work_identity, status);
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
				CREATE TABLE artifacts (
					id INTEGER PRIMARY KEY AUTOINCREMENT,
					doc_id TEXT UNIQUE NOT NULL,
					run_id TEXT REFERENCES runs(id),
					path TEXT NOT NULL,
					type TEXT NOT NULL DEFAULT 'other',
					storage_root TEXT NOT NULL DEFAULT 'work_dir',
					project_path TEXT NOT NULL,
					project_id TEXT DEFAULT NULL,
					feature TEXT NOT NULL,
					step TEXT,
					subflow INTEGER NOT NULL DEFAULT 0,
					baseline TEXT DEFAULT NULL,
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
				CREATE TABLE tasks (
					id INTEGER PRIMARY KEY AUTOINCREMENT,
					type TEXT NOT NULL,
					description TEXT NOT NULL,
					status TEXT NOT NULL DEFAULT 'pending',
					payload TEXT,
					project_path TEXT,
					project_id TEXT DEFAULT NULL,
					result TEXT,
					created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
					updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
				);
				CREATE TABLE notifications (
					id INTEGER PRIMARY KEY AUTOINCREMENT,
					message TEXT NOT NULL,
					source_type TEXT NOT NULL DEFAULT 'run',
					source_id TEXT,
					route TEXT,
					project_id TEXT,
					dismissed INTEGER NOT NULL DEFAULT 0,
					created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
				);
			`);
			rawDb.exec(`
				INSERT INTO runs (
					id, flow, feature_id, project_path, rp1_project_root, rp1_kb_root, rp1_work_root, status
				) VALUES
					('legacy-running', 'build', 'feat', '/project', '/project', '/project/.rp1/context', '/project/.rp1/work', 'running'),
					('legacy-skipped', 'build', 'feat', '/project', '/project', '/project/.rp1/context', '/project/.rp1/work', 'skipped');
			`);
			rawDb.close();

			const db = await expectTaskRight(getEmitDatabase(dbPath));

			const versionRow = db
				.prepare("SELECT version FROM schema_version")
				.get() as { version: number };
			expect(versionRow.version).toBe(18);

			const indexes = db.prepare("PRAGMA index_list(runs)").all() as {
				name: string;
			}[];
			expect(indexes.map((index) => index.name)).toContain(
				"idx_runs_status_updated",
			);

			const runsTableSql = db
				.prepare(
					"SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'runs'",
				)
				.get() as { sql: string } | null;
			expect(runsTableSql?.sql).toContain("'inactive'");
			expect(runsTableSql?.sql).toContain("'cancelled'");
			expect(runsTableSql?.sql).toContain("'abandoned'");
			expect(runsTableSql?.sql).toContain("'skipped'");

			const rows = db
				.prepare("SELECT id, status FROM runs ORDER BY id ASC")
				.all() as {
				id: string;
				status: string;
			}[];
			expect(rows).toEqual([
				{ id: "legacy-running", status: "running" },
				{ id: "legacy-skipped", status: "skipped" },
			]);

			expect(() => {
				db.prepare(
					`INSERT INTO runs (
						id, flow, feature_id, project_path, rp1_project_root, rp1_kb_root, rp1_work_root, status
					) VALUES (
						'inactive-run', 'build', 'feat', '/project', '/project', '/project/.rp1/context', '/project/.rp1/work', 'inactive'
					)`,
				).run();
			}).not.toThrow();

			expect(() => {
				db.prepare(
					`INSERT INTO runs (
						id, flow, feature_id, project_path, rp1_project_root, rp1_kb_root, rp1_work_root, status
					) VALUES (
						'cancelled-run', 'build', 'feat', '/project', '/project', '/project/.rp1/context', '/project/.rp1/work', 'cancelled'
					)`,
				).run();
			}).not.toThrow();

			expect(() => {
				db.prepare(
					`INSERT INTO runs (
						id, flow, feature_id, project_path, rp1_project_root, rp1_kb_root, rp1_work_root, status
					) VALUES (
						'abandoned-run', 'build', 'feat', '/project', '/project', '/project/.rp1/context', '/project/.rp1/work', 'abandoned'
					)`,
				).run();
			}).not.toThrow();
		});

		test("migrates v10 schema to add workflow bootstrap columns and lookup indexes", async () => {
			const dbPath = join(tempDir, "migration-v10-test.db");

			const { Database } = await import("bun:sqlite");
			const rawDb = new Database(dbPath, { create: true });
			rawDb.exec("PRAGMA journal_mode = WAL;");
			rawDb.exec("PRAGMA foreign_keys = ON;");
			rawDb.exec(`
				CREATE TABLE schema_version (version INTEGER NOT NULL);
				INSERT INTO schema_version (version) VALUES (10);
				CREATE TABLE runs (
					id TEXT PRIMARY KEY NOT NULL,
					flow TEXT NOT NULL,
					feature_id TEXT NOT NULL,
					project_path TEXT NOT NULL,
					rp1_project_root TEXT NOT NULL,
					rp1_kb_root TEXT NOT NULL,
					rp1_work_root TEXT NOT NULL,
					project_id TEXT DEFAULT NULL,
					name TEXT DEFAULT NULL,
					harness TEXT DEFAULT NULL,
					status TEXT NOT NULL DEFAULT 'not_started',
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
				CREATE TABLE artifacts (
					id INTEGER PRIMARY KEY AUTOINCREMENT,
					doc_id TEXT UNIQUE NOT NULL,
					run_id TEXT REFERENCES runs(id),
					path TEXT NOT NULL,
					type TEXT NOT NULL DEFAULT 'other',
					storage_root TEXT NOT NULL DEFAULT 'work_dir',
					project_path TEXT NOT NULL,
					project_id TEXT DEFAULT NULL,
					feature TEXT NOT NULL,
					step TEXT,
					subflow INTEGER NOT NULL DEFAULT 0,
					baseline TEXT DEFAULT NULL,
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
				CREATE TABLE tasks (
					id INTEGER PRIMARY KEY AUTOINCREMENT,
					type TEXT NOT NULL,
					description TEXT NOT NULL,
					status TEXT NOT NULL DEFAULT 'pending',
					payload TEXT,
					project_path TEXT,
					project_id TEXT DEFAULT NULL,
					result TEXT,
					created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
					updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
				);
				CREATE TABLE notifications (
					id INTEGER PRIMARY KEY AUTOINCREMENT,
					message TEXT NOT NULL,
					source_type TEXT NOT NULL DEFAULT 'run',
					source_id TEXT,
					route TEXT,
					project_id TEXT,
					dismissed INTEGER NOT NULL DEFAULT 0,
					created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
				);
			`);

			rawDb
				.prepare(
					`INSERT INTO runs (
						id, flow, feature_id, project_path, rp1_project_root,
						rp1_kb_root, rp1_work_root, project_id, name, harness
					) VALUES (
						$id, $flow, $featureId, $projectPath, $rp1ProjectRoot,
						$rp1KbRoot, $rp1WorkRoot, $projectId, $name, $harness
					)`,
				)
				.run({
					$id: "pre-v11-run",
					$flow: "build",
					$featureId: "feat-migrated",
					$projectPath: "/project/migrated",
					$rp1ProjectRoot: "/project/migrated",
					$rp1KbRoot: "/project/migrated/.rp1/context",
					$rp1WorkRoot: "/project/migrated/.rp1/work",
					$projectId: "project-migrated-id",
					$name: "build",
					$harness: "codex",
				});
			rawDb.close();

			const db = await expectTaskRight(getEmitDatabase(dbPath));

			const runColumns = db.prepare("PRAGMA table_info(runs)").all() as {
				name: string;
			}[];
			const runColumnNames = runColumns.map((c) => c.name);

			expect(runColumnNames).toContain("run_policy");
			expect(runColumnNames).toContain("work_identity");
			expect(runColumnNames).toContain("bootstrap_context");

			const indexes = db.prepare("PRAGMA index_list(runs)").all() as {
				name: string;
			}[];
			const indexNames = indexes.map((index) => index.name);

			expect(indexNames).toContain("idx_runs_project_work_identity_status");
			expect(indexNames).toContain("idx_runs_root_work_identity_status");

			const row = db
				.prepare(
					"SELECT run_policy, work_identity, bootstrap_context FROM runs WHERE id = ?",
				)
				.get("pre-v11-run") as {
				run_policy: string | null;
				work_identity: string | null;
				bootstrap_context: string | null;
			} | null;

			expect(row?.run_policy).toBeNull();
			expect(row?.work_identity).toBeNull();
			expect(row?.bootstrap_context).toBeNull();

			const versionRow = db
				.prepare("SELECT version FROM schema_version")
				.get() as { version: number };
			expect(versionRow.version).toBe(18);
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

		test("repairs mismatched directory metadata on subsequent emits", async () => {
			const dbPath = join(tempDir, "run-repair.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));
			const projectRoot = join(tempDir, "run-repair-project");
			const wrongRoot = join(tempDir, "wrong-run-root");

			await mkdir(join(projectRoot, ".rp1"), { recursive: true });
			writeFileSync(join(projectRoot, ".rp1", "project_id"), "project-uuid");

			insertRun(db, {
				id: "run-repair",
				flow: "build",
				featureId: "feat-1",
				projectPath: projectRoot,
				rp1ProjectRoot: wrongRoot,
				rp1KbRoot: join(wrongRoot, ".rp1", "context"),
				rp1WorkRoot: join(wrongRoot, ".rp1", "work"),
				projectId: "wrong-uuid",
			});

			const repaired = insertRun(db, {
				id: "run-repair",
				flow: "build",
				featureId: "feat-1",
				projectPath: projectRoot,
			});

			expect(repaired.projectPath).toBe(projectRoot);
			expect(repaired.rp1ProjectRoot).toBe(projectRoot);
			expect(repaired.rp1KbRoot).toBe(join(projectRoot, ".rp1", "context"));
			expect(repaired.rp1WorkRoot).toBe(join(projectRoot, ".rp1", "work"));
			expect(repaired.projectId).toBe("project-uuid");
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

		test("does not downgrade bootstrap metadata when later inserts omit workflow context", async () => {
			const dbPath = join(tempDir, "insert-run-preserve-bootstrap.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			insertRun(db, {
				id: "run-bootstrap-preserve",
				flow: "build",
				featureId: "feat-bootstrap",
				projectPath: "/project",
				runPolicy: "resumable",
				workIdentity: "FEATURE_ID=feat-bootstrap",
				bootstrapContext: '{"run":{"decision":"created_new_run"}}',
			});

			const second = insertRun(db, {
				id: "run-bootstrap-preserve",
				flow: "unknown",
				featureId: "unknown",
				projectPath: "/project",
			});

			expect(second.flow).toBe("build");
			expect(second.featureId).toBe("feat-bootstrap");
			expect(second.runPolicy).toBe("resumable");
			expect(second.workIdentity).toBe("FEATURE_ID=feat-bootstrap");
			expect(second.bootstrapContext).toContain("created_new_run");
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

	describe("activity search rows", () => {
		const insertIndexedRun = (
			db: Database,
			input: {
				readonly id: string;
				readonly projectId: string;
				readonly projectRoot: string;
				readonly status: "completed" | "failed";
				readonly activityAt: string;
				readonly searchText: string;
			},
		): void => {
			const run = insertRun(db, {
				id: input.id,
				flow: "build",
				featureId: input.id,
				projectPath: input.projectRoot,
				rp1ProjectRoot: input.projectRoot,
				rp1KbRoot: join(input.projectRoot, ".rp1", "context"),
				rp1WorkRoot: join(input.projectRoot, ".rp1", "work"),
				projectId: input.projectId,
			});
			upsertActivitySearchRun(db, {
				runId: input.id,
				projectId: input.projectId,
				projectRoot: input.projectRoot,
				flow: "build",
				status: input.status,
				activityAt: input.activityAt,
				sourceEventId: null,
				sourceRunUpdatedAt: run.updatedAt,
				searchText: input.searchText,
				indexedAt: "2026-01-10T00:00:00.000Z",
			});
		};

		test("upserts, queries, paginates, and deletes activity search rows", async () => {
			const dbPath = join(tempDir, "activity-search-accessors.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			insertIndexedRun(db, {
				id: "run-alpha-new",
				projectId: "project-a",
				projectRoot: "/project/a",
				status: "completed",
				activityAt: "2026-01-04T00:00:00.000Z",
				searchText: "alpha codex completed",
			});
			insertIndexedRun(db, {
				id: "run-alpha-old",
				projectId: "project-a",
				projectRoot: "/project/a",
				status: "completed",
				activityAt: "2026-01-03T00:00:00.000Z",
				searchText: "alpha codex second",
			});
			insertIndexedRun(db, {
				id: "run-alpha-failed",
				projectId: "project-a",
				projectRoot: "/project/a",
				status: "failed",
				activityAt: "2026-01-02T00:00:00.000Z",
				searchText: "alpha codex failed",
			});
			insertIndexedRun(db, {
				id: "run-alpha-other-project",
				projectId: "project-b",
				projectRoot: "/project/b",
				status: "completed",
				activityAt: "2026-01-05T00:00:00.000Z",
				searchText: "alpha codex other project",
			});
			insertIndexedRun(db, {
				id: "run-literal-percent",
				projectId: "project-a",
				projectRoot: "/project/a",
				status: "completed",
				activityAt: "2026-01-01T00:00:00.000Z",
				searchText: "literal 100% ready",
			});
			insertIndexedRun(db, {
				id: "run-percent-word",
				projectId: "project-a",
				projectRoot: "/project/a",
				status: "completed",
				activityAt: "2026-01-01T00:00:01.000Z",
				searchText: "literal 100 percent ready",
			});

			const paged = queryActivitySearchRuns(db, {
				projectId: "project-a",
				status: "completed",
				tokens: ["ALPHA", "codex"],
				limit: 1,
				offset: 1,
			});
			expect(paged.total).toBe(2);
			expect(paged.records.map((record) => record.runId)).toEqual([
				"run-alpha-old",
			]);

			const rootScoped = queryActivitySearchRuns(db, {
				projectRoot: "/project/a",
				activityFrom: "2026-01-03T00:00:00.000Z",
				tokens: ["alpha"],
			});
			expect(rootScoped.records.map((record) => record.runId)).toEqual([
				"run-alpha-new",
				"run-alpha-old",
			]);

			const literalPercent = queryActivitySearchRuns(db, {
				projectId: "project-a",
				tokens: ["100%"],
			});
			expect(literalPercent.records.map((record) => record.runId)).toEqual([
				"run-literal-percent",
			]);

			expect(deleteActivitySearchRun(db, "run-literal-percent")).toBe(true);
			expect(deleteActivitySearchRun(db, "run-literal-percent")).toBe(false);
			expect(
				queryActivitySearchRuns(db, {
					projectId: "project-a",
					tokens: ["100%"],
				}).total,
			).toBe(0);
		});

		test("detects missing and stale activity search rows from run and event sources", async () => {
			const dbPath = join(tempDir, "activity-search-refresh-candidates.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));
			const run = insertRun(db, {
				id: "run-refresh",
				flow: "build",
				featureId: "feat-refresh",
				projectPath: "/project/refresh",
				rp1ProjectRoot: "/project/refresh",
				rp1KbRoot: "/project/refresh/.rp1/context",
				rp1WorkRoot: "/project/refresh/.rp1/work",
				projectId: "project-refresh",
			});
			insertRun(db, {
				id: "bootstrap-only",
				flow: "build",
				featureId: "bootstrap",
				projectPath: "/project/refresh",
				rp1ProjectRoot: "/project/refresh",
				rp1KbRoot: "/project/refresh/.rp1/context",
				rp1WorkRoot: "/project/refresh/.rp1/work",
				projectId: "project-refresh",
				bootstrapContext: '{"bootstrap":true}',
			});
			const firstEvent = insertEvent(db, {
				runId: "run-refresh",
				type: "status_change",
				step: "task",
				data: '{"status":"running"}',
				createdAt: "2026-01-01T00:00:00.000Z",
			});

			expect(
				listActivitySearchRefreshCandidates(db, {
					projectId: "project-refresh",
					excludeBootstrapOnly: true,
				}).map((candidate) => ({
					runId: candidate.run.id,
					latestEventId: candidate.latestEventId,
					activityAt: candidate.activityAt,
					searchRow: candidate.searchRow,
				})),
			).toEqual([
				{
					runId: "run-refresh",
					latestEventId: firstEvent.id,
					activityAt: "2026-01-01T00:00:00.000Z",
					searchRow: null,
				},
			]);

			upsertActivitySearchRun(db, {
				runId: "run-refresh",
				projectId: "project-refresh",
				projectRoot: "/project/refresh",
				flow: "build",
				status: "not_started",
				activityAt: "2026-01-01T00:00:00.000Z",
				sourceEventId: firstEvent.id,
				sourceRunUpdatedAt: run.updatedAt,
				searchText: "refresh row",
			});
			expect(
				listActivitySearchRefreshCandidates(db, {
					projectId: "project-refresh",
					excludeBootstrapOnly: true,
				}),
			).toEqual([]);

			const secondEvent = insertEvent(db, {
				runId: "run-refresh",
				type: "status_change",
				step: "task",
				data: '{"status":"completed"}',
				createdAt: "2026-01-02T00:00:00.000Z",
			});
			expect(
				listActivitySearchRefreshCandidates(db, {
					projectId: "project-refresh",
					excludeBootstrapOnly: true,
				}).map((candidate) => candidate.latestEventId),
			).toEqual([secondEvent.id]);

			upsertActivitySearchRun(db, {
				runId: "run-refresh",
				projectId: "project-refresh",
				projectRoot: "/project/refresh",
				flow: "build",
				status: "not_started",
				activityAt: "2026-01-02T00:00:00.000Z",
				sourceEventId: secondEvent.id,
				sourceRunUpdatedAt: run.updatedAt,
				searchText: "refresh row",
			});
			db.prepare("UPDATE runs SET updated_at = ? WHERE id = ?").run(
				"2026-01-03T00:00:00.000Z",
				"run-refresh",
			);

			expect(
				listActivitySearchRefreshCandidates(db, {
					projectId: "project-refresh",
					activityFrom: "2026-01-02T00:00:00.000Z",
					excludeBootstrapOnly: true,
				}).map((candidate) => candidate.run.id),
			).toEqual(["run-refresh"]);
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
				storageRoot: "work_dir",
				projectPath: "/p",
				feature: "feat",
				step: "design",
			});

			expect(artifact.docId).toBe("doc-001");
			expect(artifact.path).toBe("design.md");
			expect(artifact.type).toBe("markdown");
			expect(artifact.storageRoot).toBe("work_dir");
		});

		test("updates existing artifact if doc_id already present", async () => {
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
				storageRoot: "work_dir",
				projectPath: "/p",
				feature: "feat",
			});

			const second = upsertArtifact(db, {
				docId: "doc-dup",
				runId: "run-art2",
				path: "different.md",
				type: "code",
				storageRoot: "project",
				projectPath: "/other",
				feature: "other-feat",
			});

			expect(second.id).toBe(first.id);
			expect(second.path).toBe("different.md");
			expect(second.type).toBe("code");
			expect(second.storageRoot).toBe("project");
			expect(second.projectPath).toBe("/other");
			expect(second.feature).toBe("other-feat");
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
				storageRoot: "work_dir",
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
				storageRoot: "work_dir",
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
				storageRoot: "work_dir",
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
				storageRoot: "work_dir",
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

		test("persists waiting when waiting_for_user is newer than workflow progress", async () => {
			const dbPath = join(tempDir, "derive-waiting-overlay.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			insertRun(db, {
				id: "run-waiting-overlay",
				flow: "build",
				featureId: "feat",
				projectPath: "/p",
			});

			insertEvent(db, {
				runId: "run-waiting-overlay",
				type: "status_change",
				step: "build",
				data: JSON.stringify({ status: "running" }),
			});
			insertEvent(db, {
				runId: "run-waiting-overlay",
				type: "waiting_for_user",
				step: "build",
				data: JSON.stringify({ prompt: "Need approval" }),
			});

			const status = deriveRunStatus(db, "run-waiting-overlay");

			expect(status).toBe("waiting");
		});

		test("newer workflow progress clears the waiting overlay", async () => {
			const dbPath = join(tempDir, "derive-waiting-cleared.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			insertRun(db, {
				id: "run-waiting-cleared",
				flow: "build",
				featureId: "feat",
				projectPath: "/p",
			});

			insertEvent(db, {
				runId: "run-waiting-cleared",
				type: "status_change",
				step: "build",
				data: JSON.stringify({ status: "running" }),
			});
			insertEvent(db, {
				runId: "run-waiting-cleared",
				type: "waiting_for_user",
				step: "build",
				data: JSON.stringify({ prompt: "Need approval" }),
			});
			insertEvent(db, {
				runId: "run-waiting-cleared",
				type: "status_change",
				step: "verify",
				data: JSON.stringify({ status: "running" }),
			});

			const status = deriveRunStatus(db, "run-waiting-cleared");

			expect(status).toBe("running");
		});

		test("newer namespaced child activity clears the waiting overlay", async () => {
			const dbPath = join(tempDir, "derive-waiting-cleared-child.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			insertRun(db, {
				id: "run-waiting-cleared-child",
				flow: "build",
				featureId: "feat",
				projectPath: "/p",
			});

			insertEvent(db, {
				runId: "run-waiting-cleared-child",
				type: "status_change",
				step: "build",
				data: JSON.stringify({ status: "running" }),
			});
			insertEvent(db, {
				runId: "run-waiting-cleared-child",
				type: "waiting_for_user",
				step: "build",
				data: JSON.stringify({ prompt: "Need approval" }),
			});
			insertEvent(db, {
				runId: "run-waiting-cleared-child",
				type: "status_change",
				step: "task-builder:building",
				unit: "T1",
				data: JSON.stringify({ status: "running" }),
			});

			const status = deriveRunStatus(db, "run-waiting-cleared-child");

			expect(status).toBe("running");
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

		test("child failures after parent completion do not fail the parent run", async () => {
			const dbPath = join(tempDir, "derive-late-child-failure.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			insertRun(db, {
				id: "run-late-child-failure",
				flow: "build",
				featureId: "feat",
				projectPath: "/p",
			});

			insertEvent(db, {
				runId: "run-late-child-failure",
				type: "status_change",
				step: "build",
				data: JSON.stringify({ status: "completed" }),
			});
			insertEvent(db, {
				runId: "run-late-child-failure",
				type: "status_change",
				step: "task-reviewer:failed",
				unit: "T4",
				data: JSON.stringify({ status: "failed" }),
			});

			const status = deriveRunStatus(db, "run-late-child-failure");

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

		test("manual end-run remains sticky after later workflow events", async () => {
			const dbPath = join(tempDir, "derive-sticky-end-run.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			insertRun(db, {
				id: "run-sticky-end-run",
				flow: "build",
				featureId: "feat",
				projectPath: "/p",
			});

			insertEvent(db, {
				runId: "run-sticky-end-run",
				type: "status_change",
				step: "build",
				data: JSON.stringify({ status: "running" }),
			});

			expectRight(
				endRun(db, {
					runId: "run-sticky-end-run",
					outcome: "cancelled",
					message: "Stopped intentionally",
				}),
			);

			insertEvent(db, {
				runId: "run-sticky-end-run",
				type: "status_change",
				step: "verify",
				data: JSON.stringify({ status: "running" }),
			});

			const status = deriveRunStatus(db, "run-sticky-end-run");

			expect(status).toBe("cancelled");
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

		test("namespaced sub-step events do not override active parent workflow step status", async () => {
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
					status: "running",
					concreteStep: "build",
					unit: null,
				},
			]);
		});

		test("parent step completed after sub-step failures shows completed", async () => {
			const dbPath = join(tempDir, "step-statuses-parent-completed.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			insertRun(db, {
				id: "run-ss-parent-ok",
				flow: "build",
				featureId: "feat",
				projectPath: "/p",
			});

			insertEvent(db, {
				runId: "run-ss-parent-ok",
				type: "status_change",
				step: "build",
				data: JSON.stringify({ status: "running" }),
			});
			insertEvent(db, {
				runId: "run-ss-parent-ok",
				type: "status_change",
				step: "task-builder:completed",
				unit: "T1",
				data: JSON.stringify({ status: "completed" }),
			});
			insertEvent(db, {
				runId: "run-ss-parent-ok",
				type: "status_change",
				step: "task-reviewer:failed",
				unit: "T1",
				data: JSON.stringify({ status: "failed" }),
			});
			insertEvent(db, {
				runId: "run-ss-parent-ok",
				type: "status_change",
				step: "build",
				data: JSON.stringify({ status: "completed" }),
			});
			insertEvent(db, {
				runId: "run-ss-parent-ok",
				type: "status_change",
				step: "verify",
				data: JSON.stringify({ status: "running" }),
			});

			const statuses = getStepStatuses(db, "run-ss-parent-ok");

			const buildStep = statuses.find((s) => s.step === "build");
			const verifyStep = statuses.find((s) => s.step === "verify");

			expect(buildStep?.status).toBe("completed");
			expect(verifyStep?.status).toBe("running");
			expect(statuses).toHaveLength(2);
		});
	});

	describe("getEffectiveStepStatuses", () => {
		test("projects waiting onto the current workflow step", async () => {
			const dbPath = join(tempDir, "effective-step-statuses-waiting.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			insertRun(db, {
				id: "run-effective-waiting",
				flow: "build",
				featureId: "feat",
				projectPath: "/p",
			});

			insertEvent(db, {
				runId: "run-effective-waiting",
				type: "status_change",
				step: "build",
				data: JSON.stringify({ status: "running" }),
			});
			insertEvent(db, {
				runId: "run-effective-waiting",
				type: "waiting_for_user",
				step: "build",
				data: JSON.stringify({ prompt: "Need approval" }),
			});

			const statuses = getEffectiveStepStatuses(db, "run-effective-waiting");

			expect(statuses).toEqual([
				{
					step: "build",
					status: "waiting",
					concreteStep: "build",
					unit: null,
				},
			]);
		});

		test("collapses live step statuses after a stepless terminal run override", async () => {
			const dbPath = join(tempDir, "effective-step-statuses-cancelled.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			insertRun(db, {
				id: "run-effective-cancelled",
				flow: "build",
				featureId: "feat",
				projectPath: "/p",
			});

			insertEvent(db, {
				runId: "run-effective-cancelled",
				type: "status_change",
				step: "build",
				data: JSON.stringify({ status: "running" }),
			});
			expectRight(
				endRun(db, {
					runId: "run-effective-cancelled",
					outcome: "cancelled",
					message: "Stopped intentionally",
				}),
			);

			const statuses = getEffectiveStepStatuses(db, "run-effective-cancelled");

			expect(statuses).toEqual([
				{
					step: "build",
					status: "completed",
					concreteStep: "build",
					unit: null,
				},
			]);
		});
	});

	describe("inactive reclassification", () => {
		test("skips stale bootstrap-only not_started runs with no events", async () => {
			const dbPath = join(tempDir, "inactive-bootstrap-skip.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			insertRun(db, {
				id: "run-bootstrap-only",
				flow: "phase-plan",
				featureId: "feat",
				projectPath: "/p",
				bootstrapContext: JSON.stringify({
					run: { decision: "created_new_run" },
				}),
			});
			db.prepare("UPDATE runs SET updated_at = ? WHERE id = ?").run(
				"2026-04-10T00:00:00.000Z",
				"run-bootstrap-only",
			);

			const reclassified = reclassifyInactiveRuns(
				db,
				new Date("2026-04-13T12:00:00.000Z"),
			);

			expect(reclassified).toEqual([]);
			expect(getRunById(db, "run-bootstrap-only")?.status).toBe("not_started");
			expect(getEventsForRun(db, "run-bootstrap-only")).toHaveLength(0);
		});

		test("skips stale bootstrap-only runs with only inactivity reaper events", async () => {
			const dbPath = join(tempDir, "inactive-bootstrap-reaper-skip.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			insertRun(db, {
				id: "run-bootstrap-reaper-only",
				flow: "phase-plan",
				featureId: "feat",
				projectPath: "/p",
				bootstrapContext: JSON.stringify({
					run: { decision: "created_new_run" },
				}),
			});
			insertEvent(db, {
				runId: "run-bootstrap-reaper-only",
				type: "status_change",
				data: JSON.stringify(INACTIVE_REAPER_STATUS_CHANGE),
				createdAt: "2026-04-11T00:00:00.000Z",
			});
			db.prepare("UPDATE runs SET updated_at = ? WHERE id = ?").run(
				"2026-04-10T00:00:00.000Z",
				"run-bootstrap-reaper-only",
			);

			const reclassified = reclassifyInactiveRuns(
				db,
				new Date("2026-04-13T12:00:00.000Z"),
			);

			expect(reclassified).toEqual([]);
			expect(getEventsForRun(db, "run-bootstrap-reaper-only")).toHaveLength(1);
		});

		test("reclassifies stale not_started runs after workflow events exist", async () => {
			const dbPath = join(tempDir, "inactive-not-started-events.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			insertRun(db, {
				id: "run-not-started-with-event",
				flow: "build",
				featureId: "feat",
				projectPath: "/p",
			});
			insertEvent(db, {
				runId: "run-not-started-with-event",
				type: "status_change",
				step: "build",
				data: JSON.stringify({ status: "not_started" }),
				createdAt: "2026-04-10T00:00:00.000Z",
			});
			deriveRunStatus(db, "run-not-started-with-event");
			db.prepare("UPDATE runs SET updated_at = ? WHERE id = ?").run(
				"2026-04-10T00:00:00.000Z",
				"run-not-started-with-event",
			);

			const reclassified = reclassifyInactiveRuns(
				db,
				new Date("2026-04-13T12:00:00.000Z"),
			);

			expect(reclassified).toHaveLength(1);
			expect(reclassified[0]).toMatchObject({
				runId: "run-not-started-with-event",
				previousStatus: "not_started",
				runStatus: "inactive",
			});
			expect(getRunById(db, "run-not-started-with-event")?.status).toBe(
				"inactive",
			);
		});

		test("reclassifies stale running runs to inactive and lets new activity revive them", async () => {
			const dbPath = join(tempDir, "inactive-reclassify.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			insertRun(db, {
				id: "run-inactive",
				flow: "build",
				featureId: "feat",
				projectPath: "/p",
			});
			insertEvent(db, {
				runId: "run-inactive",
				type: "status_change",
				step: "build",
				data: JSON.stringify({ status: "running" }),
			});
			deriveRunStatus(db, "run-inactive");

			db.prepare("UPDATE runs SET updated_at = ? WHERE id = ?").run(
				"2026-04-10T00:00:00.000Z",
				"run-inactive",
			);

			const reclassified = reclassifyInactiveRuns(
				db,
				new Date("2026-04-13T12:00:00.000Z"),
			);

			expect(reclassified).toHaveLength(1);
			expect(reclassified[0]).toMatchObject({
				runId: "run-inactive",
				previousStatus: "running",
				runStatus: "inactive",
			});

			let run = getRunById(db, "run-inactive");
			expect(run?.status).toBe("inactive");

			insertEvent(db, {
				runId: "run-inactive",
				type: "status_change",
				step: "verify",
				data: JSON.stringify({ status: "running" }),
			});

			expect(deriveRunStatus(db, "run-inactive")).toBe("running");
			run = getRunById(db, "run-inactive");
			expect(run?.status).toBe("running");
		});
	});

	describe("endRun", () => {
		test("writes a stepless cancelled lifecycle event", async () => {
			const dbPath = join(tempDir, "end-run-cancelled.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			insertRun(db, {
				id: "run-end-run",
				flow: "build",
				featureId: "feat",
				projectPath: "/p",
			});
			insertEvent(db, {
				runId: "run-end-run",
				type: "status_change",
				step: "build",
				data: JSON.stringify({ status: "running" }),
			});
			deriveRunStatus(db, "run-end-run");

			const result = expectRight(
				endRun(db, {
					runId: "run-end-run",
					outcome: "cancelled",
					message: "Superseded by a newer run",
				}),
			);

			expect(result.runStatus).toBe("cancelled");

			const events = getEventsForRun(db, "run-end-run");
			const terminalEvent = events.at(-1);

			expect(terminalEvent?.step).toBeNull();
			expect(terminalEvent?.unit).toBeNull();
			expect(terminalEvent?.data).not.toBeNull();
			expect(JSON.parse(terminalEvent?.data ?? "{}")).toMatchObject({
				status: "cancelled",
				message: "Superseded by a newer run",
				actor: "user",
				source: "manual_end",
			});
		});

		test("rejects runs that are already terminal", async () => {
			const dbPath = join(tempDir, "end-run-terminal.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			insertRun(db, {
				id: "run-end-run-terminal",
				flow: "build",
				featureId: "feat",
				projectPath: "/p",
			});
			insertEvent(db, {
				runId: "run-end-run-terminal",
				type: "status_change",
				step: "verify",
				data: JSON.stringify({ status: "completed" }),
			});
			deriveRunStatus(db, "run-end-run-terminal");

			const result = endRun(db, {
				runId: "run-end-run-terminal",
				outcome: "abandoned",
			});

			expect(result._tag).toBe("Left");
			if (result._tag === "Left") {
				expect(result.left._tag).toBe("RuntimeError");
				if (result.left._tag === "RuntimeError") {
					expect(result.left.message).toContain("already terminal");
				}
			}
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

		test("creates a new run after a previous run is cancelled", async () => {
			const dbPath = join(tempDir, "resume-cancelled.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			insertRun(db, {
				id: "run-cancelled",
				flow: "build",
				featureId: "feat-cancelled",
				projectPath: "/project/cancelled",
			});
			insertEvent(db, {
				runId: "run-cancelled",
				type: "status_change",
				step: "build",
				data: JSON.stringify({ status: "running" }),
			});
			deriveRunStatus(db, "run-cancelled");
			expectRight(
				endRun(db, {
					runId: "run-cancelled",
					outcome: "cancelled",
				}),
			);

			const result = findOrCreateRun(db, {
				flow: "build",
				featureId: "feat-cancelled",
				projectPath: "/project/cancelled",
			});

			expect(result.runId).not.toBe("run-cancelled");
			expect(result.resumed).toBe(false);
		});

		test("resumes legacy skipped runs because skipped is no longer terminal", async () => {
			const dbPath = join(tempDir, "resume-skipped.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			insertRun(db, {
				id: "run-skipped",
				flow: "build",
				featureId: "feat-skipped",
				projectPath: "/project/skipped",
			});

			db.prepare("UPDATE runs SET status = 'skipped' WHERE id = ?").run(
				"run-skipped",
			);

			const result = findOrCreateRun(db, {
				flow: "build",
				featureId: "feat-skipped",
				projectPath: "/project/skipped",
			});

			expect(result.runId).toBe("run-skipped");
			expect(result.resumed).toBe(true);
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

		test("matches run by project_id when available", async () => {
			const dbPath = join(tempDir, "resume-project-id.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			insertRun(db, {
				id: "run-pid",
				flow: "build",
				featureId: "feat-pid",
				projectPath: "/project/old-path",
				rp1ProjectRoot: "/project/old-path",
				projectId: "stable-project-id",
			});

			insertEvent(db, {
				runId: "run-pid",
				type: "status_change",
				step: "step1",
				data: JSON.stringify({ status: "running" }),
			});
			deriveRunStatus(db, "run-pid");

			const result = findOrCreateRun(db, {
				flow: "build",
				featureId: "feat-pid",
				projectPath: "/project/new-path",
				rp1ProjectRoot: "/project/new-path",
				projectId: "stable-project-id",
			});

			expect(result.runId).toBe("run-pid");
			expect(result.resumed).toBe(true);
		});

		test("falls back to rp1_project_root for rows with NULL project_id", async () => {
			const dbPath = join(tempDir, "resume-null-pid-fallback.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			insertRun(db, {
				id: "run-no-pid",
				flow: "build",
				featureId: "feat-no-pid",
				projectPath: "/project/fallback",
				rp1ProjectRoot: "/project/fallback",
			});

			db.prepare("UPDATE runs SET project_id = NULL WHERE id = ?").run(
				"run-no-pid",
			);

			insertEvent(db, {
				runId: "run-no-pid",
				type: "status_change",
				step: "step1",
				data: JSON.stringify({ status: "running" }),
			});
			deriveRunStatus(db, "run-no-pid");

			const result = findOrCreateRun(db, {
				flow: "build",
				featureId: "feat-no-pid",
				projectPath: "/project/fallback",
				rp1ProjectRoot: "/project/fallback",
			});

			expect(result.runId).toBe("run-no-pid");
			expect(result.resumed).toBe(true);
		});

		test("matches legacy unknown flow by project_id", async () => {
			const dbPath = join(tempDir, "resume-legacy-pid.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			insertRun(db, {
				id: "run-legacy-pid",
				flow: "unknown",
				featureId: "feat-legacy-pid",
				projectPath: "/project/legacy-path",
				rp1ProjectRoot: "/project/legacy-path",
				projectId: "stable-legacy-id",
			});

			insertEvent(db, {
				runId: "run-legacy-pid",
				type: "status_change",
				step: "step1",
				data: JSON.stringify({ status: "running" }),
			});
			deriveRunStatus(db, "run-legacy-pid");

			const result = findOrCreateRun(db, {
				flow: "build",
				featureId: "feat-legacy-pid",
				projectPath: "/project/different-path",
				rp1ProjectRoot: "/project/different-path",
				projectId: "stable-legacy-id",
			});

			expect(result.runId).toBe("run-legacy-pid");
			expect(result.resumed).toBe(true);

			const row = db
				.prepare("SELECT flow FROM runs WHERE id = ?")
				.get("run-legacy-pid") as { flow: string } | null;
			expect(row?.flow).toBe("build");
		});
	});

	describe("findOrCreateWorkflowRun", () => {
		test("resumes resumable runs by canonical project identity and work identity", async () => {
			const dbPath = join(tempDir, "workflow-run-resume.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			insertRun(db, {
				id: "run-workflow-active",
				flow: "build",
				featureId: "feat-bootstrap",
				projectPath: "/project/bootstrap",
				rp1ProjectRoot: "/project/bootstrap",
				rp1KbRoot: "/project/bootstrap/.rp1/context",
				rp1WorkRoot: "/project/bootstrap/.rp1/work",
				projectId: "project-bootstrap-id",
				runPolicy: "resumable",
				workIdentity: "FEATURE_ID=feat-bootstrap",
				bootstrapContext: '{"run":{"decision":"created_new_run"}}',
			});

			insertEvent(db, {
				runId: "run-workflow-active",
				type: "status_change",
				step: "requirements",
				data: JSON.stringify({ status: "running" }),
			});
			deriveRunStatus(db, "run-workflow-active");

			const result = findOrCreateWorkflowRun(db, {
				flow: "build",
				featureId: "feat-bootstrap",
				projectPath: "/project/bootstrap",
				rp1ProjectRoot: "/project/bootstrap",
				rp1KbRoot: "/project/bootstrap/.rp1/context",
				rp1WorkRoot: "/project/bootstrap/.rp1/work",
				projectId: "project-bootstrap-id",
				runPolicy: "resumable",
				workIdentity: "FEATURE_ID=feat-bootstrap",
				bootstrapContext: '{"run":{"decision":"matched_non_terminal_run"}}',
				harness: "codex",
			});

			expect(result.run.id).toBe("run-workflow-active");
			expect(result.resumed).toBe(true);
			expect(result.decision).toBe("matched_non_terminal_run");

			const row = db
				.prepare(
					"SELECT run_policy, work_identity, bootstrap_context, harness FROM runs WHERE id = ?",
				)
				.get("run-workflow-active") as {
				run_policy: string | null;
				work_identity: string | null;
				bootstrap_context: string | null;
				harness: string | null;
			} | null;

			expect(row?.run_policy).toBe("resumable");
			expect(row?.work_identity).toBe("FEATURE_ID=feat-bootstrap");
			expect(row?.bootstrap_context).toContain("matched_non_terminal_run");
			expect(row?.harness).toBe("codex");
		});

		test("always creates a new run for fresh workflows", async () => {
			const dbPath = join(tempDir, "workflow-run-fresh.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			const first = findOrCreateWorkflowRun(db, {
				flow: "build-fast",
				featureId: "unknown",
				projectPath: "/project/fresh",
				rp1ProjectRoot: "/project/fresh",
				rp1KbRoot: "/project/fresh/.rp1/context",
				rp1WorkRoot: "/project/fresh/.rp1/work",
				projectId: "project-fresh-id",
				runPolicy: "fresh",
				bootstrapContext: '{"run":{"decision":"created_new_run"}}',
				harness: "codex",
			});

			insertEvent(db, {
				runId: first.run.id,
				type: "status_change",
				step: "request",
				data: JSON.stringify({ status: "running" }),
			});
			deriveRunStatus(db, first.run.id);

			const second = findOrCreateWorkflowRun(db, {
				flow: "build-fast",
				featureId: "unknown",
				projectPath: "/project/fresh",
				rp1ProjectRoot: "/project/fresh",
				rp1KbRoot: "/project/fresh/.rp1/context",
				rp1WorkRoot: "/project/fresh/.rp1/work",
				projectId: "project-fresh-id",
				runPolicy: "fresh",
				bootstrapContext: '{"run":{"decision":"created_new_run"}}',
				harness: "codex",
			});

			expect(first.resumed).toBe(false);
			expect(second.resumed).toBe(false);
			expect(second.run.id).not.toBe(first.run.id);
		});

		test("backfills legacy build rows resumed through feature compatibility lookup", async () => {
			const dbPath = join(tempDir, "workflow-run-legacy.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			insertRun(db, {
				id: "run-legacy-build",
				flow: "unknown",
				featureId: "feat-legacy-bootstrap",
				projectPath: "/project/legacy-bootstrap",
				rp1ProjectRoot: "/project/legacy-bootstrap",
				rp1KbRoot: "/project/legacy-bootstrap/.rp1/context",
				rp1WorkRoot: "/project/legacy-bootstrap/.rp1/work",
			});

			insertEvent(db, {
				runId: "run-legacy-build",
				type: "status_change",
				step: "requirements",
				data: JSON.stringify({ status: "running" }),
			});
			deriveRunStatus(db, "run-legacy-build");

			const result = findOrCreateWorkflowRun(db, {
				flow: "build",
				featureId: "feat-legacy-bootstrap",
				projectPath: "/project/legacy-bootstrap",
				rp1ProjectRoot: "/project/legacy-bootstrap",
				rp1KbRoot: "/project/legacy-bootstrap/.rp1/context",
				rp1WorkRoot: "/project/legacy-bootstrap/.rp1/work",
				runPolicy: "resumable",
				projectId: "legacy-project-id",
				workIdentity: "FEATURE_ID=feat-legacy-bootstrap",
				bootstrapContext: '{"run":{"decision":"legacy_backfill_resume"}}',
				harness: "codex",
			});

			expect(result.run.id).toBe("run-legacy-build");
			expect(result.resumed).toBe(true);
			expect(result.decision).toBe("legacy_backfill_resume");

			const row = db
				.prepare(
					"SELECT flow, run_policy, work_identity, bootstrap_context FROM runs WHERE id = ?",
				)
				.get("run-legacy-build") as {
				flow: string;
				run_policy: string | null;
				work_identity: string | null;
				bootstrap_context: string | null;
			} | null;

			expect(row?.flow).toBe("build");
			expect(row?.run_policy).toBe("resumable");
			expect(row?.work_identity).toBe("FEATURE_ID=feat-legacy-bootstrap");
			expect(row?.bootstrap_context).toContain("legacy_backfill_resume");
		});

		test("ignores terminal resumable matches and creates a new run", async () => {
			const dbPath = join(tempDir, "workflow-run-terminal.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			insertRun(db, {
				id: "run-workflow-completed",
				flow: "build",
				featureId: "feat-terminal",
				projectPath: "/project/terminal",
				rp1ProjectRoot: "/project/terminal",
				rp1KbRoot: "/project/terminal/.rp1/context",
				rp1WorkRoot: "/project/terminal/.rp1/work",
				projectId: "project-terminal-id",
				runPolicy: "resumable",
				workIdentity: "FEATURE_ID=feat-terminal",
				bootstrapContext: '{"run":{"decision":"created_new_run"}}',
			});

			insertEvent(db, {
				runId: "run-workflow-completed",
				type: "status_change",
				step: "task-builder:completed",
				data: JSON.stringify({ status: "completed" }),
			});
			deriveRunStatus(db, "run-workflow-completed");

			const result = findOrCreateWorkflowRun(db, {
				flow: "build",
				featureId: "feat-terminal",
				projectPath: "/project/terminal",
				rp1ProjectRoot: "/project/terminal",
				rp1KbRoot: "/project/terminal/.rp1/context",
				rp1WorkRoot: "/project/terminal/.rp1/work",
				projectId: "project-terminal-id",
				runPolicy: "resumable",
				workIdentity: "FEATURE_ID=feat-terminal",
				bootstrapContext: '{"run":{"decision":"created_new_run"}}',
				harness: "codex",
			});

			expect(result.run.id).not.toBe("run-workflow-completed");
			expect(result.resumed).toBe(false);
			expect(result.decision).toBe("created_new_run");

			const completedRun = getRunById(db, "run-workflow-completed");
			expect(completedRun?.status).toBe("completed");
		});

		test("resumes skipped workflow rows because skipped is no longer terminal", async () => {
			const dbPath = join(tempDir, "workflow-run-skipped.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			insertRun(db, {
				id: "run-workflow-skipped",
				flow: "build",
				featureId: "feat-skipped",
				projectPath: "/project/skipped",
				rp1ProjectRoot: "/project/skipped",
				rp1KbRoot: "/project/skipped/.rp1/context",
				rp1WorkRoot: "/project/skipped/.rp1/work",
				projectId: "project-skipped-id",
				runPolicy: "resumable",
				workIdentity: "FEATURE_ID=feat-skipped",
				bootstrapContext: '{"run":{"decision":"created_new_run"}}',
			});

			db.prepare("UPDATE runs SET status = 'skipped' WHERE id = ?").run(
				"run-workflow-skipped",
			);

			const result = findOrCreateWorkflowRun(db, {
				flow: "build",
				featureId: "feat-skipped",
				projectPath: "/project/skipped",
				rp1ProjectRoot: "/project/skipped",
				rp1KbRoot: "/project/skipped/.rp1/context",
				rp1WorkRoot: "/project/skipped/.rp1/work",
				projectId: "project-skipped-id",
				runPolicy: "resumable",
				workIdentity: "FEATURE_ID=feat-skipped",
				bootstrapContext: '{"run":{"decision":"matched_non_terminal_run"}}',
				harness: "codex",
			});

			expect(result.run.id).toBe("run-workflow-skipped");
			expect(result.resumed).toBe(true);
			expect(result.decision).toBe("matched_non_terminal_run");
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
				storageRoot: "work_dir",
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

		test("excludes inactive runs from the live snapshot", async () => {
			const dbPath = join(tempDir, "snapshot-inactive.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			insertRun(db, {
				id: "run-snap-inactive",
				flow: "build",
				featureId: "feat-inactive",
				projectPath: "/p/snap",
			});
			insertEvent(db, {
				runId: "run-snap-inactive",
				type: "status_change",
				step: "build",
				data: JSON.stringify({ status: "running" }),
			});
			deriveRunStatus(db, "run-snap-inactive");
			db.prepare("UPDATE runs SET updated_at = ? WHERE id = ?").run(
				"2026-04-10T00:00:00.000Z",
				"run-snap-inactive",
			);
			reclassifyInactiveRuns(db, new Date("2026-04-13T12:00:00.000Z"));

			insertRun(db, {
				id: "run-snap-waiting",
				flow: "build",
				featureId: "feat-waiting",
				projectPath: "/p/snap",
			});
			insertEvent(db, {
				runId: "run-snap-waiting",
				type: "status_change",
				step: "build",
				data: JSON.stringify({ status: "running" }),
			});
			insertEvent(db, {
				runId: "run-snap-waiting",
				type: "waiting_for_user",
				step: "build",
				data: JSON.stringify({ prompt: "Need review" }),
			});
			deriveRunStatus(db, "run-snap-waiting");

			const snapshot = getActiveRunsSnapshot(db);

			expect(
				snapshot.find((run) => run.id === "run-snap-inactive"),
			).toBeUndefined();
			expect(
				snapshot.find((run) => run.id === "run-snap-waiting"),
			).toBeDefined();
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

		test("sorts by the latest event timestamp", async () => {
			const dbPath = join(tempDir, "list-runs-latest-event.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			insertRun(db, {
				id: "run-lr1",
				flow: "build",
				featureId: "feat",
				projectPath: "/p",
			});
			insertRun(db, {
				id: "run-lr2",
				flow: "build",
				featureId: "feat",
				projectPath: "/p",
			});

			db.prepare("UPDATE runs SET created_at = $createdAt WHERE id = $id").run({
				$createdAt: "2026-03-01T00:00:00.000Z",
				$id: "run-lr1",
			});
			db.prepare("UPDATE runs SET created_at = $createdAt WHERE id = $id").run({
				$createdAt: "2026-03-02T00:00:00.000Z",
				$id: "run-lr2",
			});

			insertEvent(db, {
				runId: "run-lr1",
				type: "btw_update",
				data: JSON.stringify({ message: "latest activity" }),
				createdAt: "2026-03-03T00:00:00.000Z",
			});
			insertEvent(db, {
				runId: "run-lr2",
				type: "btw_update",
				data: JSON.stringify({ message: "older activity" }),
				createdAt: "2026-03-01T12:00:00.000Z",
			});

			const result = listRuns(db);

			expect(result.records[0].id).toBe("run-lr1");
			expect(result.records[0].lastEventAt).toBe("2026-03-03T00:00:00.000Z");
			expect(result.records[1].id).toBe("run-lr2");
			expect(result.records[1].lastEventAt).toBe("2026-03-01T12:00:00.000Z");
		});

		test("falls back to run created_at when there are no events", async () => {
			const dbPath = join(tempDir, "list-runs-no-events.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			insertRun(db, {
				id: "run-lr3",
				flow: "build",
				featureId: "feat",
				projectPath: "/p",
			});

			db.prepare("UPDATE runs SET created_at = $createdAt WHERE id = $id").run({
				$createdAt: "2026-03-04T00:00:00.000Z",
				$id: "run-lr3",
			});

			const result = listRuns(db);

			expect(result.records[0].id).toBe("run-lr3");
			expect(result.records[0].lastEventAt).toBe("2026-03-04T00:00:00.000Z");
		});

		test("can exclude bootstrap-only runs without changing direct lookup", async () => {
			const dbPath = join(tempDir, "list-runs-bootstrap-only.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			insertRun(db, {
				id: "run-bootstrap-only",
				flow: "phase-plan",
				featureId: "phase-plan",
				projectPath: "/p",
				bootstrapContext: JSON.stringify({
					run: { decision: "created_new_run" },
				}),
			});
			insertRun(db, {
				id: "run-normal-no-events",
				flow: "build",
				featureId: "feat",
				projectPath: "/p",
			});

			const result = listRuns(db, { excludeBootstrapOnly: true });

			expect(result.total).toBe(1);
			expect(result.records.map((record) => record.id)).toEqual([
				"run-normal-no-events",
			]);
			expect(getRunById(db, "run-bootstrap-only")?.bootstrapContext).toContain(
				"created_new_run",
			);
			expect(listRuns(db).total).toBe(2);
		});

		test("keeps bootstrap-backed runs visible after they emit events", async () => {
			const dbPath = join(tempDir, "list-runs-bootstrap-events.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			insertRun(db, {
				id: "run-bootstrap-empty",
				flow: "phase-plan",
				featureId: "phase-plan",
				projectPath: "/p",
				bootstrapContext: JSON.stringify({
					run: { decision: "created_new_run" },
				}),
			});
			insertRun(db, {
				id: "run-bootstrap-eventful",
				flow: "phase-plan",
				featureId: "phase-plan",
				projectPath: "/p",
				bootstrapContext: JSON.stringify({
					run: { decision: "created_new_run" },
				}),
			});
			insertEvent(db, {
				runId: "run-bootstrap-eventful",
				type: "status_change",
				step: "planning",
				data: JSON.stringify({ status: "running" }),
				createdAt: "2026-03-05T00:00:00.000Z",
			});

			const result = listRuns(db, { excludeBootstrapOnly: true });

			expect(result.total).toBe(1);
			expect(result.records[0].id).toBe("run-bootstrap-eventful");
			expect(result.records[0].lastEventAt).toBe("2026-03-05T00:00:00.000Z");
		});

		test("excludes bootstrap-backed runs with only inactivity reaper events", async () => {
			const dbPath = join(tempDir, "list-runs-bootstrap-reaper-only.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			const bootstrapContext = JSON.stringify({
				run: { decision: "created_new_run" },
			});
			insertRun(db, {
				id: "run-bootstrap-reaper-only",
				flow: "analyse-security",
				featureId: "ui-audit",
				projectPath: "/p",
				bootstrapContext,
			});
			insertEvent(db, {
				runId: "run-bootstrap-reaper-only",
				type: "status_change",
				data: JSON.stringify(INACTIVE_REAPER_STATUS_CHANGE),
				createdAt: "2026-03-05T00:00:00.000Z",
			});
			insertRun(db, {
				id: "run-bootstrap-real-event",
				flow: "analyse-security",
				featureId: "cli",
				projectPath: "/p",
				bootstrapContext,
			});
			insertEvent(db, {
				runId: "run-bootstrap-real-event",
				type: "status_change",
				step: "scan",
				data: JSON.stringify({ status: "running" }),
				createdAt: "2026-03-04T00:00:00.000Z",
			});
			insertEvent(db, {
				runId: "run-bootstrap-real-event",
				type: "status_change",
				data: JSON.stringify(INACTIVE_REAPER_STATUS_CHANGE),
				createdAt: "2026-03-06T00:00:00.000Z",
			});

			const result = listRuns(db, { excludeBootstrapOnly: true });

			expect(result.total).toBe(1);
			expect(result.records.map((record) => record.id)).toEqual([
				"run-bootstrap-real-event",
			]);
			expect(result.records[0].lastEventAt).toBe("2026-03-06T00:00:00.000Z");
		});

		test("counts and paginates after excluding bootstrap-only runs", async () => {
			const dbPath = join(tempDir, "list-runs-bootstrap-pagination.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			const insertRunAt = (
				id: string,
				createdAt: string,
				bootstrapContext?: string,
			) => {
				insertRun(db, {
					id,
					flow: "build",
					featureId: "feat",
					projectPath: "/p",
					...(bootstrapContext !== undefined ? { bootstrapContext } : {}),
				});
				db.prepare(
					"UPDATE runs SET created_at = $createdAt WHERE id = $id",
				).run({
					$createdAt: createdAt,
					$id: id,
				});
			};

			const bootstrapContext = JSON.stringify({
				run: { decision: "created_new_run" },
			});
			insertRunAt(
				"run-hidden-newer",
				"2026-03-05T00:00:00.000Z",
				bootstrapContext,
			);
			insertRunAt("run-visible-first", "2026-03-04T00:00:00.000Z");
			insertRunAt(
				"run-hidden-middle",
				"2026-03-03T00:00:00.000Z",
				bootstrapContext,
			);
			insertRunAt("run-visible-second", "2026-03-02T00:00:00.000Z");

			const page1 = listRuns(db, {
				excludeBootstrapOnly: true,
				limit: 1,
				offset: 0,
			});
			const page2 = listRuns(db, {
				excludeBootstrapOnly: true,
				limit: 1,
				offset: 1,
			});

			expect(page1.total).toBe(2);
			expect(page1.records.map((record) => record.id)).toEqual([
				"run-visible-first",
			]);
			expect(page2.total).toBe(2);
			expect(page2.records.map((record) => record.id)).toEqual([
				"run-visible-second",
			]);
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

	describe("getRunWithLastEventById", () => {
		test("returns a run with the latest event timestamp used by list views", async () => {
			const dbPath = join(tempDir, "get-run-with-last-event.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			insertRun(db, {
				id: "run-summary",
				flow: "build",
				featureId: "feat-summary",
				projectPath: "/p/summary",
			});
			db.prepare("UPDATE runs SET created_at = $createdAt WHERE id = $id").run({
				$createdAt: "2026-03-01T00:00:00.000Z",
				$id: "run-summary",
			});
			insertEvent(db, {
				runId: "run-summary",
				type: "status_change",
				step: "build",
				data: JSON.stringify({ status: "running" }),
				createdAt: "2026-03-02T00:00:00.000Z",
			});

			const run = getRunWithLastEventById(db, "run-summary");

			expect(run).not.toBeNull();
			expect(run?.id).toBe("run-summary");
			expect(run?.lastEventAt).toBe("2026-03-02T00:00:00.000Z");
		});

		test("falls back to created_at when the run has no events", async () => {
			const dbPath = join(tempDir, "get-run-with-last-event-no-events.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			insertRun(db, {
				id: "run-summary-no-events",
				flow: "build",
				featureId: "feat-summary",
				projectPath: "/p/summary",
			});
			db.prepare("UPDATE runs SET created_at = $createdAt WHERE id = $id").run({
				$createdAt: "2026-03-03T00:00:00.000Z",
				$id: "run-summary-no-events",
			});

			const run = getRunWithLastEventById(db, "run-summary-no-events");

			expect(run).not.toBeNull();
			expect(run?.lastEventAt).toBe("2026-03-03T00:00:00.000Z");
		});

		test("returns null for missing ID", async () => {
			const dbPath = join(tempDir, "get-run-with-last-event-missing.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			const run = getRunWithLastEventById(db, "nonexistent");

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

		test("returns only recent events in chronological order", async () => {
			const dbPath = join(tempDir, "recent-events-for-run.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			insertRun(db, {
				id: "run-recent",
				flow: "build",
				featureId: "feat",
				projectPath: "/p",
			});

			for (const step of ["one", "two", "three"]) {
				insertEvent(db, {
					runId: "run-recent",
					type: "status_change",
					step,
					data: JSON.stringify({ status: "running" }),
				});
			}

			const events = getRecentEventsForRun(db, "run-recent", 2);

			expect(events.map((event) => event.step)).toEqual(["two", "three"]);
			expect(events[0].id).toBeLessThan(events[1].id);
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
				storageRoot: "work_dir",
				projectPath: "/p",
				feature: "feat",
			});
			upsertArtifact(db, {
				docId: "doc-afr-2",
				runId: "run-afr-other",
				path: "other.md",
				type: "markdown",
				storageRoot: "work_dir",
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
				storageRoot: "work_dir",
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

		test("normalizes legacy project-local .rp1/work artifacts to work_dir-relative paths", () => {
			const normalized = normalizeArtifactStorage(
				"/resolved/project/.rp1/work/features/feat/design.md",
				{
					rp1ProjectRoot: "/resolved/project",
					rp1WorkRoot: "/resolved/external-work",
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

		test("does not resolve persisted URL artifacts when caller omits location kind", async () => {
			const dbPath = join(tempDir, "artifact-resolve-url-partial.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));
			const projectRoot = join(tempDir, "project-url-partial");
			const workDir = join(tempDir, "external-url-work");
			const filePath = join(workDir, "features", "feat", "reviewed-pr.md");
			await mkdir(dirname(filePath), { recursive: true });
			writeFileSync(
				filePath,
				"---\nrp1_doc_id: link-reviewed-pr\n---\n# Not a link artifact\n",
			);

			insertRun(db, {
				id: "run-url-partial",
				flow: "pr-review",
				featureId: "feat",
				projectPath: projectRoot,
				rp1ProjectRoot: projectRoot,
				rp1KbRoot: join(projectRoot, ".rp1", "context"),
				rp1WorkRoot: workDir,
			});
			upsertArtifact(db, {
				docId: "link-reviewed-pr",
				runId: "run-url-partial",
				locationKind: "url",
				path: "features/feat/reviewed-pr.md",
				type: "link",
				storageRoot: "work_dir",
				url: "https://github.com/example/repo/pull/123",
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
					docId: "link-reviewed-pr",
					path: "features/feat/reviewed-pr.md",
					storageRoot: "work_dir",
				},
			);

			expect(resolvedPath).toBeNull();
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
			expect(artifact?.path).toBe("features/feat/design.md");
			expect(artifact?.storageRoot).toBe("work_dir");
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
				storageRoot: "work_dir",
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
				storageRoot: "work_dir",
				projectPath: "/p",
				feature: "feat",
			});
			upsertArtifact(db, {
				docId: "doc-and-2",
				runId: "run-and",
				path: "b.md",
				type: "markdown",
				storageRoot: "work_dir",
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
				storageRoot: "work_dir",
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
				storageRoot: "work_dir",
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
				storageRoot: "work_dir",
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
				storageRoot: "work_dir",
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
				storageRoot: "work_dir",
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

	describe("getProjectRunStatsByIds", () => {
		test("returns run count and last activity per project_id", async () => {
			const dbPath = join(tempDir, "project-stats-by-id.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			insertRun(db, {
				id: "run-si1",
				flow: "build",
				featureId: "feat",
				projectPath: "/project/alpha",
				projectId: "pid-alpha",
			});
			insertRun(db, {
				id: "run-si2",
				flow: "review",
				featureId: "feat",
				projectPath: "/project/alpha-alt",
				projectId: "pid-alpha",
			});
			insertRun(db, {
				id: "run-si3",
				flow: "build",
				featureId: "feat",
				projectPath: "/project/beta",
				projectId: "pid-beta",
			});

			const stats = getProjectRunStatsByIds(db, [
				"pid-alpha",
				"pid-beta",
				"pid-missing",
			]);

			expect(stats.get("pid-alpha")?.runCount).toBe(2);
			expect(stats.get("pid-alpha")?.lastActivityAt).toBeTruthy();
			expect(stats.get("pid-beta")?.runCount).toBe(1);
			expect(stats.get("pid-missing")?.runCount).toBe(0);
			expect(stats.get("pid-missing")?.lastActivityAt).toBeNull();
		});

		test("returns empty map for empty project id list", async () => {
			const dbPath = join(tempDir, "project-stats-by-id-empty.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			const stats = getProjectRunStatsByIds(db, []);

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
