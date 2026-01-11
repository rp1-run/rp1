/**
 * Validation module for work status update command.
 * Provides input validation for project path, feature name, and status.
 */

import { isAbsolute } from "node:path";
import * as E from "fp-ts/lib/Either.js";
import { pipe } from "fp-ts/lib/function.js";
import * as TE from "fp-ts/lib/TaskEither.js";
import type { CLIError } from "../../../shared/errors.js";
import { usageError } from "../../../shared/errors.js";
import type { StatusUpdateInput, StatusValue } from "./models.js";
import { VALID_STATUSES } from "./models.js";

/** Feature name pattern: lowercase alphanumeric with hyphens */
const FEATURE_PATTERN = /^[a-z0-9-]+$/;

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
}

/**
 * Validate that the project path is absolute.
 * BR-002: Project path must be absolute.
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
 * BR-003: Feature name must match ^[a-z0-9-]+$ pattern.
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
 * REQ-004: Status must be one of: started, in_progress, completed, failed.
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
 * REQ-006: Metadata stored as JSON blob when provided.
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
 * Validate all update command options and produce StatusUpdateInput.
 * Performs all validation checks required by REQ-001, BR-002, BR-003, REQ-004, REQ-006.
 */
export const validateUpdateOptions = (
	options: UpdateCommandOptions,
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
		TE.map(
			({ projectPath, feature, status, metadata }): StatusUpdateInput => ({
				projectPath,
				feature,
				task: options.task,
				status,
				message: options.message,
				metadata,
			}),
		),
	);
