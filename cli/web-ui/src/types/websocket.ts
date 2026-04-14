/**
 * WebSocket message types for real-time updates.
 * Uses the unified event:notification format for all status and artifact updates.
 */

import type { Annotation, AnnotationReply } from "./annotations";

/** File change notification */
export interface FileChangedMessage {
	type: "file:changed";
	path: string;
	changeType: "modify" | "add" | "delete";
	timestamp: string;
}

/** Tree structure change notification */
export interface TreeChangedMessage {
	type: "tree:changed";
	timestamp: string;
}

/** Server heartbeat */
export interface HeartbeatMessage {
	type: "heartbeat";
	timestamp: string;
}

/** Project registry changed notification */
export interface ProjectsChangedMessage {
	type: "projects:changed";
	timestamp: string;
}

/** Unified event notification for all status, artifact, and annotation updates */
export interface EventNotificationMessage {
	type: "event:notification";
	eventId: number;
	eventType: string;
	runId: string;
	projectId: string;
	featureId: string;
	step: string | null;
	data: Record<string, unknown> | null;
	createdAt: string;
}

/** Replayed event for reconnection recovery */
export interface EventReplayMessage {
	type: "event:replay";
	event: {
		id: number;
		runId: string;
		eventType: string;
		step: string | null;
		data: string | null;
		createdAt: string;
	};
}

/** Full state snapshot for reconnection recovery */
export interface StateSnapshotMessage {
	type: "state:snapshot";
	runs: Array<{
		id: string;
		flow: string;
		featureId: string;
		projectPath: string;
		status: string;
		steps: Array<{ step: string; status: string }>;
		artifacts: Array<{ docId: string; path: string; type: string }>;
	}>;
	lastEventId: number;
}

/** Annotation created notification */
export interface AnnotationCreatedMessage {
	type: "annotation:created";
	annotation: Annotation;
	timestamp: string;
}

/** Annotation updated notification */
export interface AnnotationUpdatedMessage {
	type: "annotation:updated";
	annotation: Annotation;
	timestamp: string;
}

/** Annotation resolved notification */
export interface AnnotationResolvedMessage {
	type: "annotation:resolved";
	annotationId: string;
	timestamp: string;
}

/** Annotation deleted notification */
export interface AnnotationDeletedMessage {
	type: "annotation:deleted";
	annotationId: string;
	timestamp: string;
}

/** Annotation reply added notification */
export interface AnnotationReplyAddedMessage {
	type: "annotation:reply-added";
	annotationId: string;
	reply: AnnotationReply;
	timestamp: string;
}

/** Notification created via the notification system */
export interface NotificationCreatedMessage {
	type: "notification:created";
	notification: {
		id: number;
		message: string;
		sourceType: string;
		sourceId: string | null;
		route: string | null;
		projectId: string | null;
		createdAt: string;
	};
}

/** Notification dismissed (soft-deleted) */
export interface NotificationDismissedMessage {
	type: "notification:dismissed";
	notificationId: number;
}

/** Union of all notification-related messages */
export type NotificationMessage =
	| NotificationCreatedMessage
	| NotificationDismissedMessage;

/** Union of all annotation-related messages */
export type AnnotationMessage =
	| AnnotationCreatedMessage
	| AnnotationUpdatedMessage
	| AnnotationResolvedMessage
	| AnnotationDeletedMessage
	| AnnotationReplyAddedMessage;

/** Union of all server messages */
export type ServerMessage =
	| FileChangedMessage
	| TreeChangedMessage
	| HeartbeatMessage
	| ProjectsChangedMessage
	| EventNotificationMessage
	| EventReplayMessage
	| StateSnapshotMessage
	| AnnotationCreatedMessage
	| AnnotationUpdatedMessage
	| AnnotationResolvedMessage
	| AnnotationDeletedMessage
	| AnnotationReplyAddedMessage
	| NotificationCreatedMessage
	| NotificationDismissedMessage;

/** WebSocket connection status */
export type ConnectionStatus = "connecting" | "connected" | "disconnected";

/** Callback type for state snapshot updates */
export type StateSnapshotCallback = (msg: StateSnapshotMessage) => void;

/** Callback type for state snapshot updates */
export type StateSnapshotCallback = (msg: StateSnapshotMessage) => void;
