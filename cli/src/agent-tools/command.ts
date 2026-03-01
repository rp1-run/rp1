/**
 * CLI command integration for agent-tools framework.
 * Provides Commander.js commands for AI agent tools.
 */

import { Command } from "commander";
import * as E from "fp-ts/lib/Either.js";
import { formatError } from "../../shared/errors.js";
import { executeExtract } from "./comment-extract/index.js";
import {
	executeAddReaction,
	executeFetchComments,
	executeReplyComment,
	executeSubmitReview,
} from "./github-pr/index.js";
import { getTool, type ToolOptions } from "./index.js";
import { readInput } from "./input.js";
import { formatOutput } from "./output.js";
import {
	closeDatabase,
	executeCleanup as executeWorkCleanup,
	executeUpdate as executeWorkUpdate,
} from "./work/index.js";
import { VALID_STATUSES } from "./work/models.js";
import { validateUpdateOptions } from "./work/update.js";

// Register process exit handlers for graceful cleanup
const cleanupAndExit = () => {
	closeDatabase();
};
process.on("exit", cleanupAndExit);
process.on("SIGTERM", () => {
	cleanupAndExit();
	process.exit(0);
});
process.on("SIGINT", () => {
	cleanupAndExit();
	process.exit(0);
});

import {
	executeCleanup,
	executeCreate,
	executeStatus,
} from "./worktree/index.js";

import "./mmd-validate/index.js";
import "./rp1-root-dir/index.js";
import "./worktree/index.js";
import "./comment-extract/index.js";
import "./github-pr/index.js";
import "./work/index.js";

/** Default timeout for tool execution in milliseconds */
const DEFAULT_TIMEOUT = 30000;

/**
 * Create JSON error response for tool execution failures.
 * Used when the tool itself fails to execute (not validation errors).
 */
const createErrorResponse = (tool: string, message: string): string =>
	JSON.stringify(
		{
			success: false,
			tool,
			data: null,
			errors: [{ message }],
		},
		null,
		2,
	);

/**
 * Agent-tools parent command.
 * Container for all AI agent tool subcommands.
 */
export const agentToolsCommand = new Command("agent-tools")
	.description("Tools for AI agents")
	.addHelpText(
		"after",
		`
Available Tools:
  mmd-validate      Validate Mermaid diagram syntax
  rp1-root-dir      Resolve RP1_ROOT path with worktree awareness
  worktree          Manage git worktrees for isolated agent execution
  comment-extract   Extract comments from git-changed files
  github-pr         GitHub PR operations (submit-review, add-reaction, reply-comment, fetch-comments)
  work              Track agent workflow progress with status updates

Examples:
  rp1 agent-tools mmd-validate ./document.md
  cat diagram.mmd | rp1 agent-tools mmd-validate
  echo "graph TD; A-->B" | rp1 agent-tools mmd-validate
  rp1 agent-tools rp1-root-dir
  rp1 agent-tools worktree create fix-auth-bug
  rp1 agent-tools worktree status
  rp1 agent-tools worktree cleanup /path/to/worktree
  rp1 agent-tools comment-extract branch main
  rp1 agent-tools comment-extract unstaged main
  echo '{"owner":"org","repo":"repo","pr_number":123}' | rp1 agent-tools github-pr fetch-comments
  rp1 agent-tools work update --project /path/to/project --feature my-feature --status in_progress
`,
	);

/**
 * mmd-validate subcommand.
 * Validates Mermaid diagram syntax in markdown documents or raw input.
 */
