/**
 * Unit tests for github-pr input validation.
 * Tests validation wrapper behavior, not Zod schema details (Zod is type-safe).
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

describe("github-pr validation", () => {
	describe("parseJsonInput", () => {
		test("parses valid JSON", () => {
			const result = parseJsonInput<{ foo: string }>('{"foo":"bar"}');
			expect(E.isRight(result)).toBe(true);
			if (E.isRight(result)) {
				expect(result.right.foo).toBe("bar");
			}
		});

		test("returns UsageError for invalid JSON", () => {
			const result = parseJsonInput<unknown>("not json");
			expect(E.isLeft(result)).toBe(true);
			if (E.isLeft(result)) {
				expect(result.left._tag).toBe("UsageError");
			}
		});
	});

	describe("validateSubmitReviewInput", () => {
		test("accepts valid input", () => {
			const result = validateSubmitReviewInput({
				owner: "test-org",
				repo: "test-repo",
				pr_number: 123,
				body: "LGTM",
				event: "APPROVE",
			});
			expect(E.isRight(result)).toBe(true);
		});

		test("accepts valid input with comments", () => {
			const result = validateSubmitReviewInput({
				owner: "test-org",
				repo: "test-repo",
				pr_number: 123,
				body: "LGTM",
				event: "APPROVE",
				comments: [
					{ path: "src/file.ts", line: 10, body: "Consider renaming" },
				],
			});
			expect(E.isRight(result)).toBe(true);
		});

		test("returns UsageError for invalid input", () => {
			const result = validateSubmitReviewInput({ invalid: "data" });
			expect(E.isLeft(result)).toBe(true);
			if (E.isLeft(result)) {
				expect(result.left._tag).toBe("UsageError");
			}
		});
	});

	describe("validateAddReactionInput", () => {
		test("accepts valid input", () => {
			const result = validateAddReactionInput({
				owner: "test-org",
				repo: "test-repo",
				comment_id: 456,
				reaction: "+1",
			});
			expect(E.isRight(result)).toBe(true);
		});

		test("returns UsageError for invalid input", () => {
			const result = validateAddReactionInput({ invalid: "data" });
			expect(E.isLeft(result)).toBe(true);
			if (E.isLeft(result)) {
				expect(result.left._tag).toBe("UsageError");
			}
		});
	});

	describe("validateReplyCommentInput", () => {
		test("accepts valid input", () => {
			const result = validateReplyCommentInput({
				owner: "test-org",
				repo: "test-repo",
				pr_number: 123,
				comment_id: 456,
				body: "Thanks for the feedback!",
			});
			expect(E.isRight(result)).toBe(true);
		});

		test("returns UsageError for invalid input", () => {
			const result = validateReplyCommentInput({ invalid: "data" });
			expect(E.isLeft(result)).toBe(true);
			if (E.isLeft(result)) {
				expect(result.left._tag).toBe("UsageError");
			}
		});
	});

	describe("validateFetchCommentsInput", () => {
		test("accepts valid input", () => {
			const result = validateFetchCommentsInput({
				owner: "test-org",
				repo: "test-repo",
				pr_number: 123,
			});
			expect(E.isRight(result)).toBe(true);
		});

		test("returns UsageError for invalid input", () => {
			const result = validateFetchCommentsInput({ invalid: "data" });
			expect(E.isLeft(result)).toBe(true);
			if (E.isLeft(result)) {
				expect(result.left._tag).toBe("UsageError");
			}
		});
	});
});
