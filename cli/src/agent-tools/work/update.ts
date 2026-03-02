/**
 * Validation module for work status update command.
 * Provides input validation for project path, feature name, status,
 * and state machine transition validation when --workflow is provided.
 */

import { isAbsolute } from "node:path";
import * as E from "fp-ts/lib/Either.js";
import { pipe } from "fp-ts/lib/function.js";
import * as TE from "fp-ts/lib/TaskEither.js";
import type { CLIError } from "../../../shared/errors.js";
import { usageError } from "../../../shared/errors.js";
import {
	listWorkflows,
	loadStateMachine,
	validateTransition,
} from "../state-machine/index.js";
import { getCurrentWorkflowState } from "./database.js";
import type { StatusUpdateInput, StatusValue } from "./models.js";
import { VALID_STATUSES } from "./models.js";

/** Sentinel error used by detectStateMachineConflict to signal a match */
class WorkflowConflictError extends Error {
	readonly workflowName: string;
	readonly task: string;
	constructor(workflowName: string, task: string) {
		super(`Workflow conflict: ${task} matches ${workflowName}`);
		this.workflowName = workflowName;
		this.task = task;
	}
}

/** Feature name pattern: lowercase alphanumeric with hyphens */
const FEATURE_PATTERN = /^[a-z0-9-]+$/;

/** Default TTL in seconds (8 hours) for expires_at computation */
const DEFAULT_TTL_SECONDS = 28800;

/**
 * Input options from CLI command.
 * All fields are strings from command line parsing.
 */
export interface UpdateCommandOptions {
	readonly project: string;
	readonly feature: string;
	readonly task?: string;
	readonly status: string;
	readonly message?: string;
	readonly metadata?: string;
	readonly workflow?: string;
	readonly runId?: string;
	readonly ttl?: string;
}

/**
 * Result of workflow validation step.
 * Contains computed values to include in the StatusUpdateInput.
 */
interface WorkflowValidationResult {
	readonly workflow?: string;
	readonly runId?: string;
	readonly expiresAt?: string;
	readonly previousState?: string | null;
}

/**
 * Validate that the project path is absolute.
 */
const validateProjectPath = (path: string): E.Either<CLIError, string> => {
	if (!path || path.trim() === "") {
		return E.left(usageError("Project path is required"));
	}

	if (!isAbsolute(path)) {
		return E.left(
			usageError(`Project path must be absolute. Received: ${path}`),
		);
	}

	return E.right(path);
};

/**
 * Validate that the feature name matches kebab-case pattern.
 */
const validateFeatureName = (feature: string): E.Either<CLIError, string> => {
	if (!feature || feature.trim() === "") {
		return E.left(usageError("Feature name is required"));
	}

	if (!FEATURE_PATTERN.test(feature)) {
		return E.left(
			usageError(
				`Feature name must match pattern ^[a-z0-9-]+$ (lowercase alphanumeric with hyphens). Received: ${feature}`,
			),
		);
	}

	return E.right(feature);
};

/**
 * Validate that the status is one of the allowed values.
 */
const validateStatus = (status: string): E.Either<CLIError, StatusValue> => {
	if (!status || status.trim() === "") {
		return E.left(usageError("Status is required"));
	}

	if (!VALID_STATUSES.includes(status as StatusValue)) {
		return E.left(
			usageError(
				`Invalid status: ${status}. Must be one of: ${VALID_STATUSES.join(", ")}`,
			),
		);
	}

	return E.right(status as StatusValue);
};

/**
 * Validate that metadata is valid JSON if provided.
 */
const validateMetadata = (
	metadata: string | undefined,
): E.Either<CLIError, string | undefined> => {
	if (metadata === undefined || metadata === "") {
		return E.right(undefined);
	}

	try {
		JSON.parse(metadata);
		return E.right(metadata);
	} catch {
		return E.left(
			usageError(`Metadata must be valid JSON. Received: ${metadata}`),
		);
	}
};

/**
 * Compute ISO 8601 expires_at timestamp from a TTL in seconds.
 */
const computeExpiresAt = (ttlSeconds: number): string => {
	const now = new Date();
	const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);
	return expiresAt.toISOString();
};

/**
 * Parse TTL string to number of seconds, defaulting to 8 hours.
 */
const parseTtl = (ttl: string | undefined): E.Either<CLIError, number> => {
	if (ttl === undefined || ttl === "") {
		return E.right(DEFAULT_TTL_SECONDS);
	}

	const parsed = parseInt(ttl, 10);
	if (Number.isNaN(parsed) || parsed <= 0) {
		return E.left(
			usageError(`TTL must be a positive integer (seconds). Received: ${ttl}`),
		);
	}

	return E.right(parsed);
};

/**
 * Validate a workflow transition when --workflow is provided.
 *
 * 1. Load state machine for the workflow
 * 2. Validate --task is provided and is a valid state
 * 3. Compute expires_at from TTL
 * 4. Query current state from DB (with stale filtering)
 * 5. If first update: validate --task is an initial state
 * 6. If subsequent: validate transition from current to --task
 */