agentToolsCommand
	.command("mmd-validate [file]")
	.description("Validate Mermaid diagram syntax in markdown or raw input")
	.option(
		"-t, --timeout <ms>",
		"Validation timeout in milliseconds",
		String(DEFAULT_TIMEOUT),
	)
	.addHelpText(
		"after",
		`
Description:
  Validates Mermaid diagram syntax using the official Mermaid library.
  Accepts markdown files with embedded mermaid blocks or raw mermaid code.

Input:
  - File path: rp1 agent-tools mmd-validate ./document.md
  - Stdin (markdown): cat doc.md | rp1 agent-tools mmd-validate
  - Stdin (raw mermaid): echo "graph TD; A-->B" | rp1 agent-tools mmd-validate

Output:
  JSON with validation results for all diagrams found.
  Exit code 0 for validation results (even if diagrams are invalid).
  Exit code 1 only for tool execution errors (file not found, etc.).

Examples:
  # Validate a markdown file with embedded mermaid diagrams
  rp1 agent-tools mmd-validate ./README.md

  # Validate raw mermaid from stdin
  echo "graph TD; A-->B" | rp1 agent-tools mmd-validate

  # Validate with custom timeout
  rp1 agent-tools mmd-validate ./large-doc.md --timeout 60000
`,
	)
	.action(
		async (
			file: string | undefined,
			options: { timeout: string },
		): Promise<void> => {
			const toolName = "mmd-validate";

			const timeout = parseInt(options.timeout, 10);
			if (Number.isNaN(timeout) || timeout <= 0) {
				console.error(
					createErrorResponse(
						toolName,
						`Invalid timeout value: ${options.timeout}. Must be a positive integer.`,
					),
				);
				process.exit(1);
			}

			const inputResult = await readInput(file)();

			if (E.isLeft(inputResult)) {
				console.error(
					createErrorResponse(toolName, formatError(inputResult.left, false)),
				);
				process.exit(1);
			}

			const { content, source } = inputResult.right;

			const tool = getTool(toolName);
			if (!tool) {
				console.error(
					createErrorResponse(toolName, "Tool not found in registry"),
				);
				process.exit(1);
			}

			const toolOptions: ToolOptions = {
				timeout,
				inputSource: source,
				filePath: file,
			};

			const result = await tool.execute(content, toolOptions)();

			if (E.isLeft(result)) {
				console.error(
					createErrorResponse(toolName, formatError(result.left, false)),
				);
				process.exit(1);
			}

			console.log(formatOutput(result.right));
			process.exit(0);
		},
	);

/**
 * rp1-root-dir subcommand.
 * Resolves RP1_ROOT path with worktree awareness for KB and artifact access.
 */
agentToolsCommand
	.command("rp1-root-dir")
	.description("Resolve RP1_ROOT path with worktree awareness")
	.addHelpText(
		"after",
		`
Description:
  Returns the resolved RP1_ROOT path, enabling agents to access KB and work
  artifacts from the main repository when running in a linked git worktree.

Output:
  JSON with root path and worktree detection info:
  - root: Absolute path to RP1_ROOT directory
  - isWorktree: Whether running in a linked git worktree
  - worktreeName: Branch name if in worktree
  - source: How root was resolved ('env', 'git-common-dir', or 'cwd')

Examples:
  rp1 agent-tools rp1-root-dir
`,
	)
	.action(async (): Promise<void> => {
		const toolName = "rp1-root-dir";

		const tool = getTool(toolName);
		if (!tool) {
			console.error(
				createErrorResponse(toolName, "Tool not found in registry"),
			);
			process.exit(1);
		}

		const result = await tool.execute("", { inputSource: "stdin" })();

		if (E.isLeft(result)) {
			console.error(
				createErrorResponse(toolName, formatError(result.left, false)),
			);
			process.exit(1);
		}

		console.log(formatOutput(result.right));
		process.exit(0);
	});

/**
 * worktree subcommand.
 * Manages git worktrees for isolated agent execution.
 */
const worktreeCommand = agentToolsCommand
	.command("worktree")
	.description("Manage git worktrees for isolated agent execution")
	.addHelpText(
		"after",
		`
Description:
  Provides subcommands for creating, cleaning up, and checking status of
  git worktrees used for isolated agent execution. Worktrees enable agents
  to make changes without affecting the user's uncommitted work.

Subcommands:
  create <slug>    Create an isolated worktree for agent execution
  cleanup <path>   Remove a worktree and optionally delete the branch
  status           Check if running in a worktree

Examples:
  rp1 agent-tools worktree create fix-auth-bug
  rp1 agent-tools worktree create add-feature --prefix feature
  rp1 agent-tools worktree status
  rp1 agent-tools worktree cleanup /path/to/worktree
  rp1 agent-tools worktree cleanup /path/to/worktree --no-keep-branch
`,
	);

