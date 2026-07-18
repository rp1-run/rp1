/**
 * Unit tests for the doc_id utility.
 * Tests markdown frontmatter injection, idempotent reuse,
 * and non-markdown passthrough behavior.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import {
	generateDocId,
	injectFrontmatter,
	isMarkdownFile,
	overwriteDocIdFrontmatter,
	parseFrontmatter,
	readFrontmatterDocId,
} from "../../../agent-tools/emit/doc-id.js";
import { createTempDir, writeFixture } from "../../helpers/index.js";

const UUID_V4_REGEX =
	/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe("doc-id utility", () => {
	let tempDir: string;

	beforeAll(async () => {
		tempDir = await createTempDir("doc-id");
	});

	afterAll(async () => {
		await rm(tempDir, { recursive: true, force: true });
	});

	describe("isMarkdownFile", () => {
		test("returns true for .md files", () => {
			expect(isMarkdownFile("design.md")).toBe(true);
		});

		test("returns true for .mdx files", () => {
			expect(isMarkdownFile("component.mdx")).toBe(true);
		});

		test("returns false for non-markdown files", () => {
			expect(isMarkdownFile("script.ts")).toBe(false);
			expect(isMarkdownFile("image.png")).toBe(false);
			expect(isMarkdownFile("data.json")).toBe(false);
		});

		test("is case-insensitive for extension", () => {
			expect(isMarkdownFile("README.MD")).toBe(true);
			expect(isMarkdownFile("notes.Md")).toBe(true);
		});
	});

	describe("generateDocId", () => {
		test("produces a valid UUID v4", () => {
			const id = generateDocId();
			expect(id).toMatch(UUID_V4_REGEX);
		});

		test("produces unique values on successive calls", () => {
			const ids = new Set(Array.from({ length: 10 }, () => generateDocId()));
			expect(ids.size).toBe(10);
		});
	});

	describe("parseFrontmatter", () => {
		test("parses valid frontmatter", () => {
			const content = "---\ntitle: Test\nauthor: User\n---\n# Body";
			const result = parseFrontmatter(content);

			expect(result).not.toBeNull();
			expect(result?.frontmatter.title).toBe("Test");
			expect(result?.frontmatter.author).toBe("User");
			expect(result?.body).toBe("\n# Body");
		});

		test("returns null for content without frontmatter", () => {
			const content = "# Just a heading\n\nSome content.";
			const result = parseFrontmatter(content);

			expect(result).toBeNull();
		});

		test("handles empty frontmatter block", () => {
			const content = "---\n\n---\n# Body";
			const result = parseFrontmatter(content);

			expect(result).not.toBeNull();
			expect(result?.body).toBe("\n# Body");
		});
	});

	describe("injectFrontmatter", () => {
		test("prepends frontmatter to content without any", () => {
			const content = "# Heading\n\nBody text.";
			const docId = "test-uuid-001";
			const result = injectFrontmatter(content, docId);

			expect(result.isNew).toBe(true);
			expect(result.content).toContain("---");
			expect(result.content).toContain("rp1_doc_id: test-uuid-001");
			expect(result.content).toContain("# Heading");
		});

		test("adds rp1_doc_id to existing frontmatter", () => {
			const content = "---\ntitle: Design\n---\n# Body";
			const docId = "test-uuid-002";
			const result = injectFrontmatter(content, docId);

			expect(result.isNew).toBe(true);
			expect(result.content).toContain("rp1_doc_id: test-uuid-002");
			expect(result.content).toContain("title: Design");
		});

		test("returns content unchanged when rp1_doc_id already exists", () => {
			const content =
				"---\nrp1_doc_id: existing-uuid\ntitle: Design\n---\n# Body";
			const docId = "new-uuid-should-not-be-used";
			const result = injectFrontmatter(content, docId);

			expect(result.isNew).toBe(false);
			expect(result.content).toBe(content);
		});
	});

	describe("readFrontmatterDocId", () => {
		test("returns the rp1_doc_id from markdown frontmatter without modifying the file", async () => {
			const existingId = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
			const originalContent = `---\nrp1_doc_id: ${existingId}\ntitle: Existing\n---\n# Content`;
			const filePath = await writeFixture(
				tempDir,
				"peek-has-doc-id.md",
				originalContent,
			);

			expect(await readFrontmatterDocId(filePath)).toBe(existingId);

			const fileContent = await readFile(filePath, "utf-8");
			expect(fileContent).toBe(originalContent);
		});

		test("returns null for markdown without frontmatter and never writes", async () => {
			const originalContent = "# My Document\n\nSome content here.";
			const filePath = await writeFixture(
				tempDir,
				"peek-no-frontmatter.md",
				originalContent,
			);

			expect(await readFrontmatterDocId(filePath)).toBeNull();

			const fileContent = await readFile(filePath, "utf-8");
			expect(fileContent).toBe(originalContent);
		});

		test("returns null for frontmatter without rp1_doc_id", async () => {
			const filePath = await writeFixture(
				tempDir,
				"peek-other-frontmatter.md",
				"---\ntitle: Design Doc\n---\n# Design",
			);

			expect(await readFrontmatterDocId(filePath)).toBeNull();
		});

		test("returns null for non-markdown files", async () => {
			const filePath = await writeFixture(
				tempDir,
				"peek-script.ts",
				"const x = 42;\n",
			);

			expect(await readFrontmatterDocId(filePath)).toBeNull();
		});

		test("returns null for missing files", async () => {
			expect(
				await readFrontmatterDocId(join(tempDir, "does-not-exist.md")),
			).toBeNull();
		});
	});

	describe("overwriteDocIdFrontmatter", () => {
		test("prepends frontmatter to markdown without any", async () => {
			const filePath = await writeFixture(
				tempDir,
				"stamp-no-frontmatter.md",
				"# My Document\n\nSome content here.",
			);

			await overwriteDocIdFrontmatter(filePath, "doc-stamped");

			const content = await readFile(filePath, "utf-8");
			expect(content).toContain("rp1_doc_id: doc-stamped");
			expect(content).toContain("# My Document");
		});

		test("adds rp1_doc_id to existing frontmatter", async () => {
			const filePath = await writeFixture(
				tempDir,
				"stamp-existing-frontmatter.md",
				"---\ntitle: Design Doc\n---\n# Design\n",
			);

			await overwriteDocIdFrontmatter(filePath, "doc-added");

			const content = await readFile(filePath, "utf-8");
			expect(content).toContain("rp1_doc_id: doc-added");
			expect(content).toContain("title: Design Doc");
		});

		test("replaces a mismatched rp1_doc_id", async () => {
			const filePath = await writeFixture(
				tempDir,
				"stamp-mismatch.md",
				"---\nrp1_doc_id: doc-loser\ntitle: Kept\n---\n# Body\n",
			);

			await overwriteDocIdFrontmatter(filePath, "doc-winner");

			const content = await readFile(filePath, "utf-8");
			expect(content).toContain("rp1_doc_id: doc-winner");
			expect(content).not.toContain("doc-loser");
			expect(content).toContain("title: Kept");
		});

		test("leaves a matching rp1_doc_id untouched", async () => {
			const originalContent = "---\nrp1_doc_id: doc-same\n---\n# Body\n";
			const filePath = await writeFixture(
				tempDir,
				"stamp-same.md",
				originalContent,
			);

			await overwriteDocIdFrontmatter(filePath, "doc-same");

			const content = await readFile(filePath, "utf-8");
			expect(content).toBe(originalContent);
		});

		test("never touches non-markdown files", async () => {
			const originalContent = "const x = 42;\n";
			const filePath = await writeFixture(
				tempDir,
				"stamp-script.ts",
				originalContent,
			);

			await overwriteDocIdFrontmatter(filePath, "doc-ignored");

			const content = await readFile(filePath, "utf-8");
			expect(content).toBe(originalContent);
		});
	});
});
