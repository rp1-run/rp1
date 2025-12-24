/**
 * Integration tests for mmd-validate tool.
 * Tests end-to-end validation using real browser and fixture files.
 */

import { beforeAll, describe, expect, it } from "bun:test";
import * as path from "node:path";
import * as E from "fp-ts/lib/Either.js";
import { extractMermaidBlocks } from "../../../agent-tools/mmd-validate/extractor.js";
import type { MmdValidateData } from "../../../agent-tools/mmd-validate/models.js";
import { validateDiagrams } from "../../../agent-tools/mmd-validate/validator.js";

const FIXTURES_DIR = path.join(import.meta.dir, "fixtures");
const MIXED_DIAGRAMS_PATH = path.join(FIXTURES_DIR, "mixed-diagrams.md");

describe("mmd-validate integration", () => {
	let fixtureContent: string;

	beforeAll(async () => {
		fixtureContent = await Bun.file(MIXED_DIAGRAMS_PATH).text();
	});

	it("should extract all 8 diagrams from mixed-diagrams.md", () => {
		const result = extractMermaidBlocks(fixtureContent);

		expect(E.isRight(result)).toBe(true);
		if (E.isRight(result)) {
			expect(result.right.length).toBe(8);

			// Verify diagram types are detected correctly
			const contents = result.right.map((b) => b.content);
			expect(contents[0]).toContain("flowchart TD");
			expect(contents[1]).toContain("sequenceDiagram");
			expect(contents[2]).toContain("classDiagram");
			expect(contents[3]).toContain("stateDiagram-v2");
			expect(contents[4]).toContain("erDiagram");
			expect(contents[5]).toContain("gantt");
			expect(contents[6]).toContain("pie title");
			expect(contents[7]).toContain("mindmap");
		}
	});

	it("should validate diagrams and identify 2 invalid ones", async () => {
		const extractResult = extractMermaidBlocks(fixtureContent);
		expect(E.isRight(extractResult)).toBe(true);
		if (!E.isRight(extractResult)) return;

		const blocks = extractResult.right;
		const startTime = performance.now();
		const validateResult = await validateDiagrams(blocks, 60000)();
		const endTime = performance.now();
		const duration = endTime - startTime;

		expect(E.isRight(validateResult)).toBe(true);
		if (!E.isRight(validateResult)) return;

		const data: MmdValidateData = validateResult.right;

		// Verify summary counts
		expect(data.summary.total).toBe(8);
		expect(data.summary.valid).toBe(6);
		expect(data.summary.invalid).toBe(2);

		// Verify which diagrams are invalid (index 3 and 6)
		const invalidIndices = data.diagrams
			.filter((d) => !d.valid)
			.map((d) => d.index);
		expect(invalidIndices).toContain(3); // State diagram
		expect(invalidIndices).toContain(6); // Pie chart

		// Verify valid diagrams
		const validIndices = data.diagrams
			.filter((d) => d.valid)
			.map((d) => d.index);
		expect(validIndices).toEqual([0, 1, 2, 4, 5, 7]);

		// Log benchmark timing
		console.log(
			`\n  Benchmark: 8 diagrams validated in ${duration.toFixed(0)}ms`,
		);
		console.log(`  Average: ${(duration / 8).toFixed(0)}ms per diagram`);
	});

	it("should include error details for invalid diagrams", async () => {
		const extractResult = extractMermaidBlocks(fixtureContent);
		expect(E.isRight(extractResult)).toBe(true);
		if (!E.isRight(extractResult)) return;

		const blocks = extractResult.right;
		const validateResult = await validateDiagrams(blocks, 60000)();

		expect(E.isRight(validateResult)).toBe(true);
		if (!E.isRight(validateResult)) return;

		const data = validateResult.right;

		// Check invalid diagrams have error information
		const invalidDiagrams = data.diagrams.filter((d) => !d.valid);

		for (const diagram of invalidDiagrams) {
			expect(diagram.errors).toBeDefined();
			expect(diagram.errors?.length).toBeGreaterThan(0);
			expect(diagram.errors?.[0].message).toBeTruthy();
			expect(diagram.errors?.[0].diagramIndex).toBe(diagram.index);
		}
	});

	it("should preserve line number information", async () => {
		const extractResult = extractMermaidBlocks(fixtureContent);
		expect(E.isRight(extractResult)).toBe(true);
		if (!E.isRight(extractResult)) return;

		const blocks = extractResult.right;
		const validateResult = await validateDiagrams(blocks, 60000)();

		expect(E.isRight(validateResult)).toBe(true);
		if (!E.isRight(validateResult)) return;

		const data = validateResult.right;

		// All diagrams should have startLine set
		for (const diagram of data.diagrams) {
			expect(diagram.startLine).toBeGreaterThan(0);
		}

		// First diagram should start around line 9 (after markdown header)
		expect(data.diagrams[0].startLine).toBeGreaterThanOrEqual(8);
		expect(data.diagrams[0].startLine).toBeLessThanOrEqual(12);
	});
});
