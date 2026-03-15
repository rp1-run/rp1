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

INSERT INTO schema_version (version) VALUES (1);

CREATE TABLE IF NOT EXISTS runs (
    id TEXT PRIMARY KEY NOT NULL,
    flow TEXT NOT NULL,
    feature_id TEXT NOT NULL,
    project_path TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'not_started'
        CHECK(status IN ('not_started', 'running', 'waiting', 'completed', 'failed', 'skipped')),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_runs_project ON runs(project_path);
CREATE INDEX IF NOT EXISTS idx_runs_feature ON runs(project_path, feature_id);
CREATE INDEX IF NOT EXISTS idx_runs_status ON runs(status);

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

/** Cached database connection (singleton pattern). */
let dbInstance: Database | null = null;

/** Input for creating or retrieving a run */
export interface RunInput {
	readonly id: string;
	readonly flow: string;
	readonly featureId: string;
	readonly projectPath: string;
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
	readonly createdAt: string;
}

/** Input for upserting an annotation */
export interface AnnotationInput {
	readonly docId: string;
	readonly runId?: string;
	readonly content: string;
	readonly data?: string;
	readonly parentId?: number;
}

/** Stored annotation record shape */
export interface AnnotationRecord {
	readonly id: number;
	readonly docId: string;
	readonly runId: string | null;
	readonly content: string;
	readonly data: string | null;
	readonly parentId: number | null;
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
	created_at: string;
}

interface AnnotationRow {
	id: number;
	doc_id: string;
	run_id: string | null;
	content: string;
	data: string | null;
	parent_id: number | null;
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
	createdAt: row.created_at,
});

const annotationRowToRecord = (row: AnnotationRow): AnnotationRecord => ({
	id: row.id,
	docId: row.doc_id,
	runId: row.run_id,
	content: row.content,
	data: row.data,
	parentId: row.parent_id,
	createdAt: row.created_at,
	updatedAt: row.updated_at,
});

/**
 * Delete legacy status.db if present in the same directory as rp1.db.
 */
const cleanupLegacyDb = (dbPath: string): void => {
	const legacyPath = join(dirname(dbPath), "status.db");
	if (existsSync(legacyPath)) {
		unlinkSync(legacyPath);
		console.log("Removed legacy status.db");
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
			db.exec("PRAGMA foreign_keys = ON;");

			const tableCheck = db
				.prepare(
					"SELECT name FROM sqlite_master WHERE type='table' AND name='runs'",
				)
				.get();

			if (!tableCheck) {
				db.exec(SCHEMA_SQL);
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
 */
export const insertRun = (db: Database, input: RunInput): RunRecord => {
	const existing = db
		.prepare("SELECT * FROM runs WHERE id = $id")
		.get({ $id: input.id }) as RunRow | null;

	if (existing) {
		return runRowToRecord(existing);
	}

	const row = db
		.prepare(
			`INSERT INTO runs (id, flow, feature_id, project_path)
			 VALUES ($id, $flow, $featureId, $projectPath)
			 RETURNING *`,
		)
		.get({
			$id: input.id,
			$flow: input.flow,
			$featureId: input.featureId,
			$projectPath: input.projectPath,
		}) as RunRow;

	return runRowToRecord(row);
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
			`INSERT INTO artifacts (doc_id, run_id, path, type, project_path, feature, step)
			 VALUES ($docId, $runId, $path, $type, $projectPath, $feature, $step)
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
			`INSERT INTO annotations (doc_id, run_id, content, data, parent_id)
			 VALUES ($docId, $runId, $content, $data, $parentId)
			 RETURNING *`,
		)
		.get({
			$docId: input.docId,
			$runId: input.runId ?? null,
			$content: input.content,
			$data: input.data ?? null,
			$parentId: input.parentId ?? null,
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
 * Updates runs.status and runs.updated_at in place.
 */
export const deriveRunStatus = (db: Database, runId: string): Status => {
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
