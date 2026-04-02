/**
 * CRUD operations for the notifications table.
 * Provides insert, list, dismiss, and deduplication-check functions
 * following the same patterns as the main database.ts module.
 */

import type { Database } from "bun:sqlite";
import type { NotificationRecord, NotificationSourceType } from "./database.js";

/** Raw notification row shape from SQLite (snake_case). */
interface NotificationRow {
	readonly id: number;
	readonly message: string;
	readonly source_type: string;
	readonly source_id: string | null;
	readonly route: string | null;
	readonly project_id: string | null;
	readonly dismissed: number;
	readonly created_at: string;
}

/** Input for creating a notification. */
export interface InsertNotificationInput {
	readonly message: string;
	readonly sourceType: NotificationSourceType;
	readonly sourceId?: string;
	readonly route?: string;
	readonly projectId?: string;
}

/** Options for listing notifications. */
export interface ListNotificationsOptions {
	readonly projectId?: string;
	readonly limit?: number;
	readonly offset?: number;
}

/** Result shape for paginated notification listing. */
export interface ListNotificationsResult {
	readonly notifications: NotificationRecord[];
	readonly total: number;
}

const notificationRowToRecord = (row: NotificationRow): NotificationRecord => ({
	id: row.id,
	message: row.message,
	sourceType: row.source_type as NotificationSourceType,
	sourceId: row.source_id,
	route: row.route,
	projectId: row.project_id,
	dismissed: row.dismissed === 1,
	createdAt: row.created_at,
});

/**
 * Insert a notification and return the created record.
 */
export const insertNotification = (
	db: Database,
	input: InsertNotificationInput,
): NotificationRecord => {
	const row = db
		.prepare(
			`INSERT INTO notifications (message, source_type, source_id, route, project_id)
			 VALUES ($message, $sourceType, $sourceId, $route, $projectId)
			 RETURNING *`,
		)
		.get({
			$message: input.message,
			$sourceType: input.sourceType,
			$sourceId: input.sourceId ?? null,
			$route: input.route ?? null,
			$projectId: input.projectId ?? null,
		}) as NotificationRow;

	return notificationRowToRecord(row);
};

/**
 * List non-dismissed notifications ordered by created_at DESC with pagination.
 * Optionally filtered by project ID.
 */
export const listNotifications = (
	db: Database,
	options: ListNotificationsOptions = {},
): ListNotificationsResult => {
	const conditions: string[] = ["dismissed = 0"];
	const filterValues: (string | number)[] = [];

	if (options.projectId != null) {
		conditions.push("project_id = ?");
		filterValues.push(options.projectId);
	}

	const whereClause = `WHERE ${conditions.join(" AND ")}`;

	const countRow = db
		.prepare(`SELECT COUNT(*) as count FROM notifications ${whereClause}`)
		.get(...filterValues) as { count: number };

	const limit = options.limit ?? 50;
	const offset = options.offset ?? 0;

	const rows = db
		.prepare(
			`SELECT * FROM notifications ${whereClause}
			 ORDER BY created_at DESC, id DESC
			 LIMIT ? OFFSET ?`,
		)
		.all(...filterValues, limit, offset) as NotificationRow[];

	return {
		notifications: rows.map(notificationRowToRecord),
		total: countRow.count,
	};
};

/**
 * Soft-delete a notification by setting dismissed = 1.
 * Returns true if a row was updated, false if the notification was not found.
 */
export const dismissNotification = (db: Database, id: number): boolean => {
	const result = db
		.prepare(
			"UPDATE notifications SET dismissed = 1 WHERE id = $id AND dismissed = 0",
		)
		.run({ $id: id });

	return result.changes > 0;
};

/**
 * Check whether a notification already exists for a given source type,
 * source ID, and message prefix. Used for deduplication of auto-generated
 * notifications (prevents duplicate notifications from rapid status changes
 * or event replays).
 */
export const hasNotificationForSource = (
	db: Database,
	sourceType: string,
	sourceId: string,
	messagePrefix: string,
): boolean => {
	const row = db
		.prepare(
			`SELECT 1 FROM notifications
			 WHERE source_type = $sourceType
			   AND source_id = $sourceId
			   AND message LIKE $messagePattern
			 LIMIT 1`,
		)
		.get({
			$sourceType: sourceType,
			$sourceId: sourceId,
			$messagePattern: `${messagePrefix}%`,
		});

	return row != null;
};
