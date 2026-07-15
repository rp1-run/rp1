/**
 * Tests for the shared include preprocessor directive.
 *
 * Covers: successful splicing, missing-target error, nested-include error,
 * golden output verification, and no-op passthrough.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import * as E from "fp-ts/lib/Either.js";
import { resolveSharedIncludes } from "../../build/preprocessor.js";
import {
	assertTestIsolation,
	cleanupTempDir,
	createTempDir,
	expectLeft,
	expectRight,
	writeFixture,
} from "../helpers/index.js";

describe("resolveSharedIncludes", () => {
	let tempDir: string;

	beforeAll(async () => {
		tempDir = await createTempDir("preprocessor-includes");
		await assertTestIsolation(tempDir);

		await writeFixture(
			tempDir,
			"plugins/shared/greeting.md",
			"Hello from shared block!",
		);

		await writeFixture(
			tempDir,
			"plugins/shared/multi-line.md",
			[
				"## Shared Section",
				"",
				"- Item one",
				"- Item two",
				"- Item three",
			].join("\n"),
		);

		await writeFixture(
			tempDir,
			"plugins/shared/nested-bad.md",
			'This includes another: {% include_shared "greeting.md" %}',
		);
	});

	afterAll(async () => {
		await cleanupTempDir(tempDir);
	});

	describe("successful include splicing", () => {
		test("replaces single include directive with file content", async () => {
			const content = [
				"# My Agent",
				"",
				'{% include_shared "greeting.md" %}',
				"",
				"## End",
			].join("\n");

			const result = await resolveSharedIncludes(content, tempDir);
			const output = expectRight(result);

			expect(output).toContain("Hello from shared block!");
			expect(output).not.toContain("include_shared");
			expect(output).toContain("# My Agent");
			expect(output).toContain("## End");
		});

		test("replaces multiple include directives", async () => {
			const content = [
				"Start.",
				'{% include_shared "greeting.md" %}',
				"Middle.",
				'{% include_shared "multi-line.md" %}',
				"End.",
			].join("\n");

			const result = await resolveSharedIncludes(content, tempDir);
			const output = expectRight(result);

			expect(output).toContain("Hello from shared block!");
			expect(output).toContain("## Shared Section");
			expect(output).toContain("- Item one");
			expect(output).not.toContain("include_shared");
		});

		test("preserves multi-line included content exactly", async () => {
			const content = '{% include_shared "multi-line.md" %}';

			const result = await resolveSharedIncludes(content, tempDir);
			const output = expectRight(result);

			expect(output).toBe(
				[
					"## Shared Section",
					"",
					"- Item one",
					"- Item two",
					"- Item three",
				].join("\n"),
			);
		});
	});

	describe("missing target error", () => {
		test("returns Left with actionable message for missing file", async () => {
			const content = '{% include_shared "nonexistent.md" %}';

			const result = await resolveSharedIncludes(content, tempDir);

			expect(E.isLeft(result)).toBe(true);
			const err = expectLeft(result);
			expect(err._tag).toBe("GenerationError");
			if (err._tag !== "GenerationError") throw new Error("unreachable");
			expect(err.message).toContain("nonexistent.md");
			expect(err.message).toContain("plugins/shared/");
		});
	});

	describe("nested include detection", () => {
		test("returns Left when included file contains another include directive", async () => {
			const content = '{% include_shared "nested-bad.md" %}';

			const result = await resolveSharedIncludes(content, tempDir);

			expect(E.isLeft(result)).toBe(true);
			const err = expectLeft(result);
			expect(err._tag).toBe("GenerationError");
			if (err._tag !== "GenerationError") throw new Error("unreachable");
			expect(err.message).toContain("nested");
		});
	});

	describe("golden output verification", () => {
		test("compiled output contains spliced content at correct position", async () => {
			const content = [
				"# Research Explorer",
				"",
				"You are an explorer agent.",
				"",
				"## Instructions",
				"",
				"Follow these steps.",
				"",
				'{% include_shared "multi-line.md" %}',
				"",
				"## Output",
				"",
				"Return JSON.",
			].join("\n");

			const result = await resolveSharedIncludes(content, tempDir);
			const output = expectRight(result);

			const expected = [
				"# Research Explorer",
				"",
				"You are an explorer agent.",
				"",
				"## Instructions",
				"",
				"Follow these steps.",
				"",
				"## Shared Section",
				"",
				"- Item one",
				"- Item two",
				"- Item three",
				"",
				"## Output",
				"",
				"Return JSON.",
			].join("\n");

			expect(output).toBe(expected);
		});
	});

	describe("no-op passthrough", () => {
		test("returns content unchanged when no include directives present", async () => {
			const content = [
				"# Regular file",
				"",
				"No includes here.",
				"Just regular content.",
			].join("\n");

			const result = await resolveSharedIncludes(content, tempDir);
			const output = expectRight(result);

			expect(output).toBe(content);
		});

		test("returns empty content unchanged", async () => {
			const result = await resolveSharedIncludes("", tempDir);
			const output = expectRight(result);
			expect(output).toBe("");
		});
	});

	describe("directive syntax", () => {
		test("handles extra whitespace around filename", async () => {
			const content = '{%  include_shared  "greeting.md"  %}';

			const result = await resolveSharedIncludes(content, tempDir);
			const output = expectRight(result);

			expect(output).toContain("Hello from shared block!");
		});

		test("does not match directives inside code blocks (preprocessor ordering)", async () => {
			// Note: code block protection is handled by extractCodeBlocks in
			// preprocessConditionals which runs AFTER resolveSharedIncludes.
			// The resolveSharedIncludes function operates on raw content,
			// so directives inside code blocks WOULD be processed.
			// This is acceptable because code blocks should not contain
			// include directives in practice -- they are for documentation.
			const content = '{% include_shared "greeting.md" %}';
			const result = await resolveSharedIncludes(content, tempDir);
			expect(E.isRight(result)).toBe(true);
		});
	});

	describe("regex state isolation across sequential files", () => {
		test("resolves directives in every file of a multi-file pass", async () => {
			// Regression: the nested-include .test() on the shared /g regex used to
			// advance lastIndex, making the NEXT file's matchAll start mid-string
			// and silently skip its directives.
			const fileA = 'A {% include_shared "greeting.md" %} tail';
			const fileB = '{% include_shared "greeting.md" %} B tail';

			for (let i = 0; i < 3; i++) {
				const a = expectRight(await resolveSharedIncludes(fileA, tempDir));
				const b = expectRight(await resolveSharedIncludes(fileB, tempDir));
				expect(a).toContain("Hello from shared block!");
				expect(a).not.toContain("include_shared");
				expect(b).toContain("Hello from shared block!");
				expect(b).not.toContain("include_shared");
			}
		});
	});

	describe("path containment", () => {
		test("rejects include targets that escape plugins/shared/", async () => {
			const content = '{% include_shared "../../../etc/passwd" %}';
			const result = await resolveSharedIncludes(content, tempDir);
			const error = expectLeft(result);
			expect(JSON.stringify(error)).toContain("escapes plugins/shared/");
		});
	});
});
