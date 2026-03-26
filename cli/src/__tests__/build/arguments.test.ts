/**
 * Unit tests for argument hint derivation and implies chain validation.
 */

import { describe, expect, test } from "bun:test";
import {
	deriveArgumentHint,
	validateImpliesChains,
} from "../../build/arguments.js";
import type { ArgumentDefinition } from "../../build/models.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeArg = (
	overrides: Partial<ArgumentDefinition> & { name: string },
): ArgumentDefinition => ({
	type: "string",
	required: false,
	description: "test",
	...overrides,
});

// ---------------------------------------------------------------------------
// deriveArgumentHint
// ---------------------------------------------------------------------------

describe("deriveArgumentHint", () => {
	test("returns empty string for empty array", () => {
		expect(deriveArgumentHint([])).toBe("");
	});

	test("required string renders as <lower-kebab-case>", () => {
		const hint = deriveArgumentHint([
			makeArg({ name: "FEATURE_ID", type: "string", required: true }),
		]);
		expect(hint).toBe("<feature-id>");
	});

	test("optional string renders as [lower-kebab-case]", () => {
		const hint = deriveArgumentHint([
			makeArg({ name: "REQUIREMENTS", type: "string", required: false }),
		]);
		expect(hint).toBe("[requirements]");
	});

	test("optional boolean renders as [--lower-kebab-case]", () => {
		const hint = deriveArgumentHint([
			makeArg({ name: "GIT_COMMIT", type: "boolean", required: false }),
		]);
		expect(hint).toBe("[--git-commit]");
	});

	test("variadic renders as [lower-kebab-case...]", () => {
		const hint = deriveArgumentHint([
			makeArg({
				name: "FILE_PATHS",
				type: "string",
				required: false,
				variadic: true,
			}),
		]);
		expect(hint).toBe("[file-paths...]");
	});

	test("variadic overrides required bracket style", () => {
		const hint = deriveArgumentHint([
			makeArg({
				name: "FILE_PATHS",
				type: "string",
				required: true,
				variadic: true,
			}),
		]);
		expect(hint).toBe("[file-paths...]");
	});

	test("required enum renders as <lower-kebab-case>", () => {
		const hint = deriveArgumentHint([
			makeArg({
				name: "PLATFORM",
				type: "enum",
				required: true,
				enum_values: ["opencode", "codex", "claude-code"],
			}),
		]);
		expect(hint).toBe("<platform>");
	});

	test("optional enum renders as [lower-kebab-case]", () => {
		const hint = deriveArgumentHint([
			makeArg({
				name: "PLATFORM",
				type: "enum",
				required: false,
				enum_values: ["opencode", "codex"],
			}),
		]);
		expect(hint).toBe("[platform]");
	});

	test("multiple arguments produce space-separated tokens", () => {
		const hint = deriveArgumentHint([
			makeArg({ name: "FEATURE_ID", type: "string", required: true }),
			makeArg({ name: "REQUIREMENTS", type: "string", required: false }),
			makeArg({ name: "AFK", type: "boolean", required: false }),
			makeArg({ name: "GIT_COMMIT", type: "boolean", required: false }),
		]);
		expect(hint).toBe("<feature-id> [requirements] [--afk] [--git-commit]");
	});

	test("UPPER_SNAKE_CASE transforms to lower-kebab-case", () => {
		const hint = deriveArgumentHint([
			makeArg({
				name: "MY_LONG_PARAMETER_NAME",
				type: "string",
				required: true,
			}),
		]);
		expect(hint).toBe("<my-long-parameter-name>");
	});

	test("single-word name transforms correctly", () => {
		const hint = deriveArgumentHint([
			makeArg({ name: "CONTEXT", type: "string", required: false }),
		]);
		expect(hint).toBe("[context]");
	});
});

// ---------------------------------------------------------------------------
// validateImpliesChains
// ---------------------------------------------------------------------------

