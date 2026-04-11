import { existsSync } from "node:fs";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import * as E from "fp-ts/lib/Either.js";
import { pipe } from "fp-ts/lib/function.js";
import * as TE from "fp-ts/lib/TaskEither.js";
import type { CLIError } from "../../../shared/errors.js";
import {
	notFoundError,
	parseError,
	usageError,
} from "../../../shared/errors.js";
import type { ClaudeCodeSkill } from "../../build/models.js";
import { parseSkill } from "../../build/parser.js";
import {
	findOrCreateWorkflowRun,
	getEmitDatabase,
	insertRun,
} from "../emit/database.js";
import { registerTool, type ToolOptions } from "../index.js";
import type { ToolResult } from "../models.js";
import { successResult } from "../output.js";
import { resolveArgs, resolveDirectories } from "../resolve-args/resolver.js";
import type {
	WorkflowBootstrapInput,
	WorkflowBootstrapResult,
	WorkflowBootstrapTrace,
	WorkflowBootstrapWorkflow,
} from "./models.js";

const TOOL_NAME = "workflow-bootstrap";

const parseInput = (
	input: string,
): E.Either<CLIError, WorkflowBootstrapInput> => {
	if (!input.trim()) {
		return E.left(
			usageError(
				"Empty input",
				'Provide JSON with "name", "schema_path", and optional "raw_args", "project_root", and "harness" fields.',
			),
		);
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(input);
	} catch {
		return E.left(parseError("stdin", "Invalid JSON input"));
	}

	if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
		return E.left(
			usageError(
				"Input must be a JSON object",
				'Provide JSON with "name", "schema_path", and optional "raw_args", "project_root", and "harness" fields.',
			),
		);
	}

	const obj = parsed as Record<string, unknown>;
	const name = typeof obj.name === "string" ? obj.name.trim() : "";
	const schemaPath =
		typeof obj.schema_path === "string" ? obj.schema_path.trim() : "";

	if (!name || !schemaPath) {
		return E.left(
			usageError(
				'Missing required "name" or "schema_path" field',
				'Provide the generated workflow "name" and "schema_path" inputs for workflow-bootstrap.',
			),
		);
	}

	return E.right({
		name,
		schema_path: schemaPath,
		raw_args: typeof obj.raw_args === "string" ? obj.raw_args : "",
		project_root:
			typeof obj.project_root === "string" && obj.project_root
				? obj.project_root
				: process.cwd(),
		harness:
			typeof obj.harness === "string" && obj.harness.trim()
				? obj.harness.trim()
				: undefined,
	});
};

const requireInitializedDirectories = (
	projectRoot: string,
): E.Either<CLIError, ReturnType<typeof resolveDirectories>> => {
	const directories = resolveDirectories(projectRoot);

	if (directories.status === "initialized") {
		return E.right(directories);
	}

	const nextStep = directories.nextStepCommand ?? "rp1 init";
	const statusLabel =
		directories.status === "legacy"
			? "legacy rp1 project"
			: "uninitialized rp1 project";

	return E.left(
		usageError(
			`Cannot bootstrap from ${statusLabel} at ${directories.projectRoot}`,
			`Run '${nextStep}' from ${directories.projectRoot} and try again.`,
		),
	);
};

const findInvokingCheckoutRoot = (startPath: string): string | undefined => {
	let current = resolve(startPath);

	while (true) {
		if (existsSync(join(current, ".git"))) {
			return current;
		}

		const parent = dirname(current);
		if (parent === current) {
			return undefined;
		}

		current = parent;
	}
};

const resolveBootstrapSchemaPath = (
	schemaPath: string,
	requestedProjectRoot: string,
	directories: ReturnType<typeof resolveDirectories>,
): string => {
	if (isAbsolute(schemaPath)) {
		return schemaPath;
	}

	if (directories.isWorktree) {
		const checkoutRoot = findInvokingCheckoutRoot(requestedProjectRoot);
		if (checkoutRoot) {
			const worktreeSchemaPath = resolve(checkoutRoot, schemaPath);
			if (existsSync(worktreeSchemaPath)) {
				return worktreeSchemaPath;
			}
		}
	}

	return resolve(directories.projectRoot, schemaPath);
};

const requireBootstrapSchemaPath = (
	resolvedSchemaPath: string,
): E.Either<CLIError, string> =>
	existsSync(resolvedSchemaPath)
		? E.right(resolvedSchemaPath)
		: E.left(
				notFoundError(
					resolvedSchemaPath,
					"Tracked workflow bootstrap requires the generated schema_path to point to an existing source SKILL.md.",
				),
			);