/**
 * worktree create subcommand.
 * Creates an isolated git worktree for agent execution.
 */
worktreeCommand
	.command("create <slug>")
	.description("Create an isolated worktree for agent execution")
	.option("-p, --prefix <prefix>", "Branch prefix", "quick-build")
	.addHelpText(
		"after",
		`
Description:
  Creates a new git worktree based on HEAD with a new branch named
  {prefix}-{slug}. The worktree is created in {RP1_ROOT}/work/worktrees/.

Arguments:
  slug    Task identifier used in branch naming (e.g., "fix-auth-bug")

Options:
  --prefix <prefix>    Branch prefix (default: "quick-build")

Output:
  JSON with worktree creation details:
  - path: Absolute path to the created worktree
  - branch: Name of the created branch
  - basedOn: Commit SHA the worktree is based on

Examples:
  rp1 agent-tools worktree create fix-auth-bug
  rp1 agent-tools worktree create add-feature --prefix feature
`,
	)
	.action(async (slug: string, options: { prefix: string }): Promise<void> => {
		const toolName = "worktree";

		const result = await executeCreate({
			slug,
			prefix: options.prefix,
		})();

		if (E.isLeft(result)) {
			console.error(
				createErrorResponse(toolName, formatError(result.left, false)),
			);
			process.exit(1);
		}

		console.log(formatOutput(result.right));
		process.exit(0);
	});

/**
 * worktree cleanup subcommand.
 * Removes a worktree and optionally deletes the associated branch.
 */
worktreeCommand
	.command("cleanup <path>")
	.description("Remove a worktree and optionally delete the branch")
	.option("--keep-branch", "Preserve the branch after removing worktree", true)
	.option("--no-keep-branch", "Delete the branch after removing worktree")
	.option("-f, --force", "Force removal even if worktree has changes", false)
	.addHelpText(
		"after",
		`
Description:
  Removes a git worktree directory and prunes stale references.
  By default, preserves the associated branch for later use.

Arguments:
  path    Absolute or relative path to the worktree to remove

Options:
  --keep-branch        Preserve the branch (default: true)
  --no-keep-branch     Delete the branch after removing worktree
  --force, -f          Force removal even if worktree has uncommitted changes

Output:
  JSON with cleanup results:
  - removed: Whether the worktree was successfully removed
  - branchDeleted: Whether the associated branch was deleted
  - path: Absolute path of the removed worktree

Examples:
  rp1 agent-tools worktree cleanup /path/to/worktree
  rp1 agent-tools worktree cleanup /path/to/worktree --no-keep-branch
  rp1 agent-tools worktree cleanup /path/to/worktree --force
`,
	)
	.action(
		async (
			worktreePath: string,
			options: { keepBranch: boolean; force: boolean },
		): Promise<void> => {
			const toolName = "worktree";

			const result = await executeCleanup({
				path: worktreePath,
				keepBranch: options.keepBranch,
				force: options.force,
			})();

			if (E.isLeft(result)) {
				console.error(
					createErrorResponse(toolName, formatError(result.left, false)),
				);
				process.exit(1);
			}

			console.log(formatOutput(result.right));
			process.exit(0);
		},
	);

/**
 * worktree status subcommand.
 * Checks if currently running in a git worktree.
 */
worktreeCommand
	.command("status")
	.description("Check if running in a worktree")
	.addHelpText(
		"after",
		`
Description:
  Detects whether the current working directory is inside a linked git worktree
  and returns information about the worktree if so.

Output:
  JSON with worktree status:
  - isWorktree: Whether running in a linked git worktree
  - path: Worktree path (if in worktree)
  - branch: Branch name (if in worktree)
  - mainRepoPath: Path to the main repository (if in worktree)

Examples:
  rp1 agent-tools worktree status
`,
	)
	.action(async (): Promise<void> => {
		const toolName = "worktree";

		const result = await executeStatus()();

		if (E.isLeft(result)) {
			console.error(
				createErrorResponse(toolName, formatError(result.left, false)),
			);
			process.exit(1);
		}

		console.log(formatOutput(result.right));
		process.exit(0);
	});

