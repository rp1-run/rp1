import { describe, expect, it } from "bun:test";
import * as E from "fp-ts/lib/Either.js";
import type {
	ArgumentSchema,
	MergedSettings,
} from "../../../agent-tools/transform-args/models.js";
import {
	parseRawArguments,
	toUpperSnakeCase,
	transformArgsSync,
} from "../../../agent-tools/transform-args/transformer.js";

describe("transformer", () => {
	describe("toUpperSnakeCase", () => {
		it("converts lowercase to UPPERCASE", () => {
			expect(toUpperSnakeCase("feature")).toBe("FEATURE");
		});

		it("converts kebab-case to UPPER_SNAKE_CASE", () => {
			expect(toUpperSnakeCase("feature-id")).toBe("FEATURE_ID");
		});

		it("handles multiple hyphens", () => {
			expect(toUpperSnakeCase("git-worktree-path")).toBe("GIT_WORKTREE_PATH");
		});

		it("handles mixed case", () => {
			expect(toUpperSnakeCase("featureId")).toBe("FEATUREID");
		});
	});

	describe("parseRawArguments", () => {
		it("parses positional arguments only", () => {
			const result = parseRawArguments(["my-feature", "add", "login"]);
			expect(result.positionalArgs).toEqual(["my-feature", "add", "login"]);
			expect(result.flags).toEqual({});
		});

		it("parses boolean flags", () => {
			const result = parseRawArguments(["--afk", "--verbose"]);
			expect(result.positionalArgs).toEqual([]);
			expect(result.flags).toEqual({ afk: true, verbose: true });
		});

		it("parses negated flags with --no- prefix", () => {
			const result = parseRawArguments(["--no-afk", "--no-verbose"]);
			expect(result.positionalArgs).toEqual([]);
			expect(result.flags).toEqual({ afk: false, verbose: false });
		});

		it("parses flags with values", () => {
			const result = parseRawArguments(["--output=json", "--mode=fast"]);
			expect(result.positionalArgs).toEqual([]);
			expect(result.flags).toEqual({ output: "json", mode: "fast" });
		});

		it("parses flags with empty values", () => {
			const result = parseRawArguments(["--output="]);
			expect(result.flags).toEqual({ output: "" });
		});

		it("parses mixed positional args and flags", () => {
			const result = parseRawArguments([
				"my-feature",
				"--afk",
				"add",
				"login",
				"--verbose",
			]);
			expect(result.positionalArgs).toEqual(["my-feature", "add", "login"]);
			expect(result.flags).toEqual({ afk: true, verbose: true });
		});

		it("handles flags with kebab-case names", () => {
			const result = parseRawArguments(["--git-worktree", "--no-git-push"]);
			expect(result.flags).toEqual({ "git-worktree": true, "git-push": false });
		});

		it("handles empty input", () => {
			const result = parseRawArguments([]);
			expect(result.positionalArgs).toEqual([]);
			expect(result.flags).toEqual({});
		});
	});

	describe("transformArgsSync", () => {
		const emptySettings: MergedSettings = {
			values: {},
			source: {},
		};

		describe("schema mode", () => {
			it("maps required positional arg to schema name", () => {
				const schema: ArgumentSchema = {
					positional: [{ name: "feature-id", required: true, variadic: false }],
					flags: [],
					raw: "<feature-id>",
				};

				const result = transformArgsSync(schema, ["my-feature"], emptySettings);

				expect(E.isRight(result)).toBe(true);
				if (E.isRight(result)) {
					expect(result.right.variables).toEqual({
						FEATURE_ID: "my-feature",
					});
					expect(result.right.schemaUsed).toBe(true);
				}
			});

			it("returns error for missing required arg", () => {
				const schema: ArgumentSchema = {
					positional: [{ name: "feature-id", required: true, variadic: false }],
					flags: [],
					raw: "<feature-id>",
				};

				const result = transformArgsSync(schema, [], emptySettings);

				expect(E.isLeft(result)).toBe(true);
				if (E.isLeft(result)) {
					expect(result.left.reason).toBe("missing-required-arg");
					expect(result.left.message).toContain("feature-id");
				}
			});

			it("handles optional positional arg when provided", () => {
				const schema: ArgumentSchema = {
					positional: [
						{ name: "feature-id", required: true, variadic: false },
						{ name: "requirements", required: false, variadic: false },
					],
					flags: [],
					raw: "<feature-id> [requirements]",
				};

				const result = transformArgsSync(
					schema,
					["my-feature", "add login"],
					emptySettings,
				);

				expect(E.isRight(result)).toBe(true);
				if (E.isRight(result)) {
					expect(result.right.variables).toEqual({
						FEATURE_ID: "my-feature",
						REQUIREMENTS: "add login",
					});
				}
			});

			it("handles optional positional arg when missing", () => {
				const schema: ArgumentSchema = {
					positional: [
						{ name: "feature-id", required: true, variadic: false },
						{ name: "requirements", required: false, variadic: false },
					],
					flags: [],
					raw: "<feature-id> [requirements]",
				};

				const result = transformArgsSync(schema, ["my-feature"], emptySettings);

				expect(E.isRight(result)).toBe(true);
				if (E.isRight(result)) {
					expect(result.right.variables).toEqual({
						FEATURE_ID: "my-feature",
					});
				}
			});

			it("handles variadic arg capturing remaining positionals", () => {
				const schema: ArgumentSchema = {
					positional: [
						{ name: "feature-id", required: true, variadic: false },
						{ name: "requirements", required: false, variadic: true },
					],
					flags: [],
					raw: "<feature-id> [requirements...]",
				};

				const result = transformArgsSync(
					schema,
					["my-feature", "add", "login", "with", "OAuth"],
					emptySettings,
				);

				expect(E.isRight(result)).toBe(true);
				if (E.isRight(result)) {
					expect(result.right.variables).toEqual({
						FEATURE_ID: "my-feature",
						REQUIREMENTS: "add login with OAuth",
					});
				}
			});

			it("handles variadic arg when empty", () => {
				const schema: ArgumentSchema = {
					positional: [
						{ name: "feature-id", required: true, variadic: false },
						{ name: "requirements", required: false, variadic: true },
					],
					flags: [],
					raw: "<feature-id> [requirements...]",
				};

				const result = transformArgsSync(schema, ["my-feature"], emptySettings);

				expect(E.isRight(result)).toBe(true);
				if (E.isRight(result)) {
					expect(result.right.variables).toEqual({
						FEATURE_ID: "my-feature",
					});
				}
			});

			it("applies boolean flag defaults from schema", () => {
				const schema: ArgumentSchema = {
					positional: [],
					flags: [
						{ name: "afk", defaultValue: false, isBoolean: true },
						{ name: "verbose", defaultValue: false, isBoolean: true },
					],
					raw: "[--afk] [--verbose]",
				};

				const result = transformArgsSync(schema, [], emptySettings);

				expect(E.isRight(result)).toBe(true);
				if (E.isRight(result)) {
					expect(result.right.variables).toEqual({
						AFK: "false",
						VERBOSE: "false",
					});
				}
			});

			it("overrides flag defaults with CLI flags", () => {
				const schema: ArgumentSchema = {
					positional: [],
					flags: [
						{ name: "afk", defaultValue: false, isBoolean: true },
						{ name: "verbose", defaultValue: false, isBoolean: true },
					],
					raw: "[--afk] [--verbose]",
				};

				const result = transformArgsSync(schema, ["--afk"], emptySettings);

				expect(E.isRight(result)).toBe(true);
				if (E.isRight(result)) {
					expect(result.right.variables.AFK).toBe("true");
					expect(result.right.variables.VERBOSE).toBe("false");
				}
			});

			it("handles value flags with defaults", () => {
				const schema: ArgumentSchema = {
					positional: [],
					flags: [{ name: "output", defaultValue: "text", isBoolean: false }],
					raw: "[--output=text]",
				};

				const result = transformArgsSync(schema, [], emptySettings);

				expect(E.isRight(result)).toBe(true);
				if (E.isRight(result)) {
					expect(result.right.variables.OUTPUT).toBe("text");
				}
			});

			it("overrides value flag default with CLI value", () => {
				const schema: ArgumentSchema = {
					positional: [],
					flags: [{ name: "output", defaultValue: "text", isBoolean: false }],
					raw: "[--output=text]",
				};

				const result = transformArgsSync(
					schema,
					["--output=json"],
					emptySettings,
				);

				expect(E.isRight(result)).toBe(true);
				if (E.isRight(result)) {
					expect(result.right.variables.OUTPUT).toBe("json");
				}
			});

			it("collects extra positional args into ARGUMENTS", () => {
				const schema: ArgumentSchema = {
					positional: [{ name: "feature-id", required: true, variadic: false }],
					flags: [],
					raw: "<feature-id>",
				};

				const result = transformArgsSync(
					schema,
					["my-feature", "extra", "args"],
					emptySettings,
				);

				expect(E.isRight(result)).toBe(true);
				if (E.isRight(result)) {
					expect(result.right.variables.FEATURE_ID).toBe("my-feature");
					expect(result.right.variables.ARGUMENTS).toBe("extra args");
				}
			});
		});

		describe("fallback mode", () => {
			it("uses ARG_N naming when no schema", () => {
				const result = transformArgsSync(
					null,
					["foo", "bar", "baz"],
					emptySettings,
				);

				expect(E.isRight(result)).toBe(true);
				if (E.isRight(result)) {
					expect(result.right.variables).toEqual({
						ARG_1: "foo",
						ARG_2: "bar",
						ARG_3: "baz",
						ARGUMENTS: "foo bar baz",
					});
					expect(result.right.schemaUsed).toBe(false);
					expect(result.right.warnings.length).toBeGreaterThan(0);
				}
			});

			it("passes through flags in fallback mode", () => {
				const result = transformArgsSync(
					null,
					["foo", "--verbose", "--mode=fast"],
					emptySettings,
				);

				expect(E.isRight(result)).toBe(true);
				if (E.isRight(result)) {
					expect(result.right.variables.ARG_1).toBe("foo");
					expect(result.right.variables.VERBOSE).toBe("true");
					expect(result.right.variables.MODE).toBe("fast");
					expect(result.right.variables.ARGUMENTS).toBe("foo");
				}
			});

			it("handles empty args in fallback mode", () => {
				const result = transformArgsSync(null, [], emptySettings);

				expect(E.isRight(result)).toBe(true);
				if (E.isRight(result)) {
					expect(result.right.variables).toEqual({});
					expect(result.right.schemaUsed).toBe(false);
				}
			});
		});

		describe("settings integration", () => {
			it("applies settings values that are not in CLI flags", () => {
				const schema: ArgumentSchema = {
					positional: [],
					flags: [{ name: "afk", defaultValue: false, isBoolean: true }],
					raw: "[--afk]",
				};

				const settings: MergedSettings = {
					values: { afk: true, verbose: true },
					source: { afk: "local", verbose: "global" },
				};

				const result = transformArgsSync(schema, [], settings);

				expect(E.isRight(result)).toBe(true);
				if (E.isRight(result)) {
					// afk from settings overrides schema default (but schema flag is applied first)
					expect(result.right.variables.AFK).toBe("false");
					// verbose from settings is applied
					expect(result.right.variables.VERBOSE).toBe("true");
				}
			});

			it("CLI flags take precedence over settings", () => {
				const schema: ArgumentSchema = {
					positional: [],
					flags: [{ name: "afk", defaultValue: false, isBoolean: true }],
					raw: "[--afk]",
				};

				const settings: MergedSettings = {
					values: { afk: false },
					source: { afk: "local" },
				};

				const result = transformArgsSync(schema, ["--afk"], settings);

				expect(E.isRight(result)).toBe(true);
				if (E.isRight(result)) {
					expect(result.right.variables.AFK).toBe("true");
				}
			});
		});
	});
});
