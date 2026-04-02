/**
 * Canonical type definitions for the rp1 event system.
 *
 * This file is the single source of truth for status enums, event types,
 * and payload interfaces. It is imported by both CLI (Bun via @shared/events)
 * and web-ui (Vite via relative path).
 */

/** Canonical status enum for runs and steps */
export type Status =
	| "not_started"
	| "running"
	| "waiting"
	| "completed"
	| "failed"
	| "skipped";

export const VALID_STATUSES: readonly Status[] = [
	"not_started",
	"running",
	"waiting",
	"completed",
	"failed",
	"skipped",
] as const;

/** The 6 supported event types */
export type EventType =
	| "status_change"
	| "artifact_registered"
	| "annotation_updated"
	| "waiting_for_user"
	| "btw_update"
	| "subflow_registered";

export const VALID_EVENT_TYPES: readonly EventType[] = [
	"status_change",
	"artifact_registered",
	"annotation_updated",
	"waiting_for_user",
	"btw_update",
	"subflow_registered",
] as const;

/** Artifact type classification */
export type ArtifactType =
	| "markdown"
	| "code"
	| "diagram"
	| "diff"
	| "report"
	| "other";

export const VALID_ARTIFACT_TYPES: readonly ArtifactType[] = [
	"markdown",
	"code",
	"diagram",
	"diff",
	"report",
	"other",
] as const;

/** Per-type payload interfaces */

export interface StatusChangePayload {
	readonly status: Status;
	readonly message?: string;
}

export interface ArtifactRegisteredPayload {
	readonly path: string;
	readonly type: ArtifactType;
	readonly projectPath: string;
	readonly feature?: string;
	readonly docId?: string;
	readonly storageRoot: "absolute" | "project" | "work_dir";
}

export interface AnnotationUpdatedPayload {
	readonly docId: string;
	readonly content: string;
	readonly data?: Readonly<Record<string, unknown>>;
	readonly parentId?: number;
}

export interface WaitingForUserPayload {
	readonly prompt: string;
	readonly context?: string;
}

export interface BtwUpdatePayload {
	readonly message: string;
	readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface SubflowRegisteredPayload {
	readonly parentStepId: string;
	readonly subflowName: string;
	readonly steps?: readonly string[];
}

/** Discriminated union of all event payloads */
export type EventPayload =
	| { readonly type: "status_change"; readonly data: StatusChangePayload }
	| {
			readonly type: "artifact_registered";
			readonly data: ArtifactRegisteredPayload;
	  }
	| {
			readonly type: "annotation_updated";
			readonly data: AnnotationUpdatedPayload;
	  }
	| {
			readonly type: "waiting_for_user";
			readonly data: WaitingForUserPayload;
	  }
	| { readonly type: "btw_update"; readonly data: BtwUpdatePayload }
	| {
			readonly type: "subflow_registered";
			readonly data: SubflowRegisteredPayload;
	  };

/** Stored event record shape */
export interface EventRecord {
	readonly id: number;
	readonly runId: string;
	readonly type: EventType;
	readonly step: string | null;
	readonly unit: string | null;
	readonly data: string | null;
	readonly parentStepId: string | null;
	readonly createdAt: string;
}

/** Stored run record shape */
export interface RunRecord {
	readonly id: string;
	readonly flow: string;
	readonly featureId: string;
	readonly projectPath: string;
	readonly rp1ProjectRoot: string;
	readonly rp1KbRoot: string;
	readonly rp1WorkRoot: string;
	readonly projectId: string | null;
	readonly status: Status;
	readonly name: string | null;
	readonly harness: string | null;
	readonly createdAt: string;
	readonly updatedAt: string;
}
