/**
 * Auto-generation logic for notifications in the emit pipeline.
 * Hooks into the emit pipeline after status derivation to create
 * notifications for completed/failed runs and waiting_for_user events.
 */

import type { Database } from "bun:sqlite";
import type { EventType, Status } from "../../../shared/events.js";
import type { NotificationRecord } from "./database.js";
import {
	hasNotificationForSource,
	insertNotification,
} from "./notification-database.js";

/** Maximum length for notification messages derived from agent prompts. */
const MAX_MESSAGE_LENGTH = 200;

/**
 * Truncate a string to the given max length, appending ellipsis if truncated.
 */
const truncateMessage = (message: string, maxLen: number): string =>
	message.length <= maxLen ? message : `${message.slice(0, maxLen - 1)}…`;

/**
 * Build a notification message for a run status change.
 * Uses the workflow name as a human-readable prefix.
 */
const buildStatusMessage = (
	workflow: string | null,
	status: string,
): string => {
	const prefix = workflow && workflow !== "unknown" ? workflow : "Run";
	return `${prefix} ${status}`;
};

/**
 * Build a notification message for a waiting_for_user event.
 * Combines workflow context with the agent's prompt, truncated.
 */
const buildWaitingMessage = (
	workflow: string | null,
	prompt: string,
): string => {
	const prefix = workflow && workflow !== "unknown" ? `${workflow}: ` : "";
	return truncateMessage(`${prefix}${prompt}`, MAX_MESSAGE_LENGTH);
};

/**
 * Conditionally generate a notification based on the event type and status.
 *
 * For status_change events with completed/failed status, creates a system-generated
 * notification with sourceType "run" and deduplication.
 *
 * For waiting_for_user events, creates an agent-initiated notification with
 * sourceType "agent" (no deduplication -- agents may emit multiple prompts per run).
 *
 * Returns the created NotificationRecord or null if no notification was generated.
 */
export const maybeGenerateNotification = (
	db: Database,
	runId: string,
	newStatus: Status,
	eventType: EventType,
	projectId: string | null,
	workflow: string | null,
	_step: string | null,
	eventData: Record<string, unknown> | null,
): NotificationRecord | null => {
	const route = `/runs/${runId}`;

	if (eventType === "waiting_for_user") {
		const prompt =
			(eventData?.prompt as string) ?? "Agent is waiting for input";
		const message = buildWaitingMessage(workflow, prompt);

		return insertNotification(db, {
			message,
			sourceType: "agent",
			sourceId: runId,
			route,
			projectId: projectId ?? undefined,
		});
	}

	if (eventType === "status_change") {
		if (newStatus !== "completed" && newStatus !== "failed") {
			return null;
		}

		const message = buildStatusMessage(workflow, newStatus);

		if (hasNotificationForSource(db, "run", runId, message)) {
			return null;
		}

		return insertNotification(db, {
			message,
			sourceType: "run",
			sourceId: runId,
			route,
			projectId: projectId ?? undefined,
		});
	}

	return null;
};
