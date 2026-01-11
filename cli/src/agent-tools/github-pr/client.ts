/**
 * Octokit client wrapper for GitHub API operations.
 * Provides authenticated client creation and error handling.
 */

import { Octokit } from "@octokit/rest";
import { pipe } from "fp-ts/lib/function.js";
import * as TE from "fp-ts/lib/TaskEither.js";
import type { CLIError } from "../../../shared/errors.js";
import { configError, runtimeError } from "../../../shared/errors.js";

/**
 * GitHub API error structure from Octokit.
 */
interface GitHubApiError {
	readonly status?: number;
	readonly message?: string;
	readonly response?: {
		readonly data?: {
			readonly message?: string;
		};
	};
}

/**
 * Create an authenticated Octokit client.
 * Reads GITHUB_TOKEN from environment variables.
 *
 * @returns TaskEither with Octokit instance or config error if token missing
 */
export const createOctokitClient = (): TE.TaskEither<CLIError, Octokit> =>
	pipe(
		TE.Do,
		TE.bind("token", () => {
			const token = process.env.GITHUB_TOKEN;
			if (!token) {
				return TE.left(
					configError(
						"GITHUB_TOKEN environment variable is not set",
						"Set GITHUB_TOKEN with a valid GitHub personal access token",
					),
				);
			}
			return TE.right(token);
		}),
		TE.map(
			({ token }) =>
				new Octokit({
					auth: token,
				}),
		),
	);

/**
 * Convert GitHub API errors to CLIError.
 * Handles rate limits, authentication errors, and general API errors.
 *
 * @param error - Error from Octokit API call
 * @param operation - Description of the operation that failed
 * @returns CLIError with appropriate type and message
 */
export const handleGitHubError = (
	error: unknown,
	operation: string,
): CLIError => {
	const apiError = error as GitHubApiError;

	if (apiError.status === 401) {
		return configError(
			`GitHub authentication failed during ${operation}`,
			"Check that GITHUB_TOKEN is valid and has required permissions",
		);
	}

	if (apiError.status === 403) {
		const message = apiError.response?.data?.message || apiError.message || "";
		if (message.toLowerCase().includes("rate limit")) {
			return runtimeError(
				`GitHub API rate limit exceeded during ${operation}. Please wait and try again.`,
				error,
			);
		}
		return configError(
			`GitHub API access forbidden during ${operation}: ${message}`,
			"Ensure GITHUB_TOKEN has sufficient permissions for this operation",
		);
	}

	if (apiError.status === 404) {
		return runtimeError(
			`Resource not found during ${operation}. Check owner, repo, and PR number.`,
			error,
		);
	}

	if (apiError.status === 422) {
		const message = apiError.response?.data?.message || "Validation failed";
		return runtimeError(
			`GitHub API validation error during ${operation}: ${message}`,
			error,
		);
	}

	const errorMessage =
		apiError.response?.data?.message ||
		apiError.message ||
		"Unknown GitHub API error";

	return runtimeError(
		`GitHub API error during ${operation}: ${errorMessage}`,
		error,
	);
};

/**
 * Wrap an Octokit API call with error handling.
 *
 * @param operation - Description of the operation for error messages
 * @param apiCall - Function that performs the API call
 * @returns TaskEither with result or handled error
 */
export const withGitHubErrorHandling = <T>(
	operation: string,
	apiCall: (client: Octokit) => Promise<T>,
): ((client: Octokit) => TE.TaskEither<CLIError, T>) => {
	return (client: Octokit) =>
		TE.tryCatch(
			() => apiCall(client),
			(error) => handleGitHubError(error, operation),
		);
};
