/**
 * Type definitions for the annotation system.
 * Used for inline comments and threading on artifacts.
 */

/** Anchor type for annotations */
export type AnchorType = "text-selection" | "hidden-anchor" | "line";

/** Resolution status */
export type AnnotationStatus = "open" | "resolved";

/** Text selection anchor data */
export interface TextSelectionAnchor {
	readonly type: "text-selection";
	readonly startOffset: number;
	readonly endOffset: number;
	readonly selectedText: string;
	readonly contextBefore: string;
	readonly contextAfter: string;
}

/** Hidden anchor reference */
export interface HiddenAnchor {
	readonly type: "hidden-anchor";
	readonly anchorId: string;
	readonly anchorText: string;
}

/** Line-based anchor */
export interface LineAnchor {
	readonly type: "line";
	readonly lineNumber: number;
	readonly lineContent: string;
}

/** Union of all anchor types */
export type Anchor = TextSelectionAnchor | HiddenAnchor | LineAnchor;

/** Single reply in a thread */
export interface AnnotationReply {
	readonly id: string;
	readonly content: string;
	readonly author: string;
	readonly createdAt: string;
}

/** Full annotation with thread */
export interface Annotation {
	readonly id: string;
	readonly artifactPath: string;
	readonly anchor: Anchor;
	readonly content: string;
	readonly status: AnnotationStatus;
	readonly author: string;
	readonly createdAt: string;
	readonly updatedAt: string;
	readonly replies: readonly AnnotationReply[];
	readonly orphaned: boolean;
}

/** Create annotation request */
export interface CreateAnnotationRequest {
	readonly artifactPath: string;
	readonly anchor: Anchor;
	readonly content: string;
}

/** Add reply request */
export interface AddReplyRequest {
	readonly content: string;
}

/** Annotation filter options */
export interface AnnotationFilter {
	readonly status: AnnotationStatus | "all";
	readonly author: string | null;
	readonly dateRange: "today" | "week" | "month" | "all";
}
