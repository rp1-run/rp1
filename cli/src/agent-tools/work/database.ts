/**
 * SQLite database layer for work status tracking.
 * Provides CRUD operations for status updates with auto-initialization.
 */

import { Database } from "bun:sqlite";
import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { pipe } from "fp-ts/lib/function.js";
import * as TE from "fp-ts/lib/TaskEither.js";
import type { CLIError } from "../../../shared/errors.js";
import { runtimeError } from "../../../shared/errors.js";
import type {
	InsertResult,
	QueryOptions,
	StatusUpdateInput,
	StatusUpdateRecord,
	StatusValue,
} from "./models.js";
import { VALID_STATUSES } from "./models.js";

/** Current schema version - must match highest migration number */
export const CURRENT_SCHEMA_VERSION = 5;

/** Default database file location */
const DEFAULT_DB_PATH = join(homedir(), ".rp1", "status.db");

/** Valid feature name pattern (kebab-case with alphanumeric) */
const FEATURE_PATTERN = /^[a-z0-9-]+$/;

/**
 * Validate that a feature name matches the expected pattern.
 * Used to prevent SQL injection when building dynamic queries.
 */
const isValidFeatureName = (name: string): boolean =>
	FEATURE_PATTERN.test(name);

/** SQL schema for status_updates table (version 5 with step column) */
const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS status_updates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_path TEXT NOT NULL,
    feature TEXT NOT NULL,
    step TEXT,
    status TEXT NOT NULL CHECK(status IN ('started', 'in_progress', 'waiting-input', 'needs-review', 'completed', 'failed')),
    message TEXT,
    metadata TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    run_id TEXT,
    expires_at TEXT,
    workflow TEXT
);

CREATE INDEX IF NOT EXISTS idx_status_project ON status_updates(project_path);
CREATE INDEX IF NOT EXISTS idx_status_created ON status_updates(created_at);
CREATE INDEX IF NOT EXISTS idx_status_feature ON status_updates(project_path, feature);
CREATE INDEX IF NOT EXISTS idx_status_run_id ON status_updates(project_path, feature, run_id);
CREATE INDEX IF NOT EXISTS idx_status_expires_at ON status_updates(expires_at);
`;

/**
 * Inline migration SQL registry.
 * Embedded as constants so they work in Bun-compiled binaries where
 * runtime filesystem reads against import.meta.url resolve to $bunfs
 * and the .sql files don't exist.
 *
 * Version 1 is the initial schema created by SCHEMA_SQL above.
 */
const MIGRATIONS: Record<number, string> = {
	2: `-- Migration: Add waiting-input and needs-review status values
CREATE TABLE status_updates_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_path TEXT NOT NULL,
    feature TEXT NOT NULL,
    task TEXT,
    status TEXT NOT NULL CHECK(status IN ('started', 'in_progress', 'waiting-input', 'needs-review', 'completed', 'failed')),
    message TEXT,
    metadata TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

INSERT INTO status_updates_new (id, project_path, feature, task, status, message, metadata, created_at)
SELECT id, project_path, feature, task, status, message, metadata, created_at
FROM status_updates;

DROP TABLE status_updates;

ALTER TABLE status_updates_new RENAME TO status_updates;

CREATE INDEX idx_status_project ON status_updates(project_path);
CREATE INDEX idx_status_created ON status_updates(created_at);
CREATE INDEX idx_status_feature ON status_updates(project_path, feature);`,

	3: `-- Migration: Add run_id and expires_at columns
ALTER TABLE status_updates ADD COLUMN run_id TEXT;
ALTER TABLE status_updates ADD COLUMN expires_at TEXT;

CREATE INDEX idx_status_run_id ON status_updates(project_path, feature, run_id);
CREATE INDEX idx_status_expires_at ON status_updates(expires_at);`,

	4: `-- Migration: Add workflow column
ALTER TABLE status_updates ADD COLUMN workflow TEXT;`,

	5: `-- Migration: Rename task column to step
