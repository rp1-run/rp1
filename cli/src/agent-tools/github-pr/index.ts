/**
 * GitHub PR agent tool entry point.
 * Provides subcommand handlers for GitHub PR operations:
 * submit-review, add-reaction, reply-comment, fetch-comments.
 *
 * Used by AI agents to interact with GitHub PRs in a deterministic,
 * testable manner rather than invoking gh CLI directly.
 */

import { pipe } from "fp-ts/lib/function.js";
import * as TE from "fp-ts/lib/TaskEither.js";
import type { CLIError } from "../../../shared/errors.js";
import { registerTool, type ToolOptions } from "../index.js";
import type { ToolResult } from "../models.js";
import { successResult } from "../output.js";
import { executeAddReaction } from "./add-reaction.js";
import { executeFetchComments } from "./fetch-comments.js";
import type { FetchCommentsOutput } from "./models.js";
import { executeReplyComment } from "./reply-comment.js";
import { executeSubmitReview } from "./submit-review.js";

/** Tool name used for registration and output */
const TOOL_NAME = "github-pr";

/**
 * Main execute function for tool registration.
 * The github-pr tool uses subcommands, so this is a placeholder
 * that returns an empty fetch-comments result. Actual execution
 * is done via the exported execute* functions called from command.ts.
 */
const execute = (
	_input: string,
	_options: ToolOptions,
): TE.TaskEither<CLIError, ToolResult<FetchCommentsOutput>> =>
	pipe(
		TE.right<CLIError, FetchCommentsOutput>({
			review_comments: [],
			issue_comments: [],
		}),
		TE.map((data) => successResult(TOOL_NAME, data)),
	);

/** Register this tool with the framework */
registerTool({
	name: TOOL_NAME,
	description:
		"GitHub PR operations (submit-review, add-reaction, reply-comment, fetch-comments)",
	execute,
});

export {
	executeAddReaction,
	executeFetchComments,
	executeReplyComment,
	executeSubmitReview,
	TOOL_NAME,
};

export type {
	AddReactionInput,
	AddReactionOutput,
	FetchCommentsInput,
	FetchCommentsOutput,
	PRComment,
	ReactionType,
	ReplyCommentInput,
	ReplyCommentOutput,
	ReviewComment,
	SubmitReviewInput,
	SubmitReviewOutput,
} from "./models.js";
