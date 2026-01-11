/**
 * Type-safe data models for github-pr agent tool.
 * Defines interfaces for GitHub PR operations: submit-review, add-reaction,
 * reply-comment, and fetch-comments.
 */

/**
 * Input for submitting a PR review.
 * Accepts JSON via stdin with owner, repo, PR number, and review details.
 */
export interface SubmitReviewInput {
	readonly owner: string;
	readonly repo: string;
	readonly pr_number: number;
	readonly body: string;
	readonly event: "APPROVE" | "REQUEST_CHANGES" | "COMMENT";
	readonly comments?: readonly ReviewComment[];
}

/**
 * Individual review comment attached to specific code location.
 */
export interface ReviewComment {
	readonly path: string;
	readonly line: number;
	readonly body: string;
}

/**
 * Output from submitting a PR review.
 */
export interface SubmitReviewOutput {
	readonly review_id: number;
	readonly html_url: string;
	readonly comments_posted: number;
}

/**
 * Input for adding a reaction to a comment.
 */
export interface AddReactionInput {
	readonly owner: string;
	readonly repo: string;
	readonly comment_id: number;
	readonly reaction: ReactionType;
}

/**
 * Supported GitHub reaction types.
 */
export type ReactionType =
	| "+1"
	| "-1"
	| "laugh"
	| "confused"
	| "heart"
	| "hooray"
	| "rocket"
	| "eyes";

/**
 * Output from adding a reaction.
 */
export interface AddReactionOutput {
	readonly reaction_id: number;
	readonly content: ReactionType;
}

/**
 * Input for replying to an existing comment.
 */
export interface ReplyCommentInput {
	readonly owner: string;
	readonly repo: string;
	readonly pr_number: number;
	readonly comment_id: number;
	readonly body: string;
}

/**
 * Output from replying to a comment.
 */
export interface ReplyCommentOutput {
	readonly comment_id: number;
	readonly html_url: string;
}

/**
 * Input for fetching PR comments.
 */
export interface FetchCommentsInput {
	readonly owner: string;
	readonly repo: string;
	readonly pr_number: number;
}

/**
 * Output from fetching PR comments.
 */
export interface FetchCommentsOutput {
	readonly review_comments: readonly PRComment[];
	readonly issue_comments: readonly PRComment[];
}

/**
 * Represents a comment on a PR (either review comment or issue comment).
 */
export interface PRComment {
	readonly id: number;
	readonly user: string;
	readonly body: string;
	readonly path?: string;
	readonly line?: number;
	readonly created_at: string;
	readonly is_bot: boolean;
}

/**
 * Validation result for input parsing.
 */
export interface ValidationResult<T> {
	readonly valid: boolean;
	readonly data?: T;
	readonly errors?: readonly string[];
}
