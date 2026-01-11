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

/** Default database file location */
const DEFAULT_DB_PATH = join(homedir(), ".rp1", "status.db");

/** SQL schema for status_updates table */
const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS status_updates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_path TEXT NOT NULL,
    feature TEXT NOT NULL,
    task TEXT,
    status TEXT NOT NULL CHECK(status IN ('started', 'in_progress', 'completed', 'failed')),
    message TEXT,
    metadata TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_status_project ON status_updates(project_path);
CREATE INDEX IF NOT EXISTS idx_status_created ON status_updates(created_at);
CREATE INDEX IF NOT EXISTS idx_status_feature ON status_updates(project_path, feature);
`;

/** Cached database connection */
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
 * Initializes schema on first connection.
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

			db.exec(SCHEMA_SQL);

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
	task: string | null;
	status: string;
	message: string | null;
	metadata: string | null;
	created_at: string;
}): StatusUpdateRecord => ({
	id: row.id,
	projectPath: row.project_path,
	feature: row.feature,
	task: row.task,
	status: row.status as StatusValue,
	message: row.message,
	metadata: row.metadata,
	createdAt: row.created_at,
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
						INSERT INTO status_updates (project_path, feature, task, status, message, metadata)
						VALUES ($projectPath, $feature, $task, $status, $message, $metadata)
						RETURNING id, created_at
					`);

					const result = stmt.get({
						$projectPath: input.projectPath,
						$feature: input.feature,
						$task: input.task ?? null,
						$status: input.status,
						$message: input.message ?? null,
						$metadata: input.metadata ?? null,
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
						SELECT id, project_path, feature, task, status, message, metadata, created_at
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
						task: string | null;
						status: string;
						message: string | null;
						metadata: string | null;
						created_at: string;
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

					// Use window function to rank updates per feature
					const placeholders = features.map((_, i) => `$f${i}`).join(", ");
					const sql = `
						SELECT id, project_path, feature, task, status, message, metadata, created_at
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
						task: string | null;
						status: string;
						message: string | null;
						metadata: string | null;
						created_at: string;
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
						SELECT s.id, s.project_path, s.feature, s.task, s.status, s.message, s.metadata, s.created_at
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
						task: string | null;
						status: string;
						message: string | null;
						metadata: string | null;
						created_at: string;
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

export { DEFAULT_DB_PATH };
