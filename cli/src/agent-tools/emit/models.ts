/**
 * Type re-exports and emit-specific interfaces.
 * Re-exports canonical types from shared/events and defines
 * EmitInput and EmitResult interfaces for the emit tool.
 */

export type {
	AnnotationUpdatedPayload,
	ArtifactRegisteredPayload,
	ArtifactType,
	BtwUpdatePayload,
	EventPayload,
	EventRecord,
	EventType,
	RunRecord,
	Status,
	StatusChangePayload,
	SubflowRegisteredPayload,
	VALID_ARTIFACT_TYPES,
	VALID_EVENT_TYPES,
	VALID_STATUSES,
	WaitingForUserPayload,
} from "../../../shared/events.js";

import type { EventType, Status } from "../../../shared/events.js";

/** Validated input for the emit command after CLI option parsing */
export interface EmitInput {
	readonly type: EventType;
	readonly runId: string;
	readonly step?: string;
	readonly unit?: string;
	readonly data: Record<string, unknown>;
	readonly projectPath: string;
}

/** Result returned from a successful emit operation */
export interface EmitResult {
	readonly eventId: number;
	readonly runId: string;
	readonly type: EventType;
	readonly docId?: string;
	readonly skippedSteps?: readonly string[];
	readonly runStatus: Status;
}
