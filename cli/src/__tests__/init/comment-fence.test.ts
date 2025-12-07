/**
 * Unit tests for the init tool comment-fence module.
 * Tests rp1's fence marker operations for content injection.
 */

import { describe, test, expect } from "bun:test";
import {
  findFencedContent,
  replaceFencedContent,
  wrapWithFence,
  extractFencedContent,
  validateFencing,
  hasFencedContent,
  appendFencedContent,
} from "../../init/comment-fence.js";

describe("comment-fence", () => {
  describe("findFencedContent", () => {
    test("returns positions of start/end markers", () => {
      const content = "before\n<!-- rp1:start -->\nmiddle\n<!-- rp1:end -->\nafter";
      const result = findFencedContent(content);

      expect(result).not.toBeNull();
      expect(result!.start).toBe(7);
      expect(result!.startMarkerEnd).toBe(7 + "<!-- rp1:start -->".length);
      expect(result!.endMarkerStart).toBeGreaterThan(result!.startMarkerEnd);
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
  });

  describe("replaceFencedContent", () => {
    test("replaces existing fenced content", () => {
      const original = "before\n<!-- rp1:start -->\nold content\n<!-- rp1:end -->\nafter";
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
      const original = "# Header\n\nSome text.\n\n<!-- rp1:start -->\nold\n<!-- rp1:end -->\n\n## Footer";
      const result = replaceFencedContent(original, "replaced");

      expect(result).toContain("# Header");
      expect(result).toContain("Some text.");
      expect(result).toContain("## Footer");
      expect(result).toContain("replaced");
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
  });

  describe("extractFencedContent", () => {
    test("returns trimmed content between markers", () => {
      const content = "before\n<!-- rp1:start -->\n  inner content  \n<!-- rp1:end -->\nafter";
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
  });
});