/**
 * comment-extract subcommand.
 * Extracts comments from git-changed files for analysis.
 */
agentToolsCommand
	.command("comment-extract <scope> <base>")
	.description("Extract comments from git-changed files")
	.option("--line-scoped", "Only extract comments on changed lines", false)
	.addHelpText(
		"after",
		`
Description:
  Extracts comments from files changed in a git scope for analysis.
  Supports multiple languages including Python, JavaScript, TypeScript,
  Go, Rust, Java, C/C++, Ruby, PHP, and Shell scripts.

Arguments:
  scope    Git scope: "branch", "unstaged", or a commit range (e.g., "abc123..def456")
  base     Base branch for comparison (e.g., "main", "master")

Options:
  --line-scoped    Only include comments on lines that actually changed (for commit ranges)

Output:
  JSON with extraction results:
  - scope: The scope used
  - base: Base branch
  - filesScanned: Number of files processed
  - linesAdded: Total lines added in diff
  - comments: Array of comment objects with file, line, type, content, context

Examples:
  # Extract from branch changes
  rp1 agent-tools comment-extract branch main

  # Extract from unstaged changes
  rp1 agent-tools comment-extract unstaged main

  # Extract from commit range with line-scoped filtering
  rp1 agent-tools comment-extract "abc123..def456" main --line-scoped
`,
	)
	.action(
		async (
			scope: string,
			base: string,
			options: { lineScoped: boolean },
		): Promise<void> => {
			const toolName = "comment-extract";

			const result = await executeExtract({
				scope,
				base,
				lineScoped: options.lineScoped,
			})();

			if (E.isLeft(result)) {
				console.error(
					createErrorResponse(toolName, formatError(result.left, false)),
				);
				process.exit(1);
			}

			console.log(formatOutput(result.right));
			process.exit(0);
		},
	);

/**
 * work subcommand.
 * Tracks agent workflow progress with status updates.
 */
const workCommand = agentToolsCommand
	.command("work")
	.description("Track agent workflow progress with status updates")
	.addHelpText(
		"after",
		`
Description:
  Provides subcommands for tracking agent workflow progress via status updates.
  Status updates are stored in a global SQLite database at ~/.rp1/status.db.

Subcommands:
  update    Record a status update for a feature/task

Examples:
  rp1 agent-tools work update --project /path/to/project --feature my-feature --status started
  rp1 agent-tools work update --project /path/to/project --feature my-feature --task T1 --status in_progress --message "Working on requirements"
`,
	);

/**
 * work update subcommand.
 * Records a status update for agent workflow tracking.
 */