ALTER TABLE status_updates RENAME COLUMN task TO step;`,
};

/** Get current database schema version from PRAGMA user_version */
const getSchemaVersion = (db: Database): number => {
	const result = db.prepare("PRAGMA user_version").get() as {
		user_version: number;
	};
	return result?.user_version ?? 0;
};

/** Set database schema version using PRAGMA user_version */
const setSchemaVersion = (db: Database, version: number): void => {
	db.exec(`PRAGMA user_version = ${version}`);
};

/**
 * Run all pending migrations atomically.
 * Each migration runs in a transaction for atomicity.
 * Reads SQL from the inline MIGRATIONS map (no filesystem access).
 *
 * @param db - Database connection
 */
const runMigrations = (db: Database): void => {
	const currentVersion = getSchemaVersion(db);

	if (currentVersion >= CURRENT_SCHEMA_VERSION) {
		return;
	}

	for (let v = currentVersion + 1; v <= CURRENT_SCHEMA_VERSION; v++) {
		const migrationSql = MIGRATIONS[v];
		if (!migrationSql) {
			throw new Error(
				`Migration SQL for version ${v} not found in MIGRATIONS map`,
			);
		}

		console.log(`Running migration to schema version ${v}...`);

		db.transaction(() => {
			db.exec(migrationSql);
			setSchemaVersion(db, v);
		})();

		console.log(`Migration to version ${v} complete`);
	}
};

/**
 * Cached database connection (singleton pattern).
 *
 * Why singleton: SQLite with WAL mode benefits from connection reuse - opening
 * multiple connections incurs lock contention and initialization overhead.
 * The status database is accessed frequently during agent operations, so a
 * persistent connection significantly improves write performance.
 *
 * Note: This deviates from the fp-ts immutability patterns used elsewhere.
 * The trade-off is justified for database connections where connection pooling
 * is standard practice.
 */
let dbInstance: Database | null = null;

/**
 * Validate status value against allowed enum.
 */
export const isValidStatus = (status: string): status is StatusValue =>
	VALID_STATUSES.includes(status as StatusValue);

/**
 * Ensure the database directory exists.
 */
const ensureDbDirectory = async (dbPath: string): Promise<void> => {
	const dir = join(dbPath, "..");
	await mkdir(dir, { recursive: true });
};

/**
 * Get or create database connection.
 * Initializes schema on first connection and runs any pending migrations.
 */
const getDatabase = (
	dbPath: string = DEFAULT_DB_PATH,
): TE.TaskEither<CLIError, Database> =>
	TE.tryCatch(
		async () => {
			if (dbInstance) {
				return dbInstance;
			}

			await ensureDbDirectory(dbPath);

			const db = new Database(dbPath, { create: true });

			// Enable WAL mode for better concurrent write performance
			db.exec("PRAGMA journal_mode = WAL;");

			const tableCheck = db
				.prepare(
					"SELECT name FROM sqlite_master WHERE type='table' AND name='status_updates'",
				)
				.get();

			if (!tableCheck) {
				db.exec(SCHEMA_SQL);
				setSchemaVersion(db, CURRENT_SCHEMA_VERSION);
			} else {
				runMigrations(db);
			}

			dbInstance = db;
			return db;
		},
		(error) =>
			runtimeError(
				`Failed to initialize database: ${error instanceof Error ? error.message : String(error)}`,
			),
	);

/**
 * Convert database row to StatusUpdateRecord.
 * Handles column name mapping from snake_case to camelCase.
 */
const rowToRecord = (row: {
	id: number;
	project_path: string;
	feature: string;
	step: string | null;
	status: string;
	message: string | null;
	metadata: string | null;
	created_at: string;
	run_id: string | null;
	expires_at: string | null;
	workflow: string | null;
}): StatusUpdateRecord => ({
	id: row.id,
	projectPath: row.project_path,
	feature: row.feature,
	step: row.step,
	status: row.status as StatusValue,
	message: row.message,
	metadata: row.metadata,
	createdAt: row.created_at,
	runId: row.run_id,
	expiresAt: row.expires_at,
	workflow: row.workflow,
});

/**
 * Insert a new status update record.
 *
 * @param input - Status update data
 * @param dbPath - Database file path (optional, defaults to ~/.rp1/status.db)
 * @returns TaskEither with InsertResult or CLIError
 */
export const insertStatusUpdate = (
	input: StatusUpdateInput,
	dbPath?: string,
): TE.TaskEither<CLIError, InsertResult> =>
	pipe(
		getDatabase(dbPath),
		TE.chain((db) =>
			TE.tryCatch(
				async () => {
					const stmt = db.prepare(`
						INSERT INTO status_updates (project_path, feature, step, status, message, metadata, run_id, expires_at, workflow)
						VALUES ($projectPath, $feature, $step, $status, $message, $metadata, $runId, $expiresAt, $workflow)
						RETURNING id, created_at
					`);

					const result = stmt.get({
						$projectPath: input.projectPath,
						$feature: input.feature,
						$step: input.step ?? null,
						$status: input.status,
						$message: input.message ?? null,
						$metadata: input.metadata ?? null,
						$runId: input.runId ?? null,
						$expiresAt: input.expiresAt ?? null,
						$workflow: input.workflow ?? null,
					}) as { id: number; created_at: string };

					return {
						id: result.id,
						createdAt: result.created_at,
					};
				},
				(error) =>
					runtimeError(
						`Failed to insert status update: ${error instanceof Error ? error.message : String(error)}`,
					),
			),
		),
	);

/**
 * Query status updates by project path.
 *
 * @param options - Query options with filters
 * @param dbPath - Database file path (optional, defaults to ~/.rp1/status.db)
 * @returns TaskEither with array of StatusUpdateRecord or CLIError
 */
export const queryStatusUpdates = (
	options: QueryOptions,
	dbPath?: string,
): TE.TaskEither<CLIError, readonly StatusUpdateRecord[]> =>
	pipe(
		getDatabase(dbPath),
		TE.chain((db) =>
			TE.tryCatch(
				async () => {
					let sql = `
						SELECT id, project_path, feature, step, status, message, metadata, created_at, run_id, expires_at, workflow
						FROM status_updates
						WHERE project_path = $projectPath
					`;
					const params: Record<string, string | number> = {
						$projectPath: options.projectPath,
					};

					if (options.feature) {
						sql += " AND feature = $feature";
						params.$feature = options.feature;
					}

					sql += " ORDER BY created_at DESC";

					if (options.limit) {
						sql += " LIMIT $limit";
						params.$limit = options.limit;
					}

					const stmt = db.prepare(sql);
					const rows = stmt.all(params) as Array<{
						id: number;
						project_path: string;
						feature: string;
						step: string | null;
						status: string;
						message: string | null;
						metadata: string | null;
						created_at: string;
						run_id: string | null;
						expires_at: string | null;
						workflow: string | null;
					}>;

					return rows.map(rowToRecord);
				},
				(error) =>
					runtimeError(
						`Failed to query status updates: ${error instanceof Error ? error.message : String(error)}`,
					),
			),
		),
	);

/**
 * Query recent status updates for multiple features in a single query.
 * Avoids N+1 queries when fetching updates for multiple features.
 *
 * @param projectPath - Project path to filter by
 * @param features - Array of feature names to fetch updates for
 * @param limitPerFeature - Maximum updates per feature (default: 10)
 * @param dbPath - Database file path (optional, defaults to ~/.rp1/status.db)
 * @returns TaskEither with Map of feature -> StatusUpdateRecord[] or CLIError
 */
export const queryStatusUpdatesForFeatures = (
	projectPath: string,
	features: readonly string[],
	limitPerFeature = 10,
	dbPath?: string,
): TE.TaskEither<CLIError, Map<string, StatusUpdateRecord[]>> =>
	pipe(
		getDatabase(dbPath),
		TE.chain((db) =>
			TE.tryCatch(
				async () => {
					if (features.length === 0) {
						return new Map<string, StatusUpdateRecord[]>();
					}

					// Validate feature names to prevent SQL injection
					const invalidFeatures = features.filter(
						(f) => !isValidFeatureName(f),
					);
					if (invalidFeatures.length > 0) {
						throw new Error(
							`Invalid feature names (must match ^[a-z0-9-]+$): ${invalidFeatures.join(", ")}`,
						);
					}

					// Use window function to rank updates per feature
					const placeholders = features.map((_, i) => `$f${i}`).join(", ");
					const sql = `
						SELECT id, project_path, feature, step, status, message, metadata, created_at, run_id, expires_at, workflow
						FROM (
							SELECT *,
								ROW_NUMBER() OVER (PARTITION BY feature ORDER BY created_at DESC) as rn
							FROM status_updates
							WHERE project_path = $projectPath
							AND feature IN (${placeholders})
						)
						WHERE rn <= $limit
						ORDER BY feature, created_at DESC
					`;

					const params: Record<string, string | number> = {
						$projectPath: projectPath,
						$limit: limitPerFeature,
					};
					features.forEach((f, i) => {
						params[`$f${i}`] = f;
					});

					const stmt = db.prepare(sql);
					const rows = stmt.all(params) as Array<{
						id: number;
						project_path: string;
						feature: string;
						step: string | null;
						status: string;
						message: string | null;
						metadata: string | null;
						created_at: string;
						run_id: string | null;
						expires_at: string | null;
						workflow: string | null;
					}>;

					const result = new Map<string, StatusUpdateRecord[]>();
					for (const feature of features) {
						result.set(feature, []);
					}
					for (const row of rows) {
						const records = result.get(row.feature);
						if (records) {
							records.push(rowToRecord(row));
						}
					}

					return result;
				},
				(error) =>
					runtimeError(
						`Failed to query status updates for features: ${error instanceof Error ? error.message : String(error)}`,
					),
			),
		),
	);

/**
 * Get the latest status for each feature in a project.
 *
 * @param projectPath - Project path to filter by
 * @param dbPath - Database file path (optional, defaults to ~/.rp1/status.db)
 * @returns TaskEither with array of StatusUpdateRecord (one per feature) or CLIError
 */
export const getLatestStatusByFeature = (
	projectPath: string,
	dbPath?: string,
): TE.TaskEither<CLIError, readonly StatusUpdateRecord[]> =>
	pipe(
		getDatabase(dbPath),
		TE.chain((db) =>
			TE.tryCatch(
				async () => {
					const stmt = db.prepare(`
						SELECT s.id, s.project_path, s.feature, s.step, s.status, s.message, s.metadata, s.created_at, s.run_id, s.expires_at, s.workflow
						FROM status_updates s
						INNER JOIN (
							SELECT feature, MAX(created_at) as max_created
							FROM status_updates
							WHERE project_path = $projectPath
							GROUP BY feature
						) latest ON s.feature = latest.feature AND s.created_at = latest.max_created
						WHERE s.project_path = $projectPath
						ORDER BY s.created_at DESC
					`);

					const rows = stmt.all({ $projectPath: projectPath }) as Array<{
						id: number;
						project_path: string;
						feature: string;
						step: string | null;
						status: string;
						message: string | null;
						metadata: string | null;
						created_at: string;
						run_id: string | null;
						expires_at: string | null;
						workflow: string | null;
					}>;

					return rows.map(rowToRecord);
				},
				(error) =>
					runtimeError(
						`Failed to get latest status by feature: ${error instanceof Error ? error.message : String(error)}`,
					),
			),
		),
	);

/**
 * Close the database connection.
 * Should be called during application shutdown.
 */
export const closeDatabase = (): void => {
	if (dbInstance) {
		dbInstance.close();
		dbInstance = null;
	}
};

/**
 * Reset the cached database instance.
 * Used for testing to allow fresh database connections.
 */
export const resetDatabaseInstance = (): void => {
	dbInstance = null;
};

/**
 * Get recently completed steps (step-level granularity).
 * Returns all step completions within the given time window.
 *
 * @param projectPath - Project path to filter by
 * @param hoursAgo - Number of hours to look back (default: 24)
 * @param dbPath - Database file path (optional, defaults to ~/.rp1/status.db)
 * @returns TaskEither with array of StatusUpdateRecord for completed steps
 */
export const getRecentlyCompletedSteps = (
	projectPath: string,
	hoursAgo = 24,
	dbPath?: string,
): TE.TaskEither<CLIError, readonly StatusUpdateRecord[]> =>
	pipe(
		getDatabase(dbPath),
		TE.chain((db) =>
			TE.tryCatch(
				async () => {
					const stmt = db.prepare(`
						SELECT id, project_path, feature, step, status, message, metadata, created_at, run_id, expires_at, workflow
						FROM status_updates
						WHERE project_path = $projectPath
						AND status = 'completed'
						AND step IS NOT NULL
						AND created_at >= datetime('now', $hoursOffset)
						ORDER BY created_at DESC
					`);

					const rows = stmt.all({
						$projectPath: projectPath,
						$hoursOffset: `-${hoursAgo} hours`,
					}) as Array<{
						id: number;
						project_path: string;
						feature: string;
						step: string | null;
						status: string;
						message: string | null;
						metadata: string | null;
						created_at: string;
						run_id: string | null;
						expires_at: string | null;
						workflow: string | null;
					}>;

					return rows.map(rowToRecord);
				},
				(error) =>
					runtimeError(
						`Failed to get recently completed steps: ${error instanceof Error ? error.message : String(error)}`,
					),
			),
		),
	);

/**
 * Get count of active (non-completed) features for a project.
 *
 * @param projectPath - Project path to filter by
 * @param dbPath - Database file path (optional, defaults to ~/.rp1/status.db)
 * @returns TaskEither with count of active features
 */
export const getActiveFeatureCount = (
	projectPath: string,
	dbPath?: string,
): TE.TaskEither<CLIError, number> =>
	pipe(
		getDatabase(dbPath),
		TE.chain((db) =>
			TE.tryCatch(
				async () => {
					const stmt = db.prepare(`
						SELECT COUNT(DISTINCT s.feature) as count
						FROM status_updates s
						INNER JOIN (
							SELECT feature, MAX(created_at) as max_created
							FROM status_updates
							WHERE project_path = $projectPath
							GROUP BY feature
						) latest ON s.feature = latest.feature AND s.created_at = latest.max_created
						WHERE s.project_path = $projectPath
						AND s.status != 'completed'
					`);

					const result = stmt.get({ $projectPath: projectPath }) as {
						count: number;
					};
					return result.count;
				},
				(error) =>
					runtimeError(
						`Failed to get active feature count: ${error instanceof Error ? error.message : String(error)}`,
					),
			),
		),
	);

/**
 * Options for querying all latest statuses across projects.
 */
export interface QueryAllLatestStatusesOptions {
	readonly status?: StatusValue;
	readonly projectPath?: string;
	readonly limit?: number;
	readonly offset?: number;
}

/**
 * Query all latest statuses across all projects for dashboard display.
 * Returns the latest status per feature (project_path + feature combination)
 * with optional filters and pagination.
 *
 * @param options - Query options with filters and pagination
 * @param dbPath - Database file path (optional, defaults to ~/.rp1/status.db)
 * @returns TaskEither with records and total count, or CLIError
 */
export const queryAllLatestStatuses = (
	options: QueryAllLatestStatusesOptions,
	dbPath?: string,
): TE.TaskEither<
	CLIError,
	{ records: readonly StatusUpdateRecord[]; total: number }
> =>
	pipe(
		getDatabase(dbPath),
		TE.chain((db) =>
			TE.tryCatch(
				async () => {
					const innerConditions: string[] = [];
					const params: Record<string, string | number> = {};

					if (options.projectPath) {
						innerConditions.push("project_path = $projectPath");
						params.$projectPath = options.projectPath;
					}

					const innerWhere =
						innerConditions.length > 0
							? `WHERE ${innerConditions.join(" AND ")}`
							: "";

					const outerConditions: string[] = [];
					if (options.projectPath) {
						outerConditions.push("s.project_path = $projectPath");
					}
					if (options.status) {
						outerConditions.push("s.status = $status");
						params.$status = options.status;
					}

					const outerWhere =
						outerConditions.length > 0
							? `WHERE ${outerConditions.join(" AND ")}`
							: "";

					const countSql = `
						SELECT COUNT(*) as total
						FROM status_updates s
						INNER JOIN (
							SELECT project_path, feature, MAX(created_at) as max_created
							FROM status_updates
							${innerWhere}
							GROUP BY project_path, feature
						) latest ON s.project_path = latest.project_path
							AND s.feature = latest.feature
							AND s.created_at = latest.max_created
						${outerWhere}
					`;

					const countResult = db.prepare(countSql).get(params) as {
						total: number;
					};
					const total = countResult.total;

					let dataSql = `
						SELECT s.id, s.project_path, s.feature, s.step, s.status, s.message, s.metadata, s.created_at, s.run_id, s.expires_at, s.workflow
						FROM status_updates s
						INNER JOIN (
							SELECT project_path, feature, MAX(created_at) as max_created
							FROM status_updates
							${innerWhere}
							GROUP BY project_path, feature
						) latest ON s.project_path = latest.project_path
							AND s.feature = latest.feature
							AND s.created_at = latest.max_created
						${outerWhere}
						ORDER BY s.created_at DESC
					`;

					if (options.limit !== undefined) {
						dataSql += " LIMIT $limit";
						params.$limit = options.limit;
					}

					if (options.offset !== undefined) {
						dataSql += " OFFSET $offset";
						params.$offset = options.offset;
					}

					const rows = db.prepare(dataSql).all(params) as Array<{
						id: number;
						project_path: string;
						feature: string;
						step: string | null;
						status: string;
						message: string | null;
						metadata: string | null;
						created_at: string;
						run_id: string | null;
						expires_at: string | null;
						workflow: string | null;
					}>;

					return {
						records: rows.map(rowToRecord),
						total,
					};
				},
				(error) =>
					runtimeError(
						`Failed to query all latest statuses: ${error instanceof Error ? error.message : String(error)}`,
					),
			),
		),
	);

/**
 * Query all status updates for a specific project+feature combination.
 * Returns the full timeline ordered chronologically (ASC) for building
 * detailed run views with events, steps, and duration.
 *
 * @param projectPath - Absolute path to the project
 * @param feature - Feature identifier (kebab-case)
 * @param dbPath - Database file path (optional, defaults to ~/.rp1/status.db)
 * @returns TaskEither with array of StatusUpdateRecord ordered by created_at ASC, or CLIError
 */
export const queryAllStatusUpdatesForFeature = (
	projectPath: string,
	feature: string,
	dbPath?: string,
): TE.TaskEither<CLIError, readonly StatusUpdateRecord[]> =>
	pipe(
		getDatabase(dbPath),
		TE.chain((db) =>
			TE.tryCatch(
				async () => {
					const stmt = db.prepare(`
						SELECT id, project_path, feature, step, status, message, metadata, created_at, run_id, expires_at, workflow
						FROM status_updates
						WHERE project_path = $projectPath AND feature = $feature
						ORDER BY created_at ASC
					`);

					const rows = stmt.all({
						$projectPath: projectPath,
						$feature: feature,
					}) as Array<{
						id: number;
						project_path: string;
						feature: string;
						step: string | null;
						status: string;
						message: string | null;
						metadata: string | null;
						created_at: string;
						run_id: string | null;
						expires_at: string | null;
						workflow: string | null;
					}>;

					return rows.map(rowToRecord);
				},
				(error) =>
					runtimeError(
						`Failed to query status updates for feature: ${error instanceof Error ? error.message : String(error)}`,
					),
			),
		),
	);

/**
 * Query a single status update record by its numeric ID.
 *
 * @param id - The auto-incremented row ID
 * @param dbPath - Database file path (optional, defaults to ~/.rp1/status.db)
 * @returns TaskEither with StatusUpdateRecord or null if not found, or CLIError
 */
export const queryStatusUpdateById = (
	id: number,
	dbPath?: string,
): TE.TaskEither<CLIError, StatusUpdateRecord | null> =>
	pipe(
		getDatabase(dbPath),
		TE.chain((db) =>
			TE.tryCatch(
				async () => {
					const stmt = db.prepare(`
						SELECT id, project_path, feature, step, status, message, metadata, created_at, run_id, expires_at, workflow
						FROM status_updates
						WHERE id = $id
					`);

					const row = stmt.get({ $id: id }) as {
						id: number;
						project_path: string;
						feature: string;
						step: string | null;
						status: string;
						message: string | null;
						metadata: string | null;
						created_at: string;
						run_id: string | null;
						expires_at: string | null;
						workflow: string | null;
					} | null;

					return row ? rowToRecord(row) : null;
				},
				(error) =>
					runtimeError(
						`Failed to query status update by ID: ${error instanceof Error ? error.message : String(error)}`,
					),
			),
		),
	);

/**
 * Run statistics for a single project.
 */
export interface ProjectRunStats {
	readonly runCount: number;
	readonly lastActivityAt: string | null;
}

/**
 * Get run statistics (distinct feature count and last activity) for multiple projects
 * in a single GROUP BY query. Avoids N+1 per-project queries.
 *
 * @param projectPaths - Array of absolute project paths to query
 * @param dbPath - Database file path (optional, defaults to ~/.rp1/status.db)
 * @returns TaskEither with Map of project path to run stats, or CLIError
 */
export const getProjectRunStats = (
	projectPaths: readonly string[],
	dbPath?: string,
): TE.TaskEither<CLIError, Map<string, ProjectRunStats>> =>
	pipe(
		getDatabase(dbPath),
		TE.chain((db) =>
			TE.tryCatch(
				async () => {
					if (projectPaths.length === 0) {
						return new Map<string, ProjectRunStats>();
					}

					const placeholders = projectPaths.map((_, i) => `$p${i}`).join(", ");
					const sql = `
						SELECT
							project_path,
							COUNT(DISTINCT feature) as run_count,
							MAX(created_at) as last_activity_at
						FROM status_updates
						WHERE project_path IN (${placeholders})
						GROUP BY project_path
					`;

					const params: Record<string, string> = {};
					projectPaths.forEach((p, i) => {
						params[`$p${i}`] = p;
					});

					const rows = db.prepare(sql).all(params) as Array<{
						project_path: string;
						run_count: number;
						last_activity_at: string | null;
					}>;

					const result = new Map<string, ProjectRunStats>();
					for (const row of rows) {
						result.set(row.project_path, {
							runCount: row.run_count,
							lastActivityAt: row.last_activity_at,
						});
					}

					return result;
				},
				(error) =>
					runtimeError(
						`Failed to get project run stats: ${error instanceof Error ? error.message : String(error)}`,
					),
			),
		),
	);

/**
 * Query the current workflow state for a feature/run combination.
 * Used by transition validation to determine the current position in a state machine.
 *
 * Filters out expired rows (on-read pruning) so stale runs from crashed agents
 * are invisible. NULL expires_at rows are always included (backward compat).
 *
 * @param projectPath - Project path to filter by
 * @param feature - Feature identifier
 * @param runId - Optional run ID for per-invocation isolation (BR-007: no runId = latest-by-timestamp)
 * @param dbPath - Database file path (optional)
 * @returns TaskEither with current step (workflow state) or null if no current state
 */
export const getCurrentWorkflowState = (
	projectPath: string,
	feature: string,
	runId?: string,
	dbPath?: string,
): TE.TaskEither<CLIError, string | null> =>
	pipe(
		getDatabase(dbPath),
		TE.chain((db) =>
			TE.tryCatch(
				async () => {
					const params: Record<string, string> = {
						$projectPath: projectPath,
						$feature: feature,
					};

					let runIdClause: string;
					if (runId) {
						runIdClause = "AND (run_id = $runId OR run_id IS NULL)";
						params.$runId = runId;
					} else {
						runIdClause = "";
					}

					const sql = `
						SELECT step FROM status_updates
						WHERE project_path = $projectPath
						AND feature = $feature
						${runIdClause}
						AND (expires_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now') OR expires_at IS NULL)
						ORDER BY created_at DESC LIMIT 1
					`;

					const row = db.prepare(sql).get(params) as {
						step: string | null;
					} | null;
					return row?.step ?? null;
				},
				(error) =>
					runtimeError(
						`Failed to query current workflow state: ${error instanceof Error ? error.message : String(error)}`,
					),
			),
		),
	);

/**
 * Result of a cleanup operation.
 * Contains the number of deleted rows and affected runs.
 */
export interface CleanupResult {
	readonly deletedRows: number;
	readonly affectedRuns: number;
}

/**
 * Count expired runs for dry-run reporting.
 * A run is considered expired when its latest row has expired.
 *
 * @param olderThanHours - Only count runs whose expires_at is at least N hours in the past (0 = any expired)
 * @param dbPath - Database file path (optional)
 * @returns TaskEither with CleanupResult (count only, no deletion)
 */
export const countExpiredRuns = (
	olderThanHours: number,
	dbPath?: string,
): TE.TaskEither<CLIError, CleanupResult> =>
	pipe(
		getDatabase(dbPath),
		TE.chain((db) =>
			TE.tryCatch(
				async () => {
					const hoursClause =
						olderThanHours > 0 ? `'-${olderThanHours} hours'` : "'0 seconds'";

					const countRunsSql = `
						SELECT COUNT(DISTINCT run_id) as run_count
						FROM status_updates
						WHERE run_id IS NOT NULL
						AND expires_at IS NOT NULL
						AND expires_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', ${hoursClause})
					`;

					const countRowsSql = `
						SELECT COUNT(*) as row_count
						FROM status_updates
						WHERE run_id IN (
							SELECT DISTINCT run_id FROM status_updates
							WHERE run_id IS NOT NULL
							AND expires_at IS NOT NULL
							AND expires_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', ${hoursClause})
						)
					`;

					const runResult = db.prepare(countRunsSql).get() as {
						run_count: number;
					};
					const rowResult = db.prepare(countRowsSql).get() as {
						row_count: number;
					};

					return {
						deletedRows: rowResult.row_count,
						affectedRuns: runResult.run_count,
					};
				},
				(error) =>
					runtimeError(
						`Failed to count expired runs: ${error instanceof Error ? error.message : String(error)}`,
					),
			),
		),
	);

/**
 * Delete all rows belonging to expired runs.
 * A run is expired when its latest row has an expires_at in the past.
 * Deletes entire runs (all rows sharing a run_id), not individual rows.
 *
 * Rows with NULL run_id or NULL expires_at are never touched.
 *
 * @param olderThanHours - Only delete runs whose expires_at is at least N hours in the past (0 = any expired)
 * @param dbPath - Database file path (optional)
 * @returns TaskEither with CleanupResult
 */
export const deleteExpiredRuns = (
	olderThanHours: number,
	dbPath?: string,
): TE.TaskEither<CLIError, CleanupResult> =>
	pipe(
		getDatabase(dbPath),
		TE.chain((db) =>
			TE.tryCatch(
				async () => {
					const hoursClause =
						olderThanHours > 0 ? `'-${olderThanHours} hours'` : "'0 seconds'";

					const countRunsSql = `
						SELECT COUNT(DISTINCT run_id) as run_count
						FROM status_updates
						WHERE run_id IS NOT NULL
						AND expires_at IS NOT NULL
						AND expires_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', ${hoursClause})
					`;

					const runResult = db.prepare(countRunsSql).get() as {
						run_count: number;
					};
					const affectedRuns = runResult.run_count;

					const deleteSql = `
						DELETE FROM status_updates
						WHERE run_id IN (
							SELECT DISTINCT run_id FROM status_updates
							WHERE run_id IS NOT NULL
							AND expires_at IS NOT NULL
							AND expires_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', ${hoursClause})
						)
					`;

					const stmt = db.prepare(deleteSql);
					const result = stmt.run();
					const deletedRows =
						typeof result.changes === "number" ? result.changes : 0;

					return {
						deletedRows,
						affectedRuns,
					};
				},
				(error) =>
					runtimeError(
						`Failed to delete expired runs: ${error instanceof Error ? error.message : String(error)}`,
					),
			),
		),
	);

export { DEFAULT_DB_PATH };
