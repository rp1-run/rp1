/**
 * CI environment detection module.
 * Detects whether running in a CI environment and identifies the platform.
 */

import { readFile } from "node:fs/promises";
import * as E from "fp-ts/lib/Either.js";
import { pipe } from "fp-ts/lib/function.js";
import * as TE from "fp-ts/lib/TaskEither.js";
import { type CLIError, runtimeError } from "../../shared/errors.js";
import type {
	CIModeResult,
	CIPlatform,
	CIPlatformConfig,
	ContextExtractionResult,
	ExecutionContext,
	GenericCIContext,
	GitHubCIContext,
	GitHubEventPayload,
	LocalContext,
} from "./models.js";

/**
 * Map CIPlatformConfig to CIPlatform.
 * Converts user-facing config values to internal platform identifiers.
 */
const configToPlatform = (config: CIPlatformConfig): CIPlatform => {
	switch (config) {
		case "github":
			return "github_actions";
		case "buildkite":
			return "buildkite";
		case "gitlab":
			return "gitlab_ci";
	}
};

/**
 * Detect if running in a CI environment based on the CI environment variable.
 * This is a simple check that only detects whether we're in CI, not which platform.
 */
const detectCIEnvironment = (): boolean => {
	return (
		process.env.CI === "true" ||
		process.env.GITHUB_ACTIONS === "true" ||
		process.env.BUILDKITE === "true" ||
		process.env.GITLAB_CI === "true"
	);
};

/**
 * Detect CI mode using explicit platform configuration.
 * The platform is always taken from the config (defaults to "github").
 * CI mode is determined by environment variable presence.
 *
 * @param ciPlatformConfig - CI platform from config (defaults to "github")
 * @returns CI mode detection result
 */
export const detectCIMode = (
	ciPlatformConfig: CIPlatformConfig = "github",
): CIModeResult => {
	const isInCI = detectCIEnvironment();
	const platform = configToPlatform(ciPlatformConfig);

	if (isInCI) {
		return { isCI: true, platform };
	}

	return { isCI: false };
};

/**
 * Check if running in CI mode.
 * Convenience function for quick checks.
 */
export const isCI = (): boolean => detectCIMode().isCI;

/**
 * Read and parse the GitHub event payload from GITHUB_EVENT_PATH.
 */
const readGitHubEventPayload = (): TE.TaskEither<
	CLIError,
	GitHubEventPayload
> => {
	const eventPath = process.env.GITHUB_EVENT_PATH;

	if (!eventPath) {
		return TE.left(
			runtimeError(
				"GITHUB_EVENT_PATH environment variable is not set. Cannot extract PR context.",
			),
		);
	}

	return pipe(
		TE.tryCatch(
			async () => {
				const content = await readFile(eventPath, "utf-8");
				return JSON.parse(content) as GitHubEventPayload;
			},
			(error) =>
				runtimeError(
					`Failed to read GitHub event payload from ${eventPath}: ${error instanceof Error ? error.message : String(error)}`,
				),
		),
	);
};

/**
 * Extract owner and repo from GITHUB_REPOSITORY environment variable.
 * Format: "owner/repo"
 */
const parseGitHubRepository = (): E.Either<
	CLIError,
	{ owner: string; repo: string }
> => {
	const repository = process.env.GITHUB_REPOSITORY;

	if (!repository) {
		return E.left(
			runtimeError(
				"GITHUB_REPOSITORY environment variable is not set. Cannot extract repository context.",
			),
		);
	}

	const parts = repository.split("/");
	if (parts.length !== 2 || !parts[0] || !parts[1]) {
		return E.left(
			runtimeError(
				`Invalid GITHUB_REPOSITORY format: "${repository}". Expected "owner/repo".`,
			),
		);
	}

	return E.right({ owner: parts[0], repo: parts[1] });
};

/**
 * Get GitHub token from environment.
 */
const getGitHubToken = (): E.Either<CLIError, string> => {
	const token = process.env.GITHUB_TOKEN;

	if (!token) {
		return E.left(
			runtimeError(
				"GITHUB_TOKEN environment variable is not set. Cannot authenticate with GitHub API.",
			),
		);
	}

	return E.right(token);
};

/**
 * Extract GitHub Actions CI context from environment and event payload.
 *
 * Sources:
 * - GITHUB_EVENT_PATH: PR number, action, draft status
 * - GITHUB_REPOSITORY: owner/repo
 * - GITHUB_TOKEN: auth token
 * - GITHUB_HEAD_REF: head branch
 * - GITHUB_BASE_REF: base branch
 */
