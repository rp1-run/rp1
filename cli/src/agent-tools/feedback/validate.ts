/**
 * Validation module for the feedback command.
 * Validates CLI options and returns Either<CLIError, ValidatedOptions>
 * for each subcommand following the validateEmitOptions pattern.
 */

import * as E from "fp-ts/lib/Either.js";
import type { CLIError } from "../../../shared/errors.js";
import { usageError } from "../../../shared/errors.js";
import {
	type AnnotationStatusFilter,
	type FeedbackAcceptEditOptions,
	type FeedbackReadOptions,
	type FeedbackReplyOptions,
	type FeedbackResolveOptions,
	VALID_STATUS_FILTERS,
} from "./models.js";

/** Raw CLI options for feedback read before validation */
export interface FeedbackReadCommandOptions {
	readonly runId: string;
	readonly status?: string;
	readonly project?: string;
}

/** Raw CLI options for feedback resolve before validation */
export interface FeedbackResolveCommandOptions {
	readonly annotationId: string;
	readonly reply?: string;
}

/** Raw CLI options for feedback reply before validation */
export interface FeedbackReplyCommandOptions {
	readonly annotationId: string;
	readonly content: string;
}

/** Raw CLI options for feedback accept-edit before validation */
export interface FeedbackAcceptEditCommandOptions {
	readonly docId: string;
}

/**
 * Validate feedback read options.
 * Ensures run-id is non-empty and status is a valid filter value.
 */
export const validateReadOptions = (
	options: FeedbackReadCommandOptions,
): E.Either<CLIError, FeedbackReadOptions> => {
	if (!options.runId || options.runId.trim() === "") {
		return E.left(usageError("--run-id is required and must be non-empty"));
	}

	const status = options.status ?? "open";
	if (!VALID_STATUS_FILTERS.includes(status as AnnotationStatusFilter)) {
		return E.left(
			usageError(
				`Invalid --status value: '${status}'. Must be one of: ${VALID_STATUS_FILTERS.join(", ")}`,
			),
		);
	}

	const projectPath = options.project ?? process.cwd();

	return E.right({
		runId: options.runId.trim(),
		status: status as AnnotationStatusFilter,
		projectPath,
	});
};

/**
 * Validate feedback resolve options.
 * Ensures annotation ID is a positive integer and reply is non-empty when provided.
 */
export const validateResolveOptions = (
	options: FeedbackResolveCommandOptions,
): E.Either<CLIError, FeedbackResolveOptions> => {
	const annotationId = parseInt(options.annotationId, 10);
	if (Number.isNaN(annotationId) || annotationId <= 0) {
		return E.left(
			usageError(
				`Invalid annotation ID: '${options.annotationId}'. Must be a positive integer.`,
			),
		);
	}

	if (options.reply !== undefined && options.reply.trim() === "") {
		return E.left(usageError("--reply must be non-empty when provided"));
	}

	return E.right({
		annotationId,
		reply: options.reply?.trim(),
	});
};

/**
 * Validate feedback reply options.
 * Ensures annotation ID is a positive integer and content is non-empty.
 */
export const validateReplyOptions = (
	options: FeedbackReplyCommandOptions,
): E.Either<CLIError, FeedbackReplyOptions> => {
	const annotationId = parseInt(options.annotationId, 10);
	if (Number.isNaN(annotationId) || annotationId <= 0) {
		return E.left(
			usageError(
				`Invalid annotation ID: '${options.annotationId}'. Must be a positive integer.`,
			),
		);
	}

	if (!options.content || options.content.trim() === "") {
		return E.left(usageError("--content is required and must be non-empty"));
	}

	return E.right({
		annotationId,
		content: options.content.trim(),
	});
};

/**
 * Validate feedback accept-edit options.
 * Ensures doc-id is non-empty.
 */
export const validateAcceptEditOptions = (
	options: FeedbackAcceptEditCommandOptions,
): E.Either<CLIError, FeedbackAcceptEditOptions> => {
	if (!options.docId || options.docId.trim() === "") {
		return E.left(usageError("doc-id is required and must be non-empty"));
	}

	return E.right({
		docId: options.docId.trim(),
	});
};
