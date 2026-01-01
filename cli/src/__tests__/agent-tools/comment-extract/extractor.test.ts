/**
 * Unit tests for comment-extract extractor module.
 * Tests comment extraction logic from source files.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
	extractComments,
	extractCommentsFromFiles,
} from "../../../agent-tools/comment-extract/extractor.js";
import {
	cleanupTempDir,
	createTempDir,
	expectRight,
	writeFixture,
} from "../../helpers/index.js";

describe("comment-extract extractor", () => {
	let tempDir: string;

	beforeAll(async () => {
		tempDir = await createTempDir("comment-extract-test");
	});

	afterAll(async () => {
		await cleanupTempDir(tempDir);
	});

	describe("extractComments", () => {
		test("extracts single-line JavaScript comments", async () => {
			const filePath = await writeFixture(
				tempDir,
				"single.js",
				`const x = 1;
// This is a comment
const y = 2; // inline comment
const z = 3;
`,
			);

			const result = await extractComments(filePath)();
			const comments = expectRight(result);

			expect(comments).toHaveLength(2);
			expect(comments[0].line).toBe(2);
			expect(comments[0].type).toBe("single");
			expect(comments[0].content).toContain("This is a comment");
			expect(comments[1].line).toBe(3);
			expect(comments[1].content).toContain("inline comment");
		});

		test("extracts multi-line JavaScript comments", async () => {
			const filePath = await writeFixture(
				tempDir,
				"multi.js",
				`const x = 1;
/* This is
   a multi-line
   comment */
const y = 2;
`,
			);

			const result = await extractComments(filePath)();
			const comments = expectRight(result);

			expect(comments).toHaveLength(1);
			expect(comments[0].line).toBe(2);
			expect(comments[0].type).toBe("multi");
			expect(comments[0].content).toContain("multi-line");
		});

		test("extracts single-line /* */ comments on one line", async () => {
			const filePath = await writeFixture(
				tempDir,
				"single-multi.js",
				`const x = 1;
/* single line block comment */
const y = 2;
`,
			);

			const result = await extractComments(filePath)();
			const comments = expectRight(result);

			expect(comments).toHaveLength(1);
			expect(comments[0].type).toBe("multi");
			expect(comments[0].content).toContain("single line block comment");
		});

		test("extracts Python hash comments", async () => {
			const filePath = await writeFixture(
				tempDir,
				"comments.py",
				`x = 1
# This is a Python comment
y = 2  # inline comment
`,
			);

			const result = await extractComments(filePath)();
			const comments = expectRight(result);

			expect(comments).toHaveLength(2);
			expect(comments[0].content).toContain("Python comment");
			expect(comments[1].content).toContain("inline comment");
		});

		test("ignores Python shebang", async () => {
			const filePath = await writeFixture(
				tempDir,
				"shebang.py",
				`#!/usr/bin/env python3
# This is a real comment
x = 1
`,
			);

			const result = await extractComments(filePath)();
			const comments = expectRight(result);

			expect(comments).toHaveLength(1);
			expect(comments[0].content).toContain("real comment");
			expect(comments[0].line).toBe(2);
		});

		test("extracts HTML comments", async () => {
			const filePath = await writeFixture(
				tempDir,
				"comments.html",
				`<html>
<!-- This is an HTML comment -->
<body>
<!--
  Multi-line
  HTML comment
-->
</body>
</html>
`,
			);

			const result = await extractComments(filePath)();
			const comments = expectRight(result);

			expect(comments).toHaveLength(2);
			expect(comments[0].content).toContain("HTML comment");
			expect(comments[1].content).toContain("Multi-line");
		});

		test("provides context before and after comments", async () => {
			const filePath = await writeFixture(
				tempDir,
				"context.js",
				`const before = 1;
// Comment here
const after = 2;
`,
			);

			const result = await extractComments(filePath)();
			const comments = expectRight(result);

			expect(comments).toHaveLength(1);
			expect(comments[0].contextBefore).toBe("const before = 1;");
			expect(comments[0].contextAfter).toBe("const after = 2;");
		});

		test("returns empty array for unsupported file types", async () => {
			const filePath = await writeFixture(
				tempDir,
				"data.json",
				'{"key": "value"}',
			);

			const result = await extractComments(filePath)();
			const comments = expectRight(result);

			expect(comments).toHaveLength(0);
		});

		test("returns empty array for files without comments", async () => {
			const filePath = await writeFixture(
				tempDir,
				"no-comments.js",
				`const x = 1;
