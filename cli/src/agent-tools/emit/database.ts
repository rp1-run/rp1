/**
 * SQLite database layer for the rp1 event system.
 * Provides schema initialization, CRUD operations for runs/events/artifacts/annotations,
 * run status derivation, skipped-step detection, and legacy cleanup.
 */

import { Database } from "bun:sqlite";
import { existsSync, unlinkSync } from "node:fs";
import { mkdir, readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import * as E from "fp-ts/lib/Either.js";
import * as TE from "fp-ts/lib/TaskEither.js";
import type { CLIError } from "../../../shared/errors.js";
import { runtimeError } from "../../../shared/errors.js";
import type {
	EventRecord,
	EventType,
	RunRecord,
	Status,
	WorkflowRunPolicy,
} from "../../../shared/events.js";
import {
	isTerminalRunStatus,
	LIVE_ATTENTION_STATUSES,
	RUN_STATUS_CHECK_STATUSES,
	TERMINAL_RUN_STATUSES,
} from "../../../shared/events.js";
import {
	getLogicalStepKey,
	isNamespacedLifecycleStep,
} from "../../../shared/logical-step.js";
import { readProjectId } from "../../../shared/project-id.js";

/** Default database file location. Override with RP1_DB env var. */
const getDefaultDbPath = (): string =>
	process.env.RP1_DB ?? join(homedir(), ".rp1", "rp1.db");

const RUN_STATUS_CHECK_SQL = RUN_STATUS_CHECK_STATUSES.map(
	(status) => `'${status}'`,
).join(", ");

// Socratic Duel ownership is cyclic by design: participants belong to a duel,
// and a duel's current owner points at one participant. SQLite permits the
// forward reference; migrations validate the resulting graph with FK checks.
const SOCRATIC_DUEL_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS socratic_duels (
    id TEXT PRIMARY KEY NOT NULL,
    target_path TEXT NOT NULL,
    target_key TEXT NOT NULL,
    topic TEXT DEFAULT NULL,
    topic_slug TEXT DEFAULT NULL,
    debate_path TEXT DEFAULT NULL,
    status TEXT NOT NULL DEFAULT 'ACTIVE'
        CHECK(status IN ('ACTIVE', 'CLOSED')),
    current_owner_id TEXT DEFAULT NULL REFERENCES socratic_duel_participants(id) ON DELETE SET NULL,
    lease_token TEXT DEFAULT NULL,
    lease_expires_at TEXT DEFAULT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS socratic_duel_participants (
    id TEXT PRIMARY KEY NOT NULL,
    duel_id TEXT NOT NULL REFERENCES socratic_duels(id) ON DELETE CASCADE,
    display_name TEXT NOT NULL,
    harness TEXT NOT NULL,
    model_id TEXT NOT NULL,
    joined_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    last_seen_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_socratic_duels_target_status ON socratic_duels(target_key, status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_socratic_duels_active_target ON socratic_duels(target_key) WHERE status = 'ACTIVE';
CREATE INDEX IF NOT EXISTS idx_socratic_duels_lease ON socratic_duels(status, current_owner_id, lease_expires_at);
CREATE INDEX IF NOT EXISTS idx_socratic_duel_participants_duel ON socratic_duel_participants(duel_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_socratic_duel_participants_identity ON socratic_duel_participants(duel_id, display_name, harness, model_id);
`;

const ACTIVITY_SEARCH_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS activity_search_runs (
    run_id TEXT PRIMARY KEY NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
    project_id TEXT DEFAULT NULL,
    project_root TEXT NOT NULL,
    flow TEXT NOT NULL,
    status TEXT NOT NULL
        CHECK(status IN (${RUN_STATUS_CHECK_SQL})),
    activity_at TEXT NOT NULL,
    source_event_id INTEGER DEFAULT NULL,
    source_run_updated_at TEXT NOT NULL,
    search_text TEXT NOT NULL,
    indexed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_activity_search_project_activity ON activity_search_runs(project_id, activity_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_search_root_activity ON activity_search_runs(project_root, activity_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_search_status_activity ON activity_search_runs(status, activity_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_search_activity ON activity_search_runs(activity_at DESC);
`;

/** Schema DDL for rp1.db (version 1, clean start) */
const SCHEMA_SQL = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schema_version (
    version INTEGER NOT NULL
);

INSERT INTO schema_version (version) VALUES (17);

CREATE TABLE IF NOT EXISTS runs (
    id TEXT PRIMARY KEY NOT NULL,
    flow TEXT NOT NULL,
    feature_id TEXT NOT NULL,
    project_path TEXT NOT NULL,
    rp1_project_root TEXT NOT NULL,
    rp1_kb_root TEXT NOT NULL,
    rp1_work_root TEXT NOT NULL,
    project_id TEXT DEFAULT NULL,
    run_policy TEXT DEFAULT NULL
        CHECK(run_policy IN ('fresh', 'resumable')),
    work_identity TEXT DEFAULT NULL,
    bootstrap_context TEXT DEFAULT NULL,
    name TEXT DEFAULT NULL,
    harness TEXT DEFAULT NULL,
    status TEXT NOT NULL DEFAULT 'not_started'
        CHECK(status IN (${RUN_STATUS_CHECK_SQL})),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_runs_project ON runs(project_path);
CREATE INDEX IF NOT EXISTS idx_runs_feature ON runs(project_path, feature_id);
CREATE INDEX IF NOT EXISTS idx_runs_status ON runs(status);
CREATE INDEX IF NOT EXISTS idx_runs_status_updated ON runs(status, updated_at);
CREATE INDEX IF NOT EXISTS idx_runs_feature_status ON runs(project_path, feature_id, status);
CREATE INDEX IF NOT EXISTS idx_runs_project_id ON runs(project_id);
CREATE INDEX IF NOT EXISTS idx_runs_project_work_identity_status ON runs(project_id, flow, work_identity, status);
CREATE INDEX IF NOT EXISTS idx_runs_root_work_identity_status ON runs(rp1_project_root, flow, work_identity, status);

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
    storage_root TEXT NOT NULL DEFAULT 'work_dir'
        CHECK(storage_root IN ('absolute', 'project', 'work_dir')),
    project_path TEXT NOT NULL,
    project_id TEXT DEFAULT NULL,
    feature TEXT NOT NULL,
    step TEXT,
    subflow INTEGER NOT NULL DEFAULT 0,
    baseline TEXT DEFAULT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_artifacts_doc_id ON artifacts(doc_id);
CREATE INDEX IF NOT EXISTS idx_artifacts_run ON artifacts(run_id);
CREATE INDEX IF NOT EXISTS idx_artifacts_project_feature ON artifacts(project_path, feature);
CREATE INDEX IF NOT EXISTS idx_artifacts_project_id ON artifacts(project_id);

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
    project_id TEXT DEFAULT NULL,
    result TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_status_created ON tasks(status, created_at);
CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_path);
CREATE INDEX IF NOT EXISTS idx_tasks_project_status ON tasks(project_path, status, created_at);
CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON tasks(project_id);

CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    message TEXT NOT NULL,
    source_type TEXT NOT NULL DEFAULT 'run'
        CHECK(source_type IN ('run', 'agent', 'system')),
    source_id TEXT,
    route TEXT,
    project_id TEXT,
    dismissed INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_notifications_dismissed ON notifications(dismissed);
CREATE INDEX IF NOT EXISTS idx_notifications_project ON notifications(project_id);
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at);
CREATE INDEX IF NOT EXISTS idx_notifications_project_dismissed ON notifications(project_id, dismissed, created_at);

CREATE TABLE IF NOT EXISTS projects (
    id TEXT NOT NULL UNIQUE,
    project_id TEXT,
    path TEXT NOT NULL,
    name TEXT NOT NULL,
    added_at TEXT NOT NULL,
    last_accessed_at TEXT NOT NULL,
    available INTEGER NOT NULL DEFAULT 1
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_path ON projects(path);
CREATE INDEX IF NOT EXISTS idx_projects_project_id ON projects(project_id);
CREATE INDEX IF NOT EXISTS idx_projects_last_accessed ON projects(last_accessed_at);

CREATE TABLE IF NOT EXISTS project_registry_meta (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT
);

${ACTIVITY_SEARCH_SCHEMA_SQL}

${SOCRATIC_DUEL_SCHEMA_SQL}
`;

/** Terminal statuses that indicate a run is no longer active */
const NON_RESUMABLE_RUN_STATUSES: readonly Status[] = TERMINAL_RUN_STATUSES;
const NON_RESUMABLE_RUN_STATUS_PLACEHOLDERS = NON_RESUMABLE_RUN_STATUSES.map(
	() => "?",
).join(", ");
const ACTIVE_SNAPSHOT_RUN_STATUSES: readonly Status[] = LIVE_ATTENTION_STATUSES;
const ACTIVE_SNAPSHOT_RUN_STATUS_PLACEHOLDERS =
	ACTIVE_SNAPSHOT_RUN_STATUSES.map(() => "?").join(", ");
const WAITING_CLEAR_STATUSES = new Set<Status>([
	"running",
	"completed",
	"failed",
	"cancelled",
	"abandoned",
]);
const TERMINAL_OVERRIDE_STEP_STATUSES = new Set<Status>(["running", "waiting"]);
const END_RUN_OUTCOMES = ["cancelled", "abandoned"] as const;
const INACTIVE_AFTER_MS = 24 * 60 * 60 * 1000;

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

export type EndRunOutcome = (typeof END_RUN_OUTCOMES)[number];

export interface EndRunInput {
	readonly runId: string;
	readonly outcome: EndRunOutcome;
	readonly message?: string;
	readonly actor?: "user" | "system" | "agent";
	readonly createdAt?: string;
}

export interface EndRunResult {
	readonly event: EventRecord;
	readonly run: RunRecord;
	readonly runStatus: Status;
}

export interface InactiveRunReclassification {
	readonly runId: string;
	readonly previousStatus: Status;
	readonly runStatus: Status;
	readonly eventId: number;
	readonly createdAt: string;
	readonly data: typeof INACTIVE_REAPER_STATUS_CHANGE;
}

export const INACTIVE_REAPER_STATUS_CHANGE = {
	status: "inactive",
	message: "No workflow activity recorded for 24 hours",
	actor: "system",
	source: "inactivity_reaper",
} as const;

const NON_REAPER_EVENT_EXISTS_SQL = `EXISTS (
	SELECT 1 FROM events
	WHERE events.run_id = runs.id
	  AND (
		  CASE
			  WHEN events.type = 'status_change'
			   AND events.data IS NOT NULL
			   AND json_valid(events.data)
			  THEN COALESCE(json_extract(events.data, '$.source'), '')
			  ELSE ''
		  END
	  ) != 'inactivity_reaper'
)`;

/** Input for creating or retrieving a run */
export interface RunInput {
	readonly id: string;
	readonly flow: string;
	readonly featureId: string;
	readonly projectPath: string;
	readonly rp1ProjectRoot?: string;
	readonly rp1KbRoot?: string;
	readonly rp1WorkRoot?: string;
	readonly projectId?: string;
	readonly runPolicy?: WorkflowRunPolicy;
	readonly workIdentity?: string;
	readonly bootstrapContext?: string;
	readonly name?: string;
	readonly harness?: string;
}

export type WorkflowRunDecision =
	| "created_new_run"
	| "matched_non_terminal_run"
	| "legacy_backfill_resume";

export interface WorkflowRunInput {
	readonly flow: string;
	readonly featureId: string;
	readonly projectPath: string;
	readonly rp1ProjectRoot: string;
	readonly rp1KbRoot: string;
	readonly rp1WorkRoot: string;
	readonly projectId?: string;
	readonly runPolicy: WorkflowRunPolicy;
	readonly workIdentity?: string;
	readonly bootstrapContext: string;
	readonly harness?: string;
}

export interface WorkflowRunResult {
	readonly run: RunRecord;
	readonly resumed: boolean;
	readonly decision: WorkflowRunDecision;
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

export interface ActivitySearchRunInput {
	readonly runId: string;
	readonly projectId?: string | null;
	readonly projectRoot: string;
	readonly flow: string;
	readonly status: Status;
	readonly activityAt: string;
	readonly sourceEventId?: number | null;
	readonly sourceRunUpdatedAt: string;
	readonly searchText: string;
	readonly indexedAt?: string;
}

export interface ActivitySearchRunRecord {
	readonly runId: string;
	readonly projectId: string | null;
	readonly projectRoot: string;
	readonly flow: string;
	readonly status: Status;
	readonly activityAt: string;
	readonly sourceEventId: number | null;
	readonly sourceRunUpdatedAt: string;
	readonly searchText: string;
	readonly indexedAt: string;
}

export interface ActivitySearchScope {
	readonly projectId?: string;
	readonly projectRoot?: string;
	readonly projectRoots?: readonly string[];
	readonly status?: Status;
	readonly excludeStatuses?: readonly Status[];
	readonly activityFrom?: string;
	readonly activityTo?: string;
}

export interface ActivitySearchRefreshScope extends ActivitySearchScope {
	readonly excludeBootstrapOnly?: boolean;
	readonly forceRefresh?: boolean;
	readonly limit?: number;
}

export interface ActivitySearchQueryOptions extends ActivitySearchScope {
	readonly tokens?: readonly string[];
	readonly limit?: number;
	readonly offset?: number;
}

export interface ActivitySearchQueryResult {
	readonly records: ActivitySearchRunRecord[];
	readonly total: number;
}

export interface ActivitySearchRefreshCandidate {
	readonly run: RunRecordWithLastEvent;
	readonly latestEventId: number | null;
	readonly activityAt: string;
	readonly searchRow: ActivitySearchRunRecord | null;
}

/** Input for upserting an artifact */
export interface ArtifactInput {
	readonly docId: string;
	readonly runId?: string;
	readonly path: string;
	readonly type: string;
	readonly storageRoot: ArtifactStorageRoot;
	readonly projectPath: string;
	readonly projectId?: string;
	readonly feature: string;
	readonly step?: string;
	readonly subflow?: boolean;
}

export type ArtifactStorageRoot = "absolute" | "project" | "work_dir";

/** Notification source type discriminator */
export type NotificationSourceType = "run" | "agent" | "system";

/** Stored notification record shape (camelCase domain model) */
export interface NotificationRecord {
	readonly id: number;
	readonly message: string;
	readonly sourceType: NotificationSourceType;
	readonly sourceId: string | null;
	readonly route: string | null;
	readonly projectId: string | null;
	readonly dismissed: boolean;
	readonly createdAt: string;
}

/** Stored artifact record shape */
export interface ArtifactRecord {
	readonly id: number;
	readonly docId: string;
	readonly runId: string | null;
	readonly path: string;
	readonly type: string;
	readonly storageRoot: ArtifactStorageRoot;
	readonly projectPath: string;
	readonly projectId: string | null;
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
	readonly concreteStep?: string;
	readonly unit?: string | null;
}

/** Raw database row shapes (snake_case) */
interface RunRow {
	id: string;
	flow: string;
	feature_id: string;
	project_path: string;
	rp1_project_root: string | null;
	rp1_kb_root: string | null;
	rp1_work_root: string | null;
	project_id: string | null;
	run_policy: WorkflowRunPolicy | null;
	work_identity: string | null;
	bootstrap_context: string | null;
	name: string | null;
	harness: string | null;
	status: string;
	created_at: string;
	updated_at: string;
}

interface ActivitySearchRunRow {
	run_id: string;
	project_id: string | null;
	project_root: string;
	flow: string;
	status: string;
	activity_at: string;
	source_event_id: number | null;
	source_run_updated_at: string;
	search_text: string;
	indexed_at: string;
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
	storage_root: ArtifactStorageRoot | null;
	project_path: string;
	project_id: string | null;
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
	id: number;
	step: string;
	unit: string | null;
	status: string;
}

interface LogicalStepStatusEntry extends StepStatusEntry {
	readonly concreteStep: string;
	readonly unit: string | null;
}

interface StepStatusProjection extends LogicalStepStatusEntry {
	readonly eventId: number;
}

interface WaitingEventRow {
	id: number;
	step: string | null;
	created_at: string;
}

interface RunLevelStatusRow {
	id: number;
	status: string;
	created_at: string;
}

const NON_TERMINAL_STATUSES = new Set<Status>([
	"running",
	"waiting",
	"not_started",
]);

const defaultKbRoot = (projectRoot: string): string =>
	join(projectRoot, ".rp1", "context");

const defaultWorkRoot = (projectRoot: string): string =>
	join(projectRoot, ".rp1", "work");

const getLegacyWorkDir = (projectRoot: string): string =>
	join(resolve(projectRoot), ".rp1", "work");

const resolveRunDirectories = (input: {
	readonly projectPath: string;
	readonly rp1ProjectRoot?: string;
	readonly rp1KbRoot?: string;
	readonly rp1WorkRoot?: string;
	readonly projectId?: string;
}): {
	readonly rp1ProjectRoot: string;
	readonly rp1KbRoot: string;
	readonly rp1WorkRoot: string;
	readonly projectId: string | undefined;
} => {
	const rp1ProjectRoot = resolve(input.rp1ProjectRoot ?? input.projectPath);
	return {
		rp1ProjectRoot,
		rp1KbRoot: resolve(input.rp1KbRoot ?? defaultKbRoot(rp1ProjectRoot)),
		rp1WorkRoot: resolve(input.rp1WorkRoot ?? defaultWorkRoot(rp1ProjectRoot)),
		projectId: input.projectId ?? readProjectId(rp1ProjectRoot),
	};
};

const runRowToRecord = (row: RunRow): RunRecord => ({
	id: row.id,
	flow: row.flow,
	featureId: row.feature_id,
	projectPath: row.project_path,
	rp1ProjectRoot: row.rp1_project_root ?? row.project_path,
	rp1KbRoot: row.rp1_kb_root ?? defaultKbRoot(row.project_path),
	rp1WorkRoot: row.rp1_work_root ?? defaultWorkRoot(row.project_path),
	projectId: row.project_id ?? null,
	runPolicy: row.run_policy ?? null,
	workIdentity: row.work_identity ?? null,
	bootstrapContext: row.bootstrap_context ?? null,
	status: row.status as Status,
	name: row.name ?? null,
	harness: row.harness ?? null,
	createdAt: row.created_at,
	updatedAt: row.updated_at,
});

const activitySearchRunRowToRecord = (
	row: ActivitySearchRunRow,
): ActivitySearchRunRecord => ({
	runId: row.run_id,
	projectId: row.project_id ?? null,
	projectRoot: row.project_root,
	flow: row.flow,
	status: row.status as Status,
	activityAt: row.activity_at,
	sourceEventId: row.source_event_id ?? null,
	sourceRunUpdatedAt: row.source_run_updated_at,
	searchText: row.search_text,
	indexedAt: row.indexed_at,
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
	storageRoot: row.storage_root ?? "work_dir",
	projectPath: row.project_path,
	projectId: row.project_id ?? null,
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

const ensureSocraticDuelMetadataColumns = (db: Database): void => {
	const columns = db.prepare("PRAGMA table_info(socratic_duels)").all() as {
		name: string;
	}[];
	const columnNames = new Set(columns.map((column) => column.name));

	if (!columnNames.has("topic")) {
		db.exec("ALTER TABLE socratic_duels ADD COLUMN topic TEXT DEFAULT NULL");
	}
	if (!columnNames.has("topic_slug")) {
		db.exec(
			"ALTER TABLE socratic_duels ADD COLUMN topic_slug TEXT DEFAULT NULL",
		);
	}
	if (!columnNames.has("debate_path")) {
		db.exec(
			"ALTER TABLE socratic_duels ADD COLUMN debate_path TEXT DEFAULT NULL",
		);
	}
};

export const ensureSocraticDuelSchema = (db: Database): void => {
	db.exec(SOCRATIC_DUEL_SCHEMA_SQL);
	ensureSocraticDuelMetadataColumns(db);
};

const ensureActivitySearchSchema = (db: Database): void => {
	db.exec(ACTIVITY_SEARCH_SCHEMA_SQL);
};

const migrateSocraticDuelLockSchema = (db: Database): void => {
	const duelTable = db
		.prepare(
			"SELECT name FROM sqlite_master WHERE type='table' AND name='socratic_duels'",
		)
		.get() as { name: string } | null;

	if (!duelTable) {
		ensureSocraticDuelSchema(db);
		return;
	}

	db.exec("PRAGMA foreign_keys = OFF");
	try {
		db.exec("BEGIN TRANSACTION");
		db.exec(`
			DROP INDEX IF EXISTS idx_socratic_duels_target_status;
			DROP INDEX IF EXISTS idx_socratic_duels_active_target;
			DROP INDEX IF EXISTS idx_socratic_duels_lease;
			DROP INDEX IF EXISTS idx_socratic_duel_participants_duel;
			DROP INDEX IF EXISTS idx_socratic_duel_participants_identity;
			DROP INDEX IF EXISTS idx_socratic_duel_turns_duel_turn;
			DROP INDEX IF EXISTS idx_socratic_duel_turns_participant;

			CREATE TABLE socratic_duels_v15 (
				id TEXT PRIMARY KEY NOT NULL,
				target_path TEXT NOT NULL,
				target_key TEXT NOT NULL,
				status TEXT NOT NULL DEFAULT 'ACTIVE'
					CHECK(status IN ('ACTIVE', 'CLOSED')),
				current_owner_id TEXT DEFAULT NULL REFERENCES socratic_duel_participants(id) ON DELETE SET NULL,
				lease_token TEXT DEFAULT NULL,
				lease_expires_at TEXT DEFAULT NULL,
				created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
				updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
			);

			INSERT INTO socratic_duels_v15 (
				id,
				target_path,
				target_key,
				status,
				current_owner_id,
				lease_token,
				lease_expires_at,
				created_at,
				updated_at
			)
			SELECT
				id,
				target_path,
				target_key,
				CASE WHEN status = 'ACTIVE' THEN 'ACTIVE' ELSE 'CLOSED' END,
				CASE WHEN status = 'ACTIVE' THEN current_owner_id ELSE NULL END,
				CASE WHEN status = 'ACTIVE' AND current_owner_id IS NOT NULL THEN 'legacy-' || id ELSE NULL END,
				CASE WHEN status = 'ACTIVE' THEN lease_expires_at ELSE NULL END,
				created_at,
				updated_at
			FROM socratic_duels;

			DROP TABLE socratic_duels;
			ALTER TABLE socratic_duels_v15 RENAME TO socratic_duels;
			DROP TABLE IF EXISTS socratic_duel_turns;

			CREATE INDEX IF NOT EXISTS idx_socratic_duels_target_status ON socratic_duels(target_key, status);
			CREATE UNIQUE INDEX IF NOT EXISTS idx_socratic_duels_active_target ON socratic_duels(target_key) WHERE status = 'ACTIVE';
			CREATE INDEX IF NOT EXISTS idx_socratic_duels_lease ON socratic_duels(status, current_owner_id, lease_expires_at);
			CREATE INDEX IF NOT EXISTS idx_socratic_duel_participants_duel ON socratic_duel_participants(duel_id);
			CREATE UNIQUE INDEX IF NOT EXISTS idx_socratic_duel_participants_identity ON socratic_duel_participants(duel_id, display_name, harness, model_id);
		`);
		db.exec("COMMIT");
	} catch (error) {
		db.exec("ROLLBACK");
		throw error;
	} finally {
		db.exec("PRAGMA foreign_keys = ON");
	}

	const fkViolations = db.prepare("PRAGMA foreign_key_check").all() as {
		table: string;
		rowid: number;
		parent: string;
		fkid: number;
	}[];
	if (fkViolations.length > 0) {
		throw new Error(
			`Socratic Duel migration produced foreign key violations: ${JSON.stringify(fkViolations)}`,
		);
	}
};

/**
 * Apply schema migrations based on the current schema version.
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

	const postV5Version = db
		.prepare("SELECT version FROM schema_version LIMIT 1")
		.get() as { version: number } | null;

	if ((postV5Version?.version ?? 6) < 7) {
		const runColumns = db.prepare("PRAGMA table_info(runs)").all() as {
			name: string;
		}[];
		const runColumnNames = runColumns.map((c) => c.name);

		if (!runColumnNames.includes("rp1_project_root")) {
			db.exec("ALTER TABLE runs ADD COLUMN rp1_project_root TEXT DEFAULT NULL");
		}
		if (!runColumnNames.includes("rp1_kb_dir")) {
			db.exec("ALTER TABLE runs ADD COLUMN rp1_kb_dir TEXT DEFAULT NULL");
		}
		if (!runColumnNames.includes("rp1_work_dir")) {
			db.exec("ALTER TABLE runs ADD COLUMN rp1_work_dir TEXT DEFAULT NULL");
		}

		const artifactColumns = db
			.prepare("PRAGMA table_info(artifacts)")
			.all() as {
			name: string;
		}[];
		const artifactColumnNames = artifactColumns.map((c) => c.name);

		if (!artifactColumnNames.includes("storage_root")) {
			db.exec(
				"ALTER TABLE artifacts ADD COLUMN storage_root TEXT NOT NULL DEFAULT 'work_dir' CHECK(storage_root IN ('absolute', 'project', 'work_dir'))",
			);
		}

		const runsToBackfill = db
			.prepare(
				"SELECT id, project_path FROM runs WHERE rp1_project_root IS NULL OR rp1_kb_dir IS NULL OR rp1_work_dir IS NULL",
			)
			.all() as { id: string; project_path: string }[];

		const backfillRunStmt = db.prepare(
			`UPDATE runs
			 SET rp1_project_root = $rp1ProjectRoot,
			     rp1_kb_dir = $rp1KbDir,
			     rp1_work_dir = $rp1WorkDir
			 WHERE id = $id`,
		);

		for (const run of runsToBackfill) {
			const directories = resolveRunDirectories({
				projectPath: run.project_path,
			});
			backfillRunStmt.run({
				$id: run.id,
				$rp1ProjectRoot: directories.rp1ProjectRoot,
				$rp1KbDir: directories.rp1KbRoot,
				$rp1WorkDir: directories.rp1WorkRoot,
			});
		}

		db.prepare("UPDATE schema_version SET version = 7").run();
	}

	const postV7Version = db
		.prepare("SELECT version FROM schema_version LIMIT 1")
		.get() as { version: number } | null;

	if ((postV7Version?.version ?? 7) < 8) {
		const cols = db.prepare("PRAGMA table_info(runs)").all() as {
			name: string;
		}[];
		const colNames = new Set(cols.map((c) => c.name));

		if (colNames.has("rp1_kb_dir") && !colNames.has("rp1_kb_root")) {
			db.exec("ALTER TABLE runs RENAME COLUMN rp1_kb_dir TO rp1_kb_root");
		}
		if (colNames.has("rp1_work_dir") && !colNames.has("rp1_work_root")) {
			db.exec("ALTER TABLE runs RENAME COLUMN rp1_work_dir TO rp1_work_root");
		}

		db.prepare("UPDATE schema_version SET version = 8").run();
	}

	const postV8Version = db
		.prepare("SELECT version FROM schema_version LIMIT 1")
		.get() as { version: number } | null;

	if ((postV8Version?.version ?? 8) < 9) {
		const runCols = db.prepare("PRAGMA table_info(runs)").all() as {
			name: string;
		}[];
		const runColNames = new Set(runCols.map((c) => c.name));

		if (!runColNames.has("project_id")) {
			db.exec("ALTER TABLE runs ADD COLUMN project_id TEXT DEFAULT NULL");
		}
		db.exec(
			"CREATE INDEX IF NOT EXISTS idx_runs_project_id ON runs(project_id)",
		);

		const artifactCols = db.prepare("PRAGMA table_info(artifacts)").all() as {
			name: string;
		}[];
		const artifactColNames = new Set(artifactCols.map((c) => c.name));

		if (!artifactColNames.has("project_id")) {
			db.exec("ALTER TABLE artifacts ADD COLUMN project_id TEXT DEFAULT NULL");
		}
		db.exec(
			"CREATE INDEX IF NOT EXISTS idx_artifacts_project_id ON artifacts(project_id)",
		);

		const taskCols = db.prepare("PRAGMA table_info(tasks)").all() as {
			name: string;
		}[];
		const taskColNames = new Set(taskCols.map((c) => c.name));

		if (!taskColNames.has("project_id")) {
			db.exec("ALTER TABLE tasks ADD COLUMN project_id TEXT DEFAULT NULL");
		}
		db.exec(
			"CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON tasks(project_id)",
		);

		const runsToBackfill = db
			.prepare(
				"SELECT id, rp1_project_root FROM runs WHERE project_id IS NULL AND rp1_project_root IS NOT NULL",
			)
			.all() as { id: string; rp1_project_root: string }[];

		const backfillStmt = db.prepare(
			"UPDATE runs SET project_id = $projectId WHERE id = $id",
		);

		for (const run of runsToBackfill) {
			const projectId = readProjectId(run.rp1_project_root);
			if (projectId) {
				backfillStmt.run({ $id: run.id, $projectId: projectId });
			}
		}

		const artifactsToBackfill = db
			.prepare(
				`SELECT a.id, r.rp1_project_root
				 FROM artifacts a
				 LEFT JOIN runs r ON a.run_id = r.id
				 WHERE a.project_id IS NULL AND r.rp1_project_root IS NOT NULL`,
			)
			.all() as { id: number; rp1_project_root: string }[];

		const backfillArtifactStmt = db.prepare(
			"UPDATE artifacts SET project_id = $projectId WHERE id = $id",
		);

		for (const artifact of artifactsToBackfill) {
			const projectId = readProjectId(artifact.rp1_project_root);
			if (projectId) {
				backfillArtifactStmt.run({
					$id: artifact.id,
					$projectId: projectId,
				});
			}
		}

		db.prepare("UPDATE schema_version SET version = 9").run();
	}

	const postV9Version = db
		.prepare("SELECT version FROM schema_version LIMIT 1")
		.get() as { version: number } | null;

	if ((postV9Version?.version ?? 9) < 10) {
		db.exec(`
			CREATE TABLE IF NOT EXISTS notifications (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				message TEXT NOT NULL,
				source_type TEXT NOT NULL DEFAULT 'run'
					CHECK(source_type IN ('run', 'agent', 'system')),
				source_id TEXT,
				route TEXT,
				project_id TEXT,
				dismissed INTEGER NOT NULL DEFAULT 0,
				created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
			);

			CREATE INDEX IF NOT EXISTS idx_notifications_dismissed ON notifications(dismissed);
			CREATE INDEX IF NOT EXISTS idx_notifications_project ON notifications(project_id);
			CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at);
			CREATE INDEX IF NOT EXISTS idx_notifications_project_dismissed ON notifications(project_id, dismissed, created_at);
		`);

		db.prepare("UPDATE schema_version SET version = 10").run();
	}

	const postV10Version = db
		.prepare("SELECT version FROM schema_version LIMIT 1")
		.get() as { version: number } | null;

	if ((postV10Version?.version ?? 10) < 11) {
		const runColumns = db.prepare("PRAGMA table_info(runs)").all() as {
			name: string;
		}[];
		const runColumnNames = new Set(runColumns.map((c) => c.name));

		if (!runColumnNames.has("run_policy")) {
			db.exec(
				"ALTER TABLE runs ADD COLUMN run_policy TEXT DEFAULT NULL CHECK(run_policy IN ('fresh', 'resumable'))",
			);
		}
		if (!runColumnNames.has("work_identity")) {
			db.exec("ALTER TABLE runs ADD COLUMN work_identity TEXT DEFAULT NULL");
		}
		if (!runColumnNames.has("bootstrap_context")) {
			db.exec(
				"ALTER TABLE runs ADD COLUMN bootstrap_context TEXT DEFAULT NULL",
			);
		}

		db.exec(
			"CREATE INDEX IF NOT EXISTS idx_runs_project_work_identity_status ON runs(project_id, flow, work_identity, status)",
		);
		db.exec(
			"CREATE INDEX IF NOT EXISTS idx_runs_root_work_identity_status ON runs(rp1_project_root, flow, work_identity, status)",
		);

		db.prepare("UPDATE schema_version SET version = 11").run();
	}

	const postV11Version = db
		.prepare("SELECT version FROM schema_version LIMIT 1")
		.get() as { version: number } | null;

	if ((postV11Version?.version ?? 11) < 12) {
		db.exec(`
			CREATE TABLE IF NOT EXISTS projects (
				id TEXT NOT NULL UNIQUE,
				project_id TEXT,
				path TEXT NOT NULL,
				name TEXT NOT NULL,
				added_at TEXT NOT NULL,
				last_accessed_at TEXT NOT NULL,
				available INTEGER NOT NULL DEFAULT 1
			);

			CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_path ON projects(path);
			CREATE INDEX IF NOT EXISTS idx_projects_project_id ON projects(project_id);
			CREATE INDEX IF NOT EXISTS idx_projects_last_accessed ON projects(last_accessed_at);

			CREATE TABLE IF NOT EXISTS project_registry_meta (
				key TEXT PRIMARY KEY NOT NULL,
				value TEXT
			);
		`);

		db.prepare("UPDATE schema_version SET version = 12").run();
	}

	const postV12Version = db
		.prepare("SELECT version FROM schema_version LIMIT 1")
		.get() as { version: number } | null;

	if ((postV12Version?.version ?? 12) < 13) {
		db.exec("PRAGMA foreign_keys = OFF");
		try {
			db.exec("BEGIN TRANSACTION");
			db.exec(`
				CREATE TABLE runs_v13 (
					id TEXT PRIMARY KEY NOT NULL,
					flow TEXT NOT NULL,
					feature_id TEXT NOT NULL,
					project_path TEXT NOT NULL,
					rp1_project_root TEXT NOT NULL,
					rp1_kb_root TEXT NOT NULL,
					rp1_work_root TEXT NOT NULL,
					project_id TEXT DEFAULT NULL,
					run_policy TEXT DEFAULT NULL
						CHECK(run_policy IN ('fresh', 'resumable')),
					work_identity TEXT DEFAULT NULL,
					bootstrap_context TEXT DEFAULT NULL,
					name TEXT DEFAULT NULL,
					harness TEXT DEFAULT NULL,
					status TEXT NOT NULL DEFAULT 'not_started'
						CHECK(status IN (${RUN_STATUS_CHECK_SQL})),
					created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
					updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
				);

				INSERT INTO runs_v13 (
					id,
					flow,
					feature_id,
					project_path,
					rp1_project_root,
					rp1_kb_root,
					rp1_work_root,
					project_id,
					run_policy,
					work_identity,
					bootstrap_context,
					name,
					harness,
					status,
					created_at,
					updated_at
				)
				SELECT
					id,
					flow,
					feature_id,
					project_path,
					rp1_project_root,
					rp1_kb_root,
					rp1_work_root,
					project_id,
					run_policy,
					work_identity,
					bootstrap_context,
					name,
					harness,
					status,
					created_at,
					updated_at
				FROM runs;

				DROP TABLE runs;
				ALTER TABLE runs_v13 RENAME TO runs;

				CREATE INDEX idx_runs_project ON runs(project_path);
				CREATE INDEX idx_runs_feature ON runs(project_path, feature_id);
				CREATE INDEX idx_runs_status ON runs(status);
				CREATE INDEX idx_runs_status_updated ON runs(status, updated_at);
				CREATE INDEX idx_runs_feature_status ON runs(project_path, feature_id, status);
				CREATE INDEX idx_runs_project_id ON runs(project_id);
				CREATE INDEX idx_runs_project_work_identity_status ON runs(project_id, flow, work_identity, status);
				CREATE INDEX idx_runs_root_work_identity_status ON runs(rp1_project_root, flow, work_identity, status);
			`);
			db.prepare("UPDATE schema_version SET version = 13").run();
			db.exec("COMMIT");
		} catch (error) {
			db.exec("ROLLBACK");
			throw error;
		} finally {
			db.exec("PRAGMA foreign_keys = ON");
		}
	}

	const postV13Version = db
		.prepare("SELECT version FROM schema_version LIMIT 1")
		.get() as { version: number } | null;

	if ((postV13Version?.version ?? 13) < 14) {
		ensureSocraticDuelSchema(db);
		db.prepare("UPDATE schema_version SET version = 14").run();
	}

	const postV14Version = db
		.prepare("SELECT version FROM schema_version LIMIT 1")
		.get() as { version: number } | null;

	if ((postV14Version?.version ?? 14) < 15) {
		migrateSocraticDuelLockSchema(db);
		db.prepare("UPDATE schema_version SET version = 15").run();
	}

	const postV15Version = db
		.prepare("SELECT version FROM schema_version LIMIT 1")
		.get() as { version: number } | null;

	if ((postV15Version?.version ?? 15) < 16) {
		ensureSocraticDuelSchema(db);
		db.prepare("UPDATE schema_version SET version = 16").run();
	}

	const postV16Version = db
		.prepare("SELECT version FROM schema_version LIMIT 1")
		.get() as { version: number } | null;

	if ((postV16Version?.version ?? 16) < 17) {
		ensureActivitySearchSchema(db);
		db.prepare("UPDATE schema_version SET version = 17").run();
	}
};

/**
 * Get or create the emit database connection.
 * Initializes schema on first connection and cleans up legacy status.db.
 */
export const getEmitDatabase = (
	dbPath: string = getDefaultDbPath(),
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
		const params: Record<string, string | null> = { $id: input.id };

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

		if (
			input.runPolicy !== undefined &&
			existing.run_policy !== input.runPolicy
		) {
			updates.push("run_policy = $runPolicy");
			params.$runPolicy = input.runPolicy;
		}

		if (
			input.workIdentity !== undefined &&
			existing.work_identity !== input.workIdentity
		) {
			updates.push("work_identity = $workIdentity");
			params.$workIdentity = input.workIdentity;
		}

		if (
			input.bootstrapContext !== undefined &&
			existing.bootstrap_context !== input.bootstrapContext
		) {
			updates.push("bootstrap_context = $bootstrapContext");
			params.$bootstrapContext = input.bootstrapContext;
		}

		const directories = resolveRunDirectories(input);

		if (existing.project_path !== input.projectPath) {
			updates.push("project_path = $projectPath");
			params.$projectPath = input.projectPath;
		}

		if (existing.rp1_project_root !== directories.rp1ProjectRoot) {
			updates.push("rp1_project_root = $rp1ProjectRoot");
			params.$rp1ProjectRoot = directories.rp1ProjectRoot;
		}

		if (existing.rp1_kb_root !== directories.rp1KbRoot) {
			updates.push("rp1_kb_root = $rp1KbRoot");
			params.$rp1KbRoot = directories.rp1KbRoot;
		}

		if (existing.rp1_work_root !== directories.rp1WorkRoot) {
			updates.push("rp1_work_root = $rp1WorkRoot");
			params.$rp1WorkRoot = directories.rp1WorkRoot;
		}

		if (existing.project_id !== (directories.projectId ?? null)) {
			updates.push("project_id = $projectId");
			params.$projectId = directories.projectId ?? null;
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

	const directories = resolveRunDirectories(input);
	const row = db
		.prepare(
			`INSERT INTO runs (
			    id, flow, feature_id, project_path, rp1_project_root, rp1_kb_root,
			    rp1_work_root, project_id, run_policy, work_identity,
			    bootstrap_context, name, harness
			 )
			 VALUES (
			    $id, $flow, $featureId, $projectPath, $rp1ProjectRoot, $rp1KbRoot,
			    $rp1WorkRoot, $projectId, $runPolicy, $workIdentity,
			    $bootstrapContext, $name, $harness
			 )
			 RETURNING *`,
		)
		.get({
			$id: input.id,
			$flow: input.flow,
			$featureId: input.featureId,
			$projectPath: input.projectPath,
			$rp1ProjectRoot: directories.rp1ProjectRoot,
			$rp1KbRoot: directories.rp1KbRoot,
			$rp1WorkRoot: directories.rp1WorkRoot,
			$projectId: directories.projectId ?? null,
			$runPolicy: input.runPolicy ?? null,
			$workIdentity: input.workIdentity ?? null,
			$bootstrapContext: input.bootstrapContext ?? null,
			$name: input.name ?? null,
			$harness: input.harness ?? null,
		}) as RunRow;

	return runRowToRecord(row);
};

const findWorkflowRunByIdentity = (
	db: Database,
	input: WorkflowRunInput,
): RunRow | null => {
	return db
		.prepare(
			`SELECT * FROM runs
			 WHERE (
			        project_id = ?
			     OR (project_id IS NULL AND rp1_project_root = ?)
			   )
			   AND flow = ?
			   AND work_identity = ?
			   AND status NOT IN (${NON_RESUMABLE_RUN_STATUS_PLACEHOLDERS})
			 ORDER BY created_at DESC
			 LIMIT 1`,
		)
		.get(
			input.projectId ?? null,
			input.rp1ProjectRoot,
			input.flow,
			input.workIdentity ?? null,
			...NON_RESUMABLE_RUN_STATUSES,
		) as RunRow | null;
};

const findLegacyWorkflowRun = (
	db: Database,
	input: WorkflowRunInput,
): RunRow | null => {
	if (input.flow !== "build" || input.featureId === "unknown") {
		return null;
	}

	return db
		.prepare(
			`SELECT * FROM runs
			 WHERE (
			        project_id = ?
			     OR (project_id IS NULL AND rp1_project_root = ?)
			   )
			   AND feature_id = ?
			   AND (flow = ? OR flow = 'unknown')
			   AND status NOT IN (${NON_RESUMABLE_RUN_STATUS_PLACEHOLDERS})
			 ORDER BY created_at DESC
			 LIMIT 1`,
		)
		.get(
			input.projectId ?? null,
			input.rp1ProjectRoot,
			input.featureId,
			input.flow,
			...NON_RESUMABLE_RUN_STATUSES,
		) as RunRow | null;
};

export const findOrCreateWorkflowRun = (
	db: Database,
	input: WorkflowRunInput,
): WorkflowRunResult => {
	const createOrUpdateRun = (
		runId: string,
		decision: WorkflowRunDecision,
		resumed: boolean,
	): WorkflowRunResult => ({
		run: insertRun(db, {
			id: runId,
			flow: input.flow,
			featureId: input.featureId,
			projectPath: input.projectPath,
			rp1ProjectRoot: input.rp1ProjectRoot,
			rp1KbRoot: input.rp1KbRoot,
			rp1WorkRoot: input.rp1WorkRoot,
			projectId: input.projectId,
			runPolicy: input.runPolicy,
			workIdentity: input.workIdentity,
			bootstrapContext: input.bootstrapContext,
			harness: input.harness,
		}),
		resumed,
		decision,
	});

	if (input.runPolicy === "fresh") {
		return createOrUpdateRun(crypto.randomUUID(), "created_new_run", false);
	}

	const existing = findWorkflowRunByIdentity(db, input);
	if (existing) {
		return createOrUpdateRun(existing.id, "matched_non_terminal_run", true);
	}

	const legacy = findLegacyWorkflowRun(db, input);
	if (legacy) {
		return createOrUpdateRun(legacy.id, "legacy_backfill_resume", true);
	}

	return createOrUpdateRun(crypto.randomUUID(), "created_new_run", false);
};

/**
 * Find the most recent non-terminal run for a feature, or create a new one.
 * Uses indexed query on (project_path, feature_id) + status filter.
 */
export const findOrCreateRun = (
	db: Database,
	input: ResumeRunInput,
): ResumeRunResult => {
	const existing = db
		.prepare(
			`SELECT * FROM runs
			 WHERE feature_id = ?
			   AND flow = ?
			   AND project_path = ?
			   AND status NOT IN (${NON_RESUMABLE_RUN_STATUS_PLACEHOLDERS})
			 ORDER BY created_at DESC
			 LIMIT 1`,
		)
		.get(
			input.featureId,
			input.flow,
			input.projectPath,
			...NON_RESUMABLE_RUN_STATUSES,
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
			   AND status NOT IN (${NON_RESUMABLE_RUN_STATUS_PLACEHOLDERS})
			 ORDER BY created_at DESC
			 LIMIT 1`,
		)
		.get(
			input.featureId,
			input.projectPath,
			...NON_RESUMABLE_RUN_STATUSES,
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
	const directories = resolveRunDirectories({ projectPath: input.projectPath });
	db.prepare(
		`INSERT INTO runs (
		    id, flow, feature_id, project_path, rp1_project_root, rp1_kb_root,
		    rp1_work_root, project_id, harness
		 )
		 VALUES (
		    $id, $flow, $featureId, $projectPath, $rp1ProjectRoot, $rp1KbRoot,
		    $rp1WorkRoot, $projectId, NULL
		 )`,
	).run({
		$id: newId,
		$flow: input.flow,
		$featureId: input.featureId,
		$projectPath: input.projectPath,
		$rp1ProjectRoot: directories.rp1ProjectRoot,
		$rp1KbRoot: directories.rp1KbRoot,
		$rp1WorkRoot: directories.rp1WorkRoot,
		$projectId: directories.projectId ?? null,
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
 * Insert an artifact by doc_id, or refresh the existing record in place.
 */
export const upsertArtifact = (
	db: Database,
	input: ArtifactInput,
): ArtifactRecord => {
	const existing = db
		.prepare("SELECT * FROM artifacts WHERE doc_id = $docId")
		.get({ $docId: input.docId }) as ArtifactRow | null;

	if (existing) {
		const row = db
			.prepare(
				`UPDATE artifacts
				 SET run_id = $runId,
				     path = $path,
				     type = $type,
				     storage_root = $storageRoot,
				     project_path = $projectPath,
				     project_id = $projectId,
				     feature = $feature,
				     step = $step,
				     subflow = $subflow
				 WHERE doc_id = $docId
				 RETURNING *`,
			)
			.get({
				$docId: input.docId,
				$runId: input.runId ?? existing.run_id,
				$path: input.path,
				$type: input.type,
				$storageRoot: input.storageRoot,
				$projectPath: input.projectPath,
				$projectId: input.projectId ?? existing.project_id,
				$feature: input.feature,
				$step: input.step ?? existing.step,
				$subflow: input.subflow ?? existing.subflow,
			}) as ArtifactRow;

		return artifactRowToRecord(row);
	}

	const row = db
		.prepare(
			`INSERT INTO artifacts (
			    doc_id, run_id, path, type, storage_root, project_path, project_id, feature, step, subflow
			 )
			 VALUES (
			    $docId, $runId, $path, $type, $storageRoot, $projectPath, $projectId, $feature, $step, $subflow
			 )
			 RETURNING *`,
		)
		.get({
			$docId: input.docId,
			$runId: input.runId ?? null,
			$path: input.path,
			$type: input.type,
			$storageRoot: input.storageRoot,
			$projectPath: input.projectPath,
			$projectId: input.projectId ?? null,
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
 * Query the latest status_change event per logical work item for a run.
 * Returns the most recent status for each unique logical step key.
 */
const getStatusChangeRows = (db: Database, runId: string): StepStatusRow[] =>
	db
		.prepare(
			`SELECT id, step, unit, json_extract(data, '$.status') as status
			 FROM events
			 WHERE run_id = $runId AND type = 'status_change' AND step IS NOT NULL
			 ORDER BY id ASC`,
		)
		.all({ $runId: runId }) as StepStatusRow[];

const getRunLevelStatusRows = (
	db: Database,
	runId: string,
): RunLevelStatusRow[] =>
	db
		.prepare(
			`SELECT id, json_extract(data, '$.status') as status, created_at
			 FROM events
			 WHERE run_id = $runId
			   AND type = 'status_change'
			   AND step IS NULL
			   AND unit IS NULL
			 ORDER BY id ASC`,
		)
		.all({ $runId: runId }) as RunLevelStatusRow[];

const buildDiagnosticStepStatusProjections = (
	rows: readonly StepStatusRow[],
): StepStatusProjection[] => {
	const latestByLogicalKey = new Map<string, StepStatusProjection>();
	let activeWorkflowStep: string | null = null;

	for (const row of rows) {
		const status = row.status as Status;

		if (isNamespacedLifecycleStep(row.step) && activeWorkflowStep) {
			continue;
		}

		const logicalStepKey = getLogicalStepKey(row.step, row.unit);

		latestByLogicalKey.set(logicalStepKey, {
			step: logicalStepKey,
			status,
			concreteStep: row.step,
			unit: row.unit,
			eventId: row.id,
		});

		if (isNamespacedLifecycleStep(row.step)) {
			continue;
		}

		if (NON_TERMINAL_STATUSES.has(status)) {
			activeWorkflowStep = row.step;
		} else if (activeWorkflowStep === row.step) {
			activeWorkflowStep = null;
		}
	}

	return Array.from(latestByLogicalKey.values());
};

const buildWorkflowStepStatusProjections = (
	rows: readonly StepStatusRow[],
): StepStatusProjection[] => {
	const latestByStep = new Map<string, StepStatusProjection>();

	for (const row of rows) {
		if (row.unit != null || isNamespacedLifecycleStep(row.step)) {
			continue;
		}

		latestByStep.set(row.step, {
			step: row.step,
			status: row.status as Status,
			concreteStep: row.step,
			unit: null,
			eventId: row.id,
		});
	}

	return Array.from(latestByStep.values());
};

const getLatestWaitingEvent = (
	db: Database,
	runId: string,
): WaitingEventRow | null =>
	db
		.prepare(
			`SELECT id, step, created_at
			 FROM events
			 WHERE run_id = $runId AND type = 'waiting_for_user'
			 ORDER BY id DESC
			 LIMIT 1`,
		)
		.get({ $runId: runId }) as WaitingEventRow | null;

const overlayWaitingStep = (
	entries: readonly StepStatusProjection[],
	waitingEvent: WaitingEventRow | null,
): StepStatusProjection[] => {
	if (waitingEvent?.step == null) {
		return [...entries];
	}

	const waitingStepKey = getLogicalStepKey(waitingEvent.step, null);
	const index = entries.findIndex(
		(entry) =>
			entry.step === waitingStepKey || entry.concreteStep === waitingEvent.step,
	);

	const waitingEntry: StepStatusProjection =
		index >= 0
			? {
					...entries[index],
					status: "waiting",
					concreteStep: waitingEvent.step,
					eventId: waitingEvent.id,
				}
			: {
					step: waitingStepKey,
					status: "waiting",
					concreteStep: waitingEvent.step,
					unit: null,
					eventId: waitingEvent.id,
				};

	if (index < 0) {
		return [...entries, waitingEntry];
	}

	return entries.map((entry, entryIndex) =>
		entryIndex === index ? waitingEntry : entry,
	);
};

const maxWaitClearingEventId = (
	entries: readonly StepStatusProjection[],
): number =>
	entries.reduce(
		(maxEventId, entry) =>
			WAITING_CLEAR_STATUSES.has(entry.status)
				? Math.max(maxEventId, entry.eventId)
				: maxEventId,
		0,
	);

const maxWaitClearingRowId = (rows: readonly StepStatusRow[]): number =>
	rows.reduce(
		(maxEventId, row) =>
			WAITING_CLEAR_STATUSES.has(row.status as Status)
				? Math.max(maxEventId, row.id)
				: maxEventId,
		0,
	);

const collapseLiveStepStatuses = (
	entries: readonly StepStatusProjection[],
): StepStatusProjection[] =>
	entries.map((entry) =>
		TERMINAL_OVERRIDE_STEP_STATUSES.has(entry.status)
			? { ...entry, status: "completed" }
			: entry,
	);

const deriveProjectedStatus = (
	entries: readonly StepStatusProjection[],
	waitingActive: boolean,
): Status => {
	if (waitingActive) {
		return "waiting";
	}

	if (entries.length === 0) {
		return "not_started";
	}

	const statuses = entries.map((entry) => entry.status);

	if (statuses.includes("failed")) {
		return "failed";
	}
	if (statuses.includes("running")) {
		return "running";
	}
	if (statuses.includes("waiting")) {
		return "waiting";
	}
	if (
		statuses.every((status) => status === "completed" || status === "skipped")
	) {
		return "completed";
	}

	return "not_started";
};

const stripStepStatusProjection = ({
	eventId: _eventId,
	...entry
}: StepStatusProjection): StepStatusEntry => entry;

const getRunLifecycleProjection = (
	db: Database,
	runId: string,
): {
	readonly derivedStatus: Status;
	readonly effectiveSteps: readonly StepStatusProjection[];
} => {
	const statusRows = getStatusChangeRows(db, runId);
	const runLevelStatusRows = getRunLevelStatusRows(db, runId);
	const diagnosticEntries = buildDiagnosticStepStatusProjections(statusRows);
	const workflowEntries = buildWorkflowStepStatusProjections(statusRows);
	const baseEntries =
		workflowEntries.length > 0 ? workflowEntries : diagnosticEntries;

	const latestManualTerminal =
		[...runLevelStatusRows]
			.reverse()
			.find(
				(row) => row.status === "cancelled" || row.status === "abandoned",
			) ?? null;

	const latestInactiveOverride =
		[...runLevelStatusRows]
			.reverse()
			.find((row) => row.status === "inactive") ?? null;

	const latestWaitingEvent = getLatestWaitingEvent(db, runId);
	const waitingActive =
		latestWaitingEvent != null &&
		latestWaitingEvent.id >
			Math.max(
				maxWaitClearingEventId(baseEntries),
				maxWaitClearingRowId(statusRows),
				latestInactiveOverride?.id ?? 0,
				latestManualTerminal?.id ?? 0,
			);

	const projectedSteps = waitingActive
		? overlayWaitingStep(baseEntries, latestWaitingEvent)
		: baseEntries;

	if (latestManualTerminal != null) {
		return {
			derivedStatus: latestManualTerminal.status as Status,
			effectiveSteps: collapseLiveStepStatuses(projectedSteps),
		};
	}

	const latestBaseEventId = projectedSteps.reduce(
		(maxEventId, entry) => Math.max(maxEventId, entry.eventId),
		0,
	);

	if (
		latestInactiveOverride != null &&
		latestInactiveOverride.id >
			Math.max(latestBaseEventId, latestWaitingEvent?.id ?? 0)
	) {
		return {
			derivedStatus: "inactive",
			effectiveSteps: collapseLiveStepStatuses(projectedSteps),
		};
	}

	return {
		derivedStatus: deriveProjectedStatus(projectedSteps, waitingActive),
		effectiveSteps: projectedSteps,
	};
};

export const getStepStatuses = (
	db: Database,
	runId: string,
): StepStatusEntry[] =>
	buildDiagnosticStepStatusProjections(getStatusChangeRows(db, runId)).map(
		stripStepStatusProjection,
	);

export const getEffectiveStepStatuses = (
	db: Database,
	runId: string,
): StepStatusEntry[] =>
	getRunLifecycleProjection(db, runId).effectiveSteps.map(
		stripStepStatusProjection,
	);

const persistRunStatus = (
	db: Database,
	runId: string,
	status: Status,
): void => {
	db.prepare(
		`UPDATE runs
		 SET status = $status, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
		 WHERE id = $runId`,
	).run({ $status: status, $runId: runId });
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
		const stepStatuses = new Map<string, StepStatusEntry>();
		for (const entry of getStepStatuses(db, runId)) {
			stepStatuses.set(entry.step, entry);
		}
		for (const entry of getEffectiveStepStatuses(db, runId)) {
			stepStatuses.set(entry.step, entry);
		}
		const now = new Date().toISOString();
		for (const entry of stepStatuses.values()) {
			if (
				entry.status === "running" ||
				entry.status === "waiting" ||
				entry.status === "not_started"
			) {
				insertEvent(db, {
					runId,
					type: "status_change",
					step: entry.concreteStep ?? entry.step,
					unit: entry.unit ?? undefined,
					data: JSON.stringify({ status: "completed" }),
					createdAt: now,
				});
			}
		}
	}

	const projection = getRunLifecycleProjection(db, runId);
	persistRunStatus(db, runId, projection.derivedStatus);
	return projection.derivedStatus;
};

export const reclassifyInactiveRuns = (
	db: Database,
	now: Date = new Date(),
): InactiveRunReclassification[] => {
	const nowIso = now.toISOString();
	const cutoffIso = new Date(
		new Date(nowIso).getTime() - INACTIVE_AFTER_MS,
	).toISOString();

	const staleRuns = db
		.prepare(
			`SELECT id, status
			 FROM runs
			 WHERE status IN ('running', 'not_started')
			   AND updated_at <= $cutoff
			   AND ${NON_REAPER_EVENT_EXISTS_SQL}
			 ORDER BY updated_at ASC, id ASC`,
		)
		.all({ $cutoff: cutoffIso }) as {
		id: string;
		status: string;
	}[];

	return staleRuns.map((row) => {
		const event = insertEvent(db, {
			runId: row.id,
			type: "status_change",
			data: JSON.stringify(INACTIVE_REAPER_STATUS_CHANGE),
			createdAt: nowIso,
		});

		const runStatus = deriveRunStatus(db, row.id);
		return {
			runId: row.id,
			previousStatus: row.status as Status,
			runStatus,
			eventId: event.id,
			createdAt: nowIso,
			data: INACTIVE_REAPER_STATUS_CHANGE,
		};
	});
};

export const endRun = (
	db: Database,
	input: EndRunInput,
): E.Either<CLIError, EndRunResult> => {
	const run = getRunById(db, input.runId);
	if (run == null) {
		return E.left(runtimeError(`Run "${input.runId}" was not found`));
	}

	if (isTerminalRunStatus(run.status)) {
		return E.left(
			runtimeError(
				`Run "${input.runId}" is already terminal (${run.status}) and cannot be ended again`,
			),
		);
	}

	const event = insertEvent(db, {
		runId: input.runId,
		type: "status_change",
		data: JSON.stringify({
			status: input.outcome,
			...(input.message ? { message: input.message } : {}),
			actor: input.actor ?? "user",
			source: "manual_end",
		}),
		createdAt: input.createdAt,
	});

	const runStatus = deriveRunStatus(db, input.runId);
	const updatedRun = getRunById(db, input.runId);

	if (updatedRun == null) {
		return E.left(
			runtimeError(`Run "${input.runId}" disappeared after end-run projection`),
		);
	}

	return E.right({
		event,
		run: updatedRun,
		runStatus,
	});
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
 * Build a snapshot of all live runs with their steps and artifacts.
 */
export const getActiveRunsSnapshot = (db: Database): ActiveRunSnapshot[] => {
	const runRows = db
		.prepare(
			`SELECT * FROM runs
			 WHERE status IN (${ACTIVE_SNAPSHOT_RUN_STATUS_PLACEHOLDERS})
			 ORDER BY created_at DESC`,
		)
		.all(...ACTIVE_SNAPSHOT_RUN_STATUSES) as RunRow[];

	return runRows.map((runRow) => {
		const steps = getEffectiveStepStatuses(db, runRow.id);

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

const appendRunActivitySearchScopeConditions = (
	conditions: string[],
	values: (string | number)[],
	opts: ActivitySearchScope,
): void => {
	if (opts.projectId != null) {
		conditions.push("runs.project_id = ?");
		values.push(opts.projectId);
	}
	if (opts.projectRoot != null) {
		conditions.push("COALESCE(runs.rp1_project_root, runs.project_path) = ?");
		values.push(opts.projectRoot);
	} else if (opts.projectRoots != null && opts.projectRoots.length > 0) {
		const placeholders = opts.projectRoots.map(() => "?").join(", ");
		conditions.push(
			`COALESCE(runs.rp1_project_root, runs.project_path) IN (${placeholders})`,
		);
		values.push(...opts.projectRoots);
	}
	if (opts.status != null) {
		conditions.push("runs.status = ?");
		values.push(opts.status);
	}
	if (opts.excludeStatuses != null && opts.excludeStatuses.length > 0) {
		const placeholders = opts.excludeStatuses.map(() => "?").join(", ");
		conditions.push(`runs.status NOT IN (${placeholders})`);
		values.push(...opts.excludeStatuses);
	}
	if (opts.activityFrom != null) {
		conditions.push(
			"COALESCE(latest_events.last_event_at, runs.created_at) >= ?",
		);
		values.push(opts.activityFrom);
	}
	if (opts.activityTo != null) {
		conditions.push(
			"COALESCE(latest_events.last_event_at, runs.created_at) <= ?",
		);
		values.push(opts.activityTo);
	}
};

const appendSearchRowScopeConditions = (
	conditions: string[],
	values: (string | number)[],
	opts: ActivitySearchScope,
): void => {
	if (opts.projectId != null) {
		conditions.push("project_id = ?");
		values.push(opts.projectId);
	}
	if (opts.projectRoot != null) {
		conditions.push("project_root = ?");
		values.push(opts.projectRoot);
	} else if (opts.projectRoots != null && opts.projectRoots.length > 0) {
		const placeholders = opts.projectRoots.map(() => "?").join(", ");
		conditions.push(`project_root IN (${placeholders})`);
		values.push(...opts.projectRoots);
	}
	if (opts.status != null) {
		conditions.push("status = ?");
		values.push(opts.status);
	}
	if (opts.excludeStatuses != null && opts.excludeStatuses.length > 0) {
		const placeholders = opts.excludeStatuses.map(() => "?").join(", ");
		conditions.push(`status NOT IN (${placeholders})`);
		values.push(...opts.excludeStatuses);
	}
	if (opts.activityFrom != null) {
		conditions.push("activity_at >= ?");
		values.push(opts.activityFrom);
	}
	if (opts.activityTo != null) {
		conditions.push("activity_at <= ?");
		values.push(opts.activityTo);
	}
};

const escapeLikeToken = (token: string): string =>
	token.replace(/[\\%_]/g, (match) => `\\${match}`);

/**
 * Find runs whose materialized Activity search row is missing or stale.
 */
export const listActivitySearchRefreshCandidates = (
	db: Database,
	opts: ActivitySearchRefreshScope = {},
): ActivitySearchRefreshCandidate[] => {
	const conditions: string[] = opts.forceRefresh
		? ["1 = 1"]
		: [
				`(activity_search_runs.run_id IS NULL
		  OR activity_search_runs.source_run_updated_at IS NOT runs.updated_at
		  OR COALESCE(activity_search_runs.source_event_id, -1) != COALESCE(latest_events.latest_event_id, -1))`,
			];
	const values: (string | number)[] = [];

	appendRunActivitySearchScopeConditions(conditions, values, opts);
	if (opts.excludeBootstrapOnly === true) {
		conditions.push(
			`(runs.bootstrap_context IS NULL OR ${NON_REAPER_EVENT_EXISTS_SQL})`,
		);
	}

	const whereClause = `WHERE ${conditions.join(" AND ")}`;
	const limitClause = opts.limit != null ? " LIMIT ?" : "";
	const queryValues = opts.limit != null ? [...values, opts.limit] : values;

	const rows = db
		.prepare(
			`SELECT runs.*,
			        COALESCE(latest_events.last_event_at, runs.created_at) AS last_event_at,
			        COALESCE(latest_events.last_event_at, runs.created_at) AS activity_at,
			        latest_events.latest_event_id AS latest_event_id,
			        activity_search_runs.run_id AS search_run_id,
			        activity_search_runs.project_id AS search_project_id,
			        activity_search_runs.project_root AS search_project_root,
			        activity_search_runs.flow AS search_flow,
			        activity_search_runs.status AS search_status,
			        activity_search_runs.activity_at AS search_activity_at,
			        activity_search_runs.source_event_id AS search_source_event_id,
			        activity_search_runs.source_run_updated_at AS search_source_run_updated_at,
			        activity_search_runs.search_text AS search_text,
			        activity_search_runs.indexed_at AS search_indexed_at
			 FROM runs
			 LEFT JOIN (
			     SELECT run_id, MAX(id) AS latest_event_id, MAX(created_at) AS last_event_at
			     FROM events
			     GROUP BY run_id
			 ) AS latest_events ON latest_events.run_id = runs.id
			 LEFT JOIN activity_search_runs ON activity_search_runs.run_id = runs.id
			 ${whereClause}
			 ORDER BY COALESCE(latest_events.last_event_at, runs.created_at) DESC,
			          runs.created_at DESC,
			          runs.id DESC
			 ${limitClause}`,
		)
		.all(...queryValues) as (RunRow & {
		last_event_at: string;
		activity_at: string;
		latest_event_id: number | null;
		search_run_id: string | null;
		search_project_id: string | null;
		search_project_root: string | null;
		search_flow: string | null;
		search_status: string | null;
		search_activity_at: string | null;
		search_source_event_id: number | null;
		search_source_run_updated_at: string | null;
		search_text: string | null;
		search_indexed_at: string | null;
	})[];

	return rows.map((row) => ({
		run: {
			...runRowToRecord(row),
			lastEventAt: row.last_event_at,
		},
		latestEventId: row.latest_event_id ?? null,
		activityAt: row.activity_at,
		searchRow:
			row.search_run_id == null
				? null
				: activitySearchRunRowToRecord({
						run_id: row.search_run_id,
						project_id: row.search_project_id,
						project_root: row.search_project_root ?? "",
						flow: row.search_flow ?? "",
						status: row.search_status ?? "not_started",
						activity_at: row.search_activity_at ?? row.activity_at,
						source_event_id: row.search_source_event_id,
						source_run_updated_at: row.search_source_run_updated_at ?? "",
						search_text: row.search_text ?? "",
						indexed_at: row.search_indexed_at ?? "",
					}),
	}));
};

export const upsertActivitySearchRun = (
	db: Database,
	input: ActivitySearchRunInput,
): ActivitySearchRunRecord => {
	const row = db
		.prepare(
			`INSERT INTO activity_search_runs (
			    run_id, project_id, project_root, flow, status, activity_at,
			    source_event_id, source_run_updated_at, search_text, indexed_at
			 )
			 VALUES (
			    $runId, $projectId, $projectRoot, $flow, $status, $activityAt,
			    $sourceEventId, $sourceRunUpdatedAt, $searchText,
			    COALESCE($indexedAt, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
			 )
			 ON CONFLICT(run_id) DO UPDATE SET
			    project_id = excluded.project_id,
			    project_root = excluded.project_root,
			    flow = excluded.flow,
			    status = excluded.status,
			    activity_at = excluded.activity_at,
			    source_event_id = excluded.source_event_id,
			    source_run_updated_at = excluded.source_run_updated_at,
			    search_text = excluded.search_text,
			    indexed_at = excluded.indexed_at
			 RETURNING *`,
		)
		.get({
			$runId: input.runId,
			$projectId: input.projectId ?? null,
			$projectRoot: input.projectRoot,
			$flow: input.flow,
			$status: input.status,
			$activityAt: input.activityAt,
			$sourceEventId: input.sourceEventId ?? null,
			$sourceRunUpdatedAt: input.sourceRunUpdatedAt,
			$searchText: input.searchText,
			$indexedAt: input.indexedAt ?? null,
		}) as ActivitySearchRunRow;

	return activitySearchRunRowToRecord(row);
};

export const deleteActivitySearchRun = (
	db: Database,
	runId: string,
): boolean => {
	const result = db
		.prepare("DELETE FROM activity_search_runs WHERE run_id = $runId")
		.run({ $runId: runId });
	return result.changes > 0;
};

export const queryActivitySearchRuns = (
	db: Database,
	opts: ActivitySearchQueryOptions = {},
): ActivitySearchQueryResult => {
	const conditions: string[] = [];
	const values: (string | number)[] = [];

	appendSearchRowScopeConditions(conditions, values, opts);
	for (const token of opts.tokens ?? []) {
		const normalizedToken = token.trim().toLowerCase();
		if (normalizedToken.length === 0) continue;
		conditions.push("search_text LIKE ? ESCAPE '\\'");
		values.push(`%${escapeLikeToken(normalizedToken)}%`);
	}

	const whereClause =
		conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
	const countRow = db
		.prepare(
			`SELECT COUNT(*) AS count FROM activity_search_runs ${whereClause}`,
		)
		.get(...values) as { count: number };

	const limitClause = opts.limit != null ? " LIMIT ? OFFSET ?" : "";
	const queryValues =
		opts.limit != null ? [...values, opts.limit, opts.offset ?? 0] : values;

	const rows = db
		.prepare(
			`SELECT * FROM activity_search_runs
			 ${whereClause}
			 ORDER BY activity_at DESC, run_id DESC
			 ${limitClause}`,
		)
		.all(...queryValues) as ActivitySearchRunRow[];

	return {
		records: rows.map(activitySearchRunRowToRecord),
		total: countRow.count,
	};
};

/** Options for listing runs with optional filters and pagination */
export interface ListRunsOptions {
	readonly projectPath?: string;
	readonly projectPaths?: readonly string[];
	readonly projectId?: string;
	readonly status?: Status;
	readonly excludeStatuses?: readonly Status[];
	readonly excludeBootstrapOnly?: boolean;
	readonly limit?: number;
	readonly offset?: number;
}

/** Paginated result for run listing */
export interface ListRunsResult {
	readonly records: RunRecordWithLastEvent[];
	readonly total: number;
}

/** Project-level run statistics */
export interface ProjectRunStats {
	readonly runCount: number;
	readonly lastActivityAt: string | null;
}

/** Runs grouped by attention-requiring status */
/** A run record augmented with the latest event timestamp. */
export type RunRecordWithLastEvent = RunRecord & {
	readonly lastEventAt: string | null;
};

export interface AttentionRuns {
	readonly waiting: RunRecordWithLastEvent[];
	readonly failed: RunRecordWithLastEvent[];
	readonly running: RunRecordWithLastEvent[];
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

	if (opts.projectId != null) {
		conditions.push("project_id = ?");
		filterValues.push(opts.projectId);
	} else if (opts.projectPath != null) {
		conditions.push("COALESCE(rp1_project_root, project_path) = ?");
		filterValues.push(opts.projectPath);
	} else if (opts.projectPaths != null && opts.projectPaths.length > 0) {
		const placeholders = opts.projectPaths.map(() => "?").join(", ");
		conditions.push(
			`COALESCE(rp1_project_root, project_path) IN (${placeholders})`,
		);
		filterValues.push(...opts.projectPaths);
	}
	if (opts.status != null) {
		conditions.push("status = ?");
		filterValues.push(opts.status);
	}
	if (opts.excludeStatuses != null && opts.excludeStatuses.length > 0) {
		const placeholders = opts.excludeStatuses.map(() => "?").join(", ");
		conditions.push(`status NOT IN (${placeholders})`);
		filterValues.push(...opts.excludeStatuses);
	}
	if (opts.excludeBootstrapOnly === true) {
		conditions.push(
			`(runs.bootstrap_context IS NULL OR ${NON_REAPER_EVENT_EXISTS_SQL})`,
		);
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
			`SELECT runs.*,
			        COALESCE(latest_events.last_event_at, runs.created_at) AS last_event_at
			 FROM runs
			 LEFT JOIN (
			     SELECT run_id, MAX(created_at) AS last_event_at
			     FROM events
			     GROUP BY run_id
			 ) AS latest_events ON latest_events.run_id = runs.id
			 ${whereClause}
			 ORDER BY COALESCE(latest_events.last_event_at, runs.created_at) DESC,
			          runs.created_at DESC,
			          runs.id DESC
			 LIMIT ? OFFSET ?`,
		)
		.all(...filterValues, limit, offset) as (RunRow & {
		last_event_at: string;
	})[];

	return {
		records: rows.map((row) => ({
			...runRowToRecord(row),
			lastEventAt: row.last_event_at,
		})),
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
 * Get a single run with the latest event timestamp used by list views.
 */
export const getRunWithLastEventById = (
	db: Database,
	runId: string,
): RunRecordWithLastEvent | null => {
	const row = db
		.prepare(
			`SELECT runs.*,
			        COALESCE(latest_events.last_event_at, runs.created_at) AS last_event_at
			 FROM runs
			 LEFT JOIN (
			     SELECT run_id, MAX(created_at) AS last_event_at
			     FROM events
			     GROUP BY run_id
			 ) AS latest_events ON latest_events.run_id = runs.id
			 WHERE runs.id = $id
			 LIMIT 1`,
		)
		.get({ $id: runId }) as (RunRow & { last_event_at: string }) | null;

	return row
		? {
				...runRowToRecord(row),
				lastEventAt: row.last_event_at,
			}
		: null;
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

export const updateArtifactStorage = (
	db: Database,
	docId: string,
	updates: {
		readonly path: string;
		readonly storageRoot: ArtifactStorageRoot;
	},
): void => {
	db.prepare(
		"UPDATE artifacts SET path = $path, storage_root = $storageRoot WHERE doc_id = $docId",
	).run({
		$path: updates.path,
		$storageRoot: updates.storageRoot,
		$docId: docId,
	});
};

const isWithinRoot = (candidatePath: string, rootPath: string): boolean => {
	const normalizedRoot = resolve(rootPath);
	const relativePath = relative(normalizedRoot, resolve(candidatePath));
	return (
		relativePath === "" ||
		(!relativePath.startsWith("..") && !isAbsolute(relativePath))
	);
};

export const normalizeArtifactStorage = (
	artifactPath: string,
	run: Pick<RunRecord, "rp1ProjectRoot" | "rp1WorkRoot">,
	storageRoot?: ArtifactStorageRoot,
): { readonly path: string; readonly storageRoot: ArtifactStorageRoot } => {
	const normalizeWithinRoot = (
		absolutePath: string,
		rootPath: string,
		targetStorageRoot: ArtifactStorageRoot,
	): {
		readonly path: string;
		readonly storageRoot: ArtifactStorageRoot;
	} | null => {
		if (!isWithinRoot(absolutePath, rootPath)) {
			return null;
		}

		return {
			path: relative(rootPath, absolutePath),
			storageRoot: targetStorageRoot,
		};
	};

	const legacyWorkDir = getLegacyWorkDir(run.rp1ProjectRoot);

	if (storageRoot != null) {
		if (storageRoot === "absolute") {
			return { path: resolve(artifactPath), storageRoot };
		}

		if (isAbsolute(artifactPath)) {
			const absolutePath = resolve(artifactPath);
			if (storageRoot === "work_dir") {
				return (
					normalizeWithinRoot(absolutePath, run.rp1WorkRoot, "work_dir") ??
					normalizeWithinRoot(absolutePath, legacyWorkDir, "work_dir") ?? {
						path: absolutePath,
						storageRoot: "absolute",
					}
				);
			}

			return (
				normalizeWithinRoot(absolutePath, run.rp1ProjectRoot, "project") ?? {
					path: absolutePath,
					storageRoot: "absolute",
				}
			);
		}

		const baseDir =
			storageRoot === "work_dir" ? run.rp1WorkRoot : run.rp1ProjectRoot;
		const resolvedPath = resolve(baseDir, artifactPath);
		if (!isWithinRoot(resolvedPath, baseDir)) {
			return {
				path: resolvedPath,
				storageRoot: "absolute",
			};
		}
		return {
			path: relative(baseDir, resolvedPath),
			storageRoot,
		};
	}

	if (isAbsolute(artifactPath)) {
		const absolutePath = resolve(artifactPath);
		return (
			normalizeWithinRoot(absolutePath, run.rp1WorkRoot, "work_dir") ??
			normalizeWithinRoot(absolutePath, legacyWorkDir, "work_dir") ??
			normalizeWithinRoot(absolutePath, run.rp1ProjectRoot, "project") ?? {
				path: absolutePath,
				storageRoot: "absolute",
			}
		);
	}

	return { path: artifactPath, storageRoot: "work_dir" };
};

async function scanForArtifactDocId(
	rootDir: string,
	docId: string,
	maxDepth = 8,
): Promise<string | null> {
	async function scanDir(dir: string, depth: number): Promise<string | null> {
		if (depth > maxDepth) return null;

		let entries: string[];
		try {
			entries = await readdir(dir);
		} catch {
			return null;
		}

		for (const name of entries) {
			const fullPath = join(dir, name);

			try {
				const fileStat = await stat(fullPath);
				if (fileStat.isDirectory()) {
					const nested = await scanDir(fullPath, depth + 1);
					if (nested) return nested;
					continue;
				}

				if (!fileStat.isFile() || !name.endsWith(".md")) {
					continue;
				}
			} catch {
				continue;
			}

			try {
				const headerBytes = await Bun.file(fullPath).slice(0, 1024).text();
				const match = headerBytes.match(/^rp1_doc_id:\s*(.+)$/m);
				if (match?.[1]?.trim() === docId) {
					return fullPath;
				}
			} catch {}
		}

		return null;
	}

	return scanDir(rootDir, 0);
}

const getArtifactReconciliationRoots = (
	run: Pick<RunRecord, "rp1ProjectRoot" | "rp1WorkRoot">,
	storageRoot: ArtifactStorageRoot,
): readonly string[] =>
	Array.from(
		new Set([
			...(storageRoot === "project" ? [resolve(run.rp1ProjectRoot)] : []),
			...(storageRoot === "absolute" ? [] : [resolve(run.rp1WorkRoot)]),
			...(storageRoot === "absolute"
				? []
				: [getLegacyWorkDir(run.rp1ProjectRoot)]),
		]),
	);

export const resolveArtifactPathForRun = async (
	db: Database,
	run: Pick<RunRecord, "rp1ProjectRoot" | "rp1WorkRoot">,
	artifact: Pick<ArtifactRecord, "docId" | "path" | "storageRoot">,
): Promise<string | null> => {
	if (isAbsolute(artifact.path)) {
		return (await Bun.file(artifact.path).exists()) ? artifact.path : null;
	}

	if (artifact.storageRoot === "work_dir") {
		const workPath = resolve(run.rp1WorkRoot, artifact.path);
		if (await Bun.file(workPath).exists()) {
			return workPath;
		}

		const legacyWorkPath = resolve(
			getLegacyWorkDir(run.rp1ProjectRoot),
			artifact.path,
		);
		if (await Bun.file(legacyWorkPath).exists()) {
			updateArtifactStorage(
				db,
				artifact.docId,
				normalizeArtifactStorage(legacyWorkPath, run, artifact.storageRoot),
			);
			return legacyWorkPath;
		}
	} else {
		const projectPath = resolve(run.rp1ProjectRoot, artifact.path);
		if (await Bun.file(projectPath).exists()) {
			return projectPath;
		}
	}

	for (const rootDir of getArtifactReconciliationRoots(
		run,
		artifact.storageRoot,
	)) {
		const scannedPath = await scanForArtifactDocId(rootDir, artifact.docId);
		if (scannedPath == null) {
			continue;
		}

		updateArtifactStorage(
			db,
			artifact.docId,
			normalizeArtifactStorage(scannedPath, run, artifact.storageRoot),
		);
		return scannedPath;
	}

	return null;
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
			`SELECT COALESCE(rp1_project_root, project_path) as effective_project_path,
			        COUNT(*) as run_count,
			        MAX(updated_at) as last_activity_at
			 FROM runs
			 WHERE COALESCE(rp1_project_root, project_path) IN (${placeholders})
			 GROUP BY COALESCE(rp1_project_root, project_path)`,
		)
		.all(...projectPaths) as {
		effective_project_path: string;
		run_count: number;
		last_activity_at: string | null;
	}[];

	for (const row of rows) {
		result.set(row.effective_project_path, {
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
			`SELECT runs.*,
			        COALESCE(latest_events.last_event_at, runs.created_at) AS last_event_at
			 FROM runs
			 LEFT JOIN (
			     SELECT run_id, MAX(created_at) AS last_event_at
			     FROM events
			     GROUP BY run_id
			 ) AS latest_events ON latest_events.run_id = runs.id
			 WHERE runs.status IN ('waiting', 'failed', 'running')
			 ORDER BY COALESCE(latest_events.last_event_at, runs.updated_at) DESC`,
		)
		.all() as (RunRow & { last_event_at: string })[];

	const waiting: RunRecordWithLastEvent[] = [];
	const failed: RunRecordWithLastEvent[] = [];
	const running: RunRecordWithLastEvent[] = [];

	for (const row of rows) {
		const record: RunRecordWithLastEvent = {
			...runRowToRecord(row),
			lastEventAt: row.last_event_at,
		};
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
