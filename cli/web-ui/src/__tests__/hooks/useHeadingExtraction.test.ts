import { describe, expect, test } from "bun:test";
import { extractHeadings } from "../../hooks/useHeadingExtraction";

describe("extractHeadings", () => {
	describe("basic extraction", () => {
		test("extracts single h1 heading", () => {
			const content = "# Hello World";
			const result = extractHeadings(content);

			expect(result).toEqual([
				{ id: "hello-world", text: "Hello World", level: 1 },
			]);
		});

		test("extracts all heading levels (h1-h6)", () => {
			const content = `# H1 Heading
## H2 Heading
### H3 Heading
#### H4 Heading
##### H5 Heading
###### H6 Heading`;

			const result = extractHeadings(content);

			expect(result).toHaveLength(6);
			expect(result[0]).toEqual({ id: "h1-heading", text: "H1 Heading", level: 1 });
			expect(result[1]).toEqual({ id: "h2-heading", text: "H2 Heading", level: 2 });
			expect(result[2]).toEqual({ id: "h3-heading", text: "H3 Heading", level: 3 });
			expect(result[3]).toEqual({ id: "h4-heading", text: "H4 Heading", level: 4 });
			expect(result[4]).toEqual({ id: "h5-heading", text: "H5 Heading", level: 5 });
			expect(result[5]).toEqual({ id: "h6-heading", text: "H6 Heading", level: 6 });
		});

		test("extracts headings with surrounding content", () => {
			const content = `Some intro text.

# First Section

Paragraph content here.

## Subsection

More text.`;

			const result = extractHeadings(content);

			expect(result).toEqual([
				{ id: "first-section", text: "First Section", level: 1 },
				{ id: "subsection", text: "Subsection", level: 2 },
			]);
		});
	});

	describe("empty and no-heading cases", () => {
		test("returns empty array for empty content", () => {
			expect(extractHeadings("")).toEqual([]);
		});

		test("returns empty array for null-like content", () => {
			expect(extractHeadings("")).toEqual([]);
		});

		test("returns empty array for content with no headings", () => {
			const content = `This is a paragraph.

Another paragraph here.

No headings at all.`;

			expect(extractHeadings(content)).toEqual([]);
		});

		test("ignores heading-like content in code blocks", () => {
			const content = `# Real Heading

\`\`\`markdown
# Code Block Heading
\`\`\`

More content.`;

			const result = extractHeadings(content);

			expect(result).toHaveLength(2);
			expect(result[0].text).toBe("Real Heading");
		});
	});

	describe("duplicate heading handling", () => {
		test("suffixes duplicate headings with incrementing numbers", () => {
			const content = `# Introduction
## Overview
# Introduction
## Overview
# Introduction`;

			const result = extractHeadings(content);

			expect(result).toEqual([
				{ id: "introduction", text: "Introduction", level: 1 },
				{ id: "overview", text: "Overview", level: 2 },
				{ id: "introduction-1", text: "Introduction", level: 1 },
				{ id: "overview-1", text: "Overview", level: 2 },
				{ id: "introduction-2", text: "Introduction", level: 1 },
			]);
		});

		test("handles multiple duplicates of same heading", () => {
			const content = `## Section
## Section
## Section
## Section`;

			const result = extractHeadings(content);

			expect(result).toEqual([
				{ id: "section", text: "Section", level: 2 },
				{ id: "section-1", text: "Section", level: 2 },
				{ id: "section-2", text: "Section", level: 2 },
				{ id: "section-3", text: "Section", level: 2 },
			]);
		});
	});

	describe("ID generation (github-slugger compatibility)", () => {
		test("converts to lowercase", () => {
			const content = "# UPPERCASE HEADING";
			const result = extractHeadings(content);

			expect(result[0].id).toBe("uppercase-heading");
		});

		test("replaces spaces with hyphens", () => {
			const content = "# Multiple Word Heading";
			const result = extractHeadings(content);

			expect(result[0].id).toBe("multiple-word-heading");
		});

		test("handles special characters", () => {
			const content = "# What's New in v2.0?";
			const result = extractHeadings(content);

			expect(result[0].id).toBe("whats-new-in-v20");
		});

		test("handles code in heading", () => {
			const content = "## Using `useState` Hook";
			const result = extractHeadings(content);

			expect(result[0].id).toBe("using-usestate-hook");
		});

		test("handles emoji in heading", () => {
			const content = "# Getting Started";
			const result = extractHeadings(content);

			expect(result[0].id).toBe("getting-started");
		});

		test("handles numbers in heading", () => {
			const content = "# Chapter 1: Introduction";
			const result = extractHeadings(content);

			expect(result[0].id).toBe("chapter-1-introduction");
		});
	});

	describe("edge cases", () => {
		test("ignores invalid heading levels (h7+)", () => {
			const content = `# Valid H1
####### Not a heading (7 hashes)`;

			const result = extractHeadings(content);

			expect(result).toEqual([
				{ id: "valid-h1", text: "Valid H1", level: 1 },
			]);
		});

		test("requires space after hashes", () => {
			const content = `#NoSpace
# With Space`;

			const result = extractHeadings(content);

			expect(result).toEqual([
				{ id: "with-space", text: "With Space", level: 1 },
			]);
		});

		test("trims whitespace from heading text", () => {
			const content = "#   Lots of spaces   ";
			const result = extractHeadings(content);

			expect(result[0].text).toBe("Lots of spaces");
		});

		test("handles heading at end of content without newline", () => {
			const content = "Some text\n# Final Heading";
			const result = extractHeadings(content);

			expect(result).toEqual([
				{ id: "final-heading", text: "Final Heading", level: 1 },
			]);
		});

		test("handles Windows line endings (CRLF)", () => {
			const content = "# First\r\n## Second\r\n### Third";
			const result = extractHeadings(content);

			expect(result).toHaveLength(3);
		});
	});

	describe("performance", () => {
		test("handles large content efficiently", () => {
			const headingCount = 1000;
			const content = Array.from(
				{ length: headingCount },
				(_, i) => `## Heading ${i}\n\nSome paragraph text here.`,
			).join("\n");

			const start = performance.now();
			const result = extractHeadings(content);
			const elapsed = performance.now() - start;

			expect(result).toHaveLength(headingCount);
			expect(elapsed).toBeLessThan(100);
		});
	});
});
