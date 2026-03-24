/**
 * Type-safe data models for PR review configuration and CI context.
 * Defines interfaces for configuration loading and CI environment detection.
 */

/**
 * AI harness types supported for running PR reviews.
 */
export type AIHarness = "claude-code" | "opencode";

/**
 * Verdict modes for PR review submission.
 * - approve: Always submit as APPROVE (advisory-only reviews)
 * - request_changes: Always submit as REQUEST_CHANGES (strict enforcement)
 * - comment: Always submit as COMMENT (neutral)
 * - auto: Determine verdict based on finding severity
 */
export type Verdict = "approve" | "request_changes" | "comment" | "auto";

/**
 * CI platform configuration for explicit platform selection.
 * - github: Use GitHub Actions context extraction (default)
 * - buildkite: Use Buildkite context extraction
 * - gitlab: Use GitLab CI context extraction
 */
export type CIPlatformConfig = "github" | "buildkite" | "gitlab";

/**
 * PR review configuration schema.
 * Maps to `.rp1/config/pr-review.yaml` file structure.
 */
export interface PRReviewConfig {
	/** Enable PR review; default: false */
	readonly enabled: boolean;
	/** Review draft PRs; default: true */
	readonly review_drafts: boolean;
	/** AI harness to use; default: "claude-code" */
	readonly ai_harness: AIHarness;
	/** Post inline comments; default: true */
	readonly add_comments: boolean;
	/** Collapse summary in details tag; default: false */
	readonly collapse_summary: boolean;
	/** Verdict mode; default: "auto" */
	readonly verdict: Verdict;
	/** Max inline comments per review; default: 25 */
	readonly max_comments: number;
	/** Bot identification marker; default: "<!-- rp1-review -->" */
	readonly bot_marker: string;
	/** Generate mermaid diagrams in summary; default: true */
	readonly visualize: boolean;
	/** CI platform configuration; default: "github" */
	readonly ci_platform: CIPlatformConfig;
}

/**
 * Source of PR review configuration.
 * - file: Loaded from pr-review.yaml
 * - defaults: Using default values (no config file)
 */
export type ConfigSource = "file" | "defaults";

/**
 * Result of configuration loading.
 * Contains the resolved config and metadata about the resolution.
 */
export interface PRReviewConfigResult {
	/** The resolved configuration */
	readonly config: PRReviewConfig;
	/** How the configuration was resolved */
	readonly source: ConfigSource;
	/** Path to the config file (only present when source is 'file') */
	readonly configPath?: string;
	/** Environment variable overrides that were applied */
	readonly envOverrides: readonly string[];
}

/**
 * CI platform types that can be detected.
 */
export type CIPlatform =
	| "github_actions"
	| "buildkite"
	| "gitlab_ci"
	| "generic_ci";

/**
 * CI mode detection result.
 */
export interface CIModeResult {
	/** Whether running in a CI environment */
	readonly isCI: boolean;
	/** The detected CI platform (undefined when not in CI) */
	readonly platform?: CIPlatform;
}

/**
 * GitHub event payload structure (subset relevant to PR reviews).
 * From GITHUB_EVENT_PATH JSON file.
 */
export interface GitHubEventPayload {
	readonly action?: string;
	readonly number?: number;
	readonly pull_request?: {
		readonly number: number;
		readonly draft?: boolean;
		readonly head?: {
			readonly ref?: string;
		};
		readonly base?: {
			readonly ref?: string;
		};
	};
	readonly repository?: {
		readonly owner?: {
			readonly login?: string;
		};
		readonly name?: string;
		readonly full_name?: string;
	};
}

/**
 * CI context for GitHub Actions.
 * Contains all information needed to interact with a PR.
 */
export interface GitHubCIContext {
	readonly platform: "github_actions";
	/** Repository owner (org or user) */
	readonly owner: string;
	/** Repository name */
	readonly repo: string;
	/** PR number */
	readonly pr_number: number;
	/** GitHub API token */
	readonly token: string;
	/** Head branch ref */
	readonly head_ref: string;
	/** Base branch ref */
	readonly base_ref: string;
	/** PR action that triggered the workflow */
	readonly action: string;
	/** Whether the PR is a draft */
	readonly is_draft: boolean;
}

/**
 * Generic CI context for other platforms (Buildkite, GitLab, etc.).
 * Placeholder for future platform support.
 */
export interface GenericCIContext {
	readonly platform: "buildkite" | "gitlab_ci" | "generic_ci";
	/** Raw platform-specific context data */
	readonly raw: Record<string, unknown>;
}

/**
 * Local (non-CI) context.
 * Used when running PR review locally for testing/debugging.
 */
export interface LocalContext {
	readonly platform: "local";
}

/**
 * Union type for all execution contexts.
 */
export type ExecutionContext =
	| GitHubCIContext
	| GenericCIContext
	| LocalContext;

/**
 * Result of context extraction.
 */
export interface ContextExtractionResult {
	/** The extracted execution context */
	readonly context: ExecutionContext;
	/** CI mode detection result */
	readonly ciMode: CIModeResult;
}
