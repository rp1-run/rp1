/**
 * Unit tests for agent-tools input module.
 * Tests file reading and input source detection.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { readFromFile, readInput } from "../../agent-tools/input.js";
import {
	cleanupTempDir,
	createTempDir,
	expectTaskLeft,
	expectTaskRight,
	writeFixture,
} from "../helpers/index.js";

describe("input", () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await createTempDir("agent-tools-input");
	});

	afterEach(async () => {
		await cleanupTempDir(tempDir);
	});

	describe("readFromFile", () => {
		test("returns file content for existing file", async () => {
			const content = "```mermaid\ngraph TD\n  A --> B\n```";
			const filePath = await writeFixture(tempDir, "test.md", content);

			const result = await expectTaskRight(readFromFile(filePath));

			expect(result).toBe(content);
		});

		test("returns NotFoundError for missing file", async () => {
			const error = await expectTaskLeft(
				readFromFile(`${tempDir}/nonexistent.md`),
			);

			expect(error._tag).toBe("NotFoundError");
		});

		test("reads UTF-8 content correctly", async () => {
			const content = "# Unicode Test\n\nflowchart TD\n  A[Cafe] --> B";
			const filePath = await writeFixture(tempDir, "unicode.md", content);

			const result = await expectTaskRight(readFromFile(filePath));

			expect(result).toContain("Cafe");
		});

		test("reads large files", async () => {
			const lines = Array.from({ length: 1000 }, (_, i) => `Line ${i + 1}`);
			const content = lines.join("\n");
			const filePath = await writeFixture(tempDir, "large.md", content);

			const result = await expectTaskRight(readFromFile(filePath));

			expect(result.split("\n")).toHaveLength(1000);
		});

		test("preserves line endings", async () => {
			const content = "line1\nline2\nline3";
			const filePath = await writeFixture(tempDir, "lines.md", content);

			const result = await expectTaskRight(readFromFile(filePath));

			expect(result).toBe("line1\nline2\nline3");
		});
	});

	describe("readInput", () => {
		test("reads from file when filePath provided", async () => {
			const content = "graph TD\n  A --> B";
			const filePath = await writeFixture(tempDir, "diagram.md", content);

			const result = await expectTaskRight(readInput(filePath));

			expect(result.content).toBe(content);
			expect(result.source).toBe("file");
		});

		test("returns source as file when reading from file", async () => {
			const filePath = await writeFixture(tempDir, "test.md", "content");

			const result = await expectTaskRight(readInput(filePath));

			expect(result.source).toBe("file");
		});

		test("returns NotFoundError for missing file path", async () => {
			const error = await expectTaskLeft(
				readInput(`${tempDir}/missing-file.md`),
			);

			expect(error._tag).toBe("NotFoundError");
		});

		test("reads empty file successfully", async () => {
			const filePath = await writeFixture(tempDir, "empty.md", "");

			const result = await expectTaskRight(readInput(filePath));

			expect(result.content).toBe("");
		});
	});
});