workCommand
	.command("update")
	.description("Record a status update for a feature/task")
	.requiredOption("-p, --project <path>", "Absolute path to project root")
	.requiredOption("-f, --feature <name>", "Feature identifier (kebab-case)")
	.option("-t, --task <id>", "Task identifier within feature")
	.requiredOption(
		"-s, --status <status>",
		`Status state (${VALID_STATUSES.join(", ")})`,
	)
	.option("-m, --message <text>", "Human-readable status message")
	.option("--metadata <json>", "JSON string for additional context")
	.option(
		"-w, --workflow <name>",
		"State machine workflow to validate against (skill name with state.mmd)",
	)
	.option(
		"--run-id <id>",
		"Workflow run isolation ID (UUID) for tracking separate invocations",
	)
	.option(
		"--ttl <seconds>",
		"TTL in seconds for expires_at timestamp (default: 28800 = 8 hours)",
	)
	.addHelpText(
		"after",
		`
Description:
  Records a status update to the global status database (~/.rp1/status.db).
  Creates the database file automatically on first invocation.

  When --workflow is provided, the command loads the skill's state machine
  (state.mmd), validates that the transition is permitted, computes an
  expires_at timestamp for stale row cleanup, and inserts the record with
  run isolation via --run-id.

Arguments:
  --project <path>     Absolute path to project root (required)
  --feature <name>     Feature identifier in kebab-case (required)
  --task <id>          Task/workflow state identifier (required when --workflow is set)
  --status <status>    Status state: ${VALID_STATUSES.join(", ")} (required)
  --message <text>     Human-readable status message (optional)
  --metadata <json>    JSON string for additional context (optional)
  --workflow <name>    Skill name whose state.mmd to validate against (optional)
  --run-id <id>        UUID grouping updates into a discrete workflow run (optional)
  --ttl <seconds>      TTL for expires_at in seconds (default: 28800 = 8h, only with --workflow)

Validation:
  - Project path must be absolute
  - Feature name must match pattern ^[a-z0-9-]+$
  - Status must be one of the valid states
  - Metadata must be valid JSON if provided
  - When --workflow is set: --task must be a valid state in the state machine
  - Transitions are validated against the state machine graph
  - First update must target an initial state

Output:
  JSON with the recorded status update:
  - id: Auto-generated record ID
  - projectPath: Project path
  - feature: Feature name
  - task: Task identifier (null if not specified)
  - status: Status state
  - message: Status message (null if not specified)
  - createdAt: ISO 8601 UTC timestamp

Examples:
  # Record feature start (no workflow validation)
  rp1 agent-tools work update \\
    --project /Users/dev/myapp \\
    --feature auth-refactor \\
    --status started \\
    --message "Starting feature implementation"

  # Record workflow transition with validation
  rp1 agent-tools work update \\
    --project /Users/dev/myapp \\
    --feature auth-refactor \\
    --workflow build \\
    --run-id "550e8400-e29b-41d4-a716-446655440000" \\
    --task requirements \\
    --status in_progress \\
    --message "Gathering requirements"

  # Record transition with custom TTL
  rp1 agent-tools work update \\
    --project /Users/dev/myapp \\
    --feature auth-refactor \\
    --workflow build \\
    --run-id "550e8400-e29b-41d4-a716-446655440000" \\
    --task design \\
    --status in_progress \\
    --ttl 3600
`,
	)
	.action(
		async (options: {
			project: string;
			feature: string;
			task?: string;
			status: string;
			message?: string;
			metadata?: string;
			workflow?: string;
			runId?: string;
			ttl?: string;
		}): Promise<void> => {
			const toolName = "work";

			const validationResult = await validateUpdateOptions(options)();

			if (E.isLeft(validationResult)) {
				console.error(
					createErrorResponse(
						toolName,
						formatError(validationResult.left, false),
					),
				);
				process.exit(1);
			}

			const result = await executeWorkUpdate(validationResult.right)();

			if (E.isLeft(result)) {
				console.error(
					createErrorResponse(toolName, formatError(result.left, false)),
				);
				process.exit(1);
			}

			console.log(formatOutput(result.right));
			process.exit(0);
		},
	);

/**
 * work cleanup subcommand.
 * Deletes expired runs (all rows for runs whose latest row has expired).
 */
workCommand
	.command("cleanup")
	.description("Delete expired workflow runs from the status database")
	.option(
		"--dry-run",
		"Report stale rows and affected runs without deleting",
		false,
	)
	.option(
		"--older-than <hours>",
		"Only delete runs whose expires_at is at least N hours in the past (0 = any expired)",
		"0",
	)
	.addHelpText(
		"after",
		`
Description:
  Deletes entire expired runs (all rows sharing a run_id) from the status database.
  A run is considered expired when its latest row has an expires_at timestamp in the past.
  Rows with NULL run_id or NULL expires_at are never touched.

Options:
  --dry-run              Report stale rows without deleting (default: false)
  --older-than <hours>   Only delete runs expired at least N hours ago (default: 0 = any expired)

Output:
  JSON with cleanup results:
  - deletedRows: Number of rows deleted (or would be deleted in dry-run)
  - affectedRuns: Number of distinct runs affected

Examples:
  # Delete all expired runs
  rp1 agent-tools work cleanup

  # Preview what would be deleted
  rp1 agent-tools work cleanup --dry-run

  # Delete only runs expired more than 24 hours ago
  rp1 agent-tools work cleanup --older-than 24

  # Preview runs expired more than 48 hours ago
  rp1 agent-tools work cleanup --dry-run --older-than 48
`,
	)
	.action(
		async (options: { dryRun: boolean; olderThan: string }): Promise<void> => {
			const toolName = "work";

			const olderThan = parseInt(options.olderThan, 10);
			if (Number.isNaN(olderThan) || olderThan < 0) {
				console.error(
					createErrorResponse(
						toolName,
						`Invalid --older-than value: ${options.olderThan}. Must be a non-negative integer (hours).`,
					),
				);
				process.exit(1);
			}

			const result = await executeWorkCleanup({
				dryRun: options.dryRun,
				olderThan,
			})();

			if (E.isLeft(result)) {
				console.error(
					createErrorResponse(toolName, formatError(result.left, false)),
				);
				process.exit(1);
			}

			console.log(formatOutput(result.right));
			process.exit(0);
		},
	);

