/**
 * Validation module for the emit command.
 * Validates CLI options, parses JSON payloads, and validates
 * payload shapes per event type with descriptive error messages.
 */

import { dirname, isAbsolute } from "node:path";
import * as E from "fp-ts/lib/Either.js";
import { pipe } from "fp-ts/lib/function.js";
import * as TE from "fp-ts/lib/TaskEither.js";
import type { CLIError } from "../../../shared/errors.js";
import { usageError } from "../../../shared/errors.js";
import {
	type EventType,
	type Status,
	VALID_EVENT_TYPES,
	VALID_STATUSES,
} from "../../../shared/events.js";
import { type ResolvedProjectPath, resolveProjectPath } from "../git.js";
import { resolveRp1Root } from "../rp1-root-dir/resolver.js";
import type { EmitInput } from "./models.js";

/** Raw CLI options before validation */
export interface EmitCommandOptions {
	readonly type: string;
	readonly runId: string;
	readonly workflow: string;
	readonly step?: string;
	readonly unit?: string;
	readonly data?: string;
	readonly project?: string;
	readonly closeRun?: boolean;
	readonly name?: string;
	readonly harness?: string;
}

const validateEventType = (type: string): E.Either<CLIError, EventType> => {
	if (!type || type.trim() === "") {
		return E.left(usageError("--type is required"));
	}

	if (!VALID_EVENT_TYPES.includes(type as EventType)) {
		return E.left(
			usageError(
				`Invalid event type: '${type}'. Must be one of: ${VALID_EVENT_TYPES.join(", ")}`,
			),
		);
	}

	return E.right(type as EventType);
};

const validateRunId = (runId: string): E.Either<CLIError, string> => {
	if (!runId || runId.trim() === "") {
		return E.left(usageError("--run-id is required"));
	}

	return E.right(runId);
};

const validateWorkflow = (workflow: string): E.Either<CLIError, string> => {
	if (!workflow || workflow.trim() === "") {
		return E.left(
			usageError(
				'--workflow is required. Specify the workflow name, e.g.: --workflow build\n\nExample:\n  rp1 agent-tools emit --workflow build --type status_change --run-id <id> --step <step> --data \'{"status": "running"}\'',
			),
		);
	}

	return E.right(workflow.trim());
};

const parseJsonPayload = (
	data: string | undefined,
): E.Either<CLIError, Record<string, unknown>> => {
	if (data === undefined || data === "") {
		return E.right({});
	}

	try {
		const parsed = JSON.parse(data);
		if (
			typeof parsed !== "object" ||
			parsed === null ||
			Array.isArray(parsed)
		) {
			return E.left(
				usageError("--data must be a JSON object (not array or primitive)"),
			);
		}
		return E.right(parsed as Record<string, unknown>);
	} catch {
		return E.left(usageError(`--data must be valid JSON. Received: ${data}`));
	}
};

const validateStatusChangePayload = (
	data: Record<string, unknown>,
): E.Either<CLIError, Record<string, unknown>> => {
	if (!data.status) {
		return E.left(
			usageError(
				"status_change events require a 'status' field in --data. Example: --data '{\"status\": \"running\"}'",
			),
		);
	}

	if (!VALID_STATUSES.includes(data.status as Status)) {
		return E.left(
			usageError(
				`Invalid status value: '${String(data.status)}'. Must be one of: ${VALID_STATUSES.join(", ")}`,
			),
		);
	}

	return E.right(data);
};

const validateArtifactRegisteredPayload = (
	data: Record<string, unknown>,
): E.Either<CLIError, Record<string, unknown>> => {
	if (!data.path || typeof data.path !== "string") {
		return E.left(
			usageError(
				'artifact_registered events require a \'path\' field (string) in --data. Example: --data \'{"path": "work/features/my-feature/design.md", "feature": "my-feature"}\'',
			),
		);
	}

	if (!data.feature || typeof data.feature !== "string") {
		return E.left(
			usageError(
				"artifact_registered events require a 'feature' field (string) in --data",
			),
		);
	}

	return E.right(data);
};

const validateAnnotationUpdatedPayload = (
	data: Record<string, unknown>,
): E.Either<CLIError, Record<string, unknown>> => {
	if (!data.docId || typeof data.docId !== "string") {
		return E.left(
			usageError(
				"annotation_updated events require a 'docId' field (string) in --data",
			),
		);
	}

	if (!data.content || typeof data.content !== "string") {
		return E.left(
			usageError(
				"annotation_updated events require a 'content' field (string) in --data",
			),
		);
	}

	return E.right(data);
};

