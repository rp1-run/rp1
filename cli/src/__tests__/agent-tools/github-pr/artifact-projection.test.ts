/**
 * Byte-for-byte golden test for the artifact projection.
 *
 * Each `golden/*-input.md` fixture is rendered through `project()` and compared
 * against its paired `golden/*-output.md` fixture using UTF-8 byte buffers
 * (not string `===`), matching how the Python golden suite asserted byte parity.
 * A single diverging byte fails the test and names the offending fixture, so any
 * projection regression (encoding, whitespace, emoji, em-dash, line-join) is
 * caught.
 *
 * The `sourcePath` passed to `project()` is `examples/<name>-input.md`, the same
 * repo-relative source the fixtures were generated with: it appears verbatim in
 * the rendered Source-path row and `path:` marker key, so it must be reproduced
 * exactly for byte parity.
 */

import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
	project,
	splitFrontmatter,
} from "../../../agent-tools/github-pr/artifact-projection.js";

const GOLDEN_DIR = join(dirname(fileURLToPath(import.meta.url)), "golden");

/** First byte offset at which two buffers differ, or -1 if identical. */
const firstDiff = (a: Uint8Array, b: Uint8Array): number => {
	const n = Math.min(a.length, b.length);
	for (let i = 0; i < n; i++) {
		if (a[i] !== b[i]) {
			return i;
		}
	}
	return a.length === b.length ? -1 : n;
};

/** Fixture names discovered from `golden/*-input.md` (without the suffix). */
const discoverCases = (): string[] =>
	readdirSync(GOLDEN_DIR)
		.filter((f) => f.endsWith("-input.md"))
		.map((f) => f.slice(0, -"-input.md".length))
		.sort();

describe("artifact projection golden fixtures", () => {
	const cases = discoverCases();

	test("discovers golden fixture pairs", () => {
		// Guards against a vacuous generated-test loop without coupling the
		// assertion to the exact fixture count.
		expect(cases.length).toBeGreaterThan(0);
	});

	for (const name of cases) {
		test(`${name} renders byte-identical to its golden output`, () => {
			const sourcePath = `examples/${name}-input.md`;
			const input = readFileSync(join(GOLDEN_DIR, `${name}-input.md`), "utf8");
			const expected = readFileSync(
				join(GOLDEN_DIR, `${name}-output.md`),
				"utf8",
			);

			const { body } = project(input, sourcePath);

			const encoder = new TextEncoder();
			const actualBytes = encoder.encode(body);
			const expectedBytes = encoder.encode(expected);

			const diff = firstDiff(actualBytes, expectedBytes);
			if (diff !== -1) {
				throw new Error(
					`projection for fixture "${name}" diverges from golden output at byte ${diff} ` +
						`(actual ${actualBytes.length} bytes, expected ${expectedBytes.length} bytes)`,
				);
			}
			expect(actualBytes.length).toBe(expectedBytes.length);
		});
	}
});

describe("CRLF frontmatter tolerance (REQ-008)", () => {
	test("CRLF frontmatter splits identically to its LF twin", () => {
		const lf =
			"---\nproducer: bug-investigator\nrp1_doc_id: abc\n---\n# Title\n\nbody\n";
		const crlf = lf.replace(/\n/g, "\r\n");

		const lfSplit = splitFrontmatter(lf);
		const crlfSplit = splitFrontmatter(crlf);

		expect(crlfSplit.fm).toEqual(lfSplit.fm);
		expect(crlfSplit.fm.producer).toBe("bug-investigator");
		expect(crlfSplit.fm.rp1_doc_id).toBe("abc");
	});

	test("an LF artifact is unchanged by CRLF tolerance", () => {
		const lf =
			"---\nproducer: bug-investigator\nrp1_doc_id: abc\n---\n# Title\n\nbody\n";
		const { fm, body } = splitFrontmatter(lf);

		expect(fm).toEqual({ producer: "bug-investigator", rp1_doc_id: "abc" });
		expect(body).toBe("# Title\n\nbody\n");
	});

	test("a CRLF artifact projects byte-identically to its LF twin", () => {
		// project() must normalize line endings end-to-end: otherwise a stray
		// `\r` leaks into every projected line, because assemble() splits the
		// body on `\n`. Use a multi-line-body fixture so a regression surfaces
		// across many lines, not just the lead.
		const name = "investigation-report";
		const sourcePath = `examples/${name}-input.md`;
		const lfInput = readFileSync(join(GOLDEN_DIR, `${name}-input.md`), "utf8");
		const crlfInput = lfInput.replace(/\n/g, "\r\n");
		const expected = readFileSync(
			join(GOLDEN_DIR, `${name}-output.md`),
			"utf8",
		);

		const encoder = new TextEncoder();
		const actualBytes = encoder.encode(project(crlfInput, sourcePath).body);
		const expectedBytes = encoder.encode(expected);

		expect(firstDiff(actualBytes, expectedBytes)).toBe(-1);
		expect(actualBytes.length).toBe(expectedBytes.length);
	});
});