export const extractGitHubContext = (): TE.TaskEither<
	CLIError,
	GitHubCIContext
> =>
	pipe(
		TE.Do,
		TE.bind("eventPayload", () => readGitHubEventPayload()),
		TE.bindW("repoInfo", () => TE.fromEither(parseGitHubRepository())),
		TE.bindW("token", () => TE.fromEither(getGitHubToken())),
		TE.chain(({ eventPayload, repoInfo, token }) => {
			const prNumber = eventPayload.pull_request?.number ?? eventPayload.number;

			if (prNumber === undefined) {
				return TE.left(
					runtimeError(
						"Could not extract PR number from GitHub event payload. Is this a pull_request event?",
					),
				);
			}

			const action = eventPayload.action ?? "unknown";
			const isDraft = eventPayload.pull_request?.draft ?? false;
			const headRef =
				process.env.GITHUB_HEAD_REF ??
				eventPayload.pull_request?.head?.ref ??
				"";
			const baseRef =
				process.env.GITHUB_BASE_REF ??
				eventPayload.pull_request?.base?.ref ??
				"";

			const context: GitHubCIContext = {
				platform: "github_actions",
				owner: repoInfo.owner,
				repo: repoInfo.repo,
				pr_number: prNumber,
				token,
				head_ref: headRef,
				base_ref: baseRef,
				action,
				is_draft: isDraft,
			};

			return TE.right(context);
		}),
	);

/**
 * Extract generic CI context (placeholder for non-GitHub platforms).
 */
const extractGenericCIContext = (
	platform: Exclude<CIPlatform, "github_actions">,
): TE.TaskEither<CLIError, GenericCIContext> => {
	// For now, just capture available environment info
	const raw: Record<string, unknown> = {};

	if (platform === "buildkite") {
		raw.buildkite_build_id = process.env.BUILDKITE_BUILD_ID;
		raw.buildkite_branch = process.env.BUILDKITE_BRANCH;
		raw.buildkite_pull_request = process.env.BUILDKITE_PULL_REQUEST;
	} else if (platform === "gitlab_ci") {
		raw.ci_merge_request_iid = process.env.CI_MERGE_REQUEST_IID;
		raw.ci_project_path = process.env.CI_PROJECT_PATH;
		raw.ci_commit_ref_name = process.env.CI_COMMIT_REF_NAME;
	}

	return TE.right<CLIError, GenericCIContext>({
		platform,
		raw,
	});
};

/**
 * Create local (non-CI) context.
 */
const createLocalContext = (): LocalContext => ({
	platform: "local",
});

/**
 * Extract execution context based on detected CI mode.
 * Returns appropriate context type for the environment.
 *
 * @param ciPlatformConfig - Optional explicit CI platform from config
 * @returns TaskEither with context extraction result
 */
export const extractContext = (
	ciPlatformConfig?: CIPlatformConfig,
): TE.TaskEither<CLIError, ContextExtractionResult> => {
	const ciMode = detectCIMode(ciPlatformConfig);

	if (!ciMode.isCI) {
		return TE.right({
			context: createLocalContext(),
			ciMode,
		});
	}

	if (ciMode.platform === "github_actions") {
		return pipe(
			extractGitHubContext(),
			TE.map(
				(context): ContextExtractionResult => ({
					context,
					ciMode,
				}),
			),
		);
	}

	// Other CI platforms - platform is guaranteed non-undefined since isCI is true
	// and we've already handled github_actions above
	const platform = ciMode.platform as Exclude<CIPlatform, "github_actions">;
	return pipe(
		extractGenericCIContext(platform),
		TE.map(
			(context): ContextExtractionResult => ({
				context,
				ciMode,
			}),
		),
	);
};

/**
 * Check if context is a GitHub Actions context.
 * Type guard for narrowing ExecutionContext.
 */
export const isGitHubContext = (
	context: ExecutionContext,
): context is GitHubCIContext => context.platform === "github_actions";

/**
 * Check if context is a local context.
 * Type guard for narrowing ExecutionContext.
 */
export const isLocalContext = (
	context: ExecutionContext,
): context is LocalContext => context.platform === "local";

/**
 * Check if context is a generic CI context.
 * Type guard for narrowing ExecutionContext.
 */
export const isGenericCIContext = (
	context: ExecutionContext,
): context is GenericCIContext =>
	context.platform === "buildkite" ||
	context.platform === "gitlab_ci" ||
	context.platform === "generic_ci";
