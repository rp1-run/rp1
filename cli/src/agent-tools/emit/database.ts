/**
 * SQLite database layer for the rp1 event system.
 * Provides schema initialization, CRUD operations for runs/events/artifacts/annotations,
 * run status derivation, skipped-step detection, and legacy cleanup.
 */

import { Database } from "bun:sqlite";
import { existsSync, unlinkSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import * as TE from "fp-ts/lib/TaskEither.js";
import type { CLIError } from "../../../shared/errors.js";
import { runtimeError } from "../../../shared/errors.js";
import type {
	EventRecord,
	EventType,
	RunRecord,
	Status,
} from "../../../shared/events.js";

/** Default database file location. Override with RP1_DB env var. */
const DEFAULT_DB_PATH = process.env.RP1_DB ?? join(homedir(), ".rp1", "rp1.db");

/** Schema DDL for rp1.db (version 1, clean start) */
const SCHEMA_SQL = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schema_version (
    version INTEGER NOT NULL
);

INSERT INTO schema_version (version) VALUES (6);

CREATE TABLE IF NOT EXISTS runs (
    id TEXT PRIMARY KEY NOT NULL,
    flow TEXT NOT NULL,
    feature_id TEXT NOT NULL,
    project_path TEXT NOT NULL,
    name TEXT DEFAULT NULL,
    harness TEXT DEFAULT NULL,
    status TEXT NOT NULL DEFAULT 'not_started'
        CHECK(status IN ('not_started', 'running', 'waiting', 'completed', 'failed', 'skipped')),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_runs_project ON runs(project_path);
CREATE INDEX IF NOT EXISTS idx_runs_feature ON runs(project_path, feature_id);
CREATE INDEX IF NOT EXISTS idx_runs_status ON runs(status);
CREATE INDEX IF NOT EXISTS idx_runs_feature_status ON runs(project_path, feature_id, status);

CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id TEXT NOT NULL REFERENCES runs(id),
    type TEXT NOT NULL
        CHECK(type IN ('status_change', 'artifact_registered', 'annotation_updated',
                       'waiting_for_user', 'btw_update', 'subflow_registered')),
    step TEXT,
    unit TEXT,
    data TEXT,
    parent_step_id TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_events_run_id ON events(run_id);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(type);
CREATE INDEX IF NOT EXISTS idx_events_created ON events(created_at);
CREATE INDEX IF NOT EXISTS idx_events_run_step ON events(run_id, step);

CREATE TABLE IF NOT EXISTS artifacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    doc_id TEXT UNIQUE NOT NULL,
    run_id TEXT REFERENCES runs(id),
    path TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'other',
    project_path TEXT NOT NULL,
    feature TEXT NOT NULL,
    step TEXT,
    subflow INTEGER NOT NULL DEFAULT 0,
    baseline TEXT DEFAULT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_artifacts_doc_id ON artifacts(doc_id);
CREATE INDEX IF NOT EXISTS idx_artifacts_run ON artifacts(run_id);
CREATE INDEX IF NOT EXISTS idx_artifacts_project_feature ON artifacts(project_path, feature);

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

CREATE INDEX IF NOT EXISTS idx_annotations_doc_id ON annotations(doc_id);
CREATE INDEX IF NOT EXISTS idx_annotations_run ON annotations(run_id);
CREATE INDEX IF NOT EXISTS idx_annotations_parent ON annotations(parent_id);

CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    description TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK(status IN ('pending', 'in_progress', 'completed', 'failed', 'cancelled')),
    payload TEXT,
    project_path TEXT,
    result TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_status_created ON tasks(status, created_at);
CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_path);
CREATE INDEX IF NOT EXISTS idx_tasks_project_status ON tasks(project_path, status, created_at);
`;

/** Terminal statuses that indicate a run is no longer active */
const TERMINAL_STATUSES: readonly Status[] = ["completed", "failed", "skipped"];

/** Cached database connection (singleton pattern). */
let dbInstance: Database | null = null;

/** Input for finding or creating a run via resume-run */
export interface ResumeRunInput {
	readonly flow: string;
	readonly featureId: string;
	readonly projectPath: string;
}

/** Result of a find-or-create run operation */
export interface ResumeRunResult {
	readonly runId: string;
	readonly resumed: boolean;
}

/** Input for creating or retrieving a run */
export interface RunInput {
	readonly id: string;
	readonly flow: string;
	readonly featureId: string;
	readonly projectPath: string;
	readonly name?: string;
	readonly harness?: string;
}

/** Input for inserting an event */
export interface EventInput {
	readonly runId: string;
	readonly type: EventType;
	readonly step?: string;
	readonly unit?: string;
	readonly data?: string;
	readonly parentStepId?: string;
	readonly createdAt?: string;
}

/** Input for upserting an artifact */
export interface ArtifactInput {
	readonly docId: string;
	readonly runId?: string;
	readonly path: string;
	readonly type: string;
	readonly projectPath: string;
	readonly feature: string;
	readonly step?: string;
	readonly subflow?: boolean;
}

/** Stored artifact record shape */
export interface ArtifactRecord {
	readonly id: number;
	readonly docId: string;
	readonly runId: string | null;
	readonly path: string;
	readonly type: string;
	readonly projectPath: string;
	readonly feature: string;
	readonly step: string | null;
	readonly subflow: boolean;
	readonly createdAt: string;
}

/** Input for upserting an annotation */
export interface AnnotationInput {
	readonly docId: string;
	readonly runId?: string;
	readonly content: string;
	readonly data?: string;
	readonly parentId?: number;
	readonly status?: AnnotationStatus;
	readonly author?: string;
}

/** Annotation status */
export type AnnotationStatus = "open" | "resolved";

/** Stored annotation record shape */
export interface AnnotationRecord {
	readonly id: number;
	readonly docId: string;
	readonly runId: string | null;
	readonly content: string;
	readonly data: string | null;
	readonly parentId: number | null;
	readonly status: AnnotationStatus;
	readonly author: string;
	readonly createdAt: string;
	readonly updatedAt: string;
}

/** Step status entry from querying latest status per step */
export interface StepStatusEntry {
	readonly step: string;
	readonly status: Status;
}

/** Raw database row shapes (snake_case) */
interface RunRow {
	id: string;
	flow: string;
	feature_id: string;
	project_path: string;
	name: string | null;
	harness: string | null;
	status: string;
	created_at: string;
	updated_at: string;
}

interface EventRow {
	id: number;
	run_id: string;
	type: string;
	step: string | null;
	unit: string | null;
	data: string | null;
	parent_step_id: string | null;
	created_at: string;
}

interface ArtifactRow {
	id: number;
	doc_id: string;
	run_id: string | null;
	path: string;
	type: string;
	project_path: string;
	feature: string;
	step: string | null;
	subflow: number;
	created_at: string;
}

interface AnnotationRow {
	id: number;
	doc_id: string;
	run_id: string | null;
	content: string;
	data: string | null;
	parent_id: number | null;
	status: string;
	author: string;
	created_at: string;
	updated_at: string;
}

interface StepStatusRow {
	step: string;
	status: string;
}

const runRowToRecord = (row: RunRow): RunRecord => ({
	id: row.id,
	flow: row.flow,
	featureId: row.feature_id,
	projectPath: row.project_path,
	status: row.status as Status,
	name: row.name ?? null,
	harness: row.harness ?? null,
	createdAt: row.created_at,
	updatedAt: row.updated_at,
});

const eventRowToRecord = (row: EventRow): EventRecord => ({
	id: row.id,
	runId: row.run_id,
	type: row.type as EventType,
	step: row.step,
	unit: row.unit,
	data: row.data,
	parentStepId: row.parent_step_id,
	createdAt: row.created_at,
});

const artifactRowToRecord = (row: ArtifactRow): ArtifactRecord => ({
	id: row.id,
	docId: row.doc_id,
	runId: row.run_id,
	path: row.path,
	type: row.type,
	projectPath: row.project_path,
	feature: row.feature,
	step: row.step,
	subflow: !!row.subflow,
	createdAt: row.created_at,
});

const annotationRowToRecord = (row: AnnotationRow): AnnotationRecord => ({
	id: row.id,
	docId: row.doc_id,
	runId: row.run_id,
	content: row.content,
	data: row.data,
	parentId: row.parent_id,
	status: row.status as AnnotationStatus,
	author: row.author,
	createdAt: row.created_at,
	updatedAt: row.updated_at,
});

/**
 * Delete legacy status.db if present in the same directory as rp1.db.
 */
const cleanupLegacyDb = (dbPath: string): void => {
	const legacyPath = join(dirname(dbPath), "status.db");
	if (existsSync(legacyPath)) {
		try {
			unlinkSync(legacyPath);
			console.log("Removed legacy status.db");
		} catch {
			// Best-effort: skip if file is locked by another process
		}
	}
};

/**
 * Apply additive schema migrations based on the current schema version.
 * Each migration bumps the version to prevent re-application.
 */
const applyMigrations = (db: Database): void => {
	const versionRow = db
		.prepare("SELECT version FROM schema_version LIMIT 1")
		.get() as { version: number } | null;

	const currentVersion = versionRow?.version ?? 1;

	if (currentVersion < 2) {
		const columns = db.prepare("PRAGMA table_info(annotations)").all() as {
			name: string;
		}[];
		const columnNames = columns.map((c) => c.name);

		if (!columnNames.includes("status")) {
			db.exec(
				"ALTER TABLE annotations ADD COLUMN status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'resolved'))",
			);
		}
		if (!columnNames.includes("author")) {
			db.exec(
				"ALTER TABLE annotations ADD COLUMN author TEXT NOT NULL DEFAULT 'user'",
			);
		}

		db.prepare("UPDATE schema_version SET version = 2").run();
	}

	const postV1Version = db
		.prepare("SELECT version FROM schema_version LIMIT 1")
		.get() as { version: number } | null;

	if ((postV1Version?.version ?? 2) < 3) {
		const columns = db.prepare("PRAGMA table_info(artifacts)").all() as {
			name: string;
		}[];
		const columnNames = columns.map((c) => c.name);

		if (!columnNames.includes("subflow")) {
			db.exec(
				"ALTER TABLE artifacts ADD COLUMN subflow INTEGER NOT NULL DEFAULT 0",
			);
		}

		db.prepare("UPDATE schema_version SET version = 3").run();
	}

	const postV2Version = db
		.prepare("SELECT version FROM schema_version LIMIT 1")
		.get() as { version: number } | null;

	if ((postV2Version?.version ?? 3) < 4) {
		const columns = db.prepare("PRAGMA table_info(artifacts)").all() as {
			name: string;
		}[];
		const columnNames = columns.map((c) => c.name);

		if (!columnNames.includes("baseline")) {
			db.exec("ALTER TABLE artifacts ADD COLUMN baseline TEXT DEFAULT NULL");
		}

		db.exec(
			"DELETE FROM annotations WHERE json_extract(data, '$.type') = 'edit-diff'",
		);

		db.prepare("UPDATE schema_version SET version = 4").run();
	}

	const postV3Version = db
		.prepare("SELECT version FROM schema_version LIMIT 1")
		.get() as { version: number } | null;

	if ((postV3Version?.version ?? 4) < 5) {
		const columns = db.prepare("PRAGMA table_info(runs)").all() as {
			name: string;
		}[];
		const columnNames = columns.map((c) => c.name);

		if (!columnNames.includes("name")) {
			db.exec("ALTER TABLE runs ADD COLUMN name TEXT DEFAULT NULL");
		}

		db.prepare("UPDATE schema_version SET version = 5").run();
	}

	const postV4Version = db
		.prepare("SELECT version FROM schema_version LIMIT 1")
		.get() as { version: number } | null;

	if ((postV4Version?.version ?? 5) < 6) {
		const columns = db.prepare("PRAGMA table_info(runs)").all() as {
			name: string;
		}[];
		const columnNames = columns.map((c) => c.name);

		if (!columnNames.includes("harness")) {
			db.exec("ALTER TABLE runs ADD COLUMN harness TEXT DEFAULT NULL");
		}

		db.prepare("UPDATE schema_version SET version = 6").run();
	}
};

/**
 * Get or create the emit database connection.
 * Initializes schema on first connection and cleans up legacy status.db.
 */
export const getEmitDatabase = (
	dbPath: string = DEFAULT_DB_PATH,
): TE.TaskEither<CLIError, Database> =>
	TE.tryCatch(
		async () => {
			if (dbInstance) {
				return dbInstance;
			}

			const dir = dirname(dbPath);
			await mkdir(dir, { recursive: true });

			const db = new Database(dbPath, { create: true });

			db.exec("PRAGMA journal_mode = WAL;");
			db.exec("PRAGMA busy_timeout = 5000;");
			db.exec("PRAGMA foreign_keys = ON;");

			const tableCheck = db
				.prepare(
					"SELECT name FROM sqlite_master WHERE type='table' AND name='runs'",
				)
				.get();

			if (!tableCheck) {
				db.exec(SCHEMA_SQL);
				applyMigrations(db);
			} else {
				db.exec(
					"CREATE INDEX IF NOT EXISTS idx_runs_feature_status ON runs(project_path, feature_id, status);",
				);
				applyMigrations(db);
			}

			cleanupLegacyDb(dbPath);

			dbInstance = db;
			return db;
		},
		(error) =>
			runtimeError(
				`Failed to initialize emit database: ${error instanceof Error ? error.message : String(error)}`,
			),
	);

/**
 * Insert a run record or return the existing one if the ID is already present.
 * If the run exists with "unknown" flow or feature_id, updates them from input.
 */
export const insertRun = (db: Database, input: RunInput): RunRecord => {
	const existing = db
		.prepare("SELECT * FROM runs WHERE id = $id")
		.get({ $id: input.id }) as RunRow | null;

	if (existing) {
		const updates: string[] = [];
		const params: Record<string, string> = { $id: input.id };

		if (existing.flow === "unknown" && input.flow !== "unknown") {
			updates.push("flow = $flow");
			params.$flow = input.flow;
		}

		if (existing.feature_id === "unknown" && input.featureId !== "unknown") {
			updates.push("feature_id = $featureId");
			params.$featureId = input.featureId;
		}

		if (existing.name === null && input.name != null) {
			updates.push("name = $name");
			params.$name = input.name;
		}

		if (existing.harness === null && input.harness != null) {
			updates.push("harness = $harness");
			params.$harness = input.harness;
		}

		if (updates.length > 0) {
			updates.push("updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')");
			db.prepare(`UPDATE runs SET ${updates.join(", ")} WHERE id = $id`).run(
				params,
			);
			const updated = db
				.prepare("SELECT * FROM runs WHERE id = $id")
				.get({ $id: input.id }) as RunRow;
			return runRowToRecord(updated);
		}

		return runRowToRecord(existing);
	}

	const row = db
		.prepare(
			`INSERT INTO runs (id, flow, feature_id, project_path, name, harness)
			 VALUES ($id, $flow, $featureId, $projectPath, $name, $harness)
			 RETURNING *`,
		)
		.get({
			$id: input.id,
			$flow: input.flow,
			$featureId: input.featureId,
			$projectPath: input.projectPath,
			$name: input.name ?? null,
			$harness: input.harness ?? null,
		}) as RunRow;

	return runRowToRecord(row);
};

/**
 * Find the most recent non-terminal run for a feature, or create a new one.
 * Uses indexed query on (project_path, feature_id) + status filter.
 */
export const findOrCreateRun = (
	db: Database,
	input: ResumeRunInput,
): ResumeRunResult => {
	const terminalPlaceholders = TERMINAL_STATUSES.map(() => "?").join(", ");

	const existing = db
		.prepare(
			`SELECT * FROM runs
			 WHERE feature_id = ?
			   AND flow = ?
			   AND project_path = ?
			   AND status NOT IN (${terminalPlaceholders})
			 ORDER BY created_at DESC
			 LIMIT 1`,
		)
		.get(
			input.featureId,
			input.flow,
			input.projectPath,
			...TERMINAL_STATUSES,
		) as RunRow | null;

	if (existing) {
		return { runId: existing.id, resumed: true };
	}

	const legacyUnknown = db
		.prepare(
			`SELECT * FROM runs
			 WHERE feature_id = ?
			   AND flow = 'unknown'
			   AND project_path = ?
			   AND status NOT IN (${terminalPlaceholders})
			 ORDER BY created_at DESC
			 LIMIT 1`,
		)
		.get(
			input.featureId,
			input.projectPath,
			...TERMINAL_STATUSES,
		) as RunRow | null;

	if (legacyUnknown) {
		db.prepare(
			`UPDATE runs
			 SET flow = ?,
			     updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
			 WHERE id = ?`,
		).run(input.flow, legacyUnknown.id);
		return { runId: legacyUnknown.id, resumed: true };
	}

	const newId = crypto.randomUUID();
	db.prepare(
		`INSERT INTO runs (id, flow, feature_id, project_path, harness)
		 VALUES ($id, $flow, $featureId, $projectPath, NULL)`,
	).run({
		$id: newId,
		$flow: input.flow,
		$featureId: input.featureId,
		$projectPath: input.projectPath,
	});

	return { runId: newId, resumed: false };
};

/**
 * Append an event to the events table.
 */
export const insertEvent = (db: Database, input: EventInput): EventRecord => {
	const row = db
		.prepare(
			`INSERT INTO events (run_id, type, step, unit, data, parent_step_id, created_at)
			 VALUES ($runId, $type, $step, $unit, $data, $parentStepId,
			         COALESCE($createdAt, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')))
			 RETURNING *`,
		)
		.get({
			$runId: input.runId,
			$type: input.type,
			$step: input.step ?? null,
			$unit: input.unit ?? null,
			$data: input.data ?? null,
			$parentStepId: input.parentStepId ?? null,
			$createdAt: input.createdAt ?? null,
		}) as EventRow;

	return eventRowToRecord(row);
};

/**
 * Insert an artifact with doc_id, or return the existing record if doc_id is already present.
 */
export const upsertArtifact = (
	db: Database,
	input: ArtifactInput,
): ArtifactRecord => {
	const existing = db
		.prepare("SELECT * FROM artifacts WHERE doc_id = $docId")
		.get({ $docId: input.docId }) as ArtifactRow | null;

	if (existing) {
		return artifactRowToRecord(existing);
	}

	const row = db
		.prepare(
			`INSERT INTO artifacts (doc_id, run_id, path, type, project_path, feature, step, subflow)
			 VALUES ($docId, $runId, $path, $type, $projectPath, $feature, $step, $subflow)
			 RETURNING *`,
		)
		.get({
			$docId: input.docId,
			$runId: input.runId ?? null,
			$path: input.path,
			$type: input.type,
			$projectPath: input.projectPath,
			$feature: input.feature,
			$step: input.step ?? null,
			$subflow: input.subflow ? 1 : 0,
		}) as ArtifactRow;

	return artifactRowToRecord(row);
};

/**
 * Insert or update an annotation with FK to artifacts.doc_id.
 */
export const upsertAnnotation = (
	db: Database,
	input: AnnotationInput,
): AnnotationRecord => {
	const row = db
		.prepare(
			`INSERT INTO annotations (doc_id, run_id, content, data, parent_id, status, author)
			 VALUES ($docId, $runId, $content, $data, $parentId, $status, $author)
			 RETURNING *`,
		)
		.get({
			$docId: input.docId,
			$runId: input.runId ?? null,
			$content: input.content,
			$data: input.data ?? null,
			$parentId: input.parentId ?? null,
			$status: input.status ?? "open",
			$author: input.author ?? "user",
		}) as AnnotationRow;

	return annotationRowToRecord(row);
};

/**
 * Query the latest status_change event per step for a run.
 * Returns the most recent status for each unique step.
 */
export const getStepStatuses = (
	db: Database,
	runId: string,
): StepStatusEntry[] => {
	const rows = db
		.prepare(
			`SELECT e.step, json_extract(e.data, '$.status') as status
			 FROM events e
			 INNER JOIN (
			     SELECT step, MAX(id) as max_id
			     FROM events
			     WHERE run_id = $runId AND type = 'status_change' AND step IS NOT NULL
			     GROUP BY step
			 ) latest ON e.id = latest.max_id
			 WHERE e.run_id = $runId`,
		)
		.all({ $runId: runId }) as StepStatusRow[];

	return rows.map((row) => ({
		step: row.step,
		status: row.status as Status,
	}));
};

/**
 * Derive the run status from constituent step statuses using priority rules:
 * failed > running > waiting > not_started > completed/skipped
 *
 * When closeRun is true, all non-terminal steps (running, waiting, not_started)
 * are force-completed before derivation, ensuring the run reaches a terminal state.
 *
 * Updates runs.status and runs.updated_at in place.
 */
export const deriveRunStatus = (
	db: Database,
	runId: string,
	closeRun = false,
): Status => {
	if (closeRun) {
		const stepStatuses = getStepStatuses(db, runId);
		const now = new Date().toISOString();
		for (const entry of stepStatuses) {
			if (
				entry.status === "running" ||
				entry.status === "waiting" ||
				entry.status === "not_started"
			) {
				insertEvent(db, {
					runId,
					type: "status_change",
					step: entry.step,
					data: JSON.stringify({ status: "completed" }),
					createdAt: now,
				});
			}
		}
	}

	const stepStatuses = getStepStatuses(db, runId);

	if (stepStatuses.length === 0) {
		return "not_started";
	}

	const statuses = stepStatuses.map((s) => s.status);

	let derived: Status;
	if (statuses.includes("failed")) {
		derived = "failed";
	} else if (statuses.includes("running")) {
		derived = "running";
	} else if (statuses.includes("waiting")) {
		derived = "waiting";
	} else if (statuses.every((s) => s === "completed" || s === "skipped")) {
		derived = "completed";
	} else {
		derived = "not_started";
	}

	db.prepare(
		`UPDATE runs
		 SET status = $status, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
		 WHERE id = $runId`,
	).run({ $status: derived, $runId: runId });

	return derived;
};

/**
 * Find prior steps (from an ordered step list) that have no status_change events for this run.
 * Used for skipped-step detection.
 *
 * @param db - Database connection
 * @param runId - The run to check
 * @param orderedSteps - All steps in order from the state machine
 * @param currentStep - The step being reported
 * @returns Names of steps that should be marked as skipped
 */
export const getSkippableSteps = (
	db: Database,
	runId: string,
	orderedSteps: readonly string[],
	currentStep: string,
): string[] => {
	const currentIndex = orderedSteps.indexOf(currentStep);
	if (currentIndex <= 0) {
		return [];
	}

	const priorSteps = orderedSteps.slice(0, currentIndex);
	const skippable: string[] = [];

	for (const step of priorSteps) {
		const existing = db
			.prepare(
				`SELECT 1 FROM events
				 WHERE run_id = $runId AND type = 'status_change' AND step = $step
				 LIMIT 1`,
			)
			.get({ $runId: runId, $step: step });

		if (!existing) {
			skippable.push(step);
		}
	}

	return skippable;
};

/**
 * Get events after a given ID, ordered chronologically.
 * Used by daemon startup recovery and WebSocket replay.
 */
export const getEventsSince = (
	db: Database,
	afterId: number,
	limit?: number,
): EventRecord[] => {
	if (limit != null) {
		const rows = db
			.prepare(
				"SELECT * FROM events WHERE id > $afterId ORDER BY id ASC LIMIT $limit",
			)
			.all({ $afterId: afterId, $limit: limit }) as EventRow[];
		return rows.map(eventRowToRecord);
	}

	const rows = db
		.prepare("SELECT * FROM events WHERE id > $afterId ORDER BY id ASC")
		.all({ $afterId: afterId }) as EventRow[];
	return rows.map(eventRowToRecord);
};

/**
 * Count events after a given ID.
 */
export const countEventsSince = (db: Database, afterId: number): number => {
	const row = db
		.prepare("SELECT COUNT(*) as count FROM events WHERE id > $afterId")
		.get({ $afterId: afterId }) as { count: number };
	return row.count;
};

/** Snapshot of an active run with its steps and artifacts */
export interface ActiveRunSnapshot {
	readonly id: string;
	readonly flow: string;
	readonly featureId: string;
	readonly projectPath: string;
	readonly status: Status;
	readonly steps: readonly { step: string; status: Status }[];
	readonly artifacts: readonly {
		docId: string;
		path: string;
		type: string;
	}[];
}

/**
 * Build a snapshot of all active (non-terminal) runs with their steps and artifacts.
 */
export const getActiveRunsSnapshot = (db: Database): ActiveRunSnapshot[] => {
	const terminalPlaceholders = TERMINAL_STATUSES.map(() => "?").join(", ");

	const runRows = db
		.prepare(
			`SELECT * FROM runs
			 WHERE status NOT IN (${terminalPlaceholders})
			 ORDER BY created_at DESC`,
		)
		.all(...TERMINAL_STATUSES) as RunRow[];

	return runRows.map((runRow) => {
		const steps = getStepStatuses(db, runRow.id);

		const artifactRows = db
			.prepare("SELECT * FROM artifacts WHERE run_id = $runId")
			.all({ $runId: runRow.id }) as ArtifactRow[];

		const artifacts = artifactRows.map((a) => ({
			docId: a.doc_id,
			path: a.path,
			type: a.type,
		}));

		return {
			id: runRow.id,
			flow: runRow.flow,
			featureId: runRow.feature_id,
			projectPath: runRow.project_path,
			status: runRow.status as Status,
			steps,
			artifacts,
		};
	});
};

/**
 * Get the highest event ID currently in the database.
 * Returns 0 if no events exist.
 */
export const getMaxEventId = (db: Database): number => {
	const row = db.prepare("SELECT MAX(id) as max_id FROM events").get() as {
		max_id: number | null;
	};

	return row.max_id ?? 0;
};

/** Options for listing runs with optional filters and pagination */
export interface ListRunsOptions {
	readonly projectPath?: string;
	readonly projectPaths?: readonly string[];
	readonly status?: Status;
	readonly limit?: number;
	readonly offset?: number;
}

/** Paginated result for run listing */
export interface ListRunsResult {
	readonly records: RunRecord[];
	readonly total: number;
}

/** Project-level run statistics */
export interface ProjectRunStats {
	readonly runCount: number;
	readonly lastActivityAt: string | null;
}

/** Runs grouped by attention-requiring status */
export interface AttentionRuns {
	readonly waiting: RunRecord[];
	readonly failed: RunRecord[];
	readonly running: RunRecord[];
}

/**
 * List runs with optional filtering by project path, status, and pagination.
 */
export const listRuns = (
	db: Database,
	opts: ListRunsOptions = {},
): ListRunsResult => {
	const conditions: string[] = [];
	const filterValues: (string | number)[] = [];

	if (opts.projectPath != null) {
		conditions.push("project_path = ?");
		filterValues.push(opts.projectPath);
	} else if (opts.projectPaths != null && opts.projectPaths.length > 0) {
		const placeholders = opts.projectPaths.map(() => "?").join(", ");
		conditions.push(`project_path IN (${placeholders})`);
		filterValues.push(...opts.projectPaths);
	}
	if (opts.status != null) {
		conditions.push("status = ?");
		filterValues.push(opts.status);
	}

	const whereClause =
		conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

	const countRow = db
		.prepare(`SELECT COUNT(*) as count FROM runs ${whereClause}`)
		.get(...filterValues) as { count: number };

	const limit = opts.limit ?? 100;
	const offset = opts.offset ?? 0;

	const rows = db
		.prepare(
			`SELECT * FROM runs ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
		)
		.all(...filterValues, limit, offset) as RunRow[];

	return {
		records: rows.map(runRowToRecord),
		total: countRow.count,
	};
};

/**
 * Get a single run by its UUID id.
 */
export const getRunById = (db: Database, runId: string): RunRecord | null => {
	const row = db
		.prepare("SELECT * FROM runs WHERE id = $id")
		.get({ $id: runId }) as RunRow | null;

	return row ? runRowToRecord(row) : null;
};

/**
 * Get all events for a run, ordered chronologically.
 */
export const getEventsForRun = (db: Database, runId: string): EventRecord[] => {
	const rows = db
		.prepare(
			"SELECT * FROM events WHERE run_id = $runId ORDER BY created_at ASC, id ASC",
		)
		.all({ $runId: runId }) as EventRow[];

	return rows.map(eventRowToRecord);
};

/**
 * Get all artifacts for a run.
 */
export const getArtifactsForRun = (
	db: Database,
	runId: string,
): ArtifactRecord[] => {
	const rows = db
		.prepare(
			"SELECT * FROM artifacts WHERE run_id = $runId ORDER BY created_at ASC",
		)
		.all({ $runId: runId }) as ArtifactRow[];

	return rows.map(artifactRowToRecord);
};

/**
 * Get a single artifact by its doc_id.
 */
export const getArtifactByDocId = (
	db: Database,
	docId: string,
): ArtifactRecord | null => {
	const row = db
		.prepare("SELECT * FROM artifacts WHERE doc_id = $docId")
		.get({ $docId: docId }) as ArtifactRow | null;

	return row ? artifactRowToRecord(row) : null;
};

/**
 * Get the baseline content and path info for an artifact by doc_id.
 */
export const getArtifactBaseline = (
	db: Database,
	docId: string,
): { baseline: string | null; path: string; projectPath: string } | null => {
	const row = db
		.prepare(
			"SELECT baseline, path, project_path FROM artifacts WHERE doc_id = $docId",
		)
		.get({ $docId: docId }) as {
		baseline: string | null;
		path: string;
		project_path: string;
	} | null;

	if (!row) return null;

	return {
		baseline: row.baseline,
		path: row.path,
		projectPath: row.project_path,
	};
};

/**
 * Store baseline content for an artifact.
 */
export const setArtifactBaseline = (
	db: Database,
	docId: string,
	baseline: string,
): void => {
	db.prepare(
		"UPDATE artifacts SET baseline = $baseline WHERE doc_id = $docId",
	).run({ $baseline: baseline, $docId: docId });
};

/**
 * Clear the baseline content for an artifact, signaling that the agent
 * has acknowledged a user edit. Sets baseline to NULL for the given doc_id.
 */
export const clearArtifactBaseline = (db: Database, docId: string): void => {
	db.prepare("UPDATE artifacts SET baseline = NULL WHERE doc_id = $docId").run({
		$docId: docId,
	});
};

/**
 * Update the cached path for an artifact identified by doc_id.
 * Used when path reconciliation discovers the file has moved.
 */
export const updateArtifactPath = (
	db: Database,
	docId: string,
	newPath: string,
): void => {
	db.prepare("UPDATE artifacts SET path = $path WHERE doc_id = $docId").run({
		$path: newPath,
		$docId: docId,
	});
};

/**
 * Look up an artifact by run_id and doc_id (fallback when path-based lookup misses).
 */
export const getArtifactByRunAndDocId = (
	db: Database,
	runId: string,
	docId: string,
): ArtifactRecord | null => {
	const row = db
		.prepare(
			"SELECT * FROM artifacts WHERE run_id = $runId AND doc_id = $docId LIMIT 1",
		)
		.get({ $runId: runId, $docId: docId }) as ArtifactRow | null;

	return row ? artifactRowToRecord(row) : null;
};

/**
 * Get annotations for a specific run.
 */
export const getAnnotationsForRun = (
	db: Database,
	runId: string,
): AnnotationRecord[] => {
	const rows = db
		.prepare(
			`SELECT DISTINCT a.* FROM annotations a
			 LEFT JOIN artifacts art ON a.doc_id = art.doc_id
			 WHERE a.run_id = $runId
			    OR (a.run_id IS NULL AND art.run_id = $runId)
			 ORDER BY a.created_at ASC`,
		)
		.all({ $runId: runId }) as AnnotationRow[];

	return rows.map(annotationRowToRecord);
};

/**
 * Get annotations for a run, filtered by status.
 * When status is "all", delegates to getAnnotationsForRun.
 */
export const getAnnotationsForRunFiltered = (
	db: Database,
	runId: string,
	status: "open" | "resolved" | "all",
): AnnotationRecord[] => {
	if (status === "all") {
		return getAnnotationsForRun(db, runId);
	}
	const rows = db
		.prepare(
			`SELECT DISTINCT a.* FROM annotations a
			 LEFT JOIN artifacts art ON a.doc_id = art.doc_id
			 WHERE (a.run_id = $runId OR (a.run_id IS NULL AND art.run_id = $runId))
			   AND a.status = $status
			 ORDER BY a.created_at ASC`,
		)
		.all({ $runId: runId, $status: status }) as AnnotationRow[];

	return rows.map(annotationRowToRecord);
};

/**
 * Get annotations for a specific artifact doc_id.
 */
export const getAnnotationsForDocId = (
	db: Database,
	docId: string,
): AnnotationRecord[] => {
	const rows = db
		.prepare(
			"SELECT * FROM annotations WHERE doc_id = $docId ORDER BY created_at ASC",
		)
		.all({ $docId: docId }) as AnnotationRow[];

	return rows.map(annotationRowToRecord);
};

/**
 * Get a single annotation by its ID.
 */
export const getAnnotationById = (
	db: Database,
	id: number,
): AnnotationRecord | null => {
	const row = db
		.prepare("SELECT * FROM annotations WHERE id = $id")
		.get({ $id: id }) as AnnotationRow | null;

	return row ? annotationRowToRecord(row) : null;
};

/**
 * Update an annotation's content and/or data.
 * Returns the updated record.
 */
export const updateAnnotation = (
	db: Database,
	id: number,
	updates: {
		readonly content?: string;
		readonly data?: string;
		readonly status?: AnnotationStatus;
	},
): AnnotationRecord => {
	const setClauses: string[] = [
		"updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')",
	];
	const values: (string | number)[] = [];

	if (updates.content != null) {
		setClauses.push("content = ?");
		values.push(updates.content);
	}
	if (updates.data != null) {
		setClauses.push("data = ?");
		values.push(updates.data);
	}
	if (updates.status != null) {
		setClauses.push("status = ?");
		values.push(updates.status);
	}

	values.push(id);

	const row = db
		.prepare(
			`UPDATE annotations SET ${setClauses.join(", ")} WHERE id = ? RETURNING *`,
		)
		.get(...values) as AnnotationRow;

	return annotationRowToRecord(row);
};

/**
 * Delete an annotation by its ID.
 */
export const deleteAnnotation = (db: Database, id: number): void => {
	db.prepare("DELETE FROM annotations WHERE id = $id").run({ $id: id });
};

/**
 * Get run statistics per project path: run count and last activity timestamp.
 */
export const getProjectRunStats = (
	db: Database,
	projectPaths: string[],
): Map<string, ProjectRunStats> => {
	const result = new Map<string, ProjectRunStats>();

	if (projectPaths.length === 0) {
		return result;
	}

	const placeholders = projectPaths.map(() => "?").join(", ");

	const rows = db
		.prepare(
			`SELECT project_path, COUNT(*) as run_count, MAX(updated_at) as last_activity_at
			 FROM runs
			 WHERE project_path IN (${placeholders})
			 GROUP BY project_path`,
		)
		.all(...projectPaths) as {
		project_path: string;
		run_count: number;
		last_activity_at: string | null;
	}[];

	for (const row of rows) {
		result.set(row.project_path, {
			runCount: row.run_count,
			lastActivityAt: row.last_activity_at,
		});
	}

	for (const path of projectPaths) {
		if (!result.has(path)) {
			result.set(path, { runCount: 0, lastActivityAt: null });
		}
	}

	return result;
};

/**
 * Get runs grouped by attention-requiring status (waiting, failed, running).
 */
export const getRunsByAttentionStatus = (db: Database): AttentionRuns => {
	const rows = db
		.prepare(
			`SELECT * FROM runs
			 WHERE status IN ('waiting', 'failed', 'running')
			 ORDER BY updated_at DESC`,
		)
		.all() as RunRow[];

	const waiting: RunRecord[] = [];
	const failed: RunRecord[] = [];
	const running: RunRecord[] = [];

	for (const row of rows) {
		const record = runRowToRecord(row);
		switch (row.status) {
			case "waiting":
				waiting.push(record);
				break;
			case "failed":
				failed.push(record);
				break;
			case "running":
				running.push(record);
				break;
		}
	}

	return { waiting, failed, running };
};

/**
 * Close the database connection and reset the singleton.
 */
export const closeDatabase = (): void => {
	if (dbInstance) {
		dbInstance.close();
		dbInstance = null;
	}
};

/**
 * Reset the singleton instance (for testing purposes).
 * Does not close the connection -- use closeDatabase() for cleanup.
 */
export const resetInstance = (): void => {
	dbInstance = null;
};
