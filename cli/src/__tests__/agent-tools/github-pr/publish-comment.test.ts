/**
 * Unit tests for origin-remote parsing.
 *
 * parseRemoteRepo must accept only `github.com` origins (SSH and HTTPS forms)
 * and return null for every other host, so a non-github.com `origin` can never
 * be published to `github.com/owner/repo` via the GitHub-only Octokit client.
 */

import { describe, expect, test } from "bun:test";
import { parseRemoteRepo } from "../../../agent-tools/github-pr/publish-comment.js";

describe("parseRemoteRepo — github.com origins parse", () => {
	test("SSH (scp) form", () => {
		expect(parseRemoteRepo("git@github.com:owner/repo.git")).toBe("owner/repo");
	});

	test("SSH URL form", () => {
		expect(parseRemoteRepo("ssh://git@github.com/owner/repo.git")).toBe(
			"owner/repo",
		);
	});

	test("HTTPS form, with and without .git", () => {
		expect(parseRemoteRepo("https://github.com/owner/repo.git")).toBe(
			"owner/repo",
		);
		expect(parseRemoteRepo("https://github.com/owner/repo")).toBe("owner/repo");
	});

	test("HTTPS with userinfo (token credentials)", () => {
		expect(
			parseRemoteRepo("https://x-access-token:TOKEN@github.com/owner/repo.git"),
		).toBe("owner/repo");
	});
});

describe("parseRemoteRepo — non-github hosts return null (security)", () => {
	for (const url of [
		"git@gitlab.com:owner/repo.git",
		"https://gitlab.com/owner/repo.git",
		"git@example.com:owner/repo.git",
		"https://bitbucket.org/owner/repo.git",
		// host-confusion attempts must not slip through
		"https://github.example.com/owner/repo.git",
		"https://github.com.evil.com/owner/repo.git",
	]) {
		test(`returns null for ${url}`, () => {
			expect(parseRemoteRepo(url)).toBeNull();
		});
	}
});
