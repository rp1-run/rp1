/**
 * Input validation for github-pr agent tool.
 * Uses Zod schemas for validation of all tool inputs.
 */

import * as E from "fp-ts/lib/Either.js";
import { z } from "zod";
import type { CLIError } from "../../../shared/errors.js";
import { usageError } from "../../../shared/errors.js";
import type {
	AddReactionInput,
	FetchCommentsInput,
	ReplyCommentInput,
	SubmitReviewInput,
} from "./models.js";

/**
 * Valid reaction types for GitHub comments.
 */
const VALID_REACTIONS = [
	"+1",
	"-1",
	"laugh",
	"confused",
	"heart",
	"hooray",
	"rocket",
	"eyes",
] as const;

/**
 * Valid review event types.
 */
const VALID_EVENTS = ["APPROVE", "REQUEST_CHANGES", "COMMENT"] as const;

/**
 * Zod schema for review comment within a review submission.
 */
const ReviewCommentSchema = z.object({
	path: z.string().min(1, "path is required and must be a non-empty string"),
	line: z.number().int().positive("line must be a positive integer"),
	body: z.string().min(1, "body is required and must be a non-empty string"),
});

/**
 * Zod schema for SubmitReviewInput.
 */
const SubmitReviewInputSchema = z.object({
	owner: z.string().min(1, "owner is required and must be a non-empty string"),
	repo: z.string().min(1, "repo is required and must be a non-empty string"),
	pr_number: z
		.number()
		.int()
		.positive("pr_number is required and must be a positive integer"),
	body: z.string().min(1, "body is required and must be a non-empty string"),
	event: z.enum(VALID_EVENTS, {
		errorMap: () => ({
			message: `event must be one of: ${VALID_EVENTS.join(", ")}`,
		}),
	}),
	comments: z.array(ReviewCommentSchema).optional(),
});

/**
 * Zod schema for AddReactionInput.
 */
const AddReactionInputSchema = z.object({
	owner: z.string().min(1, "owner is required and must be a non-empty string"),
	repo: z.string().min(1, "repo is required and must be a non-empty string"),
	comment_id: z
		.number()
		.int()
		.positive("comment_id is required and must be a positive integer"),
	reaction: z.enum(VALID_REACTIONS, {
		errorMap: () => ({
			message: `reaction must be one of: ${VALID_REACTIONS.join(", ")}`,
		}),
	}),
});

/**
 * Zod schema for ReplyCommentInput.
 */
const ReplyCommentInputSchema = z.object({
	owner: z.string().min(1, "owner is required and must be a non-empty string"),
	repo: z.string().min(1, "repo is required and must be a non-empty string"),
	pr_number: z
		.number()
		.int()
		.positive("pr_number is required and must be a positive integer"),
	comment_id: z
		.number()
		.int()
		.positive("comment_id is required and must be a positive integer"),
	body: z.string().min(1, "body is required and must be a non-empty string"),
});

/**
 * Zod schema for FetchCommentsInput.
 */
const FetchCommentsInputSchema = z.object({
	owner: z.string().min(1, "owner is required and must be a non-empty string"),
	repo: z.string().min(1, "repo is required and must be a non-empty string"),
	pr_number: z
		.number()
		.int()
		.positive("pr_number is required and must be a positive integer"),
});

/**
 * Format Zod validation errors into a human-readable string.
 */
const formatZodErrors = (error: z.ZodError): string => {
	const messages = error.issues.map((issue) => {
		const path = issue.path.length > 0 ? `${issue.path.join(".")}: ` : "";
		return `${path}${issue.message}`;
	});
	return messages.join("; ");
};

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
 * Validate SubmitReviewInput using Zod schema.
 */
export const validateSubmitReviewInput = (
	data: unknown,
): E.Either<CLIError, SubmitReviewInput> => {
	const result = SubmitReviewInputSchema.safeParse(data);

	if (!result.success) {
		return E.left(
			usageError(
				`Validation failed: ${formatZodErrors(result.error)}`,
				"Fix input fields",
			),
		);
	}

	return E.right(result.data as SubmitReviewInput);
};

/**
 * Validate AddReactionInput using Zod schema.
 */
export const validateAddReactionInput = (
	data: unknown,
): E.Either<CLIError, AddReactionInput> => {
	const result = AddReactionInputSchema.safeParse(data);

	if (!result.success) {
		return E.left(
			usageError(
				`Validation failed: ${formatZodErrors(result.error)}`,
				"Fix input fields",
			),
		);
	}

	return E.right(result.data as AddReactionInput);
};

/**
 * Validate ReplyCommentInput using Zod schema.
 */
export const validateReplyCommentInput = (
	data: unknown,
): E.Either<CLIError, ReplyCommentInput> => {
	const result = ReplyCommentInputSchema.safeParse(data);

	if (!result.success) {
		return E.left(
			usageError(
				`Validation failed: ${formatZodErrors(result.error)}`,
				"Fix input fields",
			),
		);
	}

	return E.right(result.data as ReplyCommentInput);
};

/**
 * Validate FetchCommentsInput using Zod schema.
 */
export const validateFetchCommentsInput = (
	data: unknown,
): E.Either<CLIError, FetchCommentsInput> => {
	const result = FetchCommentsInputSchema.safeParse(data);

	if (!result.success) {
		return E.left(
			usageError(
				`Validation failed: ${formatZodErrors(result.error)}`,
				"Fix input fields",
			),
		);
	}

	return E.right(result.data as FetchCommentsInput);
};