/**
 * github-pr subcommand.
 * GitHub PR operations for AI agents.
 */
const githubPrCommand = agentToolsCommand
	.command("github-pr")
	.description("GitHub PR operations for AI agents")
	.addHelpText(
		"after",
		`
Description:
  Provides subcommands for GitHub PR operations used by AI agents.
  All operations accept JSON input via stdin and output JSON results.
  Requires GITHUB_TOKEN environment variable for authentication.

Subcommands:
  submit-review    Submit a PR review with optional inline comments
  add-reaction     Add a reaction to a PR comment
  reply-comment    Reply to an existing PR comment thread
  fetch-comments   Fetch all comments from a PR

Examples:
  # Submit a review
  echo '{"owner":"org","repo":"repo","pr_number":123,"body":"LGTM","event":"APPROVE"}' | \\
    rp1 agent-tools github-pr submit-review

  # Add a reaction
  echo '{"owner":"org","repo":"repo","comment_id":456,"reaction":"+1"}' | \\
    rp1 agent-tools github-pr add-reaction

  # Fetch comments
  echo '{"owner":"org","repo":"repo","pr_number":123}' | \\
    rp1 agent-tools github-pr fetch-comments
`,
	);

/**
 * github-pr submit-review subcommand.
 * Submits a PR review with optional inline comments.
 */
githubPrCommand
	.command("submit-review")
	.description("Submit a PR review with optional inline comments")
	.addHelpText(
		"after",
		`
Description:
  Submits a PR review via GitHub API. Accepts JSON input via stdin.

Input (JSON via stdin):
  {
    "owner": "string",           // Repository owner
    "repo": "string",            // Repository name
    "pr_number": number,         // Pull request number
    "body": "string",            // Review summary body
    "event": "APPROVE" | "REQUEST_CHANGES" | "COMMENT",
    "comments": [                // Optional inline comments
      {
        "path": "string",        // File path
        "line": number,          // Line number
        "body": "string"         // Comment body
      }
    ]
  }

Output:
  JSON with review details:
  - review_id: Created review ID
  - html_url: URL to the review
  - comments_posted: Number of inline comments posted

Examples:
  echo '{"owner":"org","repo":"repo","pr_number":123,"body":"LGTM","event":"APPROVE"}' | \\
    rp1 agent-tools github-pr submit-review
`,
	)
	.action(async (): Promise<void> => {
		const toolName = "github-pr";
		const inputResult = await readInput()();

		if (E.isLeft(inputResult)) {
			console.error(
				createErrorResponse(toolName, formatError(inputResult.left, false)),
			);
			process.exit(1);
		}

		const result = await executeSubmitReview(inputResult.right.content)();

		if (E.isLeft(result)) {
			console.error(
				createErrorResponse(toolName, formatError(result.left, false)),
			);
			process.exit(1);
		}

		console.log(formatOutput(result.right));
		process.exit(0);
	});

/**
 * github-pr add-reaction subcommand.
 * Adds a reaction to a PR comment.
 */
