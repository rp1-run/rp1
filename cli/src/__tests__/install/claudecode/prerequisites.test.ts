/**
 * Unit tests for Claude Code prerequisites module.
 * Tests version parsing, comparison, and prerequisite checks.
 */

import { describe, expect, test } from "bun:test";
import * as E from "fp-ts/lib/Either.js";
import {
	checkPluginCommandSupport,
	compareVersions,
	formatVersion,
	MINIMUM_CLAUDE_VERSION,
	parseClaudeCodeVersion,
} from "../../../install/claudecode/prerequisites.js";
import {
	expectLeft,
	expectRight,
	getErrorMessage,
} from "../../helpers/index.js";

describe("claudecode/prerequisites", () => {
	describe("parseClaudeCodeVersion", () => {
		test("parses standard version format", () => {
			const result = parseClaudeCodeVersion("claude 1.0.33");
			const parsed = expectRight(result);

			expect(parsed.major).toBe(1);
			expect(parsed.minor).toBe(0);
			expect(parsed.patch).toBe(33);
		});

		test("parses version with prefix text", () => {
			const result = parseClaudeCodeVersion("Claude Code CLI version 1.2.0");
			const parsed = expectRight(result);

			expect(parsed.major).toBe(1);
			expect(parsed.minor).toBe(2);
			expect(parsed.patch).toBe(0);
		});

		test("parses bare version number", () => {
			const result = parseClaudeCodeVersion("1.0.33");
			const parsed = expectRight(result);

			expect(parsed.major).toBe(1);
			expect(parsed.minor).toBe(0);
			expect(parsed.patch).toBe(33);
		});

		test("parses version with newlines and extra whitespace", () => {
			const result = parseClaudeCodeVersion("  claude  1.5.10  \n");
			const parsed = expectRight(result);

			expect(parsed.major).toBe(1);
			expect(parsed.minor).toBe(5);
			expect(parsed.patch).toBe(10);
		});

		test("parses version with build metadata suffix", () => {
			// Some CLIs include build info after version
			const result = parseClaudeCodeVersion("claude 2.1.0-beta.1");
			const parsed = expectRight(result);

			expect(parsed.major).toBe(2);
			expect(parsed.minor).toBe(1);
			expect(parsed.patch).toBe(0);
		});

		test("returns error for invalid format - no version", () => {
			const result = parseClaudeCodeVersion("not a version");
			const error = expectLeft(result);

			expect(error._tag).toBe("PrerequisiteError");
			expect(getErrorMessage(error)).toContain("Could not parse");
		});

		test("returns error for invalid format - partial version", () => {
			const result = parseClaudeCodeVersion("claude 1.0");
			const error = expectLeft(result);

			expect(error._tag).toBe("PrerequisiteError");
			expect(getErrorMessage(error)).toContain("Could not parse");
		});

		test("returns error for empty string", () => {
			const result = parseClaudeCodeVersion("");
			const error = expectLeft(result);

			expect(error._tag).toBe("PrerequisiteError");
		});

		test("handles various real-world version formats", () => {
			const formats = [
				{ input: "claude 1.0.33", expected: { major: 1, minor: 0, patch: 33 } },
				{
					input: "Claude Code version 1.2.5",
					expected: { major: 1, minor: 2, patch: 5 },
				},
				{ input: "v1.3.0", expected: { major: 1, minor: 3, patch: 0 } },
				{
					input: "@anthropic/claude-cli@1.0.40",
					expected: { major: 1, minor: 0, patch: 40 },
				},
			];

			for (const { input, expected } of formats) {
				const result = parseClaudeCodeVersion(input);
				expect(E.isRight(result)).toBe(true);
				if (E.isRight(result)) {
					expect(result.right).toEqual(expected);
				}
			}
		});
	});

	describe("compareVersions", () => {
		test("returns 0 for equal versions", () => {
			expect(
				compareVersions(
					{ major: 1, minor: 0, patch: 33 },
					{ major: 1, minor: 0, patch: 33 },
				),
			).toBe(0);
		});

		test("returns -1 when first version is lower (major)", () => {
			expect(
				compareVersions(
					{ major: 1, minor: 0, patch: 33 },
					{ major: 2, minor: 0, patch: 0 },
				),
			).toBe(-1);
		});

		test("returns 1 when first version is higher (major)", () => {
			expect(
				compareVersions(
					{ major: 2, minor: 0, patch: 0 },
					{ major: 1, minor: 0, patch: 33 },
				),
			).toBe(1);
		});

		test("returns -1 when first version is lower (minor)", () => {
			expect(
				compareVersions(
					{ major: 1, minor: 0, patch: 33 },
					{ major: 1, minor: 1, patch: 0 },
				),
			).toBe(-1);
		});

		test("returns 1 when first version is higher (minor)", () => {
			expect(
				compareVersions(
					{ major: 1, minor: 2, patch: 0 },
					{ major: 1, minor: 1, patch: 99 },
				),
			).toBe(1);
		});

		test("returns -1 when first version is lower (patch)", () => {
			expect(
				compareVersions(
					{ major: 1, minor: 0, patch: 32 },
					{ major: 1, minor: 0, patch: 33 },
				),
			).toBe(-1);
		});

		test("returns 1 when first version is higher (patch)", () => {
			expect(
				compareVersions(
					{ major: 1, minor: 0, patch: 34 },
					{ major: 1, minor: 0, patch: 33 },
				),
			).toBe(1);
		});
	});

	describe("formatVersion", () => {
		test("formats version object as X.Y.Z string", () => {
			expect(formatVersion({ major: 1, minor: 0, patch: 33 })).toBe("1.0.33");
			expect(formatVersion({ major: 2, minor: 5, patch: 100 })).toBe("2.5.100");
			expect(formatVersion({ major: 0, minor: 0, patch: 1 })).toBe("0.0.1");
		});
	});

	describe("checkPluginCommandSupport", () => {
		test("passes for version >= 1.0.33", () => {
			const validVersions = ["1.0.33", "1.0.34", "1.1.0", "1.5.0", "2.0.0"];

			for (const version of validVersions) {
				const result = checkPluginCommandSupport(version);
				expect(E.isRight(result)).toBe(true);
				if (E.isRight(result)) {
					expect(result.right.passed).toBe(true);
					expect(result.right.check).toBe("claude-version");
				}
			}
		});

		test("fails for version < 1.0.33", () => {
			const oldVersions = ["1.0.32", "1.0.0", "0.9.99", "0.5.0"];

			for (const version of oldVersions) {
				const result = checkPluginCommandSupport(version);
				expect(E.isLeft(result)).toBe(true);
				if (E.isLeft(result)) {
					expect(result.left._tag).toBe("PrerequisiteError");
					expect(getErrorMessage(result.left)).toContain(
						"does not support plugin CLI commands",
					);
				}
			}
		});

		test("includes upgrade instructions in error", () => {
			const result = checkPluginCommandSupport("1.0.20");
			expect(E.isLeft(result)).toBe(true);
			if (E.isLeft(result)) {
				const error = result.left as { suggestion?: string };
				expect(error.suggestion).toContain(
					formatVersion(MINIMUM_CLAUDE_VERSION),
				);
				expect(error.suggestion).toContain("https://");
			}
		});

		test("handles version strings with prefix", () => {
			const result = checkPluginCommandSupport("claude 1.0.35");
			expect(E.isRight(result)).toBe(true);
			if (E.isRight(result)) {
				expect(result.right.passed).toBe(true);
			}
		});

		test("returns parsed version in result value", () => {
			const result = checkPluginCommandSupport("1.2.5");
			expect(E.isRight(result)).toBe(true);
			if (E.isRight(result)) {
				expect(result.right.value).toBe("1.2.5");
			}
		});

		test("propagates parse error for invalid version", () => {
			const result = checkPluginCommandSupport("not-a-version");
			expect(E.isLeft(result)).toBe(true);
			if (E.isLeft(result)) {
				expect(result.left._tag).toBe("PrerequisiteError");
				expect(getErrorMessage(result.left)).toContain("Could not parse");
			}
		});
	});

	describe("MINIMUM_CLAUDE_VERSION constant", () => {
		test("is set to 1.0.33", () => {
			expect(MINIMUM_CLAUDE_VERSION).toEqual({ major: 1, minor: 0, patch: 33 });
		});
	});
});
