/**
 * Reply to comment operation.
 * Posts a reply to an existing PR review comment thread.
 */

import { pipe } from "fp-ts/lib/function.js";
import * as TE from "fp-ts/lib/TaskEither.js";
import type { CLIError } from "../../../shared/errors.js";
import type { ToolResult } from "../models.js";
import { successResult } from "../output.js";
import { createOctokitClient, withGitHubErrorHandling } from "./client.js";
import type { ReplyCommentInput, ReplyCommentOutput } from "./models.js";
import { parseJsonInput, validateReplyCommentInput } from "./validation.js";

const TOOL_NAME = "github-pr";

/**
 * Execute reply-comment operation.
 * Posts a reply to an existing PR review comment.
 *
 * @param input - Raw JSON input string
 * @returns TaskEither with ToolResult containing ReplyCommentOutput
 */
export const executeReplyComment = (
	input: string,
): TE.TaskEither<CLIError, ToolResult<ReplyCommentOutput>> =>
	pipe(
		parseJsonInput<unknown>(input),
		TE.fromEither,
		TE.chain((data) => TE.fromEither(validateReplyCommentInput(data))),
		TE.chain((validInput: ReplyCommentInput) =>
			pipe(
				createOctokitClient(),
				TE.chain(
					withGitHubErrorHandling(
						"reply-comment",
						async (client): Promise<ReplyCommentOutput> => {
							const response = await client.pulls.createReplyForReviewComment({
								owner: validInput.owner,
								repo: validInput.repo,
								pull_number: validInput.pr_number,
								comment_id: validInput.comment_id,
								body: validInput.body,
							});

							return {
								comment_id: response.data.id,
								html_url: response.data.html_url,
							};
						},
					),
				),
			),
		),
		TE.map((data) => successResult(TOOL_NAME, data)),
	);
