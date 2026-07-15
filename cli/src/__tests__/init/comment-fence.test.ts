/**
 * Unit tests for the init tool comment-fence module.
 * Tests rp1's fence marker operations for content injection.
 */

import { describe, expect, test } from "bun:test";
import {
	appendFencedContent,
	extractFencedContent,
	extractFenceVersion,
	findFencedContent,
	hasFencedContent,
	removeFencedContent,
	replaceFencedContent,
	validateFencing,
	wrapWithFence,
	wrapWithVersionedFence,
} from "../../init/comment-fence.js";

describe("comment-fence", () => {
	describe("findFencedContent", () => {
		test("returns positions of start/end markers", () => {
			const content =
				"before\n<!-- rp1:start -->\nmiddle\n<!-- rp1:end -->\nafter";
			const result = findFencedContent(content);

			expect(result).not.toBeNull();
			expect(result?.start).toBe(7);
			expect(result?.startMarkerEnd).toBe(7 + "<!-- rp1:start -->".length);
			expect(result?.endMarkerStart).toBeGreaterThan(
				result?.startMarkerEnd ?? 0,
			);
		});

		test("returns null when no fence exists", () => {
			const content = "Just plain content without markers.";
			const result = findFencedContent(content);

			expect(result).toBeNull();
		});

		test("returns null when only start marker exists", () => {
			const content = "before\n<!-- rp1:start -->\nmiddle but no end";
			const result = findFencedContent(content);

			expect(result).toBeNull();
		});

		test("finds versioned markers and extracts version", () => {
			const content =
				"before\n<!-- rp1:start:v0.7.1 -->\nmiddle\n<!-- rp1:end:v0.7.1 -->\nafter";
			const result = findFencedContent(content);

			expect(result).not.toBeNull();
			expect(result?.version).toBe("0.7.1");
			expect(result?.start).toBe(7);
		});

		test("returns version null for legacy markers", () => {
			const content =
				"before\n<!-- rp1:start -->\nmiddle\n<!-- rp1:end -->\nafter";
			const result = findFencedContent(content);

			expect(result).not.toBeNull();
			expect(result?.version).toBeNull();
		});

		test("handles prerelease version markers", () => {
			const content =
				"<!-- rp1:start:v1.0.0-beta.1 -->\ncontent\n<!-- rp1:end:v1.0.0-beta.1 -->";
			const result = findFencedContent(content);

			expect(result).not.toBeNull();
			expect(result?.version).toBe("1.0.0-beta.1");
		});

		test("treats malformed version as no version (null)", () => {
			const content =
				"<!-- rp1:start:vnotaversion -->\ncontent\n<!-- rp1:end:vnotaversion -->";
			const result = findFencedContent(content);

			expect(result).toBeNull();
		});
	});

	describe("extractFenceVersion", () => {
		test("returns semver string for versioned markers", () => {
			const content =
				"<!-- rp1:start:v1.2.3 -->\ncontent\n<!-- rp1:end:v1.2.3 -->";
			expect(extractFenceVersion(content)).toBe("1.2.3");
		});

		test("returns null for legacy unversioned markers", () => {
			const content = "<!-- rp1:start -->\ncontent\n<!-- rp1:end -->";
			expect(extractFenceVersion(content)).toBeNull();
		});

		test("returns null when no markers present", () => {
			const content = "Just plain markdown content.";
			expect(extractFenceVersion(content)).toBeNull();
		});

		test("returns version with prerelease suffix", () => {
			const content =
				"<!-- rp1:start:v2.0.0-rc.1 -->\ncontent\n<!-- rp1:end:v2.0.0-rc.1 -->";
			expect(extractFenceVersion(content)).toBe("2.0.0-rc.1");
		});
	});

	describe("replaceFencedContent", () => {
		test("replaces existing fenced content", () => {
			const original =
				"before\n<!-- rp1:start -->\nold content\n<!-- rp1:end -->\nafter";
			const result = replaceFencedContent(original, "new content");

			expect(result).toContain("new content");
			expect(result).not.toContain("old content");
			expect(result).toContain("before");
			expect(result).toContain("after");
		});

		test("appends when no fence exists", () => {
			const original = "Existing content without fence.";
			const result = replaceFencedContent(original, "new content");

			expect(result).toContain("Existing content without fence.");
			expect(result).toContain("<!-- rp1:start -->");
			expect(result).toContain("new content");
			expect(result).toContain("<!-- rp1:end -->");
		});

		test("preserves content before and after fence", () => {
			const original =
				"# Header\n\nSome text.\n\n<!-- rp1:start -->\nold\n<!-- rp1:end -->\n\n## Footer";
			const result = replaceFencedContent(original, "replaced");

			expect(result).toContain("# Header");
			expect(result).toContain("Some text.");
			expect(result).toContain("## Footer");
			expect(result).toContain("replaced");
		});

		test("replaces with versioned markers when version provided", () => {
			const original =
				"before\n<!-- rp1:start -->\nold\n<!-- rp1:end -->\nafter";
			const result = replaceFencedContent(original, "new content", "0.7.1");

			expect(result).toContain("<!-- rp1:start:v0.7.1 -->");
			expect(result).toContain("<!-- rp1:end:v0.7.1 -->");
			expect(result).toContain("new content");
			expect(result).toContain("before");
			expect(result).toContain("after");
		});

		test("preserves user content outside versioned fence on replace", () => {
			const original =
				"# My custom header\n\n<!-- rp1:start:v0.6.0 -->\nold managed\n<!-- rp1:end:v0.6.0 -->\n\nMy custom footer";
			const result = replaceFencedContent(original, "new managed", "0.7.1");

			expect(result).toContain("# My custom header");
			expect(result).toContain("My custom footer");
			expect(result).toContain("new managed");
			expect(result).not.toContain("old managed");
			expect(result).toContain("<!-- rp1:start:v0.7.1 -->");
		});
	});

	describe("appendFencedContent", () => {
		test("appends fenced content to end of file", () => {
			const original = "Existing content.";
			const result = appendFencedContent(original, "new content");

			expect(result).toBe(
				"Existing content.\n\n<!-- rp1:start -->\nnew content\n<!-- rp1:end -->\n",
			);
		});

		test("handles empty original content", () => {
			const result = appendFencedContent("", "content");

			expect(result).toBe("<!-- rp1:start -->\ncontent\n<!-- rp1:end -->\n");
		});
	});

	describe("wrapWithFence", () => {
		test("produces correct marker format", () => {
			const result = wrapWithFence("content");

			expect(result).toBe("<!-- rp1:start -->\ncontent\n<!-- rp1:end -->");
		});

		test("trims whitespace from content", () => {
			const result = wrapWithFence("  content with spaces  \n\n");

			expect(result).toBe(
				"<!-- rp1:start -->\ncontent with spaces\n<!-- rp1:end -->",
			);
		});

		test("produces versioned markers when version provided", () => {
			const result = wrapWithFence("content", "0.7.1");

			expect(result).toBe(
				"<!-- rp1:start:v0.7.1 -->\ncontent\n<!-- rp1:end:v0.7.1 -->",
			);
		});
	});

	describe("wrapWithVersionedFence", () => {
		test("produces versioned markers", () => {
			const result = wrapWithVersionedFence("content", "1.0.0");

			expect(result).toBe(
				"<!-- rp1:start:v1.0.0 -->\ncontent\n<!-- rp1:end:v1.0.0 -->",
			);
		});
	});

	describe("extractFencedContent", () => {
		test("returns trimmed content between markers", () => {
			const content =
				"before\n<!-- rp1:start -->\n  inner content  \n<!-- rp1:end -->\nafter";
			const result = extractFencedContent(content);

			expect(result).toBe("inner content");
		});

		test("returns null when no fence exists", () => {
			const content = "No fence here.";
			const result = extractFencedContent(content);

			expect(result).toBeNull();
		});

		test("handles multi-line inner content", () => {
			const content = `before
<!-- rp1:start -->
line 1
line 2
line 3
<!-- rp1:end -->
after`;
			const result = extractFencedContent(content);

			expect(result).toBe("line 1\nline 2\nline 3");
		});
	});

	describe("hasFencedContent", () => {
		test("returns true when fence exists", () => {
			const content = "<!-- rp1:start -->\ncontent\n<!-- rp1:end -->";
			expect(hasFencedContent(content)).toBe(true);
		});

		test("returns false when no fence exists", () => {
			const content = "Plain content.";
			expect(hasFencedContent(content)).toBe(false);
		});
	});

	describe("validateFencing", () => {
		test("returns valid for content without fences", () => {
			const content = "No fences here.";
			const result = validateFencing(content);

			expect(result.valid).toBe(true);
			expect(result.error).toBeUndefined();
		});

		test("returns valid for properly matched fence", () => {
			const content = "<!-- rp1:start -->\ncontent\n<!-- rp1:end -->";
			const result = validateFencing(content);

			expect(result.valid).toBe(true);
		});

		test("detects mismatched marker counts", () => {
			const contentMissingEnd = "<!-- rp1:start -->\ncontent";
			const result = validateFencing(contentMissingEnd);

			expect(result.valid).toBe(false);
			expect(result.error).toContain("Mismatched");
		});

		test("detects end before start", () => {
			const content = "<!-- rp1:end -->\n<!-- rp1:start -->";
			const result = validateFencing(content);

			expect(result.valid).toBe(false);
			expect(result.error).toContain("before start");
		});

		test("detects multiple fence sections", () => {
			const content =
				"<!-- rp1:start -->a<!-- rp1:end --><!-- rp1:start -->b<!-- rp1:end -->";
			const result = validateFencing(content);

			expect(result.valid).toBe(false);
			expect(result.error).toContain("Multiple");
		});

		test("returns valid for versioned markers", () => {
			const content =
				"<!-- rp1:start:v0.7.1 -->\ncontent\n<!-- rp1:end:v0.7.1 -->";
			const result = validateFencing(content);

			expect(result.valid).toBe(true);
		});

		test("returns valid for mixed legacy and versioned end marker", () => {
			const content = "<!-- rp1:start -->\ncontent\n<!-- rp1:end:v0.7.1 -->";
			const result = validateFencing(content);

			expect(result.valid).toBe(true);
		});
	});

	describe("removeFencedContent", () => {
		test("returns content unchanged when no fence exists", () => {
			const content = "Just plain content without any fence markers.";
			expect(removeFencedContent(content)).toBe(content);
		});

		test("returns empty string when file is fence-only", () => {
			const content = "<!-- rp1:start -->\nmanaged content\n<!-- rp1:end -->";
			expect(removeFencedContent(content)).toBe("");
		});

		test("returns empty string for fence-only with trailing newline", () => {
			const content = "<!-- rp1:start -->\nmanaged content\n<!-- rp1:end -->\n";
			expect(removeFencedContent(content)).toBe("");
		});

		test("removes fence and preserves content before", () => {
			const content =
				"# Header\n\nSome text.\n\n<!-- rp1:start -->\nmanaged\n<!-- rp1:end -->";
			const result = removeFencedContent(content);

			expect(result).toContain("# Header");
			expect(result).toContain("Some text.");
			expect(result).not.toContain("<!-- rp1:start");
			expect(result).not.toContain("managed");
		});

		test("removes fence and preserves content after", () => {
			const content =
				"<!-- rp1:start -->\nmanaged\n<!-- rp1:end -->\n\n## Footer\n\nMore text.";
			const result = removeFencedContent(content);

			expect(result).toContain("## Footer");
			expect(result).toContain("More text.");
			expect(result).not.toContain("<!-- rp1:start");
			expect(result).not.toContain("managed");
		});

		test("removes fence and preserves content before and after", () => {
			const content =
				"# Header\n\nBefore.\n\n<!-- rp1:start -->\nmanaged\n<!-- rp1:end -->\n\nAfter.\n\n## Footer";
			const result = removeFencedContent(content);

			expect(result).toContain("# Header");
			expect(result).toContain("Before.");
			expect(result).toContain("After.");
			expect(result).toContain("## Footer");
			expect(result).not.toContain("managed");
		});

		test("handles versioned fence markers", () => {
			const content =
				"Keep this.\n\n<!-- rp1:start:v0.7.1 -->\nversioned managed\n<!-- rp1:end:v0.7.1 -->\n\nAlso keep.";
			const result = removeFencedContent(content);

			expect(result).toContain("Keep this.");
			expect(result).toContain("Also keep.");
			expect(result).not.toContain("versioned managed");
			expect(result).not.toContain("<!-- rp1:start:v0.7.1 -->");
		});

		test("result ends with trailing newline when non-empty content remains", () => {
			const content =
				"Keep this.\n\n<!-- rp1:start -->\nmanaged\n<!-- rp1:end -->";
			const result = removeFencedContent(content);

			expect(result.length).toBeGreaterThan(0);
			expect(result.endsWith("\n")).toBe(true);
		});
	});
});
