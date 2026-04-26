/**
 * Unit tests for the commands module.
 * Tests suite name extraction and pass rate detection.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import * as E from "fp-ts/Either";
import {
	attestFromOutput,
	detectPassRate,
	extractSuiteFromFilename,
} from "../commands.js";

const evalRoot = join(import.meta.dirname, "..", "..", "..");
const outputPath = "output/rp1-dev-coverage-skill.json";
const skillPath = "dist/claude-code/dev/skills/coverage-skill/SKILL.md";
const nestedManifestDir = join(evalRoot, "evals");

async function writeJson(path: string, value: unknown): Promise<void> {
	await mkdir(join(path, ".."), { recursive: true });
	await writeFile(path, JSON.stringify(value, null, 2), "utf-8");
}

async function writePassingOutput(path: string): Promise<void> {
	await writeJson(path, {
		evalId: "coverage-skill",
		results: {
			version: 3,
			timestamp: "2026-04-26T00:00:00.000Z",
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
			],
		},
	});
}

async function writeFailingOutput(path: string): Promise<void> {
	await writeJson(path, {
		evalId: "coverage-skill",
		results: {
			version: 3,
			timestamp: "2026-04-26T00:00:00.000Z",
			prompts: [
				{
					id: "prompt-1",
					metrics: {
						score: 0,
						testPassCount: 0,
						testFailCount: 1,
						testErrorCount: 0,
					},
				},
			],
		},
	});
}

async function writeSkillFile(): Promise<void> {
	await mkdir(join(skillPath, ".."), { recursive: true });
	await writeFile(
		skillPath,
		[
			"---",
			"name: coverage-skill",
			"metadata:",
			"  version: 1.2.3",
			"---",
			"",
			"# Coverage Skill",
			"",
			"Standalone prompt body.",
		].join("\n"),
		"utf-8",
	);
}

describe("attestFromOutput", () => {
	const originalCwd = process.cwd();

	beforeEach(async () => {
		process.chdir(evalRoot);
		await rm(outputPath, { force: true });
		await rm(join(evalRoot, "dist"), { recursive: true, force: true });
		await rm(nestedManifestDir, { recursive: true, force: true });
	});

	afterEach(async () => {
		await rm(outputPath, { force: true });
		await rm(join(evalRoot, "dist"), { recursive: true, force: true });
		await rm(nestedManifestDir, { recursive: true, force: true });
		process.chdir(originalCwd);
	});

	test("updates manifest from passing output", async () => {
		await writePassingOutput(outputPath);
		await writeSkillFile();

		const result = await attestFromOutput(outputPath, "claude-code")();

		expect(E.isRight(result)).toBe(true);
		if (E.isRight(result)) {
			expect(result.right.updated).toBe(true);
			expect(result.right.message).toBe(
				"Attestation updated for rp1-dev:coverage-skill@claude-code",
			);
		}

		const manifest = JSON.parse(
			await readFile(join(nestedManifestDir, "attestation.json"), "utf-8"),
		);
		const attestation = manifest.skills["rp1-dev:coverage-skill@claude-code"];

		expect(attestation.version).toBe("1.2.3");
		expect(attestation.platform).toBe("claude-code");
		expect(attestation.last_eval.result_file).toBe(outputPath);
		expect(attestation.last_eval.timestamp).toBe("2026-04-26T00:00:00.000Z");
		expect(attestation.prompt_hash).toStartWith("sha256:");
		expect(manifest.files[skillPath]).toBe(attestation.prompt_hash);
	});

	test("does not update manifest from failing output", async () => {
		await writeFailingOutput(outputPath);

		const result = await attestFromOutput(outputPath, "claude-code")();

		expect(E.isRight(result)).toBe(true);
		if (E.isRight(result)) {
			expect(result.right.updated).toBe(false);
			expect(result.right.message).toBe(
				"Eval suite rp1-dev/coverage-skill did not pass (failures or errors detected). Attestation not updated.",
			);
		}
	});

	test("returns an error when output file is missing", async () => {
		const result = await attestFromOutput(outputPath, "claude-code")();

		expect(E.isLeft(result)).toBe(true);
		if (E.isLeft(result)) {
			expect(result.left.message).toContain("Output file not found");
		}
	});
});

describe("extractSuiteFromFilename", () => {
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

	// Tier-prefixed filenames (from run-core-evals / run-advisory-evals)
	test("strips core- tier prefix", () => {
		const result = extractSuiteFromFilename(
			"evals/output/core-rp1-dev-build-fast.json",
		);
		expect(result).toBe("rp1-dev/build-fast");
	});

	test("strips advisory- tier prefix", () => {
		const result = extractSuiteFromFilename(
			"output/advisory-rp1-dev-build-fast.json",
		);
		expect(result).toBe("rp1-dev/build-fast");
	});

	test("strips core- tier prefix with absolute path", () => {
		const result = extractSuiteFromFilename(
			"/Users/prem/Development/rp1/evals/output/core-rp1-base-knowledge-load.json",
		);
		expect(result).toBe("rp1-base/knowledge-load");
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