const requireWorkflowTargetMatch = (
	input: WorkflowBootstrapInput,
	skill: ClaudeCodeSkill,
	resolvedSchemaPath: string,
): E.Either<CLIError, WorkflowBootstrapWorkflow> => {
	if (basename(resolvedSchemaPath) !== "SKILL.md") {
		return E.left(
			usageError(
				`workflow-bootstrap only supports tracked skill schemas, received ${resolvedSchemaPath}`,
				"Provide the generated SKILL.md schema path for the tracked workflow.",
			),
		);
	}

	if (skill.name !== input.name) {
		return E.left(
			usageError(
				`Workflow target mismatch: generated name "${input.name}" does not match schema name "${skill.name}"`,
				"Regenerate the tracked workflow prompt so workflow-bootstrap receives the canonical name/schema pair.",
			),
		);
	}

	if (
		skill.metadata?.isWorkflow !== true ||
		!skill.metadata.workflow?.runPolicy
	) {
		return E.left(
			usageError(
				`Schema "${input.schema_path}" is not a tracked workflow with bootstrap metadata`,
				"Tracked workflows must declare metadata.is_workflow: true and metadata.workflow.run_policy.",
			),
		);
	}

	const runPolicy = skill.metadata.workflow.runPolicy;
	const identityArgs = skill.metadata.workflow.identityArgs ?? [];

	if (runPolicy === "resumable" && identityArgs.length === 0) {
		return E.left(
			usageError(
				`Tracked workflow "${skill.name}" is resumable but has no identity arguments`,
				"Declare metadata.workflow.identity_args for resumable workflows.",
			),
		);
	}

	if (runPolicy === "fresh" && identityArgs.length > 0) {
		return E.left(
			usageError(
				`Tracked workflow "${skill.name}" is fresh but declares identity arguments`,
				"Remove metadata.workflow.identity_args from fresh workflows.",
			),
		);
	}

	return E.right({
		name: skill.name,
		schemaPath: input.schema_path,
		runPolicy,
		identityArgs,
	});
};

const requireResolvedArguments = (
	unresolved: readonly string[],
): E.Either<CLIError, void> =>
	unresolved.length === 0
		? E.right(undefined)
		: E.left(
				usageError(
					`Unresolved required arguments: ${unresolved.join(", ")}`,
					`Provide values for: ${unresolved.join(", ")}`,
				),
			);

const deriveIdentity = (
	workflow: WorkflowBootstrapWorkflow,
	argumentsMap: Readonly<Record<string, string | boolean>>,
): E.Either<
	CLIError,
	{
		readonly identityValues: Readonly<Record<string, string | boolean>>;
		readonly workIdentity: string | undefined;
	}
> => {
	if (workflow.runPolicy === "fresh") {
		return E.right({ identityValues: {}, workIdentity: undefined });
	}

	const identityValues: Record<string, string | boolean> = {};

	for (const argName of workflow.identityArgs) {
		const value = argumentsMap[argName];
		if (value === undefined) {
			return E.left(
				usageError(
					`Resumable workflow "${workflow.name}" is missing identity argument "${argName}"`,
					`Provide a value for ${argName} before starting the workflow.`,
				),
			);
		}

		if (typeof value === "string" && value.trim() === "") {
			return E.left(
				usageError(
					`Resumable workflow "${workflow.name}" resolved an empty identity value for "${argName}"`,
					`Provide a non-empty value for ${argName} before starting the workflow.`,
				),
			);
		}

		identityValues[argName] = value;
	}

	return E.right({
		identityValues,
		workIdentity: workflow.identityArgs
			.map((argName) => `${argName}=${String(identityValues[argName])}`)
			.join("|"),
	});
};

const resolveHostAndHarness = (
	inputHarness?: string,
): { readonly host: string; readonly harness: string } => {
	const host =
		process.env.CURRENT_HOST ??
		inputHarness ??
		process.env.RP1_HARNESS ??
		"unknown";
	const harness = inputHarness ?? process.env.RP1_HARNESS ?? host;
	return { host, harness };
};

const deriveFeatureId = (
	argumentsMap: Readonly<Record<string, string | boolean>>,
): string => {
	const featureId = argumentsMap.FEATURE_ID;
	return typeof featureId === "string" && featureId.trim()
		? featureId.trim()
		: "unknown";
};

const buildBootstrapContext = (params: {
	readonly workflow: WorkflowBootstrapWorkflow;
	readonly directories: ReturnType<typeof resolveDirectories>;
	readonly trace: WorkflowBootstrapTrace;
	readonly decision: string;
}): string =>
	JSON.stringify({
		workflow: {
			name: params.workflow.name,
			runPolicy: params.workflow.runPolicy,
			identityArgs: params.workflow.identityArgs,
		},
		directories: {
			projectRoot: params.directories.projectRoot,
			kbRoot: params.directories.kbRoot,
			workRoot: params.directories.workRoot,
		},
		trace: {
			projectIdentity: params.trace.projectIdentity,
			workIdentity: params.trace.workIdentity ?? null,
			identityValues: params.trace.identityValues,
			requestedProjectRoot: params.trace.requestedProjectRoot,
			canonicalProjectRoot: params.trace.canonicalProjectRoot,
			isWorktree: params.trace.isWorktree,
			worktreeName: params.directories.worktreeName,
			host: params.trace.host,
			harness: params.trace.harness,
		},
		run: {
			decision: params.decision,
		},
	});

