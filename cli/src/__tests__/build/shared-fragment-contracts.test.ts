/**
 * Contract tests for plugins/shared/ fragments.
 *
 * These fragments are spliced into 40+ agent and skill prompts at build time
 * via the include_shared directive, so a one-line edit silently rewrites
 * every consumer's discipline block. Pin the key invariant sentences here so
 * fragment edits trip CI the same way skill-body edits do.
 */

import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dir, "..", "..", "..", "..");

const readFragment = (name: string): Promise<string> =>
	readFile(join(REPO_ROOT, "plugins", "shared", name), "utf-8");

describe("shared fragment contracts", () => {
	test("anti-loop.md pins single-pass execution invariants", async () => {
		const fragment = await readFragment("anti-loop.md");
		expect(fragment).toContain("Single-pass execution");
		expect(fragment).toContain("Ask for clarification or approval");
		expect(fragment).toContain("Iterate, refine, or loop");
		expect(fragment).toContain("Re-implement or retry completed work");
		expect(fragment).toContain("Document the error clearly");
		expect(fragment).toContain("STOP");
	});

	test("bounded-iteration.md permits exactly one clarifying question", async () => {
		const fragment = await readFragment("bounded-iteration.md");
		expect(fragment).toContain("Single pass through the phase graph");
		expect(fragment).toContain("one** focused question");
		expect(fragment).toContain("do not open a dialogue");
		expect(fragment).toContain("stop instead of retrying");
	});

	test("bounded-iteration.md does not forbid what it exists to allow", async () => {
		// This fragment is the counterpart to anti-loop.md for workflows that
		// own a clarify/interview state. Reintroducing anti-loop's blanket
		// prohibition here would recreate the contradiction it resolves.
		const fragment = await readFragment("bounded-iteration.md");
		expect(fragment).not.toContain("Ask for clarification or approval");
	});

	test("anti-loop.md and bounded-iteration.md have disjoint consumers", async () => {
		// A prompt including both would carry contradictory clarification rules.
		const { Glob } = await import("bun");
		const glob = new Glob("plugins/**/*.md");
		const offenders: string[] = [];

		for await (const file of glob.scan(REPO_ROOT)) {
			const content = await readFile(join(REPO_ROOT, file), "utf-8");
			if (
				content.includes('include_shared "anti-loop.md"') &&
				content.includes('include_shared "bounded-iteration.md"')
			) {
				offenders.push(file);
			}
		}

		expect(offenders).toEqual([]);
	});

	test("engineering-discipline.md pins the ten MUST rules", async () => {
		const fragment = await readFragment("engineering-discipline.md");
		const rules = fragment.split("\n").filter((line) => line.startsWith("- "));
		expect(rules.length).toBe(10);
		expect(fragment).toContain("Write for the next reader under pressure");
		expect(fragment).toContain("Fail loud near cause");
		expect(fragment).toContain("Prefer duplication over wrong abstraction");
		expect(fragment).toContain("Make effects/boundaries/failures explicit");
		expect(fragment).toContain("Make change easy, then make easy change");
	});

	test("output-discipline.md pins silent JSON-only execution", async () => {
		const fragment = await readFragment("output-discipline.md");
		expect(fragment).toContain("Silent Execution");
		expect(fragment).toContain("Output ONLY the final JSON");
		expect(fragment).toContain("No progress updates");
	});

	test("kb-progressive-loading.md pins index-first progressive loading", async () => {
		const fragment = await readFragment("kb-progressive-loading.md");
		expect(fragment).toContain("index.md` first (required)");
		expect(fragment).toContain("Load additional KB files only as needed");
		expect(fragment).toContain("warn and continue");
	});
});
