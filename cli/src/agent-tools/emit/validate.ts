/**
 * Validation module for the emit command.
 * Validates CLI options, parses JSON payloads, and validates
 * payload shapes per event type with descriptive error messages.
 */

import { isAbsolute } from "node:path";
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
	VALID_STEP_STATUSES,
} from "../../../shared/events.js";
import type { ResolvedProjectPath } from "../git.js";
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
	step?: string,
): E.Either<CLIError, Record<string, unknown>> => {
	if (!data.status) {
		return E.left(
			usageError(
				"status_change events require a 'status' field in --data. Example: --data '{\"status\": \"running\"}'",
			),
		);
	}

	const validStatuses = step == null ? VALID_STATUSES : VALID_STEP_STATUSES;

	if (!validStatuses.includes(data.status as Status)) {
		return E.left(
			usageError(
				`Invalid status value: '${String(data.status)}'. Must be one of: ${validStatuses.join(", ")}`,
			),
		);
	}

	return E.right(data);
};

const isNonEmptyString = (value: unknown): value is string =>
	typeof value === "string" && value.trim().length > 0;

const validateOptionalStringField = (
	data: Record<string, unknown>,
	fieldName: string,
): E.Either<CLIError, void> => {
	if (data[fieldName] !== undefined && typeof data[fieldName] !== "string") {
		return E.left(
			usageError(
				`artifact_registered '${fieldName}' field must be a string when provided`,
			),
		);
	}

	return E.right(undefined);
};

const validateUrlArtifactRegisteredPayload = (
	data: Record<string, unknown>,
): E.Either<CLIError, Record<string, unknown>> => {
	if (data.type !== "link") {
		return E.left(
			usageError(
				'artifact_registered URL artifacts require type "link" in --data',
			),
		);
	}

	if (!isNonEmptyString(data.url)) {
		return E.left(
			usageError(
				"artifact_registered URL artifacts require a non-empty 'url' field (string) in --data",
			),
		);
	}

	try {
		const url = new URL(data.url);
		if (url.protocol !== "http:" && url.protocol !== "https:") {
			return E.left(
				usageError(
					"artifact_registered URL artifacts only support http and https URLs",
				),
			);
		}
	} catch {
		return E.left(
			usageError(
				`artifact_registered URL artifact has an invalid url: ${String(data.url)}`,
			),
		);
	}

	if (!isNonEmptyString(data.label)) {
		return E.left(
			usageError(
				"artifact_registered URL artifacts require a non-empty 'label' field (string) in --data",
			),
		);
	}

	if (!isNonEmptyString(data.relationship)) {
		return E.left(
			usageError(
				"artifact_registered URL artifacts require a non-empty 'relationship' field (string) in --data",
			),
		);
	}

	for (const fieldName of [
		"feature",
		"docId",
		"path",
		"projectPath",
		"sourceContext",
		"sourceArtifactPath",
	]) {
		const result = validateOptionalStringField(data, fieldName);
		if (E.isLeft(result)) return result;
	}

	if (
		data.metadata !== undefined &&
		(typeof data.metadata !== "object" ||
			data.metadata === null ||
			Array.isArray(data.metadata))
	) {
		return E.left(
			usageError(
				"artifact_registered URL artifact 'metadata' field must be an object when provided",
			),
		);
	}

	return E.right(data);
};

const validateArtifactRegisteredPayload = (
	data: Record<string, unknown>,
): E.Either<CLIError, Record<string, unknown>> => {
	if (data.locationKind !== undefined) {
		if (data.locationKind !== "file" && data.locationKind !== "url") {
			return E.left(
				usageError(
					"artifact_registered 'locationKind' field must be 'file' or 'url' when provided",
				),
			);
		}

		if (data.locationKind === "url") {
			return validateUrlArtifactRegisteredPayload(data);
		}
	}

	if (data.type === "link") {
		return E.left(
			usageError(
				'artifact_registered link artifacts require locationKind "url" in --data',
			),
		);
	}

	if (!data.path || typeof data.path !== "string") {
		return E.left(
			usageError(
				'artifact_registered events require a \'path\' field (string) in --data. Example: --data \'{"path": "features/my-feature/design.md", "feature": "my-feature", "storageRoot": "work_dir"}\'',
			),
		);
	}

	if (data.feature !== undefined && typeof data.feature !== "string") {
		return E.left(
			usageError(
				"artifact_registered 'feature' field must be a string when provided",
			),
		);
	}

	const storageRoot = data.storageRoot;
	if (storageRoot === undefined) {
		return E.left(
			usageError(
				"artifact_registered events require a 'storageRoot' field in --data. Use 'work_dir' for `.rp1/work`-relative paths, 'project' for project-root-relative paths, or 'absolute' for absolute paths",
			),
		);
	}

	if (
		storageRoot !== "absolute" &&
		storageRoot !== "project" &&
		storageRoot !== "work_dir"
	) {
		return E.left(
			usageError(
				"artifact_registered events only support storageRoot values 'absolute', 'project', or 'work_dir'",
			),
		);
	}

	const artifactPath = data.path;
	if (
		typeof artifactPath === "string" &&
		artifactPath.includes("..") &&
		storageRoot !== "absolute"
	) {
		return E.left(
			usageError(
				"artifact_registered paths must not contain '..' unless storageRoot is 'absolute'",
			),
		);
	}

	if (
		typeof artifactPath === "string" &&
		isAbsolute(artifactPath) &&
		storageRoot !== "absolute"
	) {
		return E.left(
			usageError(
				"artifact_registered paths must be relative when storageRoot is 'project' or 'work_dir'",
			),
		);
	}

	if (
		typeof artifactPath === "string" &&
		!isAbsolute(artifactPath) &&
		storageRoot === "absolute"
	) {
		return E.left(
			usageError(
				"artifact_registered paths must be absolute when storageRoot is 'absolute'",
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
	step?: string,
): E.Either<CLIError, Record<string, unknown>> => {
	switch (type) {
		case "status_change":
			return validateStatusChangePayload(data, step);
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
 * worktree normalization. When omitted, requires the current directory to
 * resolve to a real rp1 project with `.rp1/project_id`, matching
 * `rp1 agent-tools rp1-root-dir`.
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
		return pipe(
			resolveRp1Root(project, { requireProjectId: true }),
			TE.map(
				(result): ResolvedProjectPath => ({
					projectPath: result.projectRoot,
					worktreePath: result.isWorktree ? project : undefined,
				}),
			),
		);
	}

	return pipe(
		resolveRp1Root(process.cwd(), { requireProjectId: true }),
		TE.map(
			(result): ResolvedProjectPath => ({
				projectPath: result.projectRoot,
				worktreePath: result.isWorktree ? process.cwd() : undefined,
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
		TE.bind("data", ({ type, rawData, step }) =>
			TE.fromEither(validatePayloadShape(type, rawData, step)),
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