const validateWorkflowUpdate = (
	workflowName: string,
	projectPath: string,
	feature: string,
	task: string | undefined,
	runId: string | undefined,
	ttl: string | undefined,
	dbPath?: string,
): TE.TaskEither<CLIError, WorkflowValidationResult> => {
	if (!task) {
		return TE.left(
			usageError(
				"--task is required when --workflow is provided. The task value must be a valid state in the workflow state machine.",
			),
		);
	}

	return pipe(
		loadStateMachine(workflowName),
		TE.mapLeft((err) => {
			if (err._tag === "NotFoundError") {
				return usageError(
					`No state machine defined for workflow '${workflowName}'. Ensure a state.mmd file exists in the skill directory.`,
				);
			}
			return err;
		}),
		TE.chain((machine) => {
			if (!machine.states.has(task)) {
				return TE.left(
					usageError(
						`'${task}' is not a valid state in the '${workflowName}' workflow. Valid states: ${[...machine.states.keys()].join(", ")}`,
					),
				);
			}

			return pipe(
				TE.fromEither(parseTtl(ttl)),
				TE.chain((ttlSeconds) =>
					pipe(
						getCurrentWorkflowState(projectPath, feature, runId, dbPath),
						TE.chain((currentState) => {
							if (currentState === null) {
								if (!machine.initialStates.includes(task)) {
									return TE.left(
										usageError(
											`First update for this workflow run must be an initial state. '${task}' is not an initial state. Valid initial states: ${machine.initialStates.join(", ")}`,
										),
									);
								}
							} else {
								const validation = validateTransition(
									machine,
									currentState,
									task,
								);
								if (!validation.valid) {
									return TE.left(
										usageError(
											validation.error ??
												`Invalid transition from '${currentState}' to '${task}'.`,
										),
									);
								}
							}

							const expiresAt = computeExpiresAt(ttlSeconds);
							return TE.right({
								workflow: workflowName,
								runId,
								expiresAt,
								previousState: currentState,
							} as WorkflowValidationResult);
						}),
					),
				),
			);
		}),
	);
};

/**
 * FR-006: Detect when --workflow is omitted but task matches a state-machine-enabled workflow's state.
 * Best-effort heuristic that checks all loaded workflows.
 *
 * If the listing/loading phase fails (e.g., no state.mmd files found), we silently
 * allow the update through. But if we successfully find a match, we reject.
 */
const detectStateMachineConflict = (
	task: string,
): TE.TaskEither<CLIError, WorkflowValidationResult> =>
	TE.tryCatch(
		async () => {
			const workflowsResult = await listWorkflows()();
			if (E.isLeft(workflowsResult)) {
				return {} as WorkflowValidationResult;
			}

			for (const workflowName of workflowsResult.right) {
				const machineResult = await loadStateMachine(workflowName)();
				if (E.isRight(machineResult)) {
					if (machineResult.right.states.has(task)) {
						throw new WorkflowConflictError(workflowName, task);
					}
				}
			}

			return {} as WorkflowValidationResult;
		},
		(err): CLIError => {
			if (err instanceof WorkflowConflictError) {
				return usageError(
					`Task '${err.task}' matches a state in the '${err.workflowName}' workflow which requires the --workflow flag. ` +
						`Please specify: --workflow ${err.workflowName}`,
				);
			}
			return usageError(`Unexpected error during workflow detection: ${err}`);
		},
	);

/**
 * Validate all update command options and produce StatusUpdateInput.
 *
 * When --workflow is provided, performs state machine transition validation:
 * loads the state machine, queries current state, validates the transition,
 * and computes expires_at from TTL.
 *
 * When --workflow is omitted but --task matches a known workflow state (FR-006),
 * rejects with an error directing the caller to specify --workflow.
 *
 * @param options - CLI command options
 * @param dbPath - Optional database path override (for testing)
 */
export const validateUpdateOptions = (
	options: UpdateCommandOptions,
	dbPath?: string,
): TE.TaskEither<CLIError, StatusUpdateInput> =>
	pipe(
		TE.Do,
		TE.bind("projectPath", () =>
			TE.fromEither(validateProjectPath(options.project)),
		),
		TE.bind("feature", () =>
			TE.fromEither(validateFeatureName(options.feature)),
		),
		TE.bind("status", () => TE.fromEither(validateStatus(options.status))),
		TE.bind("metadata", () =>
			TE.fromEither(validateMetadata(options.metadata)),
		),
		TE.bind("workflowResult", ({ projectPath, feature }) =>
			options.workflow
				? validateWorkflowUpdate(
						options.workflow,
						projectPath,
						feature,
						options.task,
						options.runId,
						options.ttl,
						dbPath,
					)
				: options.task
					? detectStateMachineConflict(options.task)
					: TE.right({} as WorkflowValidationResult),
		),
		TE.map(
			({
				projectPath,
				feature,
				status,
				metadata,
				workflowResult,
			}): StatusUpdateInput => ({
				projectPath,
				feature,
				task: options.task,
				status,
				message: options.message,
				metadata,
				runId: workflowResult.runId,
				workflow: workflowResult.workflow,
				expiresAt: workflowResult.expiresAt,
				previousState: workflowResult.previousState,
			}),
		),
	);
