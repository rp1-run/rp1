/**
 * Unit tests for the doc_id utility.
 * Tests markdown frontmatter injection, idempotent reuse,
 * and non-markdown passthrough behavior.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { readFile, rm } from "node:fs/promises";
import {
	generateDocId,
	injectFrontmatter,
	isMarkdownFile,
	parseFrontmatter,
	resolveDocId,
} from "../../../agent-tools/emit/doc-id.js";
import {
	createTempDir,
	expectTaskRight,
	writeFixture,
} from "../../helpers/index.js";

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

	describe("resolveDocId", () => {
		test("creates frontmatter for markdown with no frontmatter", async () => {
			const filePath = await writeFixture(
				tempDir,
				"no-frontmatter.md",
				"# My Document\n\nSome content here.",
			);

			const result = await expectTaskRight(resolveDocId(filePath));

			expect(result.isNew).toBe(true);
			expect(result.docId).toMatch(UUID_V4_REGEX);

			const updatedContent = await readFile(filePath, "utf-8");
			expect(updatedContent).toContain("rp1_doc_id:");
			expect(updatedContent).toContain(result.docId);
			expect(updatedContent).toContain("# My Document");
		});

		test("adds rp1_doc_id to existing frontmatter", async () => {
			const filePath = await writeFixture(
				tempDir,
				"existing-frontmatter.md",
				"---\ntitle: Design Doc\nauthor: Test\n---\n# Design\n\nDetails here.",
			);

			const result = await expectTaskRight(resolveDocId(filePath));

			expect(result.isNew).toBe(true);
			expect(result.docId).toMatch(UUID_V4_REGEX);

			const updatedContent = await readFile(filePath, "utf-8");
			expect(updatedContent).toContain("rp1_doc_id:");
			expect(updatedContent).toContain("title: Design Doc");
		});

		test("returns existing rp1_doc_id without modifying file", async () => {
			const existingId = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
			const originalContent = `---\nrp1_doc_id: ${existingId}\ntitle: Existing\n---\n# Content`;
			const filePath = await writeFixture(
				tempDir,
				"has-doc-id.md",
				originalContent,
			);

			const result = await expectTaskRight(resolveDocId(filePath));

			expect(result.isNew).toBe(false);
			expect(result.docId).toBe(existingId);

			const fileContent = await readFile(filePath, "utf-8");
			expect(fileContent).toBe(originalContent);
		});

		test("generates doc_id for non-markdown without file modification", async () => {
			const originalContent = "const x = 42;\nexport { x };\n";
			const filePath = await writeFixture(
				tempDir,
				"script.ts",
				originalContent,
			);

			const result = await expectTaskRight(resolveDocId(filePath));

			expect(result.isNew).toBe(true);
			expect(result.docId).toMatch(UUID_V4_REGEX);

			const fileContent = await readFile(filePath, "utf-8");
			expect(fileContent).toBe(originalContent);
		});

		test("generated doc_id is a valid UUID v4", async () => {
			const filePath = await writeFixture(
				tempDir,
				"uuid-test.md",
				"# UUID Test",
			);

			const result = await expectTaskRight(resolveDocId(filePath));
			expect(result.docId).toMatch(UUID_V4_REGEX);
		});
	});
});
