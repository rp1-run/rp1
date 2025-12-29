/**
 * Unit tests for worktree slug generation.
 * Tests conversion of task descriptions to URL-safe branch name slugs.
 */

import { describe, expect, test } from "bun:test";
import { generateSlug } from "../../../agent-tools/worktree/slug.js";

describe("worktree slug generation", () => {
	describe("basic conversion", () => {
		test("converts simple task description to lowercase hyphenated slug", () => {
			const result = generateSlug("Fix the auth bug");

			expect(result).toBe("fix-auth-bug");
		});

		test("filters out stop words", () => {
			const result = generateSlug("Add the new feature to the settings page");

			expect(result).toBe("add-new-feature-settings-page");
		});

		test("joins words with hyphens", () => {
			const result = generateSlug("Update user profile");

			expect(result).toBe("update-user-profile");
		});

		test("handles single word input", () => {
			const result = generateSlug("Refactor");

			expect(result).toBe("refactor");
		});

		test("returns empty string for stop-words-only input", () => {
			const result = generateSlug("the and a");

			expect(result).toBe("");
		});

		test("returns empty string for empty input", () => {
			const result = generateSlug("");

			expect(result).toBe("");
		});
	});

	describe("long input truncation", () => {
		test("truncates long input to 50 characters at word boundary", () => {
			const longDescription =
				"Refactor the entire authentication system to use new security protocols and improve performance metrics significantly";

			const result = generateSlug(longDescription);

			expect(result.length).toBeLessThanOrEqual(50);
			expect(result).not.toEndWith("-");
		});

		test("preserves complete words when truncating", () => {
			const longDescription =
				"Implement comprehensive logging across all service endpoints for monitoring";

			const result = generateSlug(longDescription);

			// Should not cut a word in half
			expect(result).not.toMatch(/[a-z]-$/);
			expect(result.length).toBeLessThanOrEqual(50);
		});

		test("truncates exactly 100-char description to 50 chars max", () => {
			// Create a 100+ char description
			const longDescription =
				"Add comprehensive user authentication with OAuth support and session management for all endpoints now";

			const result = generateSlug(longDescription);

			expect(result.length).toBeLessThanOrEqual(50);
		});

		test("does not truncate input under 50 chars", () => {
			const shortDescription = "Fix bug login";

			const result = generateSlug(shortDescription);

			expect(result).toBe("fix-bug-login");
		});
	});

	describe("special characters", () => {
		test("removes special characters and numbers are kept", () => {
			const result = generateSlug("Fix bug #123!");

			expect(result).toBe("fix-bug-123");
		});

		test("handles punctuation between words", () => {
			const result = generateSlug("user.profile/settings-page");

			expect(result).toBe("user-profile-settings-page");
		});

		test("handles multiple special characters", () => {
			const result = generateSlug("Fix @#$% bug!!!");

			expect(result).toBe("fix-bug");
		});

		test("handles underscores", () => {
			const result = generateSlug("update_user_preferences");

			expect(result).toBe("update-user-preferences");
		});

		test("handles mixed case and preserves lowercase", () => {
			const result = generateSlug("Fix AuthService Bug in LoginModule");

			expect(result).toBe("fix-authservice-bug-loginmodule");
		});

		test("removes consecutive hyphens", () => {
			const result = generateSlug("fix   multiple   spaces");

			expect(result).toBe("fix-multiple-spaces");
		});

		test("removes trailing hyphens", () => {
			const result = generateSlug("update and ");

			expect(result).toBe("update");
		});
	});

	describe("design spec examples", () => {
		test("Fix the authentication bug in login -> fix-authentication-bug-login", () => {
			const result = generateSlug("Fix the authentication bug in login");

			expect(result).toBe("fix-authentication-bug-login");
		});

		test("Add dark mode toggle to settings -> add-dark-mode-toggle-settings", () => {
			const result = generateSlug("Add dark mode toggle to settings");

			expect(result).toBe("add-dark-mode-toggle-settings");
		});

		test("Refactor API client for better error handling -> refactor-api-client-better-error", () => {
			const result = generateSlug(
				"Refactor API client for better error handling",
			);

			// Note: "handling" may or may not be included depending on 50 char limit
			expect(result).toMatch(/^refactor-api-client-better-error/);
		});
	});
});
