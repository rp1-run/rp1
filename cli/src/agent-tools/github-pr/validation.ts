/**
 * Input validation for github-pr agent tool.
 * Provides validation functions for all tool inputs.
 */

import * as E from "fp-ts/lib/Either.js";
import type { CLIError } from "../../../shared/errors.js";
import { usageError } from "../../../shared/errors.js";
import type {
	AddReactionInput,
	FetchCommentsInput,
	ReactionType,
	ReplyCommentInput,
	SubmitReviewInput,
} from "./models.js";

const VALID_REACTIONS: readonly ReactionType[] = [
	"+1",
	"-1",
	"laugh",
	"confused",
	"heart",
	"hooray",
	"rocket",
	"eyes",
];

const VALID_EVENTS = ["APPROVE", "REQUEST_CHANGES", "COMMENT"] as const;

/**
 * Parse JSON input from stdin.
 *
 * @param input - Raw JSON string
 * @returns Either with parsed object or validation error
 */
export const parseJsonInput = <T>(input: string): E.Either<CLIError, T> => {
	try {
		const parsed = JSON.parse(input) as T;
		return E.right(parsed);
	} catch {
		return E.left(
			usageError(
				"Invalid JSON input",
				"Provide valid JSON via stdin with required fields",
			),
		);
	}
};

/**
 * Validate required string field.
 */
const validateRequiredString = (
	value: unknown,
	field: string,
): E.Either<string, string> => {
	if (typeof value !== "string" || value.trim().length === 0) {
		return E.left(`${field} is required and must be a non-empty string`);
	}
	return E.right(value);
};

/**
 * Validate required positive integer field.
 */
const validateRequiredPositiveInt = (
	value: unknown,
	field: string,
): E.Either<string, number> => {
	if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
		return E.left(`${field} is required and must be a positive integer`);
	}
	return E.right(value);
};

/**
 * Validate SubmitReviewInput.
 */
export const validateSubmitReviewInput = (
	data: unknown,
): E.Either<CLIError, SubmitReviewInput> => {
	const errors: string[] = [];
	const input = data as Record<string, unknown>;

	const ownerResult = validateRequiredString(input.owner, "owner");
	if (E.isLeft(ownerResult)) errors.push(ownerResult.left);

	const repoResult = validateRequiredString(input.repo, "repo");
	if (E.isLeft(repoResult)) errors.push(repoResult.left);

	const prNumberResult = validateRequiredPositiveInt(
		input.pr_number,
		"pr_number",
	);
	if (E.isLeft(prNumberResult)) errors.push(prNumberResult.left);

	const bodyResult = validateRequiredString(input.body, "body");
	if (E.isLeft(bodyResult)) errors.push(bodyResult.left);

	if (
		typeof input.event !== "string" ||
		!VALID_EVENTS.includes(input.event as (typeof VALID_EVENTS)[number])
	) {
		errors.push(`event must be one of: ${VALID_EVENTS.join(", ")}`);
	}

	if (input.comments !== undefined) {
		if (!Array.isArray(input.comments)) {
			errors.push("comments must be an array if provided");
		} else {
			for (let i = 0; i < input.comments.length; i++) {
				const comment = input.comments[i] as Record<string, unknown>;
				const pathResult = validateRequiredString(
					comment.path,
					`comments[${i}].path`,
				);
				if (E.isLeft(pathResult)) errors.push(pathResult.left);

				const lineResult = validateRequiredPositiveInt(
					comment.line,
					`comments[${i}].line`,
				);
				if (E.isLeft(lineResult)) errors.push(lineResult.left);

				const commentBodyResult = validateRequiredString(
					comment.body,
					`comments[${i}].body`,
				);
				if (E.isLeft(commentBodyResult)) errors.push(commentBodyResult.left);
			}
		}
	}

	if (errors.length > 0) {
		return E.left(
			usageError(`Validation failed: ${errors.join("; ")}`, "Fix input fields"),
		);
	}

	return E.right(input as unknown as SubmitReviewInput);
};

/**
 * Validate AddReactionInput.
 */
export const validateAddReactionInput = (
	data: unknown,
): E.Either<CLIError, AddReactionInput> => {
	const errors: string[] = [];
	const input = data as Record<string, unknown>;

	const ownerResult = validateRequiredString(input.owner, "owner");
	if (E.isLeft(ownerResult)) errors.push(ownerResult.left);

	const repoResult = validateRequiredString(input.repo, "repo");
	if (E.isLeft(repoResult)) errors.push(repoResult.left);

	const commentIdResult = validateRequiredPositiveInt(
		input.comment_id,
		"comment_id",
	);
	if (E.isLeft(commentIdResult)) errors.push(commentIdResult.left);

	if (
		typeof input.reaction !== "string" ||
		!VALID_REACTIONS.includes(input.reaction as ReactionType)
	) {
		errors.push(`reaction must be one of: ${VALID_REACTIONS.join(", ")}`);
	}

	if (errors.length > 0) {
		return E.left(
			usageError(`Validation failed: ${errors.join("; ")}`, "Fix input fields"),
		);
	}

	return E.right(input as unknown as AddReactionInput);
};

/**
 * Validate ReplyCommentInput.
 */
export const validateReplyCommentInput = (
	data: unknown,
): E.Either<CLIError, ReplyCommentInput> => {
	const errors: string[] = [];
	const input = data as Record<string, unknown>;

	const ownerResult = validateRequiredString(input.owner, "owner");
	if (E.isLeft(ownerResult)) errors.push(ownerResult.left);

	const repoResult = validateRequiredString(input.repo, "repo");
	if (E.isLeft(repoResult)) errors.push(repoResult.left);

	const prNumberResult = validateRequiredPositiveInt(
		input.pr_number,
		"pr_number",
	);
	if (E.isLeft(prNumberResult)) errors.push(prNumberResult.left);

	const commentIdResult = validateRequiredPositiveInt(
		input.comment_id,
		"comment_id",
	);
	if (E.isLeft(commentIdResult)) errors.push(commentIdResult.left);

	const bodyResult = validateRequiredString(input.body, "body");
	if (E.isLeft(bodyResult)) errors.push(bodyResult.left);

	if (errors.length > 0) {
		return E.left(
			usageError(`Validation failed: ${errors.join("; ")}`, "Fix input fields"),
		);
	}

	return E.right(input as unknown as ReplyCommentInput);
};

/**
 * Validate FetchCommentsInput.
 */
export const validateFetchCommentsInput = (
	data: unknown,
): E.Either<CLIError, FetchCommentsInput> => {
	const errors: string[] = [];
	const input = data as Record<string, unknown>;

	const ownerResult = validateRequiredString(input.owner, "owner");
	if (E.isLeft(ownerResult)) errors.push(ownerResult.left);

	const repoResult = validateRequiredString(input.repo, "repo");
	if (E.isLeft(repoResult)) errors.push(repoResult.left);

	const prNumberResult = validateRequiredPositiveInt(
		input.pr_number,
		"pr_number",
	);
	if (E.isLeft(prNumberResult)) errors.push(prNumberResult.left);

	if (errors.length > 0) {
		return E.left(
			usageError(`Validation failed: ${errors.join("; ")}`, "Fix input fields"),
		);
	}

	return E.right(input as unknown as FetchCommentsInput);
};
