/**
 * Unit tests for PR review configuration loader.
 * Tests config loading, validation, defaults, and environment overrides.
 */

import {
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	test,
} from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	getDefaultConfig,
	isValidAIHarness,
	isValidCIPlatform,
	isValidVerdict,
	loadPRReviewConfig,
} from "../../pr-review/config.js";
import { expectTaskLeft, expectTaskRight } from "../helpers/index.js";

describe("PR review config loader", () => {
	let tempDir: string;
	let rp1Root: string;
	let savedEnv: Record<string, string | undefined>;

	beforeAll(async () => {
		tempDir = join(tmpdir(), `pr-review-config-test-${Date.now()}`);
		rp1Root = join(tempDir, ".rp1");
		await mkdir(join(rp1Root, "config"), { recursive: true });
	});

	beforeEach(() => {
		// Save environment state
		savedEnv = {
			RP1_PR_REVIEW_ENABLED: process.env.RP1_PR_REVIEW_ENABLED,
			RP1_PR_REVIEW_VERDICT: process.env.RP1_PR_REVIEW_VERDICT,
			RP1_PR_REVIEW_ADD_COMMENTS: process.env.RP1_PR_REVIEW_ADD_COMMENTS,
			RP1_PR_REVIEW_VISUALIZE: process.env.RP1_PR_REVIEW_VISUALIZE,
		};
		// Clear environment
		delete process.env.RP1_PR_REVIEW_ENABLED;
		delete process.env.RP1_PR_REVIEW_VERDICT;
		delete process.env.RP1_PR_REVIEW_ADD_COMMENTS;
		delete process.env.RP1_PR_REVIEW_VISUALIZE;
	});

	afterEach(async () => {
		// Restore environment
		for (const [key, value] of Object.entries(savedEnv)) {
			if (value === undefined) {
				delete process.env[key];
			} else {
				process.env[key] = value;
			}
		}
		// Clean up config file if exists
		try {
			await rm(join(rp1Root, "config", "pr-review.yaml"), { force: true });
		} catch {
			// Ignore if file doesn't exist
		}
	});

	describe("getDefaultConfig", () => {
		test("returns correct default values", () => {
			const defaults = getDefaultConfig();

			expect(defaults.enabled).toBe(false);
			expect(defaults.review_drafts).toBe(true);
			expect(defaults.ai_harness).toBe("claude-code");
			expect(defaults.add_comments).toBe(true);
			expect(defaults.collapse_summary).toBe(false);
			expect(defaults.verdict).toBe("auto");
			expect(defaults.max_comments).toBe(25);
			expect(defaults.bot_marker).toBe("<!-- rp1-review -->");
			expect(defaults.visualize).toBe(true);
			expect(defaults.ci_platform).toBe("github");
		});
	});

	describe("missing config file", () => {
		test("returns defaults when config file does not exist", async () => {
			const result = await expectTaskRight(
				loadPRReviewConfig(join(tempDir, "nonexistent-rp1")),
			);

			expect(result.source).toBe("defaults");
			expect(result.config.enabled).toBe(false);
			expect(result.config.verdict).toBe("auto");
			expect(result.envOverrides).toEqual([]);
		});

		test("does not return error for missing file", async () => {
			const result = await expectTaskRight(
				loadPRReviewConfig(join(tempDir, "also-nonexistent")),
			);

			expect(result.source).toBe("defaults");
		});
	});

	describe("valid config file", () => {
		test("loads all fields from valid YAML", async () => {
			const config = `
enabled: true
review_drafts: false
ai_harness: opencode
add_comments: false
collapse_summary: true
verdict: request_changes
max_comments: 50
bot_marker: "<!-- custom-bot -->"
visualize: true
ci_platform: github
`;
			await writeFile(join(rp1Root, "config", "pr-review.yaml"), config);

			const result = await expectTaskRight(loadPRReviewConfig(rp1Root));

			expect(result.source).toBe("file");
			expect(result.configPath).toContain("pr-review.yaml");
			expect(result.config.enabled).toBe(true);
			expect(result.config.review_drafts).toBe(false);
			expect(result.config.ai_harness).toBe("opencode");
			expect(result.config.add_comments).toBe(false);
			expect(result.config.collapse_summary).toBe(true);
			expect(result.config.verdict).toBe("request_changes");
			expect(result.config.max_comments).toBe(50);
			expect(result.config.bot_marker).toBe("<!-- custom-bot -->");
			expect(result.config.visualize).toBe(true);
			expect(result.config.ci_platform).toBe("github");
		});

		test("merges partial config with defaults", async () => {
			const config = `
enabled: true
verdict: comment
`;
			await writeFile(join(rp1Root, "config", "pr-review.yaml"), config);

			const result = await expectTaskRight(loadPRReviewConfig(rp1Root));

			expect(result.config.enabled).toBe(true);
			expect(result.config.verdict).toBe("comment");
			// Defaults for unspecified fields
			expect(result.config.review_drafts).toBe(true);
			expect(result.config.ai_harness).toBe("claude-code");
			expect(result.config.max_comments).toBe(25);
		});

		test("handles empty config file as defaults", async () => {
			await writeFile(join(rp1Root, "config", "pr-review.yaml"), "");

			const result = await expectTaskRight(loadPRReviewConfig(rp1Root));

			expect(result.source).toBe("file");
			expect(result.config.enabled).toBe(false);
			expect(result.config.verdict).toBe("auto");
		});
	});

	describe("invalid config file", () => {
		test("returns error for invalid YAML syntax", async () => {
			const invalidYaml = `
enabled: true
  verdict: [not valid
`;
			await writeFile(join(rp1Root, "config", "pr-review.yaml"), invalidYaml);

			const error = await expectTaskLeft(loadPRReviewConfig(rp1Root));

			expect(error._tag).toBe("RuntimeError");
		});

		test("returns error for array instead of object", async () => {
			await writeFile(
				join(rp1Root, "config", "pr-review.yaml"),
				"- item1\n- item2",
			);

			const error = await expectTaskLeft(loadPRReviewConfig(rp1Root));

			expect(error._tag).toBe("ConfigError");
		});

		test("returns error for invalid verdict value", async () => {
			await writeFile(
				join(rp1Root, "config", "pr-review.yaml"),
				"verdict: invalid_value",
			);

			const error = await expectTaskLeft(loadPRReviewConfig(rp1Root));

			expect(error._tag).toBe("ConfigError");
			if (error._tag === "ConfigError") {
				expect(error.message).toContain("verdict");
			}
		});

		test("returns error for invalid ai_harness value", async () => {
			await writeFile(
				join(rp1Root, "config", "pr-review.yaml"),
				"ai_harness: gemini",
			);

			const error = await expectTaskLeft(loadPRReviewConfig(rp1Root));

			expect(error._tag).toBe("ConfigError");
			if (error._tag === "ConfigError") {
				expect(error.message).toContain("ai_harness");
			}
		});

		test("returns error for invalid ci_platform value", async () => {
			await writeFile(
				join(rp1Root, "config", "pr-review.yaml"),
				"ci_platform: jenkins",
			);

			const error = await expectTaskLeft(loadPRReviewConfig(rp1Root));

			expect(error._tag).toBe("ConfigError");
			if (error._tag === "ConfigError") {
				expect(error.message).toContain("ci_platform");
			}
		});

		test("returns error for invalid boolean value", async () => {
			await writeFile(
				join(rp1Root, "config", "pr-review.yaml"),
				"enabled: maybe",
			);

			const error = await expectTaskLeft(loadPRReviewConfig(rp1Root));

			expect(error._tag).toBe("ConfigError");
			if (error._tag === "ConfigError") {
				expect(error.message).toContain("enabled");
			}
		});

		test("returns error for negative max_comments", async () => {
			await writeFile(
				join(rp1Root, "config", "pr-review.yaml"),
				"max_comments: -5",
			);

			const error = await expectTaskLeft(loadPRReviewConfig(rp1Root));

			expect(error._tag).toBe("ConfigError");
			if (error._tag === "ConfigError") {
				expect(error.message).toContain("max_comments");
			}
		});

		test("collects multiple validation errors", async () => {
			const config = `
enabled: maybe
verdict: invalid
max_comments: -1
`;
			await writeFile(join(rp1Root, "config", "pr-review.yaml"), config);

			const error = await expectTaskLeft(loadPRReviewConfig(rp1Root));

			expect(error._tag).toBe("ConfigError");
			if (error._tag === "ConfigError") {
				expect(error.message).toContain("enabled");
				expect(error.message).toContain("verdict");
				expect(error.message).toContain("max_comments");
			}
		});
	});

	describe("environment variable overrides", () => {
		test("RP1_PR_REVIEW_ENABLED overrides config", async () => {
			await writeFile(
				join(rp1Root, "config", "pr-review.yaml"),
				"enabled: false",
			);
			process.env.RP1_PR_REVIEW_ENABLED = "true";

			const result = await expectTaskRight(loadPRReviewConfig(rp1Root));

			expect(result.config.enabled).toBe(true);
			expect(result.envOverrides).toContain("RP1_PR_REVIEW_ENABLED");
		});

		test("RP1_PR_REVIEW_VERDICT overrides config", async () => {
			await writeFile(
				join(rp1Root, "config", "pr-review.yaml"),
				"verdict: auto",
			);
			process.env.RP1_PR_REVIEW_VERDICT = "approve";

			const result = await expectTaskRight(loadPRReviewConfig(rp1Root));

			expect(result.config.verdict).toBe("approve");
			expect(result.envOverrides).toContain("RP1_PR_REVIEW_VERDICT");
		});

		test("RP1_PR_REVIEW_ADD_COMMENTS overrides config", async () => {
			await writeFile(
				join(rp1Root, "config", "pr-review.yaml"),
				"add_comments: true",
			);
			process.env.RP1_PR_REVIEW_ADD_COMMENTS = "false";

			const result = await expectTaskRight(loadPRReviewConfig(rp1Root));

			expect(result.config.add_comments).toBe(false);
			expect(result.envOverrides).toContain("RP1_PR_REVIEW_ADD_COMMENTS");
		});

		test("RP1_PR_REVIEW_VISUALIZE overrides config", async () => {
			await writeFile(
				join(rp1Root, "config", "pr-review.yaml"),
				"visualize: false",
			);
			process.env.RP1_PR_REVIEW_VISUALIZE = "true";

			const result = await expectTaskRight(loadPRReviewConfig(rp1Root));

			expect(result.config.visualize).toBe(true);
			expect(result.envOverrides).toContain("RP1_PR_REVIEW_VISUALIZE");
		});

		test("env overrides work without config file", async () => {
			process.env.RP1_PR_REVIEW_ENABLED = "true";
			process.env.RP1_PR_REVIEW_VERDICT = "comment";

			const result = await expectTaskRight(
				loadPRReviewConfig(join(tempDir, "no-config")),
			);

			expect(result.source).toBe("defaults");
			expect(result.config.enabled).toBe(true);
			expect(result.config.verdict).toBe("comment");
			expect(result.envOverrides).toContain("RP1_PR_REVIEW_ENABLED");
			expect(result.envOverrides).toContain("RP1_PR_REVIEW_VERDICT");
		});

		test("invalid env override is ignored", async () => {
			process.env.RP1_PR_REVIEW_VERDICT = "invalid_value";

			const result = await expectTaskRight(
				loadPRReviewConfig(join(tempDir, "no-config-2")),
			);

			expect(result.config.verdict).toBe("auto"); // Default, not overridden
			expect(result.envOverrides).not.toContain("RP1_PR_REVIEW_VERDICT");
		});

		test("boolean env supports multiple formats", async () => {
			// Test "1"
			process.env.RP1_PR_REVIEW_ENABLED = "1";
			let result = await expectTaskRight(
				loadPRReviewConfig(join(tempDir, "env-test-1")),
			);
			expect(result.config.enabled).toBe(true);

			// Test "yes"
			process.env.RP1_PR_REVIEW_ENABLED = "yes";
			result = await expectTaskRight(
				loadPRReviewConfig(join(tempDir, "env-test-2")),
			);
			expect(result.config.enabled).toBe(true);

			// Test "0"
			process.env.RP1_PR_REVIEW_ENABLED = "0";
			result = await expectTaskRight(
				loadPRReviewConfig(join(tempDir, "env-test-3")),
			);
			expect(result.config.enabled).toBe(false);

			// Test "no"
			process.env.RP1_PR_REVIEW_ENABLED = "no";
			result = await expectTaskRight(
				loadPRReviewConfig(join(tempDir, "env-test-4")),
			);
			expect(result.config.enabled).toBe(false);
		});
	});

	describe("validation helpers", () => {
		test("isValidVerdict returns true for valid values", () => {
			expect(isValidVerdict("approve")).toBe(true);
			expect(isValidVerdict("request_changes")).toBe(true);
			expect(isValidVerdict("comment")).toBe(true);
			expect(isValidVerdict("auto")).toBe(true);
		});

		test("isValidVerdict returns false for invalid values", () => {
			expect(isValidVerdict("invalid")).toBe(false);
			expect(isValidVerdict("APPROVE")).toBe(false);
			expect(isValidVerdict("")).toBe(false);
		});

		test("isValidAIHarness returns true for valid values", () => {
			expect(isValidAIHarness("claude-code")).toBe(true);
			expect(isValidAIHarness("opencode")).toBe(true);
		});

		test("isValidAIHarness returns false for invalid values", () => {
			expect(isValidAIHarness("gemini")).toBe(false);
			expect(isValidAIHarness("gpt")).toBe(false);
			expect(isValidAIHarness("")).toBe(false);
		});

		test("isValidCIPlatform returns true for valid values", () => {
			expect(isValidCIPlatform("github")).toBe(true);
			expect(isValidCIPlatform("buildkite")).toBe(true);
			expect(isValidCIPlatform("gitlab")).toBe(true);
		});

		test("isValidCIPlatform returns false for invalid values", () => {
			expect(isValidCIPlatform("jenkins")).toBe(false);
			expect(isValidCIPlatform("circleci")).toBe(false);
			expect(isValidCIPlatform("auto")).toBe(false);
			expect(isValidCIPlatform("")).toBe(false);
		});
	});
});
