/**
 * SQLite database layer for the task queue.
 * Provides CRUD operations for task lifecycle management.
 * Reuses the shared database connection from work/database.ts.
 */

import { pipe } from "fp-ts/lib/function.js";
import * as TE from "fp-ts/lib/TaskEither.js";
import type { CLIError } from "../../../shared/errors.js";
import { runtimeError } from "../../../shared/errors.js";
import { getDatabase } from "../work/database.js";
import type {
	TaskCreateInput,
	TaskQueryOptions,
	TaskRecord,
	TaskResolveInput,
} from "./models.js";

/** Raw database row shape for the tasks table. */
interface TaskRow {
	id: number;
	type: string;
	description: string;
	status: string;
	payload: string | null;
	project_path: string | null;
	result: string | null;
	created_at: string;
	updated_at: string;
}

/** Convert a database row to a TaskRecord with camelCase property names. */
const rowToRecord = (row: TaskRow): TaskRecord => ({
	id: row.id,
	type: row.type,
	description: row.description,
	status: row.status as TaskRecord["status"],
	payload: row.payload,
	projectPath: row.project_path,
	result: row.result,
	createdAt: row.created_at,
	updatedAt: row.updated_at,
});

/**
 * Create a new task in pending state.
 *
 * @param input - Task creation data
 * @param dbPath - Database file path (optional, defaults to ~/.rp1/status.db)
 * @returns TaskEither with the created TaskRecord or CLIError
 */
export const createTask = (
	input: TaskCreateInput,
	dbPath?: string,
): TE.TaskEither<CLIError, TaskRecord> =>
	pipe(
		getDatabase(dbPath),
		TE.chain((db) =>
			TE.tryCatch(
				async () => {
					const stmt = db.prepare(`
						INSERT INTO tasks (type, description, payload, project_path)
						VALUES ($type, $description, $payload, $projectPath)
						RETURNING id, type, description, status, payload, project_path, result, created_at, updated_at
					`);

					const row = stmt.get({
						$type: input.type,
						$description: input.description,
						$payload: input.payload ?? null,
						$projectPath: input.projectPath ?? null,
					}) as TaskRow;

					return rowToRecord(row);
				},
				(error) =>
					runtimeError(
						`Failed to create task: ${error instanceof Error ? error.message : String(error)}`,
					),
			),
		),
	);

/**
 * List tasks with optional filters and FIFO ordering.
 *
 * @param options - Query filters (status, projectPath, limit)
 * @param dbPath - Database file path (optional, defaults to ~/.rp1/status.db)
 * @returns TaskEither with array of TaskRecord or CLIError
 */
export const listTasks = (
	options: TaskQueryOptions = {},
	dbPath?: string,
): TE.TaskEither<CLIError, readonly TaskRecord[]> =>
	pipe(
		getDatabase(dbPath),
		TE.chain((db) =>
			TE.tryCatch(
				async () => {
					let sql = `
						SELECT id, type, description, status, payload, project_path, result, created_at, updated_at
						FROM tasks
						WHERE 1=1
					`;
					const params: Record<string, string | number> = {};

					if (options.status) {
						sql += " AND status = $status";
						params.$status = options.status;
					}

					if (options.projectPath) {
						sql += " AND project_path = $projectPath";
						params.$projectPath = options.projectPath;
					}

					sql += " ORDER BY created_at ASC";

					if (options.limit) {
						sql += " LIMIT $limit";
						params.$limit = options.limit;
					}

					const rows = db.prepare(sql).all(params) as TaskRow[];

					return rows.map(rowToRecord);
				},
				(error) =>
					runtimeError(
						`Failed to list tasks: ${error instanceof Error ? error.message : String(error)}`,
					),
			),
		),
	);

/**
 * Atomically pick up the oldest pending task and transition it to in_progress.
 * Uses a single UPDATE...WHERE subquery for atomicity.
 *
 * @param projectPath - Optional project path filter
 * @param dbPath - Database file path (optional, defaults to ~/.rp1/status.db)
 * @returns TaskEither with the picked-up TaskRecord or null if none available
 */
export const pickupTask = (
	projectPath?: string,
	dbPath?: string,
): TE.TaskEither<CLIError, TaskRecord | null> =>
	pipe(
		getDatabase(dbPath),
		TE.chain((db) =>
			TE.tryCatch(
				async () => {
					let subquery = `SELECT id FROM tasks WHERE status = 'pending'`;
					const params: Record<string, string> = {};

					if (projectPath) {
						subquery += " AND project_path = $projectPath";
						params.$projectPath = projectPath;
					}

					subquery += " ORDER BY created_at ASC LIMIT 1";

					const sql = `
						UPDATE tasks
						SET status = 'in_progress',
						    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
						WHERE id = (${subquery})
						RETURNING id, type, description, status, payload, project_path, result, created_at, updated_at
					`;

					const row = db.prepare(sql).get(params) as TaskRow | null;

					return row ? rowToRecord(row) : null;
				},
				(error) =>
					runtimeError(
						`Failed to pick up task: ${error instanceof Error ? error.message : String(error)}`,
					),
			),
		),
	);

