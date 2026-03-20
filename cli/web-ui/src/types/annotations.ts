/**
 * Type definitions for the annotation system.
 * Used for inline comments and threading on artifacts.
 */

import type { LineDiffEntry } from "../lib/diff-engine";

/** Anchor type for annotations */
export type AnchorType =
	| "text-selection"
	| "hidden-anchor"
	| "line"
	| "edit-diff";

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

/** Edit diff anchor for tracking document changes */
export interface EditDiffAnchor {
	readonly type: "edit-diff";
	readonly diffs: readonly LineDiffEntry[];
	readonly baselineHash: string;
}

/** Union of all anchor types */
export type Anchor =
	| TextSelectionAnchor
	| HiddenAnchor
	| LineAnchor
	| EditDiffAnchor;

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
	readonly docId: string;
	readonly artifactPath?: string;
	readonly runId?: string;
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
	readonly docId: string;
	readonly artifactPath?: string;
	readonly anchor: Anchor;
	readonly content: string;
	readonly runId?: string;
}

/** Add reply request */
export interface AddReplyRequest {
	readonly content: string;
}

/** Anchor type filter for distinguishing edit vs manual annotations */
export type AnchorTypeFilter = "all" | "edit" | "manual";

/** Annotation filter options */
export interface AnnotationFilter {
	readonly status: AnnotationStatus | "all";
	readonly author: string | null;
	readonly dateRange: "today" | "week" | "month" | "all";
	readonly anchorType: AnchorTypeFilter;
}
