/**
 * Unit tests for github-pr input validation.
 * Tests validation of all input types for GitHub PR operations.
 */

import { describe, expect, test } from "bun:test";
import * as E from "fp-ts/lib/Either.js";
import {
	parseJsonInput,
	validateAddReactionInput,
	validateFetchCommentsInput,
	validateReplyCommentInput,
	validateSubmitReviewInput,
} from "../../../agent-tools/github-pr/validation.js";
import { getErrorMessage } from "../../helpers/index.js";

describe("github-pr validation", () => {
	describe("parseJsonInput", () => {
		test("parses valid JSON", () => {
			const result = parseJsonInput<{ foo: string }>('{"foo":"bar"}');
			expect(E.isRight(result)).toBe(true);
			if (E.isRight(result)) {
				expect(result.right.foo).toBe("bar");
			}
		});

		test("returns error for invalid JSON", () => {
			const result = parseJsonInput<unknown>("not json");
			expect(E.isLeft(result)).toBe(true);
			if (E.isLeft(result)) {
				expect(result.left._tag).toBe("UsageError");
			}
		});

		test("returns error for empty input", () => {
			const result = parseJsonInput<unknown>("");
			expect(E.isLeft(result)).toBe(true);
		});
	});

	describe("validateSubmitReviewInput", () => {
		const validInput = {
			owner: "test-org",
			repo: "test-repo",
			pr_number: 123,
			body: "LGTM",
			event: "APPROVE",
		};

		test("accepts valid input", () => {
			const result = validateSubmitReviewInput(validInput);
			expect(E.isRight(result)).toBe(true);
		});

		test("accepts valid input with comments", () => {
			const inputWithComments = {
				...validInput,
				comments: [
					{ path: "src/file.ts", line: 10, body: "Consider renaming" },
				],
			};
			const result = validateSubmitReviewInput(inputWithComments);
			expect(E.isRight(result)).toBe(true);
		});

		test("rejects missing owner", () => {
			const { owner: _, ...input } = validInput;
			const result = validateSubmitReviewInput(input);
			expect(E.isLeft(result)).toBe(true);
			if (E.isLeft(result)) {
				expect(result.left._tag).toBe("UsageError");
				expect(getErrorMessage(result.left)).toContain("owner");
			}
		});

		test("rejects missing repo", () => {
			const { repo: _, ...input } = validInput;
			const result = validateSubmitReviewInput(input);
			expect(E.isLeft(result)).toBe(true);
		});

		test("rejects missing pr_number", () => {
			const { pr_number: _, ...input } = validInput;
			const result = validateSubmitReviewInput(input);
			expect(E.isLeft(result)).toBe(true);
		});

		test("rejects non-positive pr_number", () => {
			const result = validateSubmitReviewInput({ ...validInput, pr_number: 0 });
			expect(E.isLeft(result)).toBe(true);
		});

		test("rejects missing body", () => {
			const { body: _, ...input } = validInput;
			const result = validateSubmitReviewInput(input);
			expect(E.isLeft(result)).toBe(true);
		});

		test("rejects invalid event", () => {
			const result = validateSubmitReviewInput({
				...validInput,
				event: "INVALID",
			});
			expect(E.isLeft(result)).toBe(true);
			if (E.isLeft(result)) {
				expect(getErrorMessage(result.left)).toContain("event");
			}
		});

		test("accepts all valid event types", () => {
			for (const event of ["APPROVE", "REQUEST_CHANGES", "COMMENT"]) {
				const result = validateSubmitReviewInput({ ...validInput, event });
				expect(E.isRight(result)).toBe(true);
			}
		});

		test("rejects comments with missing path", () => {
			const result = validateSubmitReviewInput({
				...validInput,
				comments: [{ line: 10, body: "comment" }],
			});
			expect(E.isLeft(result)).toBe(true);
		});

		test("rejects comments with missing line", () => {
			const result = validateSubmitReviewInput({
				...validInput,
				comments: [{ path: "file.ts", body: "comment" }],
			});
			expect(E.isLeft(result)).toBe(true);
		});

		test("rejects comments with missing body", () => {
			const result = validateSubmitReviewInput({
				...validInput,
				comments: [{ path: "file.ts", line: 10 }],
			});
			expect(E.isLeft(result)).toBe(true);
		});
	});

	describe("validateAddReactionInput", () => {
		const validInput = {
			owner: "test-org",
			repo: "test-repo",
			comment_id: 456,
			reaction: "+1",
		};

		test("accepts valid input", () => {
			const result = validateAddReactionInput(validInput);
			expect(E.isRight(result)).toBe(true);
		});

		test("accepts all valid reaction types", () => {
			const reactions = [
				"+1",
				"-1",
				"laugh",
				"confused",
				"heart",
				"hooray",
				"rocket",
				"eyes",
			];
			for (const reaction of reactions) {
				const result = validateAddReactionInput({ ...validInput, reaction });
				expect(E.isRight(result)).toBe(true);
			}
		});

		test("rejects missing owner", () => {
			const { owner: _, ...input } = validInput;
			const result = validateAddReactionInput(input);
			expect(E.isLeft(result)).toBe(true);
		});

		test("rejects missing repo", () => {
			const { repo: _, ...input } = validInput;
			const result = validateAddReactionInput(input);
			expect(E.isLeft(result)).toBe(true);
		});

		test("rejects missing comment_id", () => {
			const { comment_id: _, ...input } = validInput;
			const result = validateAddReactionInput(input);
			expect(E.isLeft(result)).toBe(true);
		});

		test("rejects invalid reaction type", () => {
			const result = validateAddReactionInput({
				...validInput,
				reaction: "invalid",
			});
			expect(E.isLeft(result)).toBe(true);
			if (E.isLeft(result)) {
				expect(getErrorMessage(result.left)).toContain("reaction");
			}
		});
	});

	describe("validateReplyCommentInput", () => {
		const validInput = {
			owner: "test-org",
			repo: "test-repo",
			pr_number: 123,
			comment_id: 456,
			body: "Thanks for the feedback!",
		};

		test("accepts valid input", () => {
			const result = validateReplyCommentInput(validInput);
			expect(E.isRight(result)).toBe(true);
		});

		test("rejects missing owner", () => {
			const { owner: _, ...input } = validInput;
			const result = validateReplyCommentInput(input);
			expect(E.isLeft(result)).toBe(true);
		});

		test("rejects missing repo", () => {
			const { repo: _, ...input } = validInput;
			const result = validateReplyCommentInput(input);
			expect(E.isLeft(result)).toBe(true);
		});

		test("rejects missing pr_number", () => {
			const { pr_number: _, ...input } = validInput;
			const result = validateReplyCommentInput(input);
			expect(E.isLeft(result)).toBe(true);
		});

		test("rejects missing comment_id", () => {
			const { comment_id: _, ...input } = validInput;
			const result = validateReplyCommentInput(input);
			expect(E.isLeft(result)).toBe(true);
		});

		test("rejects missing body", () => {
			const { body: _, ...input } = validInput;
			const result = validateReplyCommentInput(input);
			expect(E.isLeft(result)).toBe(true);
		});

		test("rejects empty body", () => {
			const result = validateReplyCommentInput({ ...validInput, body: "" });
			expect(E.isLeft(result)).toBe(true);
		});
	});

	describe("validateFetchCommentsInput", () => {
		const validInput = {
			owner: "test-org",
			repo: "test-repo",
			pr_number: 123,
		};

		test("accepts valid input", () => {
			const result = validateFetchCommentsInput(validInput);
			expect(E.isRight(result)).toBe(true);
		});

		test("rejects missing owner", () => {
			const { owner: _, ...input } = validInput;
			const result = validateFetchCommentsInput(input);
			expect(E.isLeft(result)).toBe(true);
		});

		test("rejects missing repo", () => {
			const { repo: _, ...input } = validInput;
			const result = validateFetchCommentsInput(input);
			expect(E.isLeft(result)).toBe(true);
		});

		test("rejects missing pr_number", () => {
			const { pr_number: _, ...input } = validInput;
			const result = validateFetchCommentsInput(input);
			expect(E.isLeft(result)).toBe(true);
		});

		test("rejects non-integer pr_number", () => {
			const result = validateFetchCommentsInput({
				...validInput,
				pr_number: 1.5,
			});
			expect(E.isLeft(result)).toBe(true);
		});

		test("rejects negative pr_number", () => {
			const result = validateFetchCommentsInput({
				...validInput,
				pr_number: -1,
			});
			expect(E.isLeft(result)).toBe(true);
		});
	});
});