export const execute = (
	input: string,
	_options: ToolOptions,
): TE.TaskEither<CLIError, ToolResult<WorkflowBootstrapResult>> =>
	pipe(
		TE.fromEither(parseInput(input)),
		TE.bindTo("input"),
		TE.bind("requestedProjectRoot", ({ input }) =>
			TE.right(resolve(input.project_root)),
		),
		TE.bind("directories", ({ requestedProjectRoot }) =>
			TE.fromEither(requireInitializedDirectories(requestedProjectRoot)),
		),
		TE.bind(
			"resolvedSchemaPath",
			({ input, directories, requestedProjectRoot }) =>
				TE.fromEither(
					requireBootstrapSchemaPath(
						resolveBootstrapSchemaPath(
							input.schema_path,
							requestedProjectRoot,
							directories,
						),
					),
				),
		),
		TE.bind("skill", ({ resolvedSchemaPath }) =>
			parseSkill(dirname(resolvedSchemaPath)),
		),
		TE.bind("workflow", ({ input, skill, resolvedSchemaPath }) =>
			TE.fromEither(
				requireWorkflowTargetMatch(input, skill, resolvedSchemaPath),
			),
		),
		TE.bind(
			"resolvedArgs",
			({ requestedProjectRoot, input, resolvedSchemaPath }) =>
				resolveArgs({
					schema_path: resolvedSchemaPath,
					raw_args: input.raw_args,
					project_root: requestedProjectRoot,
				}),
		),
		TE.chainFirst(({ resolvedArgs }) =>
			TE.fromEither(requireResolvedArguments(resolvedArgs.unresolved)),
		),
		TE.bind("identity", ({ workflow, resolvedArgs }) =>
			TE.fromEither(deriveIdentity(workflow, resolvedArgs.arguments)),
		),
		TE.bind("hostAndHarness", ({ input }) =>
			TE.right(resolveHostAndHarness(input.harness)),
		),
		TE.bind("db", () => getEmitDatabase()),
		TE.map(
			({
				db,
				directories,
				hostAndHarness,
				identity,
				requestedProjectRoot,
				resolvedArgs,
				workflow,
			}) => {
				const trace: WorkflowBootstrapTrace = {
					projectIdentity: directories.projectId ?? directories.projectRoot,
					workIdentity: identity.workIdentity,
					identityValues: identity.identityValues,
					requestedProjectRoot,
					canonicalProjectRoot: directories.projectRoot,
					isWorktree: directories.isWorktree,
					worktreeName: directories.worktreeName,
					host: hostAndHarness.host,
					harness: hostAndHarness.harness,
				};

				const baseContext = buildBootstrapContext({
					workflow,
					directories,
					trace,
					decision: "pending",
				});

				const featureId = deriveFeatureId(resolvedArgs.arguments);
				const runResult = findOrCreateWorkflowRun(db, {
					flow: workflow.name,
					featureId,
					projectPath: directories.projectRoot,
					rp1ProjectRoot: directories.projectRoot,
					rp1KbRoot: directories.kbRoot,
					rp1WorkRoot: directories.workRoot,
					projectId: directories.projectId,
					runPolicy: workflow.runPolicy,
					workIdentity: identity.workIdentity,
					bootstrapContext: baseContext,
					harness: hostAndHarness.harness,
				});

				const finalContext = buildBootstrapContext({
					workflow,
					directories,
					trace,
					decision: runResult.decision,
				});

				insertRun(db, {
					id: runResult.run.id,
					flow: workflow.name,
					featureId,
					projectPath: directories.projectRoot,
					rp1ProjectRoot: directories.projectRoot,
					rp1KbRoot: directories.kbRoot,
					rp1WorkRoot: directories.workRoot,
					projectId: directories.projectId,
					runPolicy: workflow.runPolicy,
					workIdentity: identity.workIdentity,
					bootstrapContext: finalContext,
					harness: hostAndHarness.harness,
				});

				return successResult(TOOL_NAME, {
					arguments: resolvedArgs.arguments,
					directories: resolvedArgs.directories,
					workflow,
					run: {
						runId: runResult.run.id,
						resumed: runResult.resumed,
						decision: runResult.decision,
					},
					trace,
				});
			},
		),
	);

registerTool({
	name: TOOL_NAME,
	description:
		"Resolve canonical tracked-workflow context and deterministically create or resume the backing run",
	execute,
});

export { TOOL_NAME };
