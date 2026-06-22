/**
 * Tests for the teach-me `export` command and its self-containment re-assertion
 * (T7).
 *
 * Export is a thin pass-through over an already-rendered `lesson.html`: it
 * re-asserts self-containment and emits the standalone file (REQ-009). The full
 * static-gate pattern matrix is T6's; these pin only the behaviors export owns:
 *
 * 1. `assertSelfContained` runs exactly the artifact-bytes subset (size, no
 *    external network reference, no runtime library) — without the repo
 *    `file:line` / research-references provenance checks `export` cannot run —
 *    and must not false-positive on the W3C XML-namespace URIs in an inlined
 *    `<svg>`.
 * 2. `exportFromFile` writes the destination only when the artifact is
 *    self-contained: a passing artifact is copied byte-for-byte, a
 *    non-self-contained artifact leaves no exported file behind, and a missing
 *    input surfaces an actionable not-found error.
 */

import { describe, expect, it } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as E from "fp-ts/lib/Either.js";
import { exportFromFile } from "../../commands/teach-me/export.js";
import {
	assertSelfContained,
	DEFAULT_SIZE_LIMIT_BYTES,
} from "../../teach-me/gate/index.js";

/** A self-contained artifact body: inline style + inline IIFE script, no external refs. */
const CLEAN_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>Doc</title><style>.tm-x{color:red}</style><script>(()=>{})()</script></head>
<body><main class="tm-lesson"><tm-prose><p>Body text.</p></tm-prose></main></body></html>`;

/** Run a callback against a fresh temp directory, always cleaning up afterwards. */
async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
	const dir = await mkdtemp(join(tmpdir(), "tm-export-"));
	try {
		return await fn(dir);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
}

describe("assertSelfContained", () => {
	it("passes a self-contained artifact and runs only the self-containment checks", () => {
		const result = assertSelfContained(CLEAN_HTML);

		expect(result.passed).toBe(true);
		// Exactly the artifact-bytes subset — none of the static gate's
		// repo-provenance / research checks (export has no repo or parsed lesson).
		expect(result.checks.map((c) => c.name)).toEqual([
			"size-within-budget",
			"no-external-network-references",
			"no-runtime-rendering-library",
		]);
	});

	it("does not false-positive on SVG XML-namespace URIs", () => {
		// xmlns/xlink here are W3C spec identifiers, not fetchable resources.
		const html = `${CLEAN_HTML}
<tm-diagram data-alt="a flow"><svg xmlns="http://www.w3.org/2000/svg"
xmlns:xlink="http://www.w3.org/1999/xlink"><rect/></svg></tm-diagram>`;

		expect(assertSelfContained(html).passed).toBe(true);
	});

	it("fails on a fetchable external reference and names the check", () => {
		const html = CLEAN_HTML.replace(
			"<tm-prose>",
			'<img src="https://evil.example/x.png"><tm-prose>',
		);
		const result = assertSelfContained(html);

		expect(result.passed).toBe(false);
		const failing = result.checks.find(
			(c) => c.name === "no-external-network-references",
		);
		expect(failing?.passed).toBe(false);
		expect(failing?.detail).toBeDefined();
	});

	it("fails on a runtime library (external script) and names the check", () => {
		const html = CLEAN_HTML.replace(
			"</head>",
			'<script src="https://cdn.example/m.js"></script></head>',
		);
		const result = assertSelfContained(html);

		expect(result.passed).toBe(false);
		expect(
			result.checks.find((c) => c.name === "no-runtime-rendering-library")
				?.passed,
		).toBe(false);
	});

	it("fails when the artifact exceeds the size budget", () => {
		const huge = `${CLEAN_HTML}${"x".repeat(DEFAULT_SIZE_LIMIT_BYTES)}`;
		const result = assertSelfContained(huge);

		expect(result.passed).toBe(false);
		expect(
			result.checks.find((c) => c.name === "size-within-budget")?.detail,
		).toContain("budget");
	});
});

describe("exportFromFile", () => {
	it("emits a byte-identical standalone file for a self-contained artifact", async () => {
		await withTempDir(async (dir) => {
			const input = join(dir, "lesson.html");
			const output = join(dir, "nested", "out.html");
			await writeFile(input, CLEAN_HTML, "utf8");

			const result = await exportFromFile(input, output)();

			expect(E.isRight(result)).toBe(true);
			if (!E.isRight(result)) return;
			expect(result.right.passed).toBe(true);
			// The emitted file exists (parent dir created) and is byte-identical.
			expect(await readFile(output, "utf8")).toBe(CLEAN_HTML);
		});
	});

	it("writes no output file when the artifact is not self-contained", async () => {
		await withTempDir(async (dir) => {
			const input = join(dir, "lesson.html");
			const output = join(dir, "out.html");
			await writeFile(
				input,
				CLEAN_HTML.replace(
					"<tm-prose>",
					'<img src="https://evil.example/x.png"><tm-prose>',
				),
				"utf8",
			);

			const result = await exportFromFile(input, output)();

			expect(E.isRight(result)).toBe(true);
			if (!E.isRight(result)) return;
			expect(result.right.passed).toBe(false);
			// A non-self-contained artifact must not be emitted.
			expect(await Bun.file(output).exists()).toBe(false);
		});
	});

	it("returns a not-found error for a missing input file", async () => {
		const result = await exportFromFile(
			"/no/such/lesson.html",
			join(tmpdir(), "tm-export-missing-out.html"),
		)();

		expect(E.isLeft(result)).toBe(true);
		if (!E.isLeft(result)) return;
		expect(result.left._tag).toBe("NotFoundError");
	});
});
