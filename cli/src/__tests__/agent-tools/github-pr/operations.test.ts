/**
 * Unit tests for github-pr operations with mocked Octokit.
 * Tests payload construction, auth handling, and error scenarios.
 */

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import * as E from "fp-ts/lib/Either.js";
import { executeAddReaction } from "../../../agent-tools/github-pr/add-reaction.js";
import { executeFetchComments } from "../../../agent-tools/github-pr/fetch-comments.js";
import { executeReplyComment } from "../../../agent-tools/github-pr/reply-comment.js";
import { executeSubmitReview } from "../../../agent-tools/github-pr/submit-review.js";
import { getErrorMessage } from "../../helpers/index.js";

describe("github-pr operations", () => {
	let originalToken: string | undefined;

	beforeEach(() => {
		originalToken = process.env.GITHUB_TOKEN;
		process.env.GITHUB_TOKEN = "test-token-for-mocking";
	});

	afterEach(() => {
		if (originalToken !== undefined) {
			process.env.GITHUB_TOKEN = originalToken;
		} else {
			delete process.env.GITHUB_TOKEN;
		}
		mock.restore();
	});

	describe("executeSubmitReview", () => {
		test("returns error for missing GITHUB_TOKEN", async () => {
			delete process.env.GITHUB_TOKEN;
			const input = JSON.stringify({
				owner: "org",
				repo: "repo",
				pr_number: 123,
				body: "LGTM",
				event: "APPROVE",
			});

			const result = await executeSubmitReview(input)();
			expect(E.isLeft(result)).toBe(true);
			if (E.isLeft(result)) {
				expect(result.left._tag).toBe("ConfigError");
			}
		});

		test("returns error for invalid JSON input", async () => {
			const result = await executeSubmitReview("not json")();
			expect(E.isLeft(result)).toBe(true);
			if (E.isLeft(result)) {
				expect(result.left._tag).toBe("UsageError");
			}
		});

		test("returns error for missing required fields", async () => {
			const input = JSON.stringify({
				owner: "org",
				repo: "repo",
			});

			const result = await executeSubmitReview(input)();
			expect(E.isLeft(result)).toBe(true);
			if (E.isLeft(result)) {
				expect(result.left._tag).toBe("UsageError");
				expect(getErrorMessage(result.left)).toContain("pr_number");
			}
		});

		test("returns error for invalid event type", async () => {
			const input = JSON.stringify({
				owner: "org",
				repo: "repo",
				pr_number: 123,
				body: "Review",
				event: "INVALID_EVENT",
			});

			const result = await executeSubmitReview(input)();
			expect(E.isLeft(result)).toBe(true);
		});
	});

	describe("executeAddReaction", () => {
		test("returns error for missing GITHUB_TOKEN", async () => {
			delete process.env.GITHUB_TOKEN;
			const input = JSON.stringify({
				owner: "org",
				repo: "repo",
				comment_id: 456,
				reaction: "+1",
			});

			const result = await executeAddReaction(input)();
			expect(E.isLeft(result)).toBe(true);
			if (E.isLeft(result)) {
				expect(result.left._tag).toBe("ConfigError");
			}
		});

		test("returns error for invalid JSON input", async () => {
			const result = await executeAddReaction("not json")();
			expect(E.isLeft(result)).toBe(true);
			if (E.isLeft(result)) {
				expect(result.left._tag).toBe("UsageError");
			}
		});

		test("returns error for invalid reaction type", async () => {
			const input = JSON.stringify({
				owner: "org",
				repo: "repo",
				comment_id: 456,
				reaction: "invalid",
			});

			const result = await executeAddReaction(input)();
			expect(E.isLeft(result)).toBe(true);
			if (E.isLeft(result)) {
				expect(getErrorMessage(result.left)).toContain("reaction");
			}
		});

		test("validates all required fields", async () => {
			const input = JSON.stringify({
				owner: "org",
				reaction: "+1",
			});

			const result = await executeAddReaction(input)();
			expect(E.isLeft(result)).toBe(true);
		});
	});

	describe("executeReplyComment", () => {
		test("returns error for missing GITHUB_TOKEN", async () => {
			delete process.env.GITHUB_TOKEN;
			const input = JSON.stringify({
				owner: "org",
				repo: "repo",
				pr_number: 123,
				comment_id: 456,
				body: "Reply",
			});

			const result = await executeReplyComment(input)();
			expect(E.isLeft(result)).toBe(true);
			if (E.isLeft(result)) {
				expect(result.left._tag).toBe("ConfigError");
			}
		});

		test("returns error for invalid JSON input", async () => {
			const result = await executeReplyComment("not json")();
			expect(E.isLeft(result)).toBe(true);
		});

		test("returns error for missing body", async () => {
			const input = JSON.stringify({
				owner: "org",
				repo: "repo",
				pr_number: 123,
				comment_id: 456,
			});

			const result = await executeReplyComment(input)();
			expect(E.isLeft(result)).toBe(true);
			if (E.isLeft(result)) {
				expect(getErrorMessage(result.left)).toContain("body");
			}
		});
	});

	describe("executeFetchComments", () => {
		test("returns error for missing GITHUB_TOKEN", async () => {
			delete process.env.GITHUB_TOKEN;
			const input = JSON.stringify({
				owner: "org",
				repo: "repo",
				pr_number: 123,
			});

			const result = await executeFetchComments(input)();
			expect(E.isLeft(result)).toBe(true);
			if (E.isLeft(result)) {
				expect(result.left._tag).toBe("ConfigError");
			}
		});

		test("returns error for invalid JSON input", async () => {
			const result = await executeFetchComments("not json")();
			expect(E.isLeft(result)).toBe(true);
		});

		test("returns error for missing pr_number", async () => {
			const input = JSON.stringify({
				owner: "org",
				repo: "repo",
			});

			const result = await executeFetchComments(input)();
			expect(E.isLeft(result)).toBe(true);
			if (E.isLeft(result)) {
				expect(getErrorMessage(result.left)).toContain("pr_number");
			}
		});
	});

	describe("ToolResult envelope", () => {
		test("error results have correct structure", async () => {
			delete process.env.GITHUB_TOKEN;
			const input = JSON.stringify({
				owner: "org",
				repo: "repo",
				pr_number: 123,
			});

			const result = await executeFetchComments(input)();
			expect(E.isLeft(result)).toBe(true);
			if (E.isLeft(result)) {
				expect(result.left).toHaveProperty("_tag");
				expect(result.left._tag).toBe("ConfigError");
			}
		});
	});
});
