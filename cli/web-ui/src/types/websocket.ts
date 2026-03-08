/**
 * WebSocket message types for real-time updates.
 * Extends the existing message types with run-specific events.
 */

import type { Annotation, AnnotationReply } from "./annotations";
import type { Artifact, RunEvent } from "./runs";

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

/** Status change notification with optional optimistic update fields */
export interface StatusChangedMessage {
	type: "status_changed";
	projectId: string;
	feature: string;
	status: string;
	step?: string;
	runStatus?: string;
	timestamp: string;
}

/** Run artifact creation/update notification */
export interface RunArtifactMessage {
	type: "run:artifact";
	runId: string;
	artifact: Artifact;
	timestamp: string;
}

/** Run event stream notification */
export interface RunEventMessage {
	type: "run:event";
	runId: string;
	event: RunEvent;
	timestamp: string;
}

/** Union of all run-related messages */
export type RunMessage = RunArtifactMessage | RunEventMessage;

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
	| StatusChangedMessage
	| RunArtifactMessage
	| RunEventMessage
	| AnnotationCreatedMessage
	| AnnotationUpdatedMessage
	| AnnotationResolvedMessage
	| AnnotationDeletedMessage
	| AnnotationReplyAddedMessage;

/** WebSocket connection status */
export type ConnectionStatus = "connecting" | "connected" | "disconnected";

/** Callback type for attention updates */
export type AttentionCallback = () => void;
