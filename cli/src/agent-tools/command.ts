/**
 * CLI command integration for agent-tools framework.
 * Provides Commander.js commands for AI agent tools.
 */

import { Command } from "commander";
import * as E from "fp-ts/lib/Either.js";
import { formatError } from "../../shared/errors.js";
import { getTool, type ToolOptions } from "./index.js";
import { readInput } from "./input.js";
import { formatOutput } from "./output.js";
import {
	executeCleanup,
	executeCreate,
	executeStatus,
} from "./worktree/index.js";

// Lazy-load tools to register them with the framework
import "./mmd-validate/index.js";
import "./rp1-root-dir/index.js";
import "./worktree/index.js";

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
  mmd-validate    Validate Mermaid diagram syntax
  rp1-root-dir    Resolve RP1_ROOT path with worktree awareness
  worktree        Manage git worktrees for isolated agent execution

Examples:
  rp1 agent-tools mmd-validate ./document.md
  cat diagram.mmd | rp1 agent-tools mmd-validate
  echo "graph TD; A-->B" | rp1 agent-tools mmd-validate
  rp1 agent-tools rp1-root-dir
  rp1 agent-tools worktree create fix-auth-bug
  rp1 agent-tools worktree status
  rp1 agent-tools worktree cleanup /path/to/worktree
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
				// Tool execution error - exit code 1
				console.error(
					createErrorResponse(toolName, formatError(result.left, false)),
				);
				process.exit(1);
			}

			console.log(formatOutput(result.right));

			// Exit code 0 for validation results, even if diagrams are invalid
			// (success: false in JSON indicates validation failures, not tool errors)
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

		// Execute the tool (no input required, but ToolOptions needs inputSource)
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
