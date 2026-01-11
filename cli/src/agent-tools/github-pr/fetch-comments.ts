/**
 * Fetch comments operation.
 * Retrieves all review comments and issue comments for a pull request.
 */

import { pipe } from "fp-ts/lib/function.js";
import * as TE from "fp-ts/lib/TaskEither.js";
import type { CLIError } from "../../../shared/errors.js";
import type { ToolResult } from "../models.js";
import { successResult } from "../output.js";
import { createOctokitClient, withGitHubErrorHandling } from "./client.js";
import type {
	FetchCommentsInput,
	FetchCommentsOutput,
	PRComment,
} from "./models.js";
import { parseJsonInput, validateFetchCommentsInput } from "./validation.js";

const TOOL_NAME = "github-pr";

/**
 * Common bot user patterns for detection.
 */
const BOT_PATTERNS = [
	/\[bot\]$/i,
	/-bot$/i,
	/^dependabot$/i,
	/^github-actions$/i,
	/^renovate$/i,
	/^codecov$/i,
	/^sonarcloud$/i,
];

/**
 * Determine if a user is a bot based on username and type.
 *
 * @param username - GitHub username
 * @param userType - User type from GitHub API (e.g., "Bot", "User")
 * @returns true if user appears to be a bot
 */
const isBot = (username: string, userType?: string): boolean => {
	if (userType === "Bot") return true;
	return BOT_PATTERNS.some((pattern) => pattern.test(username));
};

/**
 * Execute fetch-comments operation.
 * Retrieves both review comments and issue comments for a PR.
 *
 * @param input - Raw JSON input string
 * @returns TaskEither with ToolResult containing FetchCommentsOutput
 */
export const executeFetchComments = (
	input: string,
): TE.TaskEither<CLIError, ToolResult<FetchCommentsOutput>> =>
	pipe(
		parseJsonInput<unknown>(input),
		TE.fromEither,
		TE.chain((data) => TE.fromEither(validateFetchCommentsInput(data))),
		TE.chain((validInput: FetchCommentsInput) =>
			pipe(
				createOctokitClient(),
				TE.chain(
					withGitHubErrorHandling(
						"fetch-comments",
						async (client): Promise<FetchCommentsOutput> => {
							const [reviewCommentsResponse, issueCommentsResponse] =
								await Promise.all([
									client.pulls.listReviewComments({
										owner: validInput.owner,
										repo: validInput.repo,
										pull_number: validInput.pr_number,
										per_page: 100,
									}),
									client.issues.listComments({
										owner: validInput.owner,
										repo: validInput.repo,
										issue_number: validInput.pr_number,
										per_page: 100,
									}),
								]);

							const reviewComments: PRComment[] =
								reviewCommentsResponse.data.map((c) => ({
									id: c.id,
									user: c.user?.login ?? "unknown",
									body: c.body,
									path: c.path,
									line: c.line ?? c.original_line ?? undefined,
									created_at: c.created_at,
									is_bot: isBot(c.user?.login ?? "", c.user?.type),
								}));

							const issueComments: PRComment[] = issueCommentsResponse.data.map(
								(c) => ({
									id: c.id,
									user: c.user?.login ?? "unknown",
									body: c.body ?? "",
									created_at: c.created_at,
									is_bot: isBot(c.user?.login ?? "", c.user?.type),
								}),
							);

							return {
								review_comments: reviewComments,
								issue_comments: issueComments,
							};
						},
					),
				),
			),
		),
		TE.map((data) => successResult(TOOL_NAME, data)),
	);
