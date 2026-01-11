/**
 * Submit PR review operation.
 * Posts a review with optional inline comments to a GitHub pull request.
 */

import { pipe } from "fp-ts/lib/function.js";
import * as TE from "fp-ts/lib/TaskEither.js";
import type { CLIError } from "../../../shared/errors.js";
import type { ToolResult } from "../models.js";
import { successResult } from "../output.js";
import { createOctokitClient, withGitHubErrorHandling } from "./client.js";
import type { SubmitReviewOutput } from "./models.js";
import { parseJsonInput, validateSubmitReviewInput } from "./validation.js";

const TOOL_NAME = "github-pr";

/**
 * Execute submit-review operation.
 * Creates a PR review with optional inline comments.
 *
 * @param input - Raw JSON input string
 * @returns TaskEither with ToolResult containing SubmitReviewOutput
 */
export const executeSubmitReview = (
	input: string,
): TE.TaskEither<CLIError, ToolResult<SubmitReviewOutput>> =>
	pipe(
		parseJsonInput<unknown>(input),
		TE.fromEither,
		TE.chain((data) => TE.fromEither(validateSubmitReviewInput(data))),
		TE.chain((validInput) =>
			pipe(
				createOctokitClient(),
				TE.chain(
					withGitHubErrorHandling(
						"submit-review",
						async (client): Promise<SubmitReviewOutput> => {
							const response = await client.pulls.createReview({
								owner: validInput.owner,
								repo: validInput.repo,
								pull_number: validInput.pr_number,
								body: validInput.body,
								event: validInput.event,
								comments: validInput.comments?.map((c) => ({
									path: c.path,
									line: c.line,
									body: c.body,
								})),
							});

							return {
								review_id: response.data.id,
								html_url: response.data.html_url,
								comments_posted: validInput.comments?.length ?? 0,
							};
						},
					),
				),
			),
		),
		TE.map((data) => successResult(TOOL_NAME, data)),
	);