githubPrCommand
	.command("add-reaction")
	.description("Add a reaction to a PR comment")
	.addHelpText(
		"after",
		`
Description:
  Adds a reaction to a PR review comment via GitHub API.
  Accepts JSON input via stdin.

Input (JSON via stdin):
  {
    "owner": "string",           // Repository owner
    "repo": "string",            // Repository name
    "comment_id": number,        // Comment ID to react to
    "reaction": "+1" | "-1" | "laugh" | "confused" | "heart" | "hooray" | "rocket" | "eyes"
  }

Output:
  JSON with reaction details:
  - reaction_id: Created reaction ID
  - content: Reaction type

Examples:
  echo '{"owner":"org","repo":"repo","comment_id":456,"reaction":"+1"}' | \\
    rp1 agent-tools github-pr add-reaction
`,
	)
	.action(async (): Promise<void> => {
		const toolName = "github-pr";
		const inputResult = await readInput()();

		if (E.isLeft(inputResult)) {
			console.error(
				createErrorResponse(toolName, formatError(inputResult.left, false)),
			);
			process.exit(1);
		}

		const result = await executeAddReaction(inputResult.right.content)();

		if (E.isLeft(result)) {
			console.error(
				createErrorResponse(toolName, formatError(result.left, false)),
			);
			process.exit(1);
		}

		console.log(formatOutput(result.right));
		process.exit(0);
	});

/**
 * github-pr reply-comment subcommand.
 * Replies to an existing PR comment thread.
 */
githubPrCommand
	.command("reply-comment")
	.description("Reply to an existing PR comment thread")
	.addHelpText(
		"after",
		`
Description:
  Posts a reply to an existing PR review comment thread via GitHub API.
  Accepts JSON input via stdin.

Input (JSON via stdin):
  {
    "owner": "string",           // Repository owner
    "repo": "string",            // Repository name
    "pr_number": number,         // Pull request number
    "comment_id": number,        // Comment ID to reply to
    "body": "string"             // Reply body
  }

Output:
  JSON with reply details:
  - comment_id: Created comment ID
  - html_url: URL to the comment

Examples:
  echo '{"owner":"org","repo":"repo","pr_number":123,"comment_id":456,"body":"Thanks!"}' | \\
    rp1 agent-tools github-pr reply-comment
`,
	)
	.action(async (): Promise<void> => {
		const toolName = "github-pr";
		const inputResult = await readInput()();

		if (E.isLeft(inputResult)) {
			console.error(
				createErrorResponse(toolName, formatError(inputResult.left, false)),
			);
			process.exit(1);
		}

		const result = await executeReplyComment(inputResult.right.content)();

		if (E.isLeft(result)) {
			console.error(
				createErrorResponse(toolName, formatError(result.left, false)),
			);
			process.exit(1);
		}

		console.log(formatOutput(result.right));
		process.exit(0);
	});

/**
 * github-pr fetch-comments subcommand.
 * Fetches all comments from a PR.
 */
githubPrCommand
	.command("fetch-comments")
	.description("Fetch all comments from a PR")
	.addHelpText(
		"after",
		`
Description:
  Fetches all review comments and issue comments from a PR via GitHub API.
  Accepts JSON input via stdin.

Input (JSON via stdin):
  {
    "owner": "string",           // Repository owner
    "repo": "string",            // Repository name
    "pr_number": number          // Pull request number
  }

Output:
  JSON with comment lists:
  - review_comments: Array of review comments (inline code comments)
    - id, user, body, path, line, created_at, is_bot
  - issue_comments: Array of issue comments (general PR comments)
    - id, user, body, created_at, is_bot

Examples:
  echo '{"owner":"org","repo":"repo","pr_number":123}' | \\
    rp1 agent-tools github-pr fetch-comments
`,
	)
	.action(async (): Promise<void> => {
		const toolName = "github-pr";
		const inputResult = await readInput()();

		if (E.isLeft(inputResult)) {
			console.error(
				createErrorResponse(toolName, formatError(inputResult.left, false)),
			);
			process.exit(1);
		}

		const result = await executeFetchComments(inputResult.right.content)();

		if (E.isLeft(result)) {
			console.error(
				createErrorResponse(toolName, formatError(result.left, false)),
			);
			process.exit(1);
		}

		console.log(formatOutput(result.right));
		process.exit(0);
	});
