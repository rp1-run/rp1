/**
 * Unit tests for github-pr client module.
 * Tests Octokit client creation and error handling.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import * as E from "fp-ts/lib/Either.js";
import {
	createOctokitClient,
	handleGitHubError,
} from "../../../agent-tools/github-pr/client.js";
import { getErrorMessage } from "../../helpers/index.js";

describe("github-pr client", () => {
	let originalToken: string | undefined;

	beforeEach(() => {
		originalToken = process.env.GITHUB_TOKEN;
	});

	afterEach(() => {
		if (originalToken !== undefined) {
			process.env.GITHUB_TOKEN = originalToken;
		} else {
			delete process.env.GITHUB_TOKEN;
		}
	});

	describe("createOctokitClient", () => {
		test("creates client when GITHUB_TOKEN is set", async () => {
			process.env.GITHUB_TOKEN = "test-token-123";
			const result = await createOctokitClient()();
			expect(E.isRight(result)).toBe(true);
		});

		test("returns error when GITHUB_TOKEN is not set", async () => {
			delete process.env.GITHUB_TOKEN;
			const result = await createOctokitClient()();
			expect(E.isLeft(result)).toBe(true);
			if (E.isLeft(result)) {
				expect(result.left._tag).toBe("ConfigError");
				expect(getErrorMessage(result.left)).toContain("GITHUB_TOKEN");
			}
		});

		test("returns error with suggestion when token missing", async () => {
			delete process.env.GITHUB_TOKEN;
			const result = await createOctokitClient()();
			expect(E.isLeft(result)).toBe(true);
			if (E.isLeft(result) && result.left._tag === "ConfigError") {
				expect(result.left.suggestion).toContain("personal access token");
			}
		});
	});

	describe("handleGitHubError", () => {
		test("handles 401 authentication error", () => {
			const error = { status: 401, message: "Bad credentials" };
			const result = handleGitHubError(error, "submit-review");
			expect(result._tag).toBe("ConfigError");
			if (result._tag === "ConfigError") {
				expect(result.message).toContain("authentication failed");
				expect(result.suggestion).toContain("valid");
			}
		});

		test("handles 403 rate limit error", () => {
			const error = {
				status: 403,
				response: { data: { message: "API rate limit exceeded" } },
			};
			const result = handleGitHubError(error, "fetch-comments");
			expect(result._tag).toBe("RuntimeError");
			if (result._tag === "RuntimeError") {
				expect(result.message).toContain("rate limit");
			}
		});

		test("handles 403 forbidden error", () => {
			const error = {
				status: 403,
				response: { data: { message: "Resource not accessible" } },
			};
			const result = handleGitHubError(error, "add-reaction");
			expect(result._tag).toBe("ConfigError");
			if (result._tag === "ConfigError") {
				expect(result.message).toContain("forbidden");
				expect(result.suggestion).toContain("permissions");
			}
		});

		test("handles 404 not found error", () => {
			const error = { status: 404, message: "Not Found" };
			const result = handleGitHubError(error, "reply-comment");
			expect(result._tag).toBe("RuntimeError");
			if (result._tag === "RuntimeError") {
				expect(result.message).toContain("not found");
			}
		});

		test("handles 422 validation error", () => {
			const error = {
				status: 422,
				response: { data: { message: "Invalid request body" } },
			};
			const result = handleGitHubError(error, "submit-review");
			expect(result._tag).toBe("RuntimeError");
			if (result._tag === "RuntimeError") {
				expect(result.message).toContain("validation error");
			}
		});

		test("handles unknown error", () => {
			const error = { status: 500, message: "Internal Server Error" };
			const result = handleGitHubError(error, "fetch-comments");
			expect(result._tag).toBe("RuntimeError");
			if (result._tag === "RuntimeError") {
				expect(result.message).toContain("Internal Server Error");
			}
		});

		test("handles error without status", () => {
			const error = { message: "Network error" };
			const result = handleGitHubError(error, "submit-review");
			expect(result._tag).toBe("RuntimeError");
			if (result._tag === "RuntimeError") {
				expect(result.message).toContain("Network error");
			}
		});

		test("includes operation name in error message", () => {
			const error = { status: 404 };
			const result = handleGitHubError(error, "custom-operation");
			expect(result._tag).toBe("RuntimeError");
			if (result._tag === "RuntimeError") {
				expect(result.message).toContain("custom-operation");
			}
		});
	});
});
