import { describe, expect, test } from "bun:test";
import * as E from "fp-ts/lib/Either.js";
import { extractFrontmatter } from "../../build/parser.js";

const SAMPLE_FRONTMATTER_LF = [
	"---",
	"name: artifact-templates",
	'description: "Sample skill description"',
	"metadata:",
	"  category: knowledge",
	"  is_workflow: false",
	"---",
	"",
	"# Body",
	"Body text.",
	"",
].join("\n");

const SAMPLE_FRONTMATTER_CRLF = SAMPLE_FRONTMATTER_LF.replace(/\n/g, "\r\n");

const SAMPLE_FRONTMATTER_MIXED = [
	"---\r\n",
	"name: mixed\r\n",
	"description: \"mixed endings\"\n",
	"metadata:\r\n",
	"  is_workflow: false\n",
	"---\r\n",
	"\n",
	"# Body\r\n",
].join("");

describe("extractFrontmatter line-ending tolerance", () => {
	test("parses LF-only frontmatter (baseline)", () => {
		const result = extractFrontmatter(
			SAMPLE_FRONTMATTER_LF,
			"test-lf.md",
		);
		expect(E.isRight(result)).toBe(true);
		if (E.isRight(result)) {
			expect(result.right.metadata.name).toBe("artifact-templates");
			expect(result.right.metadata.description).toBe(
				"Sample skill description",
			);
			const metadata = result.right.metadata.metadata as {
				category: string;
				is_workflow: boolean;
			};
			expect(metadata.category).toBe("knowledge");
			expect(metadata.is_workflow).toBe(false);
		}
	});

	test("parses CRLF frontmatter without error", () => {
		const result = extractFrontmatter(
			SAMPLE_FRONTMATTER_CRLF,
			"test-crlf.md",
		);
		expect(E.isRight(result)).toBe(true);
		if (E.isRight(result)) {
			expect(result.right.metadata.name).toBe("artifact-templates");
			const metadata = result.right.metadata.metadata as {
				category: string;
				is_workflow: boolean;
			};
			expect(metadata.category).toBe("knowledge");
			expect(metadata.is_workflow).toBe(false);
		}
	});

	test("parses mixed CRLF/LF frontmatter", () => {
		const result = extractFrontmatter(
			SAMPLE_FRONTMATTER_MIXED,
			"test-mixed.md",
		);
		expect(E.isRight(result)).toBe(true);
		if (E.isRight(result)) {
			expect(result.right.metadata.name).toBe("mixed");
		}
	});

	test("preserves body content across CRLF input", () => {
		const result = extractFrontmatter(
			SAMPLE_FRONTMATTER_CRLF,
			"test-crlf-body.md",
		);
		expect(E.isRight(result)).toBe(true);
		if (E.isRight(result)) {
			expect(result.right.body).toContain("# Body");
			expect(result.right.body).toContain("Body text.");
		}
	});

	test("still rejects missing closing ---", () => {
		const malformed = "---\r\nname: foo\r\nbody without close";
		const result = extractFrontmatter(malformed, "malformed.md");
		expect(E.isLeft(result)).toBe(true);
	});

	test("still rejects content without opening ---", () => {
		const malformed = "name: foo\r\nno frontmatter here";
		const result = extractFrontmatter(malformed, "malformed.md");
		expect(E.isLeft(result)).toBe(true);
	});
});