describe("validateImpliesChains", () => {
	test("returns empty array for args without implies", () => {
		const errors = validateImpliesChains([
			makeArg({ name: "A", type: "boolean" }),
			makeArg({ name: "B", type: "boolean" }),
		]);
		expect(errors).toEqual([]);
	});

	test("returns empty array for valid implies chain", () => {
		const errors = validateImpliesChains([
			makeArg({ name: "GIT_PR", type: "boolean", implies: ["GIT_PUSH"] }),
			makeArg({
				name: "GIT_PUSH",
				type: "boolean",
				implies: ["GIT_COMMIT"],
			}),
			makeArg({ name: "GIT_COMMIT", type: "boolean" }),
		]);
		expect(errors).toEqual([]);
	});

	test("detects dangling reference", () => {
		const errors = validateImpliesChains([
			makeArg({
				name: "GIT_PR",
				type: "boolean",
				implies: ["NONEXISTENT"],
			}),
		]);
		expect(errors).toHaveLength(1);
		expect(errors[0].type).toBe("dangling");
		expect(errors[0].argument).toBe("GIT_PR");
		expect(errors[0].target).toBe("NONEXISTENT");
	});

	test("detects multiple dangling references", () => {
		const errors = validateImpliesChains([
			makeArg({
				name: "FLAG_A",
				type: "boolean",
				implies: ["MISSING_1", "MISSING_2"],
			}),
		]);
		const danglingErrors = errors.filter((e) => e.type === "dangling");
		expect(danglingErrors).toHaveLength(2);
	});

	test("detects direct circular chain (A -> B -> A)", () => {
		const errors = validateImpliesChains([
			makeArg({ name: "A", type: "boolean", implies: ["B"] }),
			makeArg({ name: "B", type: "boolean", implies: ["A"] }),
		]);
		const circularErrors = errors.filter((e) => e.type === "circular");
		expect(circularErrors.length).toBeGreaterThanOrEqual(1);
		expect(circularErrors[0].type).toBe("circular");
	});

	test("detects self-referencing implies", () => {
		const errors = validateImpliesChains([
			makeArg({ name: "SELF", type: "boolean", implies: ["SELF"] }),
		]);
		const circularErrors = errors.filter((e) => e.type === "circular");
		expect(circularErrors.length).toBeGreaterThanOrEqual(1);
	});

	test("detects longer circular chain (A -> B -> C -> A)", () => {
		const errors = validateImpliesChains([
			makeArg({ name: "A", type: "boolean", implies: ["B"] }),
			makeArg({ name: "B", type: "boolean", implies: ["C"] }),
			makeArg({ name: "C", type: "boolean", implies: ["A"] }),
		]);
		const circularErrors = errors.filter((e) => e.type === "circular");
		expect(circularErrors.length).toBeGreaterThanOrEqual(1);
		expect(circularErrors[0].chain).toBeDefined();
	});

	test("passes valid diamond-shaped implies (no cycle)", () => {
		const errors = validateImpliesChains([
			makeArg({ name: "TOP", type: "boolean", implies: ["LEFT", "RIGHT"] }),
			makeArg({
				name: "LEFT",
				type: "boolean",
				implies: ["BOTTOM"],
			}),
			makeArg({
				name: "RIGHT",
				type: "boolean",
				implies: ["BOTTOM"],
			}),
			makeArg({ name: "BOTTOM", type: "boolean" }),
		]);
		expect(errors).toEqual([]);
	});

	test("reports both dangling and circular errors together", () => {
		const errors = validateImpliesChains([
			makeArg({
				name: "A",
				type: "boolean",
				implies: ["B", "MISSING"],
			}),
			makeArg({ name: "B", type: "boolean", implies: ["A"] }),
		]);
		const dangling = errors.filter((e) => e.type === "dangling");
		const circular = errors.filter((e) => e.type === "circular");
		expect(dangling.length).toBeGreaterThanOrEqual(1);
		expect(circular.length).toBeGreaterThanOrEqual(1);
	});

	test("handles args with empty implies array", () => {
		const errors = validateImpliesChains([
			makeArg({ name: "A", type: "boolean", implies: [] }),
			makeArg({ name: "B", type: "boolean" }),
		]);
		expect(errors).toEqual([]);
	});
});