const validateWaitingForUserPayload = (
	data: Record<string, unknown>,
): E.Either<CLIError, Record<string, unknown>> => {
	if (!data.prompt || typeof data.prompt !== "string") {
		return E.left(
			usageError(
				"waiting_for_user events require a 'prompt' field (string) in --data",
			),
		);
	}

	return E.right(data);
};

const validateBtwUpdatePayload = (
	data: Record<string, unknown>,
): E.Either<CLIError, Record<string, unknown>> => {
	if (!data.message || typeof data.message !== "string") {
		return E.left(
			usageError(
				"btw_update events require a 'message' field (string) in --data",
			),
		);
	}

	return E.right(data);
};

const validateSubflowRegisteredPayload = (
	data: Record<string, unknown>,
): E.Either<CLIError, Record<string, unknown>> => {
	if (!data.parentStepId || typeof data.parentStepId !== "string") {
		return E.left(
			usageError(
				"subflow_registered events require a 'parentStepId' field (string) in --data",
			),
		);
	}

	if (!data.subflowName || typeof data.subflowName !== "string") {
		return E.left(
			usageError(
				"subflow_registered events require a 'subflowName' field (string) in --data",
			),
		);
	}

	return E.right(data);
};

/** Validate payload shape for the given event type */
export const validatePayloadShape = (
	type: EventType,
	data: Record<string, unknown>,
): E.Either<CLIError, Record<string, unknown>> => {
	switch (type) {
		case "status_change":
			return validateStatusChangePayload(data);
		case "artifact_registered":
			return validateArtifactRegisteredPayload(data);
		case "annotation_updated":
			return validateAnnotationUpdatedPayload(data);
		case "waiting_for_user":
			return validateWaitingForUserPayload(data);
		case "btw_update":
			return validateBtwUpdatePayload(data);
		case "subflow_registered":
			return validateSubflowRegisteredPayload(data);
	}
};

/**
 * Resolve the project path for an emit event.
 *
 * When --project is explicitly provided, validates and resolves it via git
 * worktree normalization. When omitted, uses the same resolution chain as
 * `rp1 agent-tools rp1-root-dir`: RP1_ROOT env var → git common-dir → cwd.
 * This ensures emit records are attributed to the correct project regardless
 * of worktree context or env overrides.
 */
const validateProjectPath = (
	project: string | undefined,
): TE.TaskEither<CLIError, ResolvedProjectPath> => {
	if (project !== undefined) {
		if (!isAbsolute(project)) {
			return TE.left(
				usageError(`Project path must be absolute. Received: ${project}`),
			);
		}
		return resolveProjectPath(project);
	}

	return pipe(
		resolveRp1Root(),
		TE.map(
			(result): ResolvedProjectPath => ({
				projectPath: dirname(result.root),
				worktreePath: result.isWorktree ? process.cwd() : undefined,
			}),
		),
		TE.orElse(() =>
			TE.right<CLIError, ResolvedProjectPath>({
				projectPath: process.cwd(),
				worktreePath: undefined,
			}),
		),
	);
};

const validateStepForType = (
	type: EventType,
	step: string | undefined,
): E.Either<CLIError, string | undefined> => {
	if ((type === "status_change" || type === "subflow_registered") && !step) {
		return E.left(usageError(`--step is required for '${type}' events`));
	}

	return E.right(step);
};

/**
 * Validate all emit command options and produce an EmitInput.
 * Validates event type, run ID, JSON payload, payload shape per type,
 * and project path.
 */
export const validateEmitOptions = (
	options: EmitCommandOptions,
): TE.TaskEither<CLIError, EmitInput> =>
	pipe(
		TE.Do,
		TE.bind("type", () => TE.fromEither(validateEventType(options.type))),
		TE.bind("runId", () => TE.fromEither(validateRunId(options.runId))),
		TE.bind("workflow", () =>
			TE.fromEither(validateWorkflow(options.workflow)),
		),
		TE.bind("rawData", () => TE.fromEither(parseJsonPayload(options.data))),
		TE.bind("step", ({ type }) =>
			TE.fromEither(validateStepForType(type, options.step)),
		),
		TE.bind("data", ({ type, rawData }) =>
			TE.fromEither(validatePayloadShape(type, rawData)),
		),
		TE.bind("resolved", () => validateProjectPath(options.project)),
		TE.map(
			({ type, runId, workflow, step, data, resolved }): EmitInput => ({
				type,
				runId,
				workflow,
				step,
				unit: options.unit,
				data: { ...data, workflow },
				projectPath: resolved.projectPath,
				closeRun: options.closeRun,
				name: options.name,
				harness: options.harness,
			}),
		),
	);
