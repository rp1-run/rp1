/**
 * CLI command integration for agent-tools framework.
 * Provides Commander.js commands for AI agent tools.
 */

import { posix, win32 } from "node:path";
import { Command } from "commander";
import * as E from "fp-ts/lib/Either.js";
import { type CLIError, formatError, usageError } from "../../shared/errors.js";
import { VALID_EVENT_TYPES } from "../../shared/events.js";
import {
	DEFAULT_MAX_BUILDERS,
	MAX_BUILDERS_LIMIT,
} from "./build-task-plan/models.js";
import { CHANGE_MANIFEST_SOURCES } from "./change-manifest/index.js";
import { closeDatabase as closeEmitDatabase } from "./emit/database.js";
import type { EmitCommandOptions } from "./emit/validate.js";
import { VALID_STATUS_FILTERS } from "./feedback/models.js";
import { getTool, type ToolOptions } from "./index.js";
import { readInput } from "./input.js";
import { formatOutput } from "./output.js";
import {
	type TerminalOutcome,
	VALID_TERMINAL_OUTCOMES,
} from "./socratic-duel/models.js";
import { VALID_TASK_STATUSES } from "./task/models.js";
import {
	WORK_SEARCH_DEFAULT_LIMIT,
	WORK_SEARCH_MAX_LIMIT,
} from "./work-search/models.js";

const cleanupAndExit = () => {
	closeEmitDatabase();
};

export const isPlatformAbsoluteProjectPath = (
	projectPath: string,
	platform: typeof process.platform = process.platform,
): boolean =>
	platform === "win32"
		? win32.isAbsolute(projectPath)
		: posix.isAbsolute(projectPath);

process.on("exit", cleanupAndExit);
process.on("SIGTERM", () => {
	cleanupAndExit();
	process.exit(0);
});
process.on("SIGINT", () => {
	cleanupAndExit();
	process.exit(0);
});

/**
 * Static map from subcommand name to dynamic import thunk.
 * Each thunk lazily loads the tool module on first use, triggering
 * registerTool() as a side effect. The runtime caches modules after
 * first import so repeated calls are free.
 */
export const TOOL_MODULES: ReadonlyMap<string, () => Promise<void>> = new Map([
	[
		"build-task-plan",
		() => import("./build-task-plan/index.js").then(() => undefined),
	],
	[
		"mmd-validate",
		() => import("./mmd-validate/index.js").then(() => undefined),
	],
	[
		"resolve-args",
		() => import("./resolve-args/index.js").then(() => undefined),
	],
	[
		"rp1-root-dir",
		() => import("./rp1-root-dir/index.js").then(() => undefined),
	],
	[
		"workflow-bootstrap",
		() => import("./workflow-bootstrap/index.js").then(() => undefined),
	],
	[
		"workflow-state",
		() => import("./workflow-state/index.js").then(() => undefined),
	],
	[
		"comment-extract",
		() => import("./comment-extract/index.js").then(() => undefined),
	],
	["emit", () => import("./emit/index.js").then(() => undefined)],
	["feedback", () => import("./feedback/index.js").then(() => undefined)],
	["github-pr", () => import("./github-pr/index.js").then(() => undefined)],
	[
		"socratic-duel",
		() => import("./socratic-duel/index.js").then(() => undefined),
	],
	["task", () => import("./task/index.js").then(() => undefined)],
	["work-search", () => import("./work-search/index.js").then(() => undefined)],
]);

/** Ensure a tool module is loaded before accessing it via getTool(). */
const ensureToolLoaded = async (name: string): Promise<void> => {
	const loader = TOOL_MODULES.get(name);
	if (loader) await loader();
};

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
  resolve-args      Resolve structured arguments from schema, settings, and user input
  rp1-root-dir      Resolve project, KB, and work directories with worktree detection
  workflow-bootstrap Resolve canonical tracked-workflow bootstrap context and run selection
  workflow-state    Read workflow state and next parent phase from the emit database
  build-task-plan   Read schema-backed tasks.json and group build task units
  change-manifest  Create cleanup manifests from repository change evidence
  comment-extract   Extract comments from git-changed files
  emit              Record events for the rp1 workflow event system
  feedback          Read, resolve, reply to, and accept feedback from the Arcade
  github-pr         GitHub PR operations (submit-review, add-reaction, reply-comment, fetch-comments, publish-comment)
  socratic-duel     Coordinate Socratic Duel participant locks and leases
  task              Manage task queue (create, list, pickup, complete, fail, cancel, get)
  work-search       Search project-scoped rp1 work artifacts

Examples:
  rp1 agent-tools mmd-validate ./document.md
  cat diagram.mmd | rp1 agent-tools mmd-validate
  echo "graph TD; A-->B" | rp1 agent-tools mmd-validate
  rp1 agent-tools rp1-root-dir
  rp1 agent-tools workflow-state --run-id <uuid> --workflow build --feature example --parent-phases requirements,planning,implementation,release
  rp1 agent-tools build-task-plan --tasks-path /path/to/features/example/tasks.md --max-simple-batch 3 --complex-isolated true
  rp1 agent-tools change-manifest snapshot --code-root . --out .rp1/work/features/example/change-manifest-baseline.json
  rp1 agent-tools change-manifest generate --code-root . --out .rp1/work/features/example/change-manifest-001.json --status-out .rp1/work/features/example/change-manifest-status.json --source build --baseline .rp1/work/features/example/change-manifest-baseline.json
  rp1 agent-tools comment-extract branch main
  rp1 agent-tools comment-extract unstaged main
  echo '{"owner":"org","repo":"repo","pr_number":123}' | rp1 agent-tools github-pr fetch-comments
  rp1 agent-tools feedback read --run-id <uuid> --status open
  rp1 agent-tools feedback resolve 42 --reply "Applied fix"
  rp1 agent-tools task create --type check-annotations --description "Review open annotations"
  rp1 agent-tools task list --status pending
  rp1 agent-tools work-search "phase plan" --limit 5
  rp1 agent-tools emit --type status_change --run-id <uuid> --step requirements --data '{"status": "running"}'
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
			await ensureToolLoaded(toolName);

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
 * Resolves project, KB, and work directories with worktree awareness.
 */
