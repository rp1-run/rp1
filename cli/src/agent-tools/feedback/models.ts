/**
 * Type-safe data models for the feedback agent tool.
 * Defines interfaces for feedback read, resolve, reply, and accept-edit operations.
 */

/** Feedback read options after validation */
export interface FeedbackReadOptions {
	readonly runId: string;
	readonly status: AnnotationStatusFilter;
	readonly projectPath: string;
}

/** Feedback resolve options after validation */
export interface FeedbackResolveOptions {
	readonly annotationId: number;
	readonly reply?: string;
}

/** Feedback reply options after validation */
export interface FeedbackReplyOptions {
	readonly annotationId: number;
	readonly content: string;
}

/** Feedback accept-edit options after validation */
export interface FeedbackAcceptEditOptions {
	readonly docId: string;
}

/** Valid status filter values for feedback read */
export type AnnotationStatusFilter = "open" | "resolved" | "all";

/** Array of valid annotation status filter values for runtime validation */
export const VALID_STATUS_FILTERS: readonly AnnotationStatusFilter[] = [
	"open",
	"resolved",
	"all",
] as const;

/** Annotation item in feedback read response */
export interface FeedbackAnnotation {
	readonly id: number;
	readonly docId: string;
	readonly artifactPath: string | null;
	readonly content: string;
	readonly anchor: unknown;
	readonly status: string;
	readonly author: string;
	readonly replies: readonly {
		readonly id: number;
		readonly content: string;
		readonly author: string;
		readonly createdAt: string;
	}[];
	readonly createdAt: string;
}

/** Edit item in feedback read response */
export interface FeedbackEdit {
	readonly docId: string;
	readonly artifactPath: string;
	readonly patch: string;
}

/** Full feedback read response */
export interface FeedbackReadResult {
	readonly runId: string;
	readonly annotations: readonly FeedbackAnnotation[];
	readonly edits: readonly FeedbackEdit[];
	readonly summary: {
		readonly totalAnnotations: number;
		readonly totalEdits: number;
		readonly byArtifactType: Record<string, number>;
	};
}

/** Result from a feedback resolve operation */
export interface FeedbackResolveResult {
	readonly resolved: true;
	readonly annotationId: number;
	readonly replyId?: number;
}

/** Result from a feedback reply operation */
export interface FeedbackReplyResult {
	readonly replyId: number;
	readonly annotationId: number;
}

/** Result from a feedback accept-edit operation */
export interface FeedbackAcceptEditResult {
	readonly accepted: true;
	readonly docId: string;
}