const y = 2;
`,
			);

			const result = await extractComments(filePath)();
			const comments = expectRight(result);

			expect(comments).toHaveLength(0);
		});

		test("filters comments by line number when lineFilter provided", async () => {
			const filePath = await writeFixture(
				tempDir,
				"filtered.js",
				`// Line 1 comment
// Line 2 comment
// Line 3 comment
// Line 4 comment
`,
			);

			const lineFilter = new Set([2, 4]);
			const result = await extractComments(filePath, lineFilter)();
			const comments = expectRight(result);

			expect(comments).toHaveLength(2);
			expect(comments[0].line).toBe(2);
			expect(comments[1].line).toBe(4);
		});

		test("handles TypeScript files", async () => {
			const filePath = await writeFixture(
				tempDir,
				"types.ts",
				`interface User {
  // User's name
  name: string;
  /** User's age */
  age: number;
}
`,
			);

			const result = await extractComments(filePath)();
			const comments = expectRight(result);

			expect(comments).toHaveLength(2);
			expect(comments.some((c) => c.content.includes("User's name"))).toBe(
				true,
			);
			expect(comments.some((c) => c.content.includes("User's age"))).toBe(true);
		});

		test("handles Vue files with multiple comment styles", async () => {
			const filePath = await writeFixture(
				tempDir,
				"component.vue",
				`<template>
  <!-- Template comment -->
  <div></div>
</template>
<script>
// Script comment
export default {}
</script>
`,
			);

			const result = await extractComments(filePath)();
			const comments = expectRight(result);

			expect(comments).toHaveLength(2);
			expect(comments.some((c) => c.content.includes("Template comment"))).toBe(
				true,
			);
			expect(comments.some((c) => c.content.includes("Script comment"))).toBe(
				true,
			);
		});
	});

	describe("extractCommentsFromFiles", () => {
		test("extracts comments from multiple files", async () => {
			const jsFile = await writeFixture(
				tempDir,
				"batch1.js",
				"// JS comment\nconst x = 1;",
			);
			const tsFile = await writeFixture(
				tempDir,
				"batch1.ts",
				"// TS comment\nconst y: number = 2;",
			);

			const result = await extractCommentsFromFiles([jsFile, tsFile])();
			const { comments, filesScanned } = expectRight(result);

			expect(filesScanned).toBe(2);
			expect(comments).toHaveLength(2);
			expect(comments.some((c) => c.content.includes("JS comment"))).toBe(true);
			expect(comments.some((c) => c.content.includes("TS comment"))).toBe(true);
		});

		test("filters out unsupported file types", async () => {
			const jsFile = await writeFixture(
				tempDir,
				"batch2.js",
				"// JS comment\nconst x = 1;",
			);
			const jsonFile = await writeFixture(
				tempDir,
				"batch2.json",
				'{"key": "value"}',
			);

			const result = await extractCommentsFromFiles([jsFile, jsonFile])();
			const { comments, filesScanned } = expectRight(result);

			expect(filesScanned).toBe(1);
			expect(comments).toHaveLength(1);
		});

		test("applies changedLines filter per file", async () => {
			const file1 = await writeFixture(
				tempDir,
				"changed1.js",
				`// Line 1
// Line 2
// Line 3
`,
			);
			const file2 = await writeFixture(
				tempDir,
				"changed2.js",
				`// Line 1
// Line 2
`,
			);

			const changedLines = new Map<string, ReadonlySet<number>>([
				[file1, new Set([2])],
				[file2, new Set([1])],
			]);

			const result = await extractCommentsFromFiles(
				[file1, file2],
				changedLines,
			)();
			const { comments } = expectRight(result);

			expect(comments).toHaveLength(2);
			expect(comments.find((c) => c.file === file1)?.line).toBe(2);
			expect(comments.find((c) => c.file === file2)?.line).toBe(1);
		});

		test("returns empty for empty file list", async () => {
			const result = await extractCommentsFromFiles([])();
			const { comments, filesScanned } = expectRight(result);

			expect(filesScanned).toBe(0);
			expect(comments).toHaveLength(0);
		});
	});
});