agentToolsCommand
	.command("rp1-root-dir")
	.description(
		"Resolve project, KB, and work directories with worktree detection",
	)
	.addHelpText(
		"after",
		`
Description:
  Resolves the effective project root plus the derived knowledge-base and work
  directories. When running in a linked git worktree, the tool detects this and
  maps back to the main repository so agents operate on the canonical project.

  This is a read-only detection tool. It does not create, modify, or remove
  git worktrees. Users manage worktrees directly with native git commands.

Resolution order:
  1. Walk up from current directory to find .rp1/project_id
  2. Git worktree detection via git-common-dir (maps to main repo)
  3. If a legacy .rp1/ directory exists without project_id, fail with a
     suggestion to run 'rp1 migrate'
  4. If no rp1 project exists, fail with a suggestion to run 'rp1 init'

Output:
  JSON with resolved directories and detection metadata:
  - projectId: Stable project UUID when available
  - projectRoot: Absolute path to the effective project root
  - kbRoot: Absolute path to the knowledge-base directory
  - workRoot: Absolute path to the work artifact directory
  - isWorktree: Whether running in a linked git worktree
  - worktreeName: Branch name if in worktree

Examples:
  rp1 agent-tools rp1-root-dir
`,
	)
	.action(async (): Promise<void> => {
		const toolName = "rp1-root-dir";
		await ensureToolLoaded(toolName);

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
 * resolve-args subcommand.
 * Resolves structured arguments for skills and agents.
 */
agentToolsCommand
	.command("resolve-args")
	.description(
		"Resolve structured arguments from schema, settings, and user input",
	)
	.option("-f, --file <path>", "Read JSON input from file instead of stdin")
	.option(
		"-n, --name <namespace>",
		'Skill/agent name using namespace convention (e.g., "rp1-dev:build")',
	)
	.option(
		"-s, --schema-path <path>",
		"Direct path to SKILL.md or agent .md file (overrides --name)",
	)
	.option("-a, --args <args>", "Raw argument string from invocation")
	.option(
		"-p, --project-root <path>",
		"Path used to anchor directory resolution and settings lookup",
	)
	.addHelpText(
		"after",
		`
Description:
  Resolves arguments for a skill or agent by reading the structured arguments
  schema from frontmatter, merging user input with project and user settings,
  and returning a fully resolved argument object.

  The schema can be located by name (--name) or by direct path (--schema-path).
  Name-based lookup resolves the schema internally by searching plugin directories.
  When --schema-path is provided, it takes precedence over --name.

  Resolution precedence (highest to lowest):
  1. Explicit user input (from raw_args)
  2. Project settings (.rp1/settings.toml)
  3. User settings (~/.config/rp1/settings.toml)
  4. ENV var (source.env on argument definition)
  5. Schema default

Input (CLI flags or JSON via stdin/file):
  - name: Skill/agent namespace (e.g., "rp1-dev:build")
  - schema_path: Direct path to SKILL.md or agent .md file
  - raw_args: Raw argument string from invocation
  - project_root: Path used to anchor directory resolution and settings lookup

Output:
  JSON ToolResult with resolved arguments, resolved directories, an
  environment placeholder object, and an unresolved list.

Examples:
  rp1 agent-tools resolve-args --name rp1-dev:build --args "my-feature --afk"
  rp1 agent-tools resolve-args --schema-path plugins/dev/skills/build/SKILL.md --args "my-feature"
  echo '{"name":"rp1-dev:build","raw_args":"my-feature --afk","project_root":"/project"}' | rp1 agent-tools resolve-args
  rp1 agent-tools resolve-args -f input.json
`,
	)
	.action(
		async (options: {
			file?: string;
			name?: string;
			schemaPath?: string;
			args?: string;
			projectRoot?: string;
		}): Promise<void> => {
			const toolName = "resolve-args";
			await ensureToolLoaded(toolName);

			let content: string;
			let source: "file" | "stdin" = "stdin";

			if (options.name || options.schemaPath) {
				const input: Record<string, string> = {};
				if (options.schemaPath) {
					input.schema_path = options.schemaPath;
				}
				if (options.name) {
					input.name = options.name;
				}
				if (options.args) {
					input.raw_args = options.args;
				}
				if (options.projectRoot) {
					input.project_root = options.projectRoot;
				}
				content = JSON.stringify(input);
				source = "stdin";
			} else {
				const inputResult = await readInput(options.file)();

				if (E.isLeft(inputResult)) {
					console.log(
						createErrorResponse(toolName, formatError(inputResult.left, false)),
					);
					process.exit(1);
				}

				content = inputResult.right.content;
				source = inputResult.right.source;
			}

			const tool = getTool(toolName);
			if (!tool) {
				console.log(
					createErrorResponse(toolName, "Tool not found in registry"),
				);
				process.exit(1);
			}

			const toolOptions: ToolOptions = {
				inputSource: source,
				filePath: options.file,
			};

			const result = await tool.execute(content, toolOptions)();

			if (E.isLeft(result)) {
				console.log(
					createErrorResponse(toolName, formatError(result.left, false)),
				);
				process.exit(1);
			}

			console.log(formatOutput(result.right));
			process.exit(0);
		},
	);

/**
 * workflow-bootstrap subcommand.
 * Resolves canonical tracked-workflow startup context and run selection.
 */
agentToolsCommand
	.command("workflow-bootstrap")
	.description(
		"Resolve canonical tracked-workflow bootstrap context and deterministic run selection",
	)
	.option("-f, --file <path>", "Read JSON input from file instead of stdin")
	.option("-n, --name <name>", "Generated workflow name (e.g., build)")
	.option(
		"-s, --schema-path <path>",
		"Generated workflow schema path (e.g., plugins/dev/skills/build/SKILL.md)",
	)
	.option("-a, --args <args>", "Raw argument string from invocation")
	.option(
		"-p, --project-root <path>",
		"Path used to anchor canonical directory resolution (defaults to cwd)",
	)
	.option(
		"--harness <name>",
		"Harness/platform name (e.g., claude-code, codex, opencode)",
	)
	.option("--include-trace", "Include invocation trace in the response")
	.addHelpText(
		"after",
		`
Description:
  Resolves one canonical tracked-workflow bootstrap contract before the workflow
  emits progress or registers artifacts. The tool validates the generated
  workflow target contract, resolves arguments and canonical directories, then
  deterministically creates or resumes the backing run.

Input (CLI flags or JSON via stdin/file):
  - name: Generated workflow name (required)
  - schema_path: Generated workflow schema path (required)
  - raw_args: Raw argument string from invocation
  - project_root: Requested invocation path used to discover canonical roots
  - harness: Optional harness/platform override

Output:
  JSON ToolResult with canonical arguments, directories, workflow metadata,
  and run selection. Use --include-trace to include invocation trace data.
  (The flag avoids -v/--verbose, which the parent CLI reserves for debug logging.)

Examples:
  rp1 agent-tools workflow-bootstrap \\
    --name build \\
    --schema-path plugins/dev/skills/build/SKILL.md \\
    --args "my-feature --afk" \\
    --project-root /path/to/project \\
    --harness codex
  rp1 agent-tools workflow-bootstrap --include-trace \\
    --name build \\
    --schema-path plugins/dev/skills/build/SKILL.md \\
    --args "my-feature --afk"
  echo '{"name":"build","schema_path":"plugins/dev/skills/build/SKILL.md","raw_args":"my-feature"}' | rp1 agent-tools workflow-bootstrap
  rp1 agent-tools workflow-bootstrap -f input.json
`,
	)
	.action(
		async (options: {
			file?: string;
			name?: string;
			schemaPath?: string;
			args?: string;
			projectRoot?: string;
			harness?: string;
			includeTrace?: boolean;
		}): Promise<void> => {
			const toolName = "workflow-bootstrap";
			await ensureToolLoaded(toolName);

			let content: string;
			let source: "file" | "stdin" = "stdin";

			if (options.name || options.schemaPath) {
				const input: Record<string, string> = {};
				if (options.name) {
					input.name = options.name;
				}
				if (options.schemaPath) {
					input.schema_path = options.schemaPath;
				}
				if (options.args) {
					input.raw_args = options.args;
				}
				if (options.projectRoot) {
					input.project_root = options.projectRoot;
				}
				if (options.harness) {
					input.harness = options.harness;
				}
				content = JSON.stringify(input);
			} else {
				const inputResult = await readInput(options.file)();

				if (E.isLeft(inputResult)) {
					console.log(
						createErrorResponse(toolName, formatError(inputResult.left, false)),
					);
					process.exit(1);
				}

				content = inputResult.right.content;
				source = inputResult.right.source;
			}

			const tool = getTool(toolName);
			if (!tool) {
				console.log(
					createErrorResponse(toolName, "Tool not found in registry"),
				);
				process.exit(1);
			}

			const toolOptions: ToolOptions = {
				inputSource: source,
				filePath: options.file,
				verbose: options.includeTrace,
			};

			const result = await tool.execute(content, toolOptions)();

			if (E.isLeft(result)) {
				console.log(
					createErrorResponse(toolName, formatError(result.left, false)),
				);
				process.exit(1);
			}

			console.log(formatOutput(result.right));
			process.exit(0);
		},
	);

/**
 * workflow-state subcommand.
 * Reads tracked workflow state from the emit database.
 */
agentToolsCommand
	.command("workflow-state")
	.description(
		"Read workflow state and next parent phase from the emit database",
	)
	.option("-f, --file <path>", "Read JSON input from file instead of stdin")
	.option("--run-id <uuid>", "Run id to inspect")
	.option("--workflow <name>", "Expected workflow name")
	.option("--feature <id>", "Expected feature id")
	.option(
		"--parent-phases <phases>",
		"Comma-separated parent phases in workflow order",
	)
	.option(
		"--recent-events <n>",
		"Number of recent events to include (default: 25, max: 100)",
	)
	.addHelpText(
		"after",
		`
Description:
  Reads the emit database projection for a run and returns run metadata,
  effective step statuses, registered artifacts, bounded recent events,
  the next parent phase, and contract gaps for completed phases whose
  expected artifacts were not registered.

Input (CLI flags or JSON via stdin/file):
  - run_id: Run UUID (required)
  - workflow: Expected workflow name (required)
  - feature: Expected feature id (required)
  - parent_phases: Ordered parent phase list (required)
  - recent_event_limit: Optional recent event bound

Output:
  JSON ToolResult with run, steps, artifacts, recent_events, phases, and summary.

Examples:
  rp1 agent-tools workflow-state \\
    --run-id <uuid> \\
    --workflow build \\
    --feature example \\
    --parent-phases requirements,planning,implementation,release
  echo '{"run_id":"<uuid>","workflow":"build","feature":"example","parent_phases":["requirements","planning","implementation","release"]}' | rp1 agent-tools workflow-state
`,
	)
	.action(
		async (options: {
			file?: string;
			runId?: string;
			workflow?: string;
			feature?: string;
			parentPhases?: string;
			recentEvents?: string;
		}): Promise<void> => {
			const toolName = "workflow-state";
			await ensureToolLoaded(toolName);

			let content: string;
			let source: "file" | "stdin" = "stdin";

			if (
				options.runId ||
				options.workflow ||
				options.feature ||
				options.parentPhases
			) {
				const input: Record<string, unknown> = {};
				if (options.runId) {
					input.run_id = options.runId;
				}
				if (options.workflow) {
					input.workflow = options.workflow;
				}
				if (options.feature) {
					input.feature = options.feature;
				}
				if (options.parentPhases) {
					input.parent_phases = options.parentPhases
						.split(",")
						.map((phase) => phase.trim())
						.filter(Boolean);
				}
				if (options.recentEvents) {
					input.recent_event_limit = Number(options.recentEvents);
				}
				content = JSON.stringify(input);
			} else {
				const inputResult = await readInput(options.file)();

				if (E.isLeft(inputResult)) {
					console.log(
						createErrorResponse(toolName, formatError(inputResult.left, false)),
					);
					process.exit(1);
				}

				content = inputResult.right.content;
				source = inputResult.right.source;
			}

			const tool = getTool(toolName);
			if (!tool) {
				console.log(
					createErrorResponse(toolName, "Tool not found in registry"),
				);
				process.exit(1);
			}

			const result = await tool.execute(content, {
				inputSource: source,
				filePath: options.file,
			})();

			if (E.isLeft(result)) {
				console.log(
					createErrorResponse(toolName, formatError(result.left, false)),
				);
				process.exit(1);
			}

			console.log(formatOutput(result.right));
			process.exit(0);
		},
	);

const parseBooleanFlag = (
	value: string | undefined,
	optionName: string,
): boolean | undefined => {
	if (value === undefined) {
		return undefined;
	}

	const normalized = value.trim().toLowerCase();
	if (["true", "1", "yes"].includes(normalized)) {
		return true;
	}
	if (["false", "0", "no"].includes(normalized)) {
		return false;
	}

	throw usageError(
		`Invalid ${optionName} value: ${value}`,
		`Use true or false for ${optionName}.`,
	);
};

/**
 * build-task-plan subcommand.
 * Reads schema-backed task plans and groups pending task units.
 */
agentToolsCommand
	.command("build-task-plan")
	.description("Read schema-backed tasks.json and group build task units")
	.option("-f, --file <path>", "Read JSON input from file instead of stdin")
	.option("--tasks-path <path>", "Absolute path to tasks.md or tasks.json")
	.option(
		"--max-simple-batch <n>",
		"Max pending simple code tasks per builder unit",
	)
	.option(
		"--complex-isolated <boolean>",
		"Whether complex tasks are isolated into their own units",
	)
	.addHelpText(
		"after",
		`
Description:
  Reads the schema-backed tasks.json sidecar generated by feature-tasker. When
  given tasks.md, the tool resolves the sibling tasks.json file and does not
  parse markdown.

Input (CLI flags or JSON via stdin/file):
  - tasks_path: Absolute path to tasks.md or tasks.json (required)
  - max_simple_batch: Optional positive integer, default 3
  - complex_isolated: Optional boolean, default true

Output:
  JSON ToolResult with parsed tasks, pending implementation tasks, pending
  documentation tasks, grouped task_units, warnings, and summary counts.

Examples:
  rp1 agent-tools build-task-plan \\
    --tasks-path /project/.rp1/work/features/example/tasks.md \\
    --max-simple-batch 3 \\
    --complex-isolated true
  echo '{"tasks_path":"/project/.rp1/work/features/example/tasks.md","max_simple_batch":3,"complex_isolated":true}' | rp1 agent-tools build-task-plan
`,
	)
	.action(
		async (options: {
			file?: string;
			tasksPath?: string;
			maxSimpleBatch?: string;
			complexIsolated?: string;
		}): Promise<void> => {
			const toolName = "build-task-plan";
			await ensureToolLoaded(toolName);

			let content: string;
			let source: "file" | "stdin" = "stdin";

			if (
				options.tasksPath ||
				options.maxSimpleBatch ||
				options.complexIsolated !== undefined
			) {
				const input: Record<string, unknown> = {};
				if (options.tasksPath) {
					input.tasks_path = options.tasksPath;
				}
				if (options.maxSimpleBatch) {
					input.max_simple_batch = options.maxSimpleBatch;
				}
				try {
					const complexIsolated = parseBooleanFlag(
						options.complexIsolated,
						"--complex-isolated",
					);
					if (complexIsolated !== undefined) {
						input.complex_isolated = complexIsolated;
					}
				} catch (error) {
					console.log(
						createErrorResponse(
							toolName,
							formatError(error as CLIError, false),
						),
					);
					process.exit(1);
				}
				content = JSON.stringify(input);
			} else {
				const inputResult = await readInput(options.file)();

				if (E.isLeft(inputResult)) {
					console.log(
						createErrorResponse(toolName, formatError(inputResult.left, false)),
					);
					process.exit(1);
				}

				content = inputResult.right.content;
				source = inputResult.right.source;
			}

			const tool = getTool(toolName);
			if (!tool) {
				console.log(
					createErrorResponse(toolName, "Tool not found in registry"),
				);
				process.exit(1);
			}

			const result = await tool.execute(content, {
				inputSource: source,
				filePath: options.file,
			})();

			if (E.isLeft(result)) {
				console.log(
					createErrorResponse(toolName, formatError(result.left, false)),
				);
				process.exit(1);
			}

			console.log(formatOutput(result.right));
			process.exit(0);
		},
	);

/**
 * schedule-wave subcommand.
 * Computes the next dispatch wave from a task plan and completed-task state.
 */
agentToolsCommand
	.command("schedule-wave")
	.description("Compute the next builder dispatch wave from task plan state")
	.option("--tasks-path <path>", "Absolute path to tasks.md or tasks.json")
	.option(
		"--completed-task-ids <ids>",
		"Comma-separated task IDs already completed by reviewers",
	)
	.option(
		"--built-task-ids <ids>",
		"Comma-separated task IDs already built but not yet reviewed",
	)
	.option(
		"--pending-integration-task-ids <ids>",
		"Comma-separated task IDs built in a worktree that is not yet integrated",
	)
	.option(
		"--max-builders <n>",
		`Maximum concurrent builders, 1-${MAX_BUILDERS_LIMIT} (default ${DEFAULT_MAX_BUILDERS})`,
	)
	.option("--git-commit <boolean>", "Whether builders produce atomic commits")
	.option(
		"--clean-tree <boolean>",
		"Whether the working tree is clean (no unstaged/uncommitted changes)",
	)
	.addHelpText(
		"after",
		`
Description:
  Stateless advisory scheduler. Reads the task plan from tasks.json, combines
  it with the completed and built task IDs supplied by the orchestrator, and
  returns what to run now: units to review, builders to dispatch, and the
  units held back.

  Units already built but not yet reviewed are returned in "review", never in
  "dispatch": their edits are already on disk, so rebuilding would re-apply
  them. When "review" and "dispatch" are both non-empty, run them
  concurrently -- that is the reviewer-pipelining case, and the scheduler only
  pairs them when the build cannot collide with a retry of the reviewed unit.

  Work built in a worktree that is not yet integrated belongs in
  pending_integration_task_ids, not built_task_ids: it is on neither the
  primary branch nor available for review. Such units are held, and no builder
  is dispatched over their files, until the orchestrator integrates or discards
  the worktree. A wave with nothing to do reports reason "pending_integration"
  when integration is still owed, distinguishing it from a real deadlock.

  All three state lists are validated against the task plan: unknown IDs,
  duplicates, an ID in two lists, and partial unit state are rejected.

  File-disjointness is computed from task targets, comparing whole path
  segments so a directory target overlaps files beneath it. Known-shared paths
  (lockfiles, generated catalog) are treated as always-overlapping.

  State is carried by task ID. Unit IDs are renumbered on every call as tasks
  complete, so they are only meaningful within one response.

Input (CLI flags):
  - tasks_path: Absolute path to tasks.md or tasks.json (required)
  - completed_task_ids: Comma-separated IDs whose reviewer passed (default "")
  - built_task_ids: Comma-separated IDs built but not yet reviewed (default "")
  - pending_integration_task_ids: Comma-separated IDs built in an unintegrated
    worktree (default "")
  - max_builders: Whole number, 1-${MAX_BUILDERS_LIMIT} (default ${DEFAULT_MAX_BUILDERS})
  - git_commit: Boolean (default false)
  - clean_tree: Boolean (default false)

Output:
  JSON ToolResult with review array (unit_id, task_ids), dispatch array
  (unit_id, task_ids, role), mode (serial | parallel-wave | review-only), and
  held unit IDs.

Examples:
  rp1 agent-tools schedule-wave \\
    --tasks-path /project/.rp1/work/features/example/tasks.json \\
    --completed-task-ids "T1,T2,T3" \\
    --built-task-ids "T4" \\
    --max-builders 4 \\
    --git-commit true \\
    --clean-tree true
`,
	)
	.action(
		async (options: {
			tasksPath?: string;
			completedTaskIds?: string;
			builtTaskIds?: string;
			pendingIntegrationTaskIds?: string;
			maxBuilders?: string;
			gitCommit?: string;
			cleanTree?: string;
		}): Promise<void> => {
			const toolName = "schedule-wave";
			await ensureToolLoaded("build-task-plan");

			if (!options.tasksPath) {
				console.log(
					createErrorResponse(toolName, "Missing required --tasks-path."),
				);
				process.exit(1);
			}

			if (!isPlatformAbsoluteProjectPath(options.tasksPath)) {
				console.log(
					createErrorResponse(
						toolName,
						"--tasks-path must be an absolute path.",
					),
				);
				process.exit(1);
			}

			let gitCommit = false;
			let cleanTree = false;
			let maxBuilders = DEFAULT_MAX_BUILDERS;

			try {
				gitCommit =
					parseBooleanFlag(options.gitCommit, "--git-commit") ?? false;
				cleanTree =
					parseBooleanFlag(options.cleanTree, "--clean-tree") ?? false;
			} catch (error) {
				console.log(
					createErrorResponse(toolName, formatError(error as CLIError, false)),
				);
				process.exit(1);
			}

			if (options.maxBuilders !== undefined) {
				// Reuses the strict whole-number parser so "4abc" and "3.9" are
				// rejected instead of silently truncating to 4 and 3.
				const { parsePositiveInteger } = await import(
					"./build-task-plan/index.js"
				);
				const parsed = parsePositiveInteger(
					options.maxBuilders,
					"--max-builders",
					DEFAULT_MAX_BUILDERS,
				);
				if (E.isLeft(parsed)) {
					console.log(
						createErrorResponse(toolName, formatError(parsed.left, false)),
					);
					process.exit(1);
				}
				if (parsed.right > MAX_BUILDERS_LIMIT) {
					console.log(
						createErrorResponse(
							toolName,
							`--max-builders must not exceed ${MAX_BUILDERS_LIMIT}; each builder beyond the primary needs its own worktree.`,
						),
					);
					process.exit(1);
				}
				maxBuilders = parsed.right;
			}

			const splitTaskIds = (raw: string | undefined): readonly string[] =>
				raw
					? raw
							.split(",")
							.map((id) => id.trim())
							.filter(Boolean)
					: [];

			const completedTaskIds = splitTaskIds(options.completedTaskIds);
			const builtTaskIds = splitTaskIds(options.builtTaskIds);
			const pendingIntegrationTaskIds = splitTaskIds(
				options.pendingIntegrationTaskIds,
			);

			const planInput = JSON.stringify({
				tasks_path: options.tasksPath,
			});

			const tool = getTool("build-task-plan");
			if (!tool) {
				console.log(
					createErrorResponse(toolName, "build-task-plan tool not found"),
				);
				process.exit(1);
			}

			const planResult = await tool.execute(planInput, {
				inputSource: "stdin",
			})();

			if (E.isLeft(planResult)) {
				console.log(
					createErrorResponse(
						toolName,
						`Task plan read failed: ${formatError(planResult.left, false)}`,
					),
				);
				process.exit(1);
			}

			const plan = planResult.right;
			if (!plan.success || !plan.data) {
				console.log(
					JSON.stringify(
						{
							success: false,
							tool: toolName,
							data: null,
							errors: plan.errors ?? [{ message: "Task plan parsing failed." }],
						},
						null,
						2,
					),
				);
				process.exit(1);
			}

			const planData = plan.data as {
				task_units: import("./build-task-plan/models.js").BuildTaskUnit[];
				tasks: import("./build-task-plan/models.js").BuildTaskPlanTask[];
			};

			// The orchestrator is an LLM, so a mistyped or mis-serialized ID is a
			// realistic input. Unknown IDs would otherwise be silently ignored and
			// yield a confidently wrong schedule, so every list is checked against
			// the plan before scheduling.
			const knownTaskIds = new Set(planData.tasks.map((task) => task.id));
			const stateLists = [
				{ flag: "--completed-task-ids", ids: completedTaskIds },
				{ flag: "--built-task-ids", ids: builtTaskIds },
				{
					flag: "--pending-integration-task-ids",
					ids: pendingIntegrationTaskIds,
				},
			] as const;

			for (const { flag, ids } of stateLists) {
				const unknown = ids.filter((id) => !knownTaskIds.has(id));
				if (unknown.length > 0) {
					console.log(
						createErrorResponse(
							toolName,
							`${flag} contains task IDs absent from the task plan: ${unknown.join(", ")}.`,
						),
					);
					process.exit(1);
				}

				const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
				if (duplicates.length > 0) {
					console.log(
						createErrorResponse(
							toolName,
							`${flag} contains duplicate task IDs: ${[...new Set(duplicates)].join(", ")}.`,
						),
					);
					process.exit(1);
				}
			}

			for (const [a, b] of [
				[stateLists[0], stateLists[1]],
				[stateLists[0], stateLists[2]],
				[stateLists[1], stateLists[2]],
			] as const) {
				const overlap = a.ids.filter((id) => b.ids.includes(id));
				if (overlap.length > 0) {
					console.log(
						createErrorResponse(
							toolName,
							`A task ID cannot be in both ${a.flag} and ${b.flag}: ${overlap.join(", ")}.`,
						),
					);
					process.exit(1);
				}
			}

			// A unit is built, completed, or integrated as a whole. Partial state
			// means the orchestrator lost track, and left unchecked the unit looks
			// ready and gets rebuilt over edits that already exist on disk.
			const stateById = new Map<string, string>();
			for (const { flag, ids } of stateLists) {
				for (const id of ids) {
					stateById.set(id, flag);
				}
			}
			for (const unit of planData.task_units) {
				const states = new Set(
					unit.task_ids.map((id) => stateById.get(id) ?? "unset"),
				);
				if (states.size > 1) {
					console.log(
						createErrorResponse(
							toolName,
							`Task unit ${unit.unit_id} has mixed state across its tasks (${unit.task_ids
								.map((id) => `${id}=${stateById.get(id) ?? "unset"}`)
								.join(", ")}). Record state one whole unit at a time.`,
						),
					);
					process.exit(1);
				}
			}

			const { scheduleWave } = await import("./build-task-plan/index.js");

			const waveResult = scheduleWave({
				task_units: planData.task_units,
				tasks: planData.tasks,
				completed_task_ids: completedTaskIds,
				built_task_ids: builtTaskIds,
				pending_integration_task_ids: pendingIntegrationTaskIds,
				max_builders: maxBuilders,
				git_commit: gitCommit,
				clean_tree: cleanTree,
			});

			console.log(
				formatOutput({ success: true, tool: toolName, data: waveResult }),
			);
			process.exit(0);
		},
	);

/**
 * work-search subcommand.
 * Searches project-scoped rp1 work artifacts.
 */
agentToolsCommand
	.command("work-search [query]")
	.description("Search project-scoped rp1 work artifacts")
	.option(
		"--project <path>",
		"Resolve and search an explicit rp1 project path instead of the active project",
	)
	.option(
		"--limit <n>",
		`Maximum number of results to return (default: ${WORK_SEARCH_DEFAULT_LIMIT}, max: ${WORK_SEARCH_MAX_LIMIT})`,
		String(WORK_SEARCH_DEFAULT_LIMIT),
	)
	.option(
		"--no-refresh",
		"Search the existing sidecar index without refreshing",
	)
	.option(
		"--refresh-only",
		"Refresh the sidecar index without searching",
		false,
	)
	.addHelpText(
		"after",
		`
Description:
  Searches markdown artifacts under the active project's .rp1/work directory.
  By default the command refreshes the project-local sidecar index before
  searching. Use --no-refresh to query the existing index, or --refresh-only
  to refresh without requiring a search query.

Options:
  --project <path>    Explicit rp1 project path to resolve and search
  --limit <n>         Maximum results (default: ${WORK_SEARCH_DEFAULT_LIMIT}, max: ${WORK_SEARCH_MAX_LIMIT})
  --no-refresh        Skip refresh and search the existing sidecar index
  --refresh-only      Refresh the sidecar index and return refresh stats only

Output:
  JSON ToolResult with:
  - query: Query string, or null for --refresh-only
  - project: projectId, projectRoot, and workRoot
  - refresh: Refresh stats when refresh ran
  - results: Ranked snippets with normalized work artifact paths and metadata

Examples:
  rp1 agent-tools work-search "persistent memory"
  rp1 agent-tools work-search "phase plan" --limit 5
  rp1 agent-tools work-search --refresh-only
  rp1 agent-tools work-search "requirements" --project /path/to/project --no-refresh
`,
	)
	.action(
		async (
			query: string | undefined,
			options: {
				project?: string;
				limit: string;
				refresh: boolean;
				refreshOnly: boolean;
			},
		): Promise<void> => {
			const toolName = "work-search";
			await ensureToolLoaded(toolName);

			const tool = getTool(toolName);
			if (!tool) {
				console.error(
					createErrorResponse(toolName, "Tool not found in registry"),
				);
				process.exit(1);
			}

			const result = await tool.execute(
				JSON.stringify({
					query,
					project: options.project,
					limit: options.limit,
					refresh: options.refresh !== false,
					refreshOnly: options.refreshOnly,
				}),
				{ inputSource: "stdin" },
			)();

			if (E.isLeft(result)) {
				console.error(
					createErrorResponse(toolName, formatError(result.left, false)),
				);
				process.exit(1);
			}

			console.log(formatOutput(result.right));
			process.exit(result.right.success ? 0 : 1);
		},
	);

/**
 * change-manifest subcommand.
 * Creates durable cleanup manifests from repository evidence.
 */
const changeManifestCommand = agentToolsCommand
	.command("change-manifest")
	.description("Create cleanup manifests from repository change evidence")
	.addHelpText(
		"after",
		`
Subcommands:
  snapshot    Record the starting repository state for build-owned cleanup
  generate    Create or skip a cleanup manifest from a baseline or user scope

Examples:
  rp1 agent-tools change-manifest snapshot --code-root . --out .rp1/work/features/example/change-manifest-baseline.json
  rp1 agent-tools change-manifest generate --code-root . --out .rp1/work/features/example/change-manifest-001.json --status-out .rp1/work/features/example/change-manifest-status.json --source build --baseline .rp1/work/features/example/change-manifest-baseline.json
`,
	);

changeManifestCommand
	.command("snapshot")
	.description("Record baseline HEAD and dirty paths")
	.requiredOption("--code-root <path>", "Repository source root")
	.requiredOption("--out <path>", "Baseline snapshot JSON path")
	.addHelpText(
		"after",
		`
Description:
  Records the current HEAD and dirty paths for later manifest generation.

Output:
  JSON ToolResult with snapshotPath, codeRoot, head, and dirtyPaths.

Example:
  rp1 agent-tools change-manifest snapshot \\
    --code-root . \\
    --out .rp1/work/features/example/change-manifest-baseline.json
`,
	)
	.action(async (options: { codeRoot: string; out: string }): Promise<void> => {
		const toolName = "change-manifest";
		const { executeChangeManifestSnapshot } = await import(
			"./change-manifest/index.js"
		);
		const result = await executeChangeManifestSnapshot({
			codeRoot: options.codeRoot,
			out: options.out,
		})();

		if (E.isLeft(result)) {
			console.error(
				createErrorResponse(toolName, formatError(result.left, false)),
			);
			process.exit(1);
		}

		console.log(formatOutput(result.right));
		process.exit(result.right.success ? 0 : 1);
	});

changeManifestCommand
	.command("generate")
	.description("Create or skip a cleanup manifest")
	.requiredOption("--code-root <path>", "Repository source root")
	.requiredOption("--out <path>", "Change manifest JSON path")
	.requiredOption("--status-out <path>", "Manifest status JSON path")
	.requiredOption(
		"--source <source>",
		`Manifest source (${CHANGE_MANIFEST_SOURCES.join(", ")})`,
	)
	.option("--baseline <path>", "Baseline snapshot path for build-owned changes")
	.option("--scope <scope>", "User cleanup scope for code-clean-comments")
	.addHelpText(
		"after",
		`
Description:
  Generates a manifest from either a build baseline or a code-clean-comments
  user scope. Skipped outcomes still write --status-out with the reason.

Options:
  --baseline <path>   Required for source build or build-fast
  --scope <scope>     Required for source code-clean-comments

Output:
  JSON ToolResult with status, manifestPath, statusPath, files,
  ownedLineCount, and skipReason.

Examples:
  rp1 agent-tools change-manifest generate \\
    --code-root . \\
    --out .rp1/work/features/example/change-manifest-001.json \\
    --status-out .rp1/work/features/example/change-manifest-status.json \\
    --source build \\
    --baseline .rp1/work/features/example/change-manifest-baseline.json

  rp1 agent-tools change-manifest generate \\
    --code-root . \\
    --out .rp1/work/comment-cleanup/change-manifest-001.json \\
    --status-out .rp1/work/comment-cleanup/change-manifest-status.json \\
    --source code-clean-comments \\
    --scope src/
`,
	)
	.action(
		async (options: {
			codeRoot: string;
			out: string;
			statusOut: string;
			source: string;
			baseline?: string;
			scope?: string;
		}): Promise<void> => {
			const toolName = "change-manifest";
			const { executeGenerateChangeManifest } = await import(
				"./change-manifest/index.js"
			);
			const result = await executeGenerateChangeManifest({
				codeRoot: options.codeRoot,
				out: options.out,
				statusOut: options.statusOut,
				source: options.source,
				baseline: options.baseline,
				scope: options.scope,
			})();

			if (E.isLeft(result)) {
				console.error(
					createErrorResponse(toolName, formatError(result.left, false)),
				);
				process.exit(1);
			}

			console.log(formatOutput(result.right));
			process.exit(result.right.success ? 0 : 1);
		},
	);

/**
 * comment-extract subcommand.
 * Extracts comments from git-changed files for analysis.
 */
agentToolsCommand
	.command("comment-extract <scope> <base>")
	.description("Extract comments from git-changed files")
	.option("--line-scoped", "Only extract comments on changed lines", false)
	.option(
		"--change-manifest <path>",
		"Extract only comments inside a change manifest boundary",
	)
	.option("--code-root <path>", "Source root for resolving manifest paths")
	.addHelpText(
		"after",
		`
Description:
  Extracts comments from files changed in a git scope or from owned
  files and lines declared in a change manifest.
  Supports multiple languages including Python, JavaScript, TypeScript,
  Go, Rust, Java, C/C++, Ruby, PHP, and Shell scripts.

Arguments:
  scope    Git scope: "branch", "unstaged", a commit range, or "manifest"
  base     Base branch for comparison (e.g., "main", "master")

Options:
  --line-scoped              Only include comments on changed lines (for commit ranges)
  --change-manifest <path>   JSON manifest with owned files and lines/hunks
  --code-root <path>         Source root for resolving manifest paths

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

  # Extract from a change manifest boundary
  rp1 agent-tools comment-extract manifest manifest --change-manifest .rp1/work/features/example/change-manifest-001.json --code-root .
`,
	)
	.action(
		async (
			scope: string,
			base: string,
			options: {
				lineScoped: boolean;
				changeManifest?: string;
				codeRoot?: string;
			},
		): Promise<void> => {
			const toolName = "comment-extract";
			const { executeExtract } = await import("./comment-extract/index.js");

			const result = await executeExtract({
				scope,
				base,
				lineScoped: options.lineScoped,
				changeManifest: options.changeManifest,
				codeRoot: options.codeRoot,
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
 * emit subcommand.
 * Records events for the rp1 workflow event system.
 */
const emitCommand = agentToolsCommand
	.command("emit")
	.description("Record events for the rp1 workflow event system")
	.option("--type <type>", `Event type (${VALID_EVENT_TYPES.join(", ")})`)
	.option("--run-id <id>", "Workflow run ID (UUID)")
	.option("--workflow <name>", "Workflow name (e.g., build, pr-review)")
	.option(
		"--step <step>",
		"Workflow step name (required for status_change, subflow_registered)",
	)
	.option("--unit <unit>", "Task/unit identifier")
	.option("--data <json>", "JSON payload for the event")
	.option(
		"--project <path>",
		"Absolute project path override (otherwise auto-resolved from the active rp1 project)",
	)
	.option("--name <name>", "Human-readable name for the run (set-once)")
	.option(
		"--harness <name>",
		"Harness/platform name (e.g., claude-code, codex, opencode)",
	)
	.option(
		"--close-run",
		"Force-close the run by completing all non-terminal steps",
	)
	.option(
		"--batch <json>",
		'JSON array of event entries for batch emit (use "-" for stdin)',
	)
	.addHelpText(
		"after",
		`
Description:
  Records an event to the rp1 event system database (~/.rp1/rp1.db).
  This is the unified entry point for all event types, replacing the old
  'work update' command.

  Supports 6 event types:
    status_change         Record a workflow step status transition
    artifact_registered   Register an artifact with stable doc_id identity
    annotation_updated    Create or update an annotation on an artifact
    waiting_for_user      Signal that the workflow is waiting for user input
    btw_update            Send an informational update message
    subflow_registered    Register a subflow under a parent step

  Subcommands:
    resume-run            Reuse the latest compatible non-terminal run
    end-run               End a live run as cancelled or abandoned

  Runs are auto-created on first emit if the run-id does not exist.
  Skipped-step detection automatically marks prior unreported steps as skipped.
  Use 'emit end-run' for intentional terminal outcomes. Generic status_change
  events still require --step and are reserved for workflow-step lifecycle
  updates plus force-complete flows via --close-run.

  Batch mode:
    Use --batch to emit multiple events in a single invocation. Events share
    --run-id and --workflow from the parent flags. Each entry in the JSON
    array carries type, step, data, and optional unit/name fields. Events are
    processed strictly in order with per-event state-machine validation. On
    the first invalid event, processing stops and all prior successful events
    are reported alongside the failure.

    --batch <json>       JSON array inline, or "-" to read from stdin

Arguments:
  --type <type>        Event type (required): ${VALID_EVENT_TYPES.join(", ")}
  --run-id <id>        Workflow run UUID (required)
  --workflow <name>    Workflow name (required, e.g., build, pr-review)
  --step <step>        Workflow step name (required for status_change, subflow_registered)
  --unit <unit>        Task/unit identifier (optional)
  --data <json>        JSON payload (optional, content depends on event type)
  --project <path>     Absolute path to project root (optional override)

Project Resolution:
  If --project is omitted, emit resolves the active rp1 project from the
  current directory. If no project exists, run 'rp1 init'. If a legacy
  .rp1/ directory exists without project_id, run 'rp1 migrate'.

Output:
  JSON ToolResult with:
  - eventId: Auto-generated event ID
  - runId: Run identifier
  - type: Event type recorded
  - docId: Stable document ID (for artifact_registered events)
  - skippedSteps: Steps auto-marked as skipped (if any)
  - runStatus: Current derived run status

Examples:
  # Record a status change
  rp1 agent-tools emit \\
    --workflow build \\
    --type status_change \\
    --run-id "550e8400-e29b-41d4-a716-446655440000" \\
    --step requirements \\
    --data '{"status": "running"}'

  # Register an artifact
  rp1 agent-tools emit \\
    --workflow build \\
    --type artifact_registered \\
    --run-id "550e8400-e29b-41d4-a716-446655440000" \\
    --data '{"path": "features/my-feature/design.md", "feature": "my-feature", "storageRoot": "work_dir"}'

  # Record a subflow
  rp1 agent-tools emit \\
    --workflow build \\
    --type subflow_registered \\
    --run-id "550e8400-e29b-41d4-a716-446655440000" \\
    --step building \\
    --data '{"parentStepId": "building", "subflowName": "task-builder"}'

  # Batch emit: multiple events in one call
  rp1 agent-tools emit \\
    --workflow build \\
    --run-id "550e8400-e29b-41d4-a716-446655440000" \\
    --batch '[{"type":"status_change","step":"requirements","data":{"status":"running"}},{"type":"status_change","step":"requirements","data":{"status":"completed"}}]'

  # Batch emit from stdin
  echo '[{"type":"status_change","step":"planning","data":{"status":"running"}}]' | \\
    rp1 agent-tools emit \\
    --workflow build \\
    --run-id "550e8400-e29b-41d4-a716-446655440000" \\
    --batch -
`,
	)
	.action(
		async (options: {
			type: string;
			runId: string;
			workflow: string;
			step?: string;
			unit?: string;
			data?: string;
			project?: string;
			closeRun?: boolean;
			name?: string;
			harness?: string;
			batch?: string;
		}): Promise<void> => {
			const toolName = "emit";

			if (options.batch !== undefined) {
				const { executeBatchEmit } = await import("./emit/index.js");
				const { validateBatchEmitOptions } = await import("./emit/validate.js");
				let batchJson = options.batch;
				if (batchJson === "-") {
					const inputResult = await readInput()();
					if (E.isLeft(inputResult)) {
						console.error(
							createErrorResponse(
								toolName,
								formatError(inputResult.left, false),
							),
						);
						process.exit(1);
					}
					batchJson = inputResult.right.content;
				}

				const validationResult = await validateBatchEmitOptions({
					runId: options.runId,
					workflow: options.workflow,
					project: options.project,
					harness: options.harness,
					batch: batchJson,
				})();

				if (E.isLeft(validationResult)) {
					console.error(
						createErrorResponse(
							toolName,
							formatError(validationResult.left, false),
						),
					);
					process.exit(1);
				}

				const result = await executeBatchEmit(validationResult.right)();

				if (E.isLeft(result)) {
					console.error(
						createErrorResponse(toolName, formatError(result.left, false)),
					);
					process.exit(1);
				}

				console.log(formatOutput(result.right));
				process.exit(result.right.data.failed > 0 ? 1 : 0);
			}

			const { validateEmitOptions } = await import("./emit/validate.js");
			const { executeEmit } = await import("./emit/index.js");

			const emitOptions: EmitCommandOptions = {
				type: options.type,
				runId: options.runId,
				workflow: options.workflow,
				step: options.step,
				unit: options.unit,
				data: options.data,
				project: options.project,
				closeRun: options.closeRun,
				name: options.name,
				harness: options.harness,
			};

			const validationResult = await validateEmitOptions(emitOptions)();

			if (E.isLeft(validationResult)) {
				console.error(
					createErrorResponse(
						toolName,
						formatError(validationResult.left, false),
					),
				);
				process.exit(1);
			}

			const result = await executeEmit(validationResult.right)();

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
 * emit resume-run subcommand.
 * Finds or creates a run for a feature, enabling run resumption via DB lookup.
 */
emitCommand
	.command("resume-run")
	.description("Find or create a run for a feature (run resumption via DB)")
	.requiredOption("--feature <id>", "Feature identifier")
	.requiredOption("--flow <name>", "Workflow name (e.g., build, build-fast)")
	.option("--project <path>", "Project path (defaults to cwd)")
	.addHelpText(
		"after",
		`
Description:
  Finds the most recent non-terminal run for the given feature and project,
  or creates a new one if none exists. This enables skills to resume an
  existing run rather than creating duplicates.

  Terminal statuses are: completed, failed, cancelled, abandoned.
  Legacy skipped runs remain resumable.
  Non-terminal runs are returned in order of most recently created.

Options:
  --feature <id>     Feature identifier (required)
  --flow <name>      Workflow name (required, e.g., build, build-fast, blueprint, pr-review)
  --project <path>   Absolute path to project root (optional, defaults to cwd)

Output:
  JSON ToolResult with:
  - runId: The run UUID (existing or newly created)
  - resumed: true if an existing run was found, false if a new run was created
  - flow: The workflow name
  - featureId: The feature identifier

Examples:
  # Resume or create a run for a feature
  rp1 agent-tools emit resume-run \\
    --feature my-feature \\
    --flow build \\
    --project /path/to/project
`,
	)
	.action(
		async (options: {
			feature: string;
			flow: string;
			project?: string;
		}): Promise<void> => {
			const toolName = "emit";
			const { resolveProjectPath } = await import("./git.js");
			const { findOrCreateRun, getEmitDatabase } = await import(
				"./emit/database.js"
			);

			const projectPath = options.project ?? process.cwd();

			if (!isPlatformAbsoluteProjectPath(projectPath)) {
				console.error(
					createErrorResponse(
						toolName,
						`Project path must be absolute. Received: ${projectPath}`,
					),
				);
				process.exit(1);
			}

			const resolvedResult = await resolveProjectPath(projectPath)();

			if (E.isLeft(resolvedResult)) {
				console.error(
					createErrorResponse(
						toolName,
						formatError(resolvedResult.left, false),
					),
				);
				process.exit(1);
			}

			const dbResult = await getEmitDatabase()();

			if (E.isLeft(dbResult)) {
				console.error(
					createErrorResponse(toolName, formatError(dbResult.left, false)),
				);
				process.exit(1);
			}

			const db = dbResult.right;
			const result = findOrCreateRun(db, {
				flow: options.flow,
				featureId: options.feature,
				projectPath: resolvedResult.right.projectPath,
			});

			console.log(
				formatOutput({
					success: true,
					tool: toolName,
					data: {
						runId: result.runId,
						resumed: result.resumed,
						flow: options.flow,
						featureId: options.feature,
					},
				}),
			);
			process.exit(0);
		},
	);

emitCommand
	.command("end-run")
	.description("End a live run as cancelled or abandoned")
	.requiredOption(
		"--outcome <outcome>",
		"Terminal outcome (cancelled, abandoned)",
	)
	.option("--reason <message>", "Optional explanation for why work stopped")
	.addHelpText(
		"after",
		`
Description:
  Ends an in-progress run with an explicit terminal outcome. This writes a
  stepless status_change event so the run ends without overloading a workflow
  step or using skipped as a cancellation signal.

Options:
  --run-id <id>           Workflow run UUID (required)
  --outcome <outcome>     Terminal outcome: cancelled or abandoned
  --reason <message>      Optional operator-visible explanation

Examples:
  rp1 agent-tools emit end-run \\
    --run-id "550e8400-e29b-41d4-a716-446655440000" \\
    --outcome cancelled \\
    --reason "Superseded by a newer run"
`,
	)
	.action(
		async (
			options: {
				outcome: string;
				reason?: string;
			},
			command: { optsWithGlobals: () => { runId?: string } },
		): Promise<void> => {
			const toolName = "emit";
			const runId = command.optsWithGlobals().runId;
			if (!runId || runId.trim() === "") {
				console.error(
					createErrorResponse(
						toolName,
						formatError(usageError("--run-id is required"), false),
					),
				);
				process.exit(1);
			}
			if (options.outcome !== "cancelled" && options.outcome !== "abandoned") {
				console.error(
					createErrorResponse(
						toolName,
						formatError(
							usageError(
								`Invalid end-run outcome: '${options.outcome}'. Must be one of: cancelled, abandoned`,
							),
							false,
						),
					),
				);
				process.exit(1);
			}

			const { executeEndRun } = await import("./emit/index.js");
			const result = await executeEndRun({
				runId,
				outcome: options.outcome,
				reason: options.reason,
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
 * feedback subcommand.
 * Read, resolve, reply to, and accept feedback from the Arcade.
 */
const feedbackCommand = agentToolsCommand
	.command("feedback")
	.description("Read, resolve, reply to, and accept feedback from the Arcade")
	.addHelpText(
		"after",
		`
Description:
  Provides subcommands for managing the feedback lifecycle between
  users and agents. Agents read annotations and file edits from the
  Arcade, then resolve, reply, or accept them.

Subcommands:
  read          Read open annotations and pending file edits for a run
  resolve       Resolve an annotation with an optional reply
  reply         Reply to an annotation thread
  accept-edit   Accept (acknowledge) a direct file edit

Examples:
  rp1 agent-tools feedback read --run-id <uuid> --status open
  rp1 agent-tools feedback resolve 42 --reply "Applied the suggested fix"
  rp1 agent-tools feedback reply 42 --content "Working on this now"
  rp1 agent-tools feedback accept-edit <doc-id>
`,
	);

/**
 * feedback read subcommand.
 * Retrieves all open annotations and pending file edits for a workflow run.
 */
feedbackCommand
	.command("read")
	.description("Read open annotations and pending file edits for a run")
	.requiredOption("--run-id <id>", "Workflow run ID")
	.option(
		"--status <status>",
		`Annotation status filter (${VALID_STATUS_FILTERS.join(", ")})`,
		"open",
	)
	.option("--project <path>", "Project path (defaults to cwd)")
	.addHelpText(
		"after",
		`
Description:
  Retrieves all open annotations and pending file edits associated with
  a workflow run. Annotations include their full thread (replies).
  File edits are returned as unified diffs computed from the stored
  baseline vs current file content on disk.

Options:
  --run-id <id>       Workflow run ID (required)
  --status <status>   Filter annotations by status: ${VALID_STATUS_FILTERS.join(", ")} (default: open)
  --project <path>    Project path for resolving artifact file paths (defaults to cwd)

Output:
  JSON ToolResult with:
  - runId: The run identifier
  - annotations: Array of annotation objects with id, docId, artifactPath, content, anchor, status, author, replies, createdAt
  - edits: Array of edit objects with docId, artifactPath, patch (unified diff)
  - summary: Counts of annotations, edits, and breakdown by artifact type

Examples:
  rp1 agent-tools feedback read --run-id "550e8400-e29b-41d4-a716-446655440000"
  rp1 agent-tools feedback read --run-id "550e8400-e29b-41d4-a716-446655440000" --status all
  rp1 agent-tools feedback read --run-id "550e8400-e29b-41d4-a716-446655440000" --status resolved --project /path/to/project
`,
	)
	.action(
		async (options: {
			runId: string;
			status: string;
			project?: string;
		}): Promise<void> => {
			const toolName = "feedback";
			const { executeFeedbackRead, validateReadOptions } = await import(
				"./feedback/index.js"
			);

			const validationResult = validateReadOptions({
				runId: options.runId,
				status: options.status,
				project: options.project,
			});

			if (E.isLeft(validationResult)) {
				console.error(
					createErrorResponse(
						toolName,
						formatError(validationResult.left, false),
					),
				);
				process.exit(1);
			}

			const result = await executeFeedbackRead(validationResult.right)();

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
 * feedback resolve subcommand.
 * Marks an annotation as resolved with an optional reply.
 */
feedbackCommand
	.command("resolve <annotation-id>")
	.description("Resolve an annotation with an optional reply")
	.option("--reply <text>", "Reply explaining what action was taken")
	.addHelpText(
		"after",
		`
Description:
  Marks an annotation as resolved. Optionally includes a reply that
  explains what action was taken. The reply is attributed to the agent.
  Only root annotations (not replies) can be resolved.

Arguments:
  annotation-id   Annotation ID to resolve (positive integer)

Options:
  --reply <text>   Optional reply explaining the action taken

Output:
  JSON ToolResult with:
  - resolved: true
  - annotationId: The resolved annotation ID
  - replyId: ID of the reply (if --reply was provided)

Examples:
  rp1 agent-tools feedback resolve 42
  rp1 agent-tools feedback resolve 42 --reply "Applied the suggested fix to design.md"
`,
	)
	.action(
		async (
			annotationId: string,
			options: { reply?: string },
		): Promise<void> => {
			const toolName = "feedback";
			const { executeFeedbackResolve, validateResolveOptions } = await import(
				"./feedback/index.js"
			);

			const validationResult = validateResolveOptions({
				annotationId,
				reply: options.reply,
			});

			if (E.isLeft(validationResult)) {
				console.error(
					createErrorResponse(
						toolName,
						formatError(validationResult.left, false),
					),
				);
				process.exit(1);
			}

			const result = await executeFeedbackResolve(validationResult.right)();

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
 * feedback reply subcommand.
 * Adds an agent-attributed reply to an annotation thread.
 */
feedbackCommand
	.command("reply <annotation-id>")
	.description("Reply to an annotation thread")
	.requiredOption("--content <text>", "Reply content")
	.addHelpText(
		"after",
		`
Description:
  Adds a reply to an existing annotation thread without resolving it.
  The reply is attributed to the agent (author: "agent").

Arguments:
  annotation-id   Annotation ID to reply to (positive integer)

Options:
  --content <text>   Reply content (required, must be non-empty)

Output:
  JSON ToolResult with:
  - replyId: ID of the created reply
  - annotationId: The parent annotation ID

Examples:
  rp1 agent-tools feedback reply 42 --content "Working on this now"
  rp1 agent-tools feedback reply 42 --content "This conflicts with the existing caching strategy, leaving open for discussion"
`,
	)
	.action(
		async (
			annotationId: string,
			options: { content: string },
		): Promise<void> => {
			const toolName = "feedback";
			const { executeFeedbackReply, validateReplyOptions } = await import(
				"./feedback/index.js"
			);

			const validationResult = validateReplyOptions({
				annotationId,
				content: options.content,
			});

			if (E.isLeft(validationResult)) {
				console.error(
					createErrorResponse(
						toolName,
						formatError(validationResult.left, false),
					),
				);
				process.exit(1);
			}

			const result = await executeFeedbackReply(validationResult.right)();

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
 * feedback accept-edit subcommand.
 * Accepts a direct file edit by clearing the artifact baseline.
 */
feedbackCommand
	.command("accept-edit <doc-id>")
	.description("Accept (acknowledge) a direct file edit")
	.addHelpText(
		"after",
		`
Description:
  Accepts a user's direct file edit by clearing the stored baseline for
  that artifact. After acceptance, the edit no longer appears as pending
  in feedback reads. The file content on disk is not modified.

Arguments:
  doc-id   Document ID of the artifact whose edit to accept

Output:
  JSON ToolResult with:
  - accepted: true
  - docId: The accepted document ID

Examples:
  rp1 agent-tools feedback accept-edit "abc123-def456"
`,
	)
	.action(async (docId: string): Promise<void> => {
		const toolName = "feedback";
		const { executeFeedbackAcceptEdit, validateAcceptEditOptions } =
			await import("./feedback/index.js");

		const validationResult = validateAcceptEditOptions({ docId });

		if (E.isLeft(validationResult)) {
			console.error(
				createErrorResponse(
					toolName,
					formatError(validationResult.left, false),
				),
			);
			process.exit(1);
		}

		const result = await executeFeedbackAcceptEdit(validationResult.right)();

		if (E.isLeft(result)) {
			console.error(
				createErrorResponse(toolName, formatError(result.left, false)),
			);
			process.exit(1);
		}

		console.log(formatOutput(result.right));
		process.exit(0);
	});

const socraticDuelCommand = agentToolsCommand
	.command("socratic-duel")
	.description("Coordinate Socratic Duel participant locks and leases")
	.addHelpText(
		"after",
		`
Description:
  Provides deterministic lock coordination for the Socratic Duel workflow. The
  tool validates the readable source Markdown path, registers participants,
  allocates debate artifact paths when requested, grants one exclusive lock
  lease at a time, refreshes active leases, and releases or closes lock
  contexts. Closing requires the current unexpired owner token. Agents own
  document parsing, debate state, Markdown updates, template selection,
  candidate convergence, and terminal summaries.

Subcommands:
  join          Create or resume an active lock context and register a participant
  status        Show participant and lease status
  claim-lock    Acquire the lock or receive bounded wait guidance
  refresh-lock  Extend the current owner's lease
  release-lock  Release the current lock, optionally closing with an owned lease

Examples:
  rp1 agent-tools socratic-duel join --target /tmp/plan.md --topic "API shape" --debate-dir /tmp/debates --participant-name codex --harness codex --model-id gpt-5
  rp1 agent-tools socratic-duel claim-lock --duel-id <id> --participant-id <id>
  rp1 agent-tools socratic-duel claim-lock --duel-id <id> --participant-id <id> --for-timeout
  rp1 agent-tools socratic-duel refresh-lock --duel-id <id> --participant-id <id> --lease-token <token>
  rp1 agent-tools socratic-duel release-lock --duel-id <id> --participant-id <id> --lease-token <token>
  rp1 agent-tools socratic-duel release-lock --duel-id <id> --participant-id <id> --lease-token <token> --close --outcome TIMEOUT
`,
	);

socraticDuelCommand
	.command("join")
	.description("Create or resume an active duel and register a participant")
	.requiredOption(
		"--target <path>",
		"Absolute path to the readable Markdown source",
	)
	.option("--topic <topic>", "Effective debate topic")
	.option("--debate-dir <path>", "Absolute directory for debate artifacts")
	.requiredOption("--participant-name <name>", "Participant display name")
	.requiredOption("--harness <name>", "Harness identity")
	.option("--model-id <id>", "Model identity", "unknown-model")
	.option("--run-id <id>", "Workflow run ID")
	.action(
		async (options: {
			target: string;
			topic?: string;
			debateDir?: string;
			participantName: string;
			harness: string;
			modelId: string;
			runId?: string;
		}): Promise<void> => {
			const toolName = "socratic-duel";
			const { executeJoin: executeSocraticDuelJoin } = await import(
				"./socratic-duel/index.js"
			);
			const result = await executeSocraticDuelJoin({
				targetPath: options.target,
				topic: options.topic,
				debateDir: options.debateDir,
				participantName: options.participantName,
				harness: options.harness,
				modelId: options.modelId,
				runId: options.runId,
			})();

			if (E.isLeft(result)) {
				console.error(
					createErrorResponse(toolName, formatError(result.left, false)),
				);
				process.exit(1);
			}

			console.log(formatOutput(result.right));
			process.exit(result.right.success ? 0 : 1);
		},
	);

socraticDuelCommand
	.command("status")
	.description("Show duel status")
	.option("--duel-id <id>", "Duel ID")
	.option("--target <path>", "Absolute path to the Markdown source")
	.option("--topic <topic>", "Effective debate topic")
	.action(
		async (options: {
			duelId?: string;
			target?: string;
			topic?: string;
		}): Promise<void> => {
			const toolName = "socratic-duel";
			const { executeStatus: executeSocraticDuelStatus } = await import(
				"./socratic-duel/index.js"
			);
			const result = await executeSocraticDuelStatus({
				duelId: options.duelId,
				targetPath: options.target,
				topic: options.topic,
			})();

			if (E.isLeft(result)) {
				console.error(
					createErrorResponse(toolName, formatError(result.left, false)),
				);
				process.exit(1);
			}

			console.log(formatOutput(result.right));
			process.exit(result.right.success ? 0 : 1);
		},
	);

socraticDuelCommand
	.command("claim-lock")
	.description("Acquire the lock or receive bounded wait guidance")
	.requiredOption("--duel-id <id>", "Duel ID")
	.requiredOption("--participant-id <id>", "Participant ID")
	.option(
		"--for-timeout",
		"Acquire a lock for writing a bounded-wait timeout conclusion",
		false,
	)
	.action(
		async (options: {
			duelId: string;
			participantId: string;
			forTimeout: boolean;
		}): Promise<void> => {
			const toolName = "socratic-duel";
			const { executeClaimLock: executeSocraticDuelClaimLock } = await import(
				"./socratic-duel/index.js"
			);
			const result = await executeSocraticDuelClaimLock({
				duelId: options.duelId,
				participantId: options.participantId,
				forTimeout: options.forTimeout,
			})();

			if (E.isLeft(result)) {
				console.error(
					createErrorResponse(toolName, formatError(result.left, false)),
				);
				process.exit(1);
			}

			console.log(formatOutput(result.right));
			process.exit(result.right.success ? 0 : 1);
		},
	);

socraticDuelCommand
	.command("refresh-lock")
	.description("Refresh the current owner's lock lease")
	.requiredOption("--duel-id <id>", "Duel ID")
	.requiredOption("--participant-id <id>", "Participant ID")
	.requiredOption("--lease-token <token>", "Lease token returned by claim-lock")
	.action(
		async (options: {
			duelId: string;
			participantId: string;
			leaseToken: string;
		}): Promise<void> => {
			const toolName = "socratic-duel";
			const { executeRefreshLock: executeSocraticDuelRefreshLock } =
				await import("./socratic-duel/index.js");
			const result = await executeSocraticDuelRefreshLock({
				duelId: options.duelId,
				participantId: options.participantId,
				leaseToken: options.leaseToken,
			})();

			if (E.isLeft(result)) {
				console.error(
					createErrorResponse(toolName, formatError(result.left, false)),
				);
				process.exit(1);
			}

			console.log(formatOutput(result.right));
			process.exit(result.right.success ? 0 : 1);
		},
	);

socraticDuelCommand
	.command("release-lock")
	.description(
		"Release the current lock, optionally closing with an owned lease",
	)
	.requiredOption("--duel-id <id>", "Duel ID")
	.requiredOption("--participant-id <id>", "Participant ID")
	.option("--lease-token <token>", "Lease token returned by claim-lock")
	.option(
		"--close",
		"Close the lock context after releasing an owned lease",
		false,
	)
	.option(
		"--outcome <outcome>",
		`Terminal outcome when used with --close: ${VALID_TERMINAL_OUTCOMES.join(", ")}`,
	)
	.action(
		async (options: {
			duelId: string;
			participantId: string;
			leaseToken?: string;
			close: boolean;
			outcome?: string;
		}): Promise<void> => {
			const toolName = "socratic-duel";
			if (
				options.outcome !== undefined &&
				!VALID_TERMINAL_OUTCOMES.includes(options.outcome as TerminalOutcome)
			) {
				console.error(
					createErrorResponse(
						toolName,
						formatError(
							usageError(
								`Invalid --outcome value: '${options.outcome}'. Must be one of: ${VALID_TERMINAL_OUTCOMES.join(", ")}`,
							),
							false,
						),
					),
				);
				process.exit(1);
			}

			const { executeReleaseLock: executeSocraticDuelReleaseLock } =
				await import("./socratic-duel/index.js");
			const result = await executeSocraticDuelReleaseLock({
				duelId: options.duelId,
				participantId: options.participantId,
				leaseToken: options.leaseToken,
				close: options.close,
				outcome: options.outcome as TerminalOutcome | undefined,
			})();

			if (E.isLeft(result)) {
				console.error(
					createErrorResponse(toolName, formatError(result.left, false)),
				);
				process.exit(1);
			}

			console.log(formatOutput(result.right));
			process.exit(result.right.success ? 0 : 1);
		},
	);

/**
 * task subcommand.
 * Manages the persistent FIFO task queue for agents and workflows.
 */
const taskCommand = agentToolsCommand
	.command("task")
	.description(
		"Manage task queue (create, list, pickup, complete, fail, cancel, get)",
	)
	.addHelpText(
		"after",
		`
Description:
  Provides subcommands for managing a persistent FIFO task queue.
  Tasks are stored in the global SQLite database at ~/.rp1/rp1.db.
  Agents, workflows, and users can create tasks for later execution.

Subcommands:
  create     Create a new pending task
  list       List tasks with optional filters
  pickup     Pick up the oldest pending task (atomic FIFO)
  complete   Mark an in-progress task as completed
  fail       Mark an in-progress task as failed
  cancel     Cancel a pending or in-progress task
  get        Get a single task by ID

Examples:
  rp1 agent-tools task create --type check-annotations --description "Review open annotations"
  rp1 agent-tools task list --status pending
  rp1 agent-tools task pickup --project /path/to/project
  rp1 agent-tools task complete --id 1 --result "All annotations resolved"
  rp1 agent-tools task fail --id 2 --result "Could not access file"
  rp1 agent-tools task cancel --id 3
  rp1 agent-tools task get --id 1
`,
	);

/**
 * task create subcommand.
 * Creates a new pending task in the queue.
 */
taskCommand
	.command("create")
	.description("Create a new pending task")
	.requiredOption(
		"--type <type>",
		"Task type (free-form string, e.g. 'check-annotations')",
	)
	.requiredOption("--description <text>", "Human-readable task description")
	.option("--payload <json>", "JSON blob for type-specific data")
	.option("--project <path>", "Absolute path to project directory for scoping")
	.addHelpText(
		"after",
		`
Description:
  Creates a new task in pending state. The task is added to the FIFO queue
  and will be picked up by agents or harness hooks in creation order.

Options:
  --type <type>          Task type string (required, must be non-empty)
  --description <text>   Human-readable description (required, must be non-empty)
  --payload <json>       Optional JSON blob for type-specific data
  --project <path>       Optional absolute project path for scoping

Validation:
  - Type must be a non-empty string
  - Description must be a non-empty string
  - Payload must be valid JSON if provided
  - Project path must be absolute if provided

Output:
  JSON ToolResult with the created TaskRecord including assigned ID.

Examples:
  rp1 agent-tools task create --type check-annotations --description "Review open annotations from last audit"
  rp1 agent-tools task create --type archive-feature --description "Archive auth-refactor" --project /Users/dev/myapp
  rp1 agent-tools task create --type remediate --description "Fix findings" --payload '{"severity":"high","count":3}'
`,
	)
	.action(
		async (options: {
			type: string;
			description: string;
			payload?: string;
			project?: string;
		}): Promise<void> => {
			const toolName = "task";
			const { executeCreate: executeTaskCreate } = await import(
				"./task/index.js"
			);

			const result = await executeTaskCreate({
				type: options.type,
				description: options.description,
				payload: options.payload,
				projectPath: options.project,
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
 * task list subcommand.
 * Lists tasks with optional filters.
 */
taskCommand
	.command("list")
	.description("List tasks with optional filters")
	.option(
		"--status <status>",
		`Filter by status (${VALID_TASK_STATUSES.join(", ")})`,
	)
	.option("--project <path>", "Filter by project path (absolute)")
	.option("--limit <n>", "Maximum number of tasks to return")
	.addHelpText(
		"after",
		`
Description:
  Lists tasks from the queue, optionally filtered by status and/or project.
  Results are returned in FIFO order (oldest first).

Options:
  --status <status>   Filter by lifecycle status: ${VALID_TASK_STATUSES.join(", ")}
  --project <path>    Filter by absolute project path
  --limit <n>         Maximum number of results (positive integer)

Validation:
  - Status must be a valid task status if provided
  - Project path must be absolute if provided
  - Limit must be a positive integer if provided

Output:
  JSON ToolResult with array of TaskRecord objects.

Examples:
  rp1 agent-tools task list
  rp1 agent-tools task list --status pending
  rp1 agent-tools task list --project /Users/dev/myapp --limit 10
`,
	)
	.action(
		async (options: {
			status?: string;
			project?: string;
			limit?: string;
		}): Promise<void> => {
			const toolName = "task";

			const limit = options.limit ? parseInt(options.limit, 10) : undefined;
			if (
				options.limit !== undefined &&
				(Number.isNaN(limit) || !limit || limit <= 0)
			) {
				console.error(
					createErrorResponse(
						toolName,
						`Invalid --limit value: ${options.limit}. Must be a positive integer.`,
					),
				);
				process.exit(1);
			}

			const { executeList: executeTaskList } = await import("./task/index.js");
			const result = await executeTaskList({
				status: options.status as
					| import("./task/models.js").TaskStatus
					| undefined,
				projectPath: options.project,
				limit,
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
 * task pickup subcommand.
 * Atomically picks up the oldest pending task.
 */
taskCommand
	.command("pickup")
	.description("Pick up the oldest pending task (atomic FIFO)")
	.option("--project <path>", "Filter by project path (absolute)")
	.addHelpText(
		"after",
		`
Description:
  Atomically picks up the oldest pending task and transitions it to in_progress.
  Returns null (with success: true) if no pending tasks exist.

Options:
  --project <path>   Filter by absolute project path

Validation:
  - Project path must be absolute if provided

Output:
  JSON ToolResult with the picked-up TaskRecord, or null if queue is empty.

Examples:
  rp1 agent-tools task pickup
  rp1 agent-tools task pickup --project /Users/dev/myapp
`,
	)
	.action(async (options: { project?: string }): Promise<void> => {
		const toolName = "task";
		const { executePickup: executeTaskPickup } = await import(
			"./task/index.js"
		);

		const result = await executeTaskPickup(options.project)();

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
 * task complete subcommand.
 * Marks an in-progress task as completed.
 */
taskCommand
	.command("complete")
	.description("Mark an in-progress task as completed")
	.requiredOption("--id <id>", "Task ID (positive integer)")
	.option("--result <text>", "Optional result summary")
	.addHelpText(
		"after",
		`
Description:
  Marks an in_progress task as completed with an optional result summary.
  Only tasks in in_progress state can be completed.

Options:
  --id <id>          Task ID to complete (required, positive integer)
  --result <text>    Optional result summary describing what was done

Validation:
  - ID must be a positive integer
  - Task must be in in_progress state

Output:
  JSON ToolResult with the completed TaskRecord.

Examples:
  rp1 agent-tools task complete --id 1
  rp1 agent-tools task complete --id 1 --result "All annotations resolved, 3 files updated"
`,
	)
	.action(async (options: { id: string; result?: string }): Promise<void> => {
		const toolName = "task";
		const { executeComplete: executeTaskComplete } = await import(
			"./task/index.js"
		);

		const id = parseInt(options.id, 10);
		if (Number.isNaN(id) || id <= 0) {
			console.error(
				createErrorResponse(
					toolName,
					`Invalid --id value: ${options.id}. Must be a positive integer.`,
				),
			);
			process.exit(1);
		}

		const result = await executeTaskComplete({
			id,
			result: options.result,
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
 * task fail subcommand.
 * Marks an in-progress task as failed.
 */
taskCommand
	.command("fail")
	.description("Mark an in-progress task as failed")
	.requiredOption("--id <id>", "Task ID (positive integer)")
	.option("--result <text>", "Optional error description")
	.addHelpText(
		"after",
		`
Description:
  Marks an in_progress task as failed with an optional error description.
  Only tasks in in_progress state can be failed.

Options:
  --id <id>          Task ID to fail (required, positive integer)
  --result <text>    Optional error description explaining the failure

Validation:
  - ID must be a positive integer
  - Task must be in in_progress state

Output:
  JSON ToolResult with the failed TaskRecord.

Examples:
  rp1 agent-tools task fail --id 2
  rp1 agent-tools task fail --id 2 --result "Could not access required file: permission denied"
`,
	)
	.action(async (options: { id: string; result?: string }): Promise<void> => {
		const toolName = "task";
		const { executeFail: executeTaskFail } = await import("./task/index.js");

		const id = parseInt(options.id, 10);
		if (Number.isNaN(id) || id <= 0) {
			console.error(
				createErrorResponse(
					toolName,
					`Invalid --id value: ${options.id}. Must be a positive integer.`,
				),
			);
			process.exit(1);
		}

		const result = await executeTaskFail({
			id,
			result: options.result,
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
 * task cancel subcommand.
 * Cancels a pending or in-progress task.
 */
taskCommand
	.command("cancel")
	.description("Cancel a pending or in-progress task")
	.requiredOption("--id <id>", "Task ID (positive integer)")
	.addHelpText(
		"after",
		`
Description:
  Cancels a task that is in pending or in_progress state.
  Completed and failed tasks cannot be cancelled.

Options:
  --id <id>   Task ID to cancel (required, positive integer)

Validation:
  - ID must be a positive integer
  - Task must be in pending or in_progress state

Output:
  JSON ToolResult with the cancelled TaskRecord.

Examples:
  rp1 agent-tools task cancel --id 3
`,
	)
	.action(async (options: { id: string }): Promise<void> => {
		const toolName = "task";

		const id = parseInt(options.id, 10);
		if (Number.isNaN(id) || id <= 0) {
			console.error(
				createErrorResponse(
					toolName,
					`Invalid --id value: ${options.id}. Must be a positive integer.`,
				),
			);
			process.exit(1);
		}

		const { executeCancel: executeTaskCancel } = await import(
			"./task/index.js"
		);
		const result = await executeTaskCancel(id)();

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
 * task get subcommand.
 * Retrieves a single task by ID.
 */
taskCommand
	.command("get")
	.description("Get a single task by ID")
	.requiredOption("--id <id>", "Task ID (positive integer)")
	.addHelpText(
		"after",
		`
Description:
  Retrieves a single task record by its ID.

Options:
  --id <id>   Task ID to retrieve (required, positive integer)

Validation:
  - ID must be a positive integer

Output:
  JSON ToolResult with the TaskRecord.

Examples:
  rp1 agent-tools task get --id 1
`,
	)
	.action(async (options: { id: string }): Promise<void> => {
		const toolName = "task";

		const id = parseInt(options.id, 10);
		if (Number.isNaN(id) || id <= 0) {
			console.error(
				createErrorResponse(
					toolName,
					`Invalid --id value: ${options.id}. Must be a positive integer.`,
				),
			);
			process.exit(1);
		}

		const { executeGet: executeTaskGet } = await import("./task/index.js");
		const result = await executeTaskGet(id)();

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
  publish-comment  Publish an rp1 artifact as an idempotent PR/issue comment

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

  # Publish an artifact as a comment
  echo '{"artifact_path":".rp1/work/features/x/design.md"}' | \\
    rp1 agent-tools github-pr publish-comment
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

		const { executeSubmitReview } = await import("./github-pr/index.js");
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

		const { executeAddReaction } = await import("./github-pr/index.js");
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

		const { executeReplyComment } = await import("./github-pr/index.js");
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

		const { executeFetchComments } = await import("./github-pr/index.js");
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

/**
 * github-pr publish-comment subcommand.
 * Publishes an rp1 artifact as an idempotent PR or issue comment.
 */
githubPrCommand
	.command("publish-comment")
	.description("Publish an rp1 artifact as an idempotent PR/issue comment")
	.addHelpText(
		"after",
		`
Description:
  Projects an rp1 work artifact into a routing comment and upserts it onto a
  PR or issue via the GitHub API. The operation is idempotent: re-runs update
  the same comment in place (matched by an HTML marker key). Owner/repo are
  derived from the git origin remote; the target defaults to the current
  branch's open PR. Accepts JSON input via stdin.

Input (JSON via stdin):
  {
    "artifact_path": "string",   // Path to the rp1 artifact to publish
    "target": "string",          // Optional PR/issue number or URL (defaults to current-branch PR)
    "dry_run": boolean,          // Optional: project the body without writing
    "force": boolean             // Optional: override foreign/orphaned-comment refusals
  }

Output:
  JSON with publish details:
  - action: "post" | "patch"
  - comment_url: URL to the comment (null on dry_run)
  - doc_key: Stable marker key for the artifact
  - size_bytes: Projected comment body size in bytes
  - warnings: Array of advisory warnings
  - dry_run: Whether the run was a dry run
  - comment_body: Projected body (dry_run only)

Examples:
  echo '{"artifact_path":".rp1/work/features/x/design.md"}' | \\
    rp1 agent-tools github-pr publish-comment

  echo '{"artifact_path":".rp1/work/features/x/design.md","target":"123","dry_run":true}' | \\
    rp1 agent-tools github-pr publish-comment
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

		const { executePublishComment } = await import("./github-pr/index.js");
		const result = await executePublishComment(inputResult.right.content)();

		if (E.isLeft(result)) {
			console.error(
				createErrorResponse(toolName, formatError(result.left, false)),
			);
			process.exit(1);
		}

		console.log(formatOutput(result.right));
		process.exit(0);
	});
