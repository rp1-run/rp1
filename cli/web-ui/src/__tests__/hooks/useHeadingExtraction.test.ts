import { describe, expect, test } from "bun:test";
import { extractHeadings } from "../../hooks/useHeadingExtraction";

describe("extractHeadings", () => {
	test("extracts all heading levels (h1-h6)", () => {
		const content = `# H1 Heading
## H2 Heading
### H3 Heading
#### H4 Heading
##### H5 Heading
###### H6 Heading`;

		const result = extractHeadings(content);

		expect(result).toHaveLength(6);
		expect(result[0]).toEqual({
			id: "h1-heading",
			text: "H1 Heading",
			level: 1,
		});
		expect(result[1]).toEqual({
			id: "h2-heading",
			text: "H2 Heading",
			level: 2,
		});
		expect(result[2]).toEqual({
			id: "h3-heading",
			text: "H3 Heading",
			level: 3,
		});
		expect(result[3]).toEqual({
			id: "h4-heading",
			text: "H4 Heading",
			level: 4,
		});
		expect(result[4]).toEqual({
			id: "h5-heading",
			text: "H5 Heading",
			level: 5,
		});
		expect(result[5]).toEqual({
			id: "h6-heading",
			text: "H6 Heading",
			level: 6,
		});
	});

	test("returns empty array for empty content", () => {
		expect(extractHeadings("")).toEqual([]);
	});

	test("returns empty array for content with no headings", () => {
		const content = `This is a paragraph.

Another paragraph here.

No headings at all.`;

		expect(extractHeadings(content)).toEqual([]);
	});

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

	test("generates github-slugger compatible IDs with special characters", () => {
		const content = "# What's New in v2.0?";
		const result = extractHeadings(content);

		expect(result[0].id).toBe("whats-new-in-v20");
	});

	test("handles code in heading", () => {
		const content = "## Using `useState` Hook";
		const result = extractHeadings(content);

		expect(result[0].id).toBe("using-usestate-hook");
	});

	test("ignores invalid heading levels (h7+)", () => {
		const content = `# Valid H1
####### Not a heading (7 hashes)`;

		const result = extractHeadings(content);

		expect(result).toEqual([{ id: "valid-h1", text: "Valid H1", level: 1 }]);
	});

	test("requires space after hashes", () => {
		const content = `#NoSpace
# With Space`;

		const result = extractHeadings(content);

		expect(result).toEqual([
			{ id: "with-space", text: "With Space", level: 1 },
		]);
	});
});
