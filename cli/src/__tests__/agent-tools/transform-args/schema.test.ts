/**
 * Unit tests for argument-hint schema parser.
 * Tests parsing of command argument schemas from YAML frontmatter.
 */

import { describe, expect, test } from "bun:test";
import {
	emptySchema,
	parseArgumentHint,
	type SchemaParseError,
} from "../../../agent-tools/transform-args/schema.js";
import { expectLeft, expectRight } from "../../helpers/fp-ts-helpers.js";

describe("parseArgumentHint", () => {
	describe("required positional arguments", () => {
		test("parses single required positional", () => {
			const result = expectRight(parseArgumentHint("<feature-id>"));

			expect(result.positional).toHaveLength(1);
			expect(result.positional[0]).toEqual({
				name: "feature-id",
				required: true,
				variadic: false,
			});
			expect(result.flags).toHaveLength(0);
		});

		test("parses multiple required positionals", () => {
			const result = expectRight(parseArgumentHint("<repo> <branch>"));

			expect(result.positional).toHaveLength(2);
			expect(result.positional[0].name).toBe("repo");
			expect(result.positional[1].name).toBe("branch");
			expect(result.positional.every((p) => p.required)).toBe(true);
		});
	});

	describe("optional positional arguments", () => {
		test("parses single optional positional", () => {
			const result = expectRight(parseArgumentHint("[requirements]"));

			expect(result.positional).toHaveLength(1);
			expect(result.positional[0]).toEqual({
				name: "requirements",
				required: false,
				variadic: false,
			});
		});

		test("parses mixed required and optional positionals", () => {
			const result = expectRight(
				parseArgumentHint("<feature-id> [requirements]"),
			);

			expect(result.positional).toHaveLength(2);
			expect(result.positional[0].required).toBe(true);
			expect(result.positional[1].required).toBe(false);
		});
	});

	describe("variadic arguments", () => {
		test("parses variadic with three dots", () => {
			const result = expectRight(parseArgumentHint("[args...]"));

			expect(result.positional).toHaveLength(1);
			expect(result.positional[0]).toEqual({
				name: "args",
				required: false,
				variadic: true,
			});
		});

		test("parses variadic with two dots", () => {
			const result = expectRight(parseArgumentHint("[files..]"));

			expect(result.positional).toHaveLength(1);
			expect(result.positional[0].variadic).toBe(true);
		});

		test("fails when variadic is not last positional", () => {
			const error = expectLeft(
				parseArgumentHint("<feature-id> [args...] [extra]"),
			) as SchemaParseError;

			expect(error._tag).toBe("SchemaParseError");
			expect(error.message).toContain("must be the last positional");
		});
	});

	describe("boolean flags", () => {
		test("parses single boolean flag", () => {
			const result = expectRight(parseArgumentHint("[--afk]"));

			expect(result.flags).toHaveLength(1);
			expect(result.flags[0]).toEqual({
				name: "afk",
				defaultValue: false,
				isBoolean: true,
			});
		});

		test("parses multiple boolean flags", () => {
			const result = expectRight(parseArgumentHint("[--afk] [--git-worktree]"));

			expect(result.flags).toHaveLength(2);
			expect(result.flags[0].name).toBe("afk");
			expect(result.flags[1].name).toBe("git-worktree");
		});
	});

	describe("value flags", () => {
		test("parses flag with default value", () => {
			const result = expectRight(parseArgumentHint("[--output=json]"));

			expect(result.flags).toHaveLength(1);
			expect(result.flags[0]).toEqual({
				name: "output",
				defaultValue: "json",
				isBoolean: false,
			});
		});

		test("parses flag with empty default value", () => {
			const result = expectRight(parseArgumentHint("[--prefix=]"));

			expect(result.flags).toHaveLength(1);
			expect(result.flags[0].defaultValue).toBe("");
		});
	});

	describe("complex schemas", () => {
		test("parses full command schema", () => {
			const result = expectRight(
				parseArgumentHint(
					"<feature-id> [requirements...] [--afk] [--mode=fast]",
				),
			);

			expect(result.positional).toHaveLength(2);
			expect(result.positional[0].name).toBe("feature-id");
			expect(result.positional[0].required).toBe(true);
			expect(result.positional[1].name).toBe("requirements");
			expect(result.positional[1].variadic).toBe(true);

			expect(result.flags).toHaveLength(2);
			expect(result.flags[0].name).toBe("afk");
			expect(result.flags[0].isBoolean).toBe(true);
			expect(result.flags[1].name).toBe("mode");
			expect(result.flags[1].defaultValue).toBe("fast");
		});

		test("preserves raw hint string", () => {
			const hint = "<id> [--verbose]";
			const result = expectRight(parseArgumentHint(hint));

			expect(result.raw).toBe(hint);
		});
	});

	describe("edge cases", () => {
		test("handles empty hint", () => {
			const result = expectRight(parseArgumentHint(""));

			expect(result.positional).toHaveLength(0);
			expect(result.flags).toHaveLength(0);
		});

		test("handles whitespace-only hint", () => {
			const result = expectRight(parseArgumentHint("   "));

			expect(result.positional).toHaveLength(0);
			expect(result.flags).toHaveLength(0);
		});

		test("handles extra whitespace between tokens", () => {
			const result = expectRight(
				parseArgumentHint("<id>    [--flag]    [name]"),
			);

			expect(result.positional).toHaveLength(2);
			expect(result.flags).toHaveLength(1);
		});

		test("ignores unrecognized tokens", () => {
			const result = expectRight(
				parseArgumentHint("<id> unrecognized [--flag]"),
			);

			expect(result.positional).toHaveLength(1);
			expect(result.flags).toHaveLength(1);
		});
	});

	describe("emptySchema", () => {
		test("returns schema with no arguments", () => {
			const schema = emptySchema();

			expect(schema.positional).toHaveLength(0);
			expect(schema.flags).toHaveLength(0);
			expect(schema.raw).toBe("");
		});
	});
});