/**
 * Mark an in_progress task as completed with an optional result summary.
 *
 * @param input - Task ID and optional result
 * @param dbPath - Database file path (optional, defaults to ~/.rp1/status.db)
 * @returns TaskEither with the completed TaskRecord or CLIError
 */
export const completeTask = (
	input: TaskResolveInput,
	dbPath?: string,
): TE.TaskEither<CLIError, TaskRecord> =>
	pipe(
		getDatabase(dbPath),
		TE.chain((db) =>
			TE.tryCatch(
				async () => {
					const stmt = db.prepare(`
						UPDATE tasks
						SET status = 'completed',
						    result = $result,
						    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
						WHERE id = $id AND status = 'in_progress'
						RETURNING id, type, description, status, payload, project_path, result, created_at, updated_at
					`);

					const row = stmt.get({
						$id: input.id,
						$result: input.result ?? null,
					}) as TaskRow | null;

					if (!row) {
						throw new Error(
							`Task ${input.id} not found or not in in_progress state`,
						);
					}

					return rowToRecord(row);
				},
				(error) =>
					runtimeError(
						`Failed to complete task: ${error instanceof Error ? error.message : String(error)}`,
					),
			),
		),
	);

/**
 * Mark an in_progress task as failed with an optional error description.
 *
 * @param input - Task ID and optional error description
 * @param dbPath - Database file path (optional, defaults to ~/.rp1/status.db)
 * @returns TaskEither with the failed TaskRecord or CLIError
 */
export const failTask = (
	input: TaskResolveInput,
	dbPath?: string,
): TE.TaskEither<CLIError, TaskRecord> =>
	pipe(
		getDatabase(dbPath),
		TE.chain((db) =>
			TE.tryCatch(
				async () => {
					const stmt = db.prepare(`
						UPDATE tasks
						SET status = 'failed',
						    result = $result,
						    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
						WHERE id = $id AND status = 'in_progress'
						RETURNING id, type, description, status, payload, project_path, result, created_at, updated_at
					`);

					const row = stmt.get({
						$id: input.id,
						$result: input.result ?? null,
					}) as TaskRow | null;

					if (!row) {
						throw new Error(
							`Task ${input.id} not found or not in in_progress state`,
						);
					}

					return rowToRecord(row);
				},
				(error) =>
					runtimeError(
						`Failed to fail task: ${error instanceof Error ? error.message : String(error)}`,
					),
			),
		),
	);

/**
 * Cancel a pending or in_progress task.
 * Rejects cancellation of completed or failed tasks.
 *
 * @param id - Task ID to cancel
 * @param dbPath - Database file path (optional, defaults to ~/.rp1/status.db)
 * @returns TaskEither with the cancelled TaskRecord or CLIError
 */
export const cancelTask = (
	id: number,
	dbPath?: string,
): TE.TaskEither<CLIError, TaskRecord> =>
	pipe(
		getDatabase(dbPath),
		TE.chain((db) =>
			TE.tryCatch(
				async () => {
					const stmt = db.prepare(`
						UPDATE tasks
						SET status = 'cancelled',
						    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
						WHERE id = $id AND status IN ('pending', 'in_progress')
						RETURNING id, type, description, status, payload, project_path, result, created_at, updated_at
					`);

					const row = stmt.get({ $id: id }) as TaskRow | null;

					if (!row) {
						throw new Error(
							`Task ${id} not found or not in a cancellable state (must be pending or in_progress)`,
						);
					}

					return rowToRecord(row);
				},
				(error) =>
					runtimeError(
						`Failed to cancel task: ${error instanceof Error ? error.message : String(error)}`,
					),
			),
		),
	);

/**
 * Get a single task by ID.
 *
 * @param id - Task ID
 * @param dbPath - Database file path (optional, defaults to ~/.rp1/status.db)
 * @returns TaskEither with the TaskRecord or CLIError if not found
 */
export const getTask = (
	id: number,
	dbPath?: string,
): TE.TaskEither<CLIError, TaskRecord> =>
	pipe(
		getDatabase(dbPath),
		TE.chain((db) =>
			TE.tryCatch(
				async () => {
					const stmt = db.prepare(`
						SELECT id, type, description, status, payload, project_path, result, created_at, updated_at
						FROM tasks
						WHERE id = $id
					`);

					const row = stmt.get({ $id: id }) as TaskRow | null;

					if (!row) {
						throw new Error(`Task ${id} not found`);
					}

					return rowToRecord(row);
				},
				(error) =>
					runtimeError(
						`Failed to get task: ${error instanceof Error ? error.message : String(error)}`,
					),
			),
		),
	);
