/**
 * Unit tests for the shell comment fence module.
 * Tests shell-style fence marker operations for .gitignore files.
 */

import { describe, expect, test } from "bun:test";
import {
	appendShellFencedContent,
	extractShellFencedContent,
	findShellFencedContent,
	hasShellFencedContent,
	replaceShellFencedContent,
	validateShellFencing,
	wrapWithShellFence,
} from "../../init/shell-fence.js";

describe("shell-fence", () => {
	describe("findShellFencedContent", () => {
		test("returns positions of start/end markers", () => {
			const content = "before\n# rp1:start\nmiddle\n# rp1:end\nafter";
			const result = findShellFencedContent(content);

			expect(result).not.toBeNull();
			expect(result?.start).toBe(7);
			expect(result?.startMarkerEnd).toBe(7 + "# rp1:start".length);
			expect(result?.endMarkerStart).toBeGreaterThan(
				result?.startMarkerEnd ?? 0,
			);
		});

		test("returns null when no fence exists", () => {
			const content = "Just plain content without markers.";
			const result = findShellFencedContent(content);

			expect(result).toBeNull();
		});

		test("returns null when only start marker exists", () => {
			const content = "before\n# rp1:start\nmiddle but no end";
			const result = findShellFencedContent(content);

			expect(result).toBeNull();
		});

		test("returns null when only end marker exists", () => {
			const content = "before\nmiddle\n# rp1:end\nafter";
			const result = findShellFencedContent(content);

			expect(result).toBeNull();
		});
	});

	describe("replaceShellFencedContent", () => {
		test("replaces existing fenced content", () => {
			const original = "before\n# rp1:start\nold content\n# rp1:end\nafter";
			const result = replaceShellFencedContent(original, "new content");

			expect(result).toContain("new content");
			expect(result).not.toContain("old content");
			expect(result).toContain("before");
			expect(result).toContain("after");
		});

		test("appends when no fence exists", () => {
			const original = "Existing content without fence.";
			const result = replaceShellFencedContent(original, "new content");

			expect(result).toContain("Existing content without fence.");
			expect(result).toContain("# rp1:start");
			expect(result).toContain("new content");
			expect(result).toContain("# rp1:end");
		});

		test("preserves content before and after fence", () => {
			const original =
				"# Header\n\nSome text.\n\n# rp1:start\nold\n# rp1:end\n\n# Footer";
			const result = replaceShellFencedContent(original, "replaced");

			expect(result).toContain("# Header");
			expect(result).toContain("Some text.");
			expect(result).toContain("# Footer");
			expect(result).toContain("replaced");
		});

		test("handles gitignore-style content", () => {
			const original = `# IDE files
.idea/
.vscode/

# rp1:start
.rp1/work/
# rp1:end

# Build artifacts
dist/
`;
			const result = replaceShellFencedContent(original, ".rp1/meta.json");

			expect(result).toContain("# IDE files");
			expect(result).toContain(".idea/");
			expect(result).toContain("# Build artifacts");
			expect(result).toContain("dist/");
			expect(result).toContain(".rp1/meta.json");
			expect(result).not.toContain(".rp1/work/");
		});
	});

	describe("appendShellFencedContent", () => {
		test("appends fenced content to end of file", () => {
			const original = "Existing content.";
			const result = appendShellFencedContent(original, "new content");

			expect(result).toBe(
				"Existing content.\n\n# rp1:start\nnew content\n# rp1:end\n",
			);
		});

		test("handles empty original content", () => {
			const result = appendShellFencedContent("", "content");

			expect(result).toBe("# rp1:start\ncontent\n# rp1:end\n");
		});

		test("handles whitespace-only original content", () => {
			const result = appendShellFencedContent("   \n\n  ", "content");

			expect(result).toBe("# rp1:start\ncontent\n# rp1:end\n");
		});

		test("trims trailing whitespace from original", () => {
			const result = appendShellFencedContent(
				"existing\n\n\n   ",
				"new content",
			);

			expect(result).toBe("existing\n\n# rp1:start\nnew content\n# rp1:end\n");
		});
	});

	describe("wrapWithShellFence", () => {
		test("produces correct marker format", () => {
			const result = wrapWithShellFence("content");

			expect(result).toBe("# rp1:start\ncontent\n# rp1:end");
		});

		test("trims whitespace from content", () => {
			const result = wrapWithShellFence("  content with spaces  \n\n");

			expect(result).toBe("# rp1:start\ncontent with spaces\n# rp1:end");
		});

		test("handles multi-line content", () => {
			const result = wrapWithShellFence(".rp1/work/\n.rp1/meta.json");

			expect(result).toBe("# rp1:start\n.rp1/work/\n.rp1/meta.json\n# rp1:end");
		});
	});

	describe("extractShellFencedContent", () => {
		test("returns trimmed content between markers", () => {
			const content =
				"before\n# rp1:start\n  inner content  \n# rp1:end\nafter";
			const result = extractShellFencedContent(content);

			expect(result).toBe("inner content");
		});

		test("returns null when no fence exists", () => {
			const content = "No fence here.";
			const result = extractShellFencedContent(content);

			expect(result).toBeNull();
		});

		test("handles multi-line inner content", () => {
			const content = `before
# rp1:start
.rp1/work/
.rp1/meta.json
# rp1:end
after`;
			const result = extractShellFencedContent(content);

			expect(result).toBe(".rp1/work/\n.rp1/meta.json");
		});
	});

	describe("hasShellFencedContent", () => {
		test("returns true when fence exists", () => {
			const content = "# rp1:start\ncontent\n# rp1:end";
			expect(hasShellFencedContent(content)).toBe(true);
		});

		test("returns false when no fence exists", () => {
			const content = "Plain content.";
			expect(hasShellFencedContent(content)).toBe(false);
		});

		test("returns false when only start marker exists", () => {
			const content = "# rp1:start\ncontent but no end";
			expect(hasShellFencedContent(content)).toBe(false);
		});
	});

	describe("validateShellFencing", () => {
		test("returns valid for content without fences", () => {
			const content = "No fences here.";
			const result = validateShellFencing(content);

			expect(result.valid).toBe(true);
			expect(result.error).toBeUndefined();
		});

		test("returns valid for properly matched fence", () => {
			const content = "# rp1:start\ncontent\n# rp1:end";
			const result = validateShellFencing(content);

			expect(result.valid).toBe(true);
		});

		test("detects mismatched marker counts - missing end", () => {
			const contentMissingEnd = "# rp1:start\ncontent";
			const result = validateShellFencing(contentMissingEnd);

			expect(result.valid).toBe(false);
			expect(result.error).toContain("Mismatched");
		});

		test("detects mismatched marker counts - missing start", () => {
			const contentMissingStart = "content\n# rp1:end";
			const result = validateShellFencing(contentMissingStart);

			expect(result.valid).toBe(false);
			expect(result.error).toContain("Mismatched");
		});

		test("detects end before start", () => {
			const content = "# rp1:end\n# rp1:start";
			const result = validateShellFencing(content);

			expect(result.valid).toBe(false);
			expect(result.error).toContain("before start");
		});

		test("detects multiple fence sections", () => {
			const content = "# rp1:start\na\n# rp1:end\n# rp1:start\nb\n# rp1:end";
			const result = validateShellFencing(content);

			expect(result.valid).toBe(false);
			expect(result.error).toContain("Multiple");
		});
	});
});
