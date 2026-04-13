/**
 * Unit tests for prompt-hash module.
 * Tests frontmatter stripping and hash computation for attestation system.
 */

import { afterEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	computeDepsHash,
	computePromptHash,
	stripFrontmatter,
} from "../prompt-hash.js";
import type { HashResult } from "../types.js";

let tempDirs: string[] = [];

afterEach(async () => {
	await Promise.all(
		tempDirs.map((dir) => rm(dir, { recursive: true, force: true })),
	);
	tempDirs = [];
});

describe("prompt-hash", () => {
	describe("stripFrontmatter", () => {
		test("removes YAML frontmatter from content", () => {
			const content = `---
name: test-command
version: 1.0.0
---

# Test Command

This is the body content.`;

			const result = stripFrontmatter(content);

			expect(result).toBe(`
# Test Command

This is the body content.`);
		});

		test("handles content with no frontmatter", () => {
			const content = `# No Frontmatter

This is just plain markdown.`;

			const result = stripFrontmatter(content);

			expect(result).toBe(content);
		});

		test("handles empty content", () => {
			const result = stripFrontmatter("");

			expect(result).toBe("");
		});

		test("handles frontmatter with CRLF line endings", () => {
			const content = "---\r\nname: test\r\n---\r\n\r\n# Body";

			const result = stripFrontmatter(content);

			expect(result).toBe("\r\n# Body");
		});

		test("handles frontmatter with multiline values", () => {
			const content = `---
name: test
description: |
  This is a multiline
  description value
---

# Body Content`;

			const result = stripFrontmatter(content);

			expect(result).toBe(`
# Body Content`);
		});

		test("preserves content that looks like frontmatter but is not at start", () => {
			const content = `# Header

Some text before

---
key: value
---

More text after`;

			const result = stripFrontmatter(content);

			expect(result).toBe(content);
		});

		test("handles frontmatter-only content", () => {
			const content = `---
name: test
---
`;

			const result = stripFrontmatter(content);

			expect(result).toBe("");
		});
	});

	describe("computePromptHash", () => {
		test("hashes the markdown body after stripping frontmatter", async () => {
			const dir = await mkdtemp(join(tmpdir(), "rp1-prompt-hash-"));
			tempDirs.push(dir);
			const filePath = join(dir, "SKILL.md");
			const content = `---
name: test-skill
---

# Body

Prompt text.`;
			const body = `
# Body

Prompt text.`;
			await writeFile(filePath, content, "utf-8");

			const result = await computePromptHash(filePath)();

			expect(result._tag).toBe("Right");
			if (result._tag === "Left") {
				throw result.left;
			}

			expect(result.right).toEqual({
				path: filePath,
				hash: `sha256:${createHash("sha256").update(body).digest("hex")}`,
				content_length: body.length,
			});
		});

		test("returns a contextual error when the prompt file cannot be read", async () => {
			const missingPath = join(
				tmpdir(),
				`rp1-prompt-hash-missing-${Date.now()}`,
				"SKILL.md",
			);

			const result = await computePromptHash(missingPath)();

			expect(result._tag).toBe("Left");
			if (result._tag === "Right") {
				throw new Error("Expected computePromptHash to fail");
			}
			expect(result.left.message).toContain(`Failed to hash ${missingPath}`);
		});
	});

	describe("computeDepsHash", () => {
		test("produces consistent hash for same content", () => {
			const hashes: HashResult[] = [
				{ path: "a.md", hash: "sha256:abc123", content_length: 100 },
				{ path: "b.md", hash: "sha256:def456", content_length: 200 },
			];

			const result1 = computeDepsHash(hashes);
			const result2 = computeDepsHash(hashes);

			expect(result1).toBe(result2);
		});

		test("produces same hash regardless of input order", () => {
			const hashesOrdered: HashResult[] = [
				{ path: "a.md", hash: "sha256:abc123", content_length: 100 },
				{ path: "b.md", hash: "sha256:def456", content_length: 200 },
				{ path: "c.md", hash: "sha256:ghi789", content_length: 300 },
			];

			const hashesReversed: HashResult[] = [
				{ path: "c.md", hash: "sha256:ghi789", content_length: 300 },
				{ path: "b.md", hash: "sha256:def456", content_length: 200 },
				{ path: "a.md", hash: "sha256:abc123", content_length: 100 },
			];

			const hashesRandom: HashResult[] = [
				{ path: "b.md", hash: "sha256:def456", content_length: 200 },
				{ path: "a.md", hash: "sha256:abc123", content_length: 100 },
				{ path: "c.md", hash: "sha256:ghi789", content_length: 300 },
			];

			const result1 = computeDepsHash(hashesOrdered);
			const result2 = computeDepsHash(hashesReversed);
			const result3 = computeDepsHash(hashesRandom);

			expect(result1).toBe(result2);
			expect(result2).toBe(result3);
		});

		test("returns sha256-prefixed hash", () => {
			const hashes: HashResult[] = [
				{ path: "test.md", hash: "sha256:abc123", content_length: 100 },
			];

			const result = computeDepsHash(hashes);

			expect(result).toMatch(/^sha256:[a-f0-9]{64}$/);
		});

		test("handles empty array", () => {
			const result = computeDepsHash([]);

			expect(result).toMatch(/^sha256:[a-f0-9]{64}$/);
			const expected = `sha256:${createHash("sha256").update("").digest("hex")}`;
			expect(result).toBe(expected);
		});

		test("handles single file", () => {
			const hashes: HashResult[] = [
				{ path: "single.md", hash: "sha256:abc123", content_length: 50 },
			];

			const result = computeDepsHash(hashes);

			const expected = `sha256:${createHash("sha256").update("sha256:abc123").digest("hex")}`;
			expect(result).toBe(expected);
		});

		test("produces different hash for different content", () => {
			const hashes1: HashResult[] = [
				{ path: "a.md", hash: "sha256:abc123", content_length: 100 },
			];
			const hashes2: HashResult[] = [
				{ path: "a.md", hash: "sha256:xyz789", content_length: 100 },
			];

			const result1 = computeDepsHash(hashes1);
			const result2 = computeDepsHash(hashes2);

			expect(result1).not.toBe(result2);
		});

		test("does not mutate input array", () => {
			const hashes: HashResult[] = [
				{ path: "z.md", hash: "sha256:zzz", content_length: 10 },
				{ path: "a.md", hash: "sha256:aaa", content_length: 10 },
			];
			const originalOrder = [...hashes];

			computeDepsHash(hashes);

			expect(hashes[0].path).toBe(originalOrder[0].path);
			expect(hashes[1].path).toBe(originalOrder[1].path);
		});
	});
});
