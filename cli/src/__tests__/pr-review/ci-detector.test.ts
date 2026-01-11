/**
 * Unit tests for CI environment detection module.
 * Tests CI mode detection, platform identification, and context extraction.
 */

import {
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	test,
} from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	detectCIMode,
	extractContext,
	extractGitHubContext,
	isCI,
	isGenericCIContext,
	isGitHubContext,
	isLocalContext,
} from "../../pr-review/ci-detector.js";
import type { GitHubEventPayload } from "../../pr-review/models.js";
import {
	expectTaskLeft,
	expectTaskRight,
	getErrorMessage,
} from "../helpers/index.js";

describe("CI environment detection", () => {
	let savedEnv: Record<string, string | undefined>;
	let tempDir: string;

	beforeAll(async () => {
		tempDir = join(tmpdir(), `ci-detector-test-${Date.now()}`);
		await mkdir(tempDir, { recursive: true });
	});

	beforeEach(() => {
		// Save and clear all CI-related environment variables
		savedEnv = {
			GITHUB_ACTIONS: process.env.GITHUB_ACTIONS,
			BUILDKITE: process.env.BUILDKITE,
			GITLAB_CI: process.env.GITLAB_CI,
			CI: process.env.CI,
			GITHUB_EVENT_PATH: process.env.GITHUB_EVENT_PATH,
			GITHUB_REPOSITORY: process.env.GITHUB_REPOSITORY,
			GITHUB_TOKEN: process.env.GITHUB_TOKEN,
			GITHUB_HEAD_REF: process.env.GITHUB_HEAD_REF,
			GITHUB_BASE_REF: process.env.GITHUB_BASE_REF,
		};

		// Clear environment
		delete process.env.GITHUB_ACTIONS;
		delete process.env.BUILDKITE;
		delete process.env.GITLAB_CI;
		delete process.env.CI;
		delete process.env.GITHUB_EVENT_PATH;
		delete process.env.GITHUB_REPOSITORY;
		delete process.env.GITHUB_TOKEN;
		delete process.env.GITHUB_HEAD_REF;
		delete process.env.GITHUB_BASE_REF;
	});

	afterEach(() => {
		// Restore environment
		for (const [key, value] of Object.entries(savedEnv)) {
			if (value === undefined) {
				delete process.env[key];
			} else {
				process.env[key] = value;
			}
		}
	});

	describe("detectCIMode", () => {
		test("detects GitHub Actions", () => {
			process.env.GITHUB_ACTIONS = "true";

			const result = detectCIMode();

			expect(result.isCI).toBe(true);
			expect(result.platform).toBe("github_actions");
		});

		test("detects Buildkite", () => {
			process.env.BUILDKITE = "true";

			const result = detectCIMode();

			expect(result.isCI).toBe(true);
			expect(result.platform).toBe("buildkite");
		});

		test("detects GitLab CI", () => {
			process.env.GITLAB_CI = "true";

			const result = detectCIMode();

			expect(result.isCI).toBe(true);
			expect(result.platform).toBe("gitlab_ci");
		});

		test("detects generic CI", () => {
			process.env.CI = "true";

			const result = detectCIMode();

			expect(result.isCI).toBe(true);
			expect(result.platform).toBe("generic_ci");
		});

		test("returns not CI when no CI variables set", () => {
			const result = detectCIMode();

			expect(result.isCI).toBe(false);
			expect(result.platform).toBeUndefined();
		});

		test("GitHub Actions takes precedence over generic CI", () => {
			process.env.GITHUB_ACTIONS = "true";
			process.env.CI = "true";

			const result = detectCIMode();

			expect(result.platform).toBe("github_actions");
		});

		test("Buildkite takes precedence over generic CI", () => {
			process.env.BUILDKITE = "true";
			process.env.CI = "true";

			const result = detectCIMode();

			expect(result.platform).toBe("buildkite");
		});

		test("explicit ci_platform config overrides auto-detection", () => {
			// No CI env vars set, but explicit config
			const result = detectCIMode("github");

			expect(result.isCI).toBe(true);
			expect(result.platform).toBe("github_actions");
		});

		test("explicit ci_platform=buildkite sets buildkite platform", () => {
			const result = detectCIMode("buildkite");

			expect(result.isCI).toBe(true);
			expect(result.platform).toBe("buildkite");
		});

		test("explicit ci_platform=gitlab sets gitlab_ci platform", () => {
			const result = detectCIMode("gitlab");

			expect(result.isCI).toBe(true);
			expect(result.platform).toBe("gitlab_ci");
		});

		test("ci_platform=auto falls back to env detection", () => {
			process.env.GITHUB_ACTIONS = "true";

			const result = detectCIMode("auto");

			expect(result.isCI).toBe(true);
			expect(result.platform).toBe("github_actions");
		});

		test("ci_platform=auto returns not CI when no env vars", () => {
			const result = detectCIMode("auto");

			expect(result.isCI).toBe(false);
			expect(result.platform).toBeUndefined();
		});
	});

	describe("isCI", () => {
		test("returns true in CI environment", () => {
			process.env.CI = "true";

			expect(isCI()).toBe(true);
		});

		test("returns false when not in CI", () => {
			expect(isCI()).toBe(false);
		});
	});

	describe("extractGitHubContext", () => {
		const createEventPayload = (
			overrides: Partial<GitHubEventPayload> = {},
		): GitHubEventPayload => ({
			action: "opened",
			number: 123,
			pull_request: {
				number: 123,
				draft: false,
				head: { ref: "feature-branch" },
				base: { ref: "main" },
			},
			repository: {
				owner: { login: "rp1-run" },
				name: "rp1",
				full_name: "rp1-run/rp1",
			},
			...overrides,
		});

		const setupGitHubEnv = async (
			eventPayload: GitHubEventPayload,
		): Promise<string> => {
			const eventPath = join(tempDir, `event-${Date.now()}.json`);
			await writeFile(eventPath, JSON.stringify(eventPayload));

			process.env.GITHUB_ACTIONS = "true";
			process.env.GITHUB_EVENT_PATH = eventPath;
			process.env.GITHUB_REPOSITORY = "rp1-run/rp1";
			process.env.GITHUB_TOKEN = "ghp_test_token";
			process.env.GITHUB_HEAD_REF = "feature-branch";
			process.env.GITHUB_BASE_REF = "main";

			return eventPath;
		};

		test("extracts full GitHub context from environment", async () => {
			await setupGitHubEnv(createEventPayload());

			const result = await expectTaskRight(extractGitHubContext());

			expect(result.platform).toBe("github_actions");
			expect(result.owner).toBe("rp1-run");
			expect(result.repo).toBe("rp1");
			expect(result.pr_number).toBe(123);
			expect(result.token).toBe("ghp_test_token");
			expect(result.head_ref).toBe("feature-branch");
			expect(result.base_ref).toBe("main");
			expect(result.action).toBe("opened");
			expect(result.is_draft).toBe(false);
		});

		test("extracts PR number from event payload", async () => {
			await setupGitHubEnv(
				createEventPayload({
					number: 456,
					pull_request: {
						number: 456,
						draft: true,
						head: { ref: "fix-bug" },
						base: { ref: "develop" },
					},
				}),
			);

			const result = await expectTaskRight(extractGitHubContext());

			expect(result.pr_number).toBe(456);
			expect(result.is_draft).toBe(true);
		});

		test("uses GITHUB_HEAD_REF from environment over event payload", async () => {
			await setupGitHubEnv(createEventPayload());
			process.env.GITHUB_HEAD_REF = "env-head-ref";

			const result = await expectTaskRight(extractGitHubContext());

			expect(result.head_ref).toBe("env-head-ref");
		});

		test("returns error when GITHUB_EVENT_PATH not set", async () => {
			process.env.GITHUB_ACTIONS = "true";
			process.env.GITHUB_REPOSITORY = "rp1-run/rp1";
			process.env.GITHUB_TOKEN = "ghp_test_token";
			// GITHUB_EVENT_PATH not set

			const error = await expectTaskLeft(extractGitHubContext());

			expect(error._tag).toBe("RuntimeError");
			expect(getErrorMessage(error)).toContain("GITHUB_EVENT_PATH");
		});

		test("returns error when GITHUB_REPOSITORY not set", async () => {
			const eventPath = join(tempDir, `event-no-repo-${Date.now()}.json`);
			await writeFile(eventPath, JSON.stringify(createEventPayload()));

			process.env.GITHUB_ACTIONS = "true";
			process.env.GITHUB_EVENT_PATH = eventPath;
			process.env.GITHUB_TOKEN = "ghp_test_token";
			// GITHUB_REPOSITORY not set

			const error = await expectTaskLeft(extractGitHubContext());

			expect(error._tag).toBe("RuntimeError");
			expect(getErrorMessage(error)).toContain("GITHUB_REPOSITORY");
		});

		test("returns error when GITHUB_TOKEN not set", async () => {
			const eventPath = join(tempDir, `event-no-token-${Date.now()}.json`);
			await writeFile(eventPath, JSON.stringify(createEventPayload()));

			process.env.GITHUB_ACTIONS = "true";
			process.env.GITHUB_EVENT_PATH = eventPath;
			process.env.GITHUB_REPOSITORY = "rp1-run/rp1";
			// GITHUB_TOKEN not set

			const error = await expectTaskLeft(extractGitHubContext());

			expect(error._tag).toBe("RuntimeError");
			expect(getErrorMessage(error)).toContain("GITHUB_TOKEN");
		});

		test("returns error when event payload has no PR number", async () => {
			const eventPath = join(tempDir, `event-no-pr-${Date.now()}.json`);
			await writeFile(
				eventPath,
				JSON.stringify({
					action: "push",
					// No number or pull_request
				}),
			);

			process.env.GITHUB_ACTIONS = "true";
			process.env.GITHUB_EVENT_PATH = eventPath;
			process.env.GITHUB_REPOSITORY = "rp1-run/rp1";
			process.env.GITHUB_TOKEN = "ghp_test_token";

			const error = await expectTaskLeft(extractGitHubContext());

			expect(error._tag).toBe("RuntimeError");
			expect(getErrorMessage(error)).toContain("PR number");
		});

		test("returns error for invalid GITHUB_REPOSITORY format", async () => {
			const eventPath = join(tempDir, `event-invalid-repo-${Date.now()}.json`);
			await writeFile(eventPath, JSON.stringify(createEventPayload()));

			process.env.GITHUB_ACTIONS = "true";
			process.env.GITHUB_EVENT_PATH = eventPath;
			process.env.GITHUB_REPOSITORY = "invalid-format";
			process.env.GITHUB_TOKEN = "ghp_test_token";

			const error = await expectTaskLeft(extractGitHubContext());

			expect(error._tag).toBe("RuntimeError");
			expect(getErrorMessage(error)).toContain("owner/repo");
		});

		test("handles action: synchronize event", async () => {
			await setupGitHubEnv(
				createEventPayload({
					action: "synchronize",
				}),
			);

			const result = await expectTaskRight(extractGitHubContext());

			expect(result.action).toBe("synchronize");
		});
	});

	describe("extractContext", () => {
		test("returns local context when not in CI", async () => {
			const result = await expectTaskRight(extractContext());

			expect(result.ciMode.isCI).toBe(false);
			expect(result.context.platform).toBe("local");
		});

		test("returns GitHub context in GitHub Actions", async () => {
			const eventPath = join(tempDir, `event-full-${Date.now()}.json`);
			await writeFile(
				eventPath,
				JSON.stringify({
					action: "opened",
					number: 789,
					pull_request: {
						number: 789,
						draft: false,
						head: { ref: "test-branch" },
						base: { ref: "main" },
					},
				}),
			);

			process.env.GITHUB_ACTIONS = "true";
			process.env.GITHUB_EVENT_PATH = eventPath;
			process.env.GITHUB_REPOSITORY = "test/repo";
			process.env.GITHUB_TOKEN = "token123";

			const result = await expectTaskRight(extractContext());

			expect(result.ciMode.isCI).toBe(true);
			expect(result.ciMode.platform).toBe("github_actions");
			expect(result.context.platform).toBe("github_actions");

			if (isGitHubContext(result.context)) {
				expect(result.context.pr_number).toBe(789);
				expect(result.context.owner).toBe("test");
				expect(result.context.repo).toBe("repo");
			}
		});

		test("returns generic context for Buildkite", async () => {
			process.env.BUILDKITE = "true";
			process.env.BUILDKITE_BUILD_ID = "build-123";
			process.env.BUILDKITE_BRANCH = "feature";
			process.env.BUILDKITE_PULL_REQUEST = "42";

			const result = await expectTaskRight(extractContext());

			expect(result.ciMode.isCI).toBe(true);
			expect(result.ciMode.platform).toBe("buildkite");
			expect(result.context.platform).toBe("buildkite");

			if (isGenericCIContext(result.context)) {
				expect(result.context.raw.buildkite_build_id).toBe("build-123");
				expect(result.context.raw.buildkite_pull_request).toBe("42");
			}
		});

		test("returns generic context for GitLab CI", async () => {
			process.env.GITLAB_CI = "true";
			process.env.CI_MERGE_REQUEST_IID = "99";
			process.env.CI_PROJECT_PATH = "group/project";

			const result = await expectTaskRight(extractContext());

			expect(result.ciMode.isCI).toBe(true);
			expect(result.ciMode.platform).toBe("gitlab_ci");
			expect(result.context.platform).toBe("gitlab_ci");

			if (isGenericCIContext(result.context)) {
				expect(result.context.raw.ci_merge_request_iid).toBe("99");
				expect(result.context.raw.ci_project_path).toBe("group/project");
			}
		});
	});

	describe("type guards", () => {
		test("isGitHubContext identifies GitHub context", async () => {
			const eventPath = join(tempDir, `event-guard-${Date.now()}.json`);
			await writeFile(
				eventPath,
				JSON.stringify({
					action: "opened",
					number: 1,
					pull_request: { number: 1, draft: false },
				}),
			);

			process.env.GITHUB_ACTIONS = "true";
			process.env.GITHUB_EVENT_PATH = eventPath;
			process.env.GITHUB_REPOSITORY = "a/b";
			process.env.GITHUB_TOKEN = "t";

			const result = await expectTaskRight(extractContext());

			expect(isGitHubContext(result.context)).toBe(true);
			expect(isLocalContext(result.context)).toBe(false);
			expect(isGenericCIContext(result.context)).toBe(false);
		});

		test("isLocalContext identifies local context", async () => {
			const result = await expectTaskRight(extractContext());

			expect(isLocalContext(result.context)).toBe(true);
			expect(isGitHubContext(result.context)).toBe(false);
			expect(isGenericCIContext(result.context)).toBe(false);
		});

		test("isGenericCIContext identifies generic CI contexts", async () => {
			process.env.BUILDKITE = "true";

			const result = await expectTaskRight(extractContext());

			expect(isGenericCIContext(result.context)).toBe(true);
			expect(isGitHubContext(result.context)).toBe(false);
			expect(isLocalContext(result.context)).toBe(false);
		});
	});
});
