/**
 * Unit tests for the commands module.
 * Tests suite name extraction and pass rate detection.
 */

import { describe, expect, test } from "bun:test";
import { detectPassRate, extractSuiteFromFilename } from "../commands.js";

describe("extractSuiteFromFilename", () => {
	// Fixed filename format (no timestamp)
	test("extracts suite from fixed filename without timestamp", () => {
		const result = extractSuiteFromFilename("output/rp1-dev-build-fast.json");
		expect(result).toBe("rp1-dev/build-fast");
	});

	test("extracts suite from fixed filename with absolute path", () => {
		const result = extractSuiteFromFilename(
			"/Users/prem/Development/rp1/evals/output/rp1-dev-build.json",
		);
		expect(result).toBe("rp1-dev/build");
	});

	test("handles fixed filename for base plugin", () => {
		const result = extractSuiteFromFilename("rp1-base-knowledge-load.json");
		expect(result).toBe("rp1-base/knowledge-load");
	});

	test("handles fixed filename for utils plugin", () => {
		const result = extractSuiteFromFilename("rp1-utils-prompt-writer.json");
		expect(result).toBe("rp1-utils/prompt-writer");
	});

	// Legacy timestamped filename format (backwards compatibility)
	test("extracts suite from legacy filename with timestamp", () => {
		const result = extractSuiteFromFilename(
			"output/rp1-dev-build-fast-2026-01-22T10-30-00.json",
		);
		expect(result).toBe("rp1-dev/build-fast");
	});

	test("extracts suite from absolute path with timestamp", () => {
		const result = extractSuiteFromFilename(
			"/Users/prem/Development/rp1/evals/output/rp1-dev-build-fast-2026-01-19T03-37-37.json",
		);
		expect(result).toBe("rp1-dev/build-fast");
	});

	test("extracts suite from filename with different timestamp", () => {
		const result = extractSuiteFromFilename(
			"rp1-base-knowledge-load-2025-12-31T23-59-59.json",
		);
		expect(result).toBe("rp1-base/knowledge-load");
	});

	test("handles nested path with timestamp", () => {
		const result = extractSuiteFromFilename(
			"some/nested/path/rp1-utils-prompt-writer-2026-06-15T08-00-00.json",
		);
		expect(result).toBe("rp1-utils/prompt-writer");
	});

	test("handles filename without directory prefix", () => {
		const result = extractSuiteFromFilename(
			"rp1-dev-feature-architect-2026-01-01T00-00-00.json",
		);
		expect(result).toBe("rp1-dev/feature-architect");
	});
});

describe("detectPassRate", () => {
	test("returns true for single prompt with all passing tests", () => {
		const output = {
			evalId: "test-eval",
			results: {
				version: 3,
				timestamp: "2026-01-22T10:30:00.000Z",
				prompts: [
					{
						id: "prompt-1",
						metrics: {
							score: 2,
							testPassCount: 2,
							testFailCount: 0,
							testErrorCount: 0,
						},
					},
				],
			},
		};
		expect(detectPassRate(output)).toBe(true);
	});

	test("returns true for multiple prompts all passing", () => {
		const output = {
			evalId: "test-eval",
			results: {
				version: 3,
				timestamp: "2026-01-22T10:30:00.000Z",
				prompts: [
					{
						id: "prompt-1",
						metrics: {
							score: 1,
							testPassCount: 1,
							testFailCount: 0,
							testErrorCount: 0,
						},
					},
					{
						id: "prompt-2",
						metrics: {
							score: 3,
							testPassCount: 3,
							testFailCount: 0,
							testErrorCount: 0,
						},
					},
				],
			},
		};
		expect(detectPassRate(output)).toBe(true);
	});

	test("returns false when any prompt has failures", () => {
		const output = {
			evalId: "test-eval",
			results: {
				version: 3,
				timestamp: "2026-01-22T10:30:00.000Z",
				prompts: [
					{
						id: "prompt-1",
						metrics: {
							score: 1,
							testPassCount: 1,
							testFailCount: 0,
							testErrorCount: 0,
						},
					},
					{
						id: "prompt-2",
						metrics: {
							score: 0,
							testPassCount: 0,
							testFailCount: 1,
							testErrorCount: 0,
						},
					},
				],
			},
		};
		expect(detectPassRate(output)).toBe(false);
	});

	test("returns false when any prompt has errors", () => {
		const output = {
			evalId: "test-eval",
			results: {
				version: 3,
				timestamp: "2026-01-22T10:30:00.000Z",
				prompts: [
					{
						id: "prompt-1",
						metrics: {
							score: 1,
							testPassCount: 1,
							testFailCount: 0,
							testErrorCount: 1,
						},
					},
				],
			},
		};
		expect(detectPassRate(output)).toBe(false);
	});

	test("returns false when prompt has both failures and errors", () => {
		const output = {
			evalId: "test-eval",
			results: {
				version: 3,
				timestamp: "2026-01-22T10:30:00.000Z",
				prompts: [
					{
						id: "prompt-1",
						metrics: {
							score: 0,
							testPassCount: 0,
							testFailCount: 2,
							testErrorCount: 1,
						},
					},
				],
			},
		};
		expect(detectPassRate(output)).toBe(false);
	});

	test("returns false for empty prompts array", () => {
		const output = {
			evalId: "test-eval",
			results: {
				version: 3,
				timestamp: "2026-01-22T10:30:00.000Z",
				prompts: [],
			},
		};
		expect(detectPassRate(output)).toBe(false);
	});

	test("returns false for undefined prompts", () => {
		const output = {
			evalId: "test-eval",
			results: {
				version: 3,
				timestamp: "2026-01-22T10:30:00.000Z",
				prompts: undefined as unknown as Array<{
					id: string;
					metrics: {
						score: number;
						testPassCount: number;
						testFailCount: number;
						testErrorCount: number;
					};
				}>,
			},
		};
		expect(detectPassRate(output)).toBe(false);
	});
});
