/**
 * Add reaction operation.
 * Adds a reaction to an existing PR review comment.
 */

import { pipe } from "fp-ts/lib/function.js";
import * as TE from "fp-ts/lib/TaskEither.js";
import type { CLIError } from "../../../shared/errors.js";
import type { ToolResult } from "../models.js";
import { successResult } from "../output.js";
import { createOctokitClient, withGitHubErrorHandling } from "./client.js";
import type { AddReactionInput, AddReactionOutput } from "./models.js";
import { parseJsonInput, validateAddReactionInput } from "./validation.js";

const TOOL_NAME = "github-pr";

/**
 * Execute add-reaction operation.
 * Adds a reaction to a PR review comment.
 *
 * @param input - Raw JSON input string
 * @returns TaskEither with ToolResult containing AddReactionOutput
 */
export const executeAddReaction = (
	input: string,
): TE.TaskEither<CLIError, ToolResult<AddReactionOutput>> =>
	pipe(
		parseJsonInput<unknown>(input),
		TE.fromEither,
		TE.chain((data) => TE.fromEither(validateAddReactionInput(data))),
		TE.chain((validInput: AddReactionInput) =>
			pipe(
				createOctokitClient(),
				TE.chain(
					withGitHubErrorHandling(
						"add-reaction",
						async (client): Promise<AddReactionOutput> => {
							const response =
								await client.reactions.createForPullRequestReviewComment({
									owner: validInput.owner,
									repo: validInput.repo,
									comment_id: validInput.comment_id,
									content: validInput.reaction,
								});

							return {
								reaction_id: response.data.id,
								content: validInput.reaction,
							};
						},
					),
				),
			),
		),
		TE.map((data) => successResult(TOOL_NAME, data)),
	);
