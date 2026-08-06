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

const readPrompt = (name: string): Promise<string> =>
	readFile(join(REPO_ROOT, "plugins", "dev", "agents", name), "utf-8");

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

	test("delegated workers that escalate decisions do not use bounded-iteration.md", async () => {
		// A prompt returning `needs_decision` hands the question to its caller,
		// which owns the user prompt and reinvokes with the answer. Granting it
		// bounded-iteration's permission to ask directly contradicts that
		// protocol, so such prompts must stay on anti-loop.md.
		const { Glob } = await import("bun");
		const glob = new Glob("plugins/**/*.md");
		const offenders: string[] = [];

		for await (const file of glob.scan(REPO_ROOT)) {
			const content = await readFile(join(REPO_ROOT, file), "utf-8");
			if (
				content.includes("needs_decision") &&
				content.includes('include_shared "bounded-iteration.md"')
			) {
				offenders.push(file);
			}
		}

		expect(offenders).toEqual([]);
	});

	test("engineering-discipline.md preserves the original ten MUST rules", async () => {
		const fragment = await readFragment("engineering-discipline.md");
		const [discipline] = fragment.split("\n## Reuse-First Scope Discipline\n");
		const rules = discipline
			.split("\n")
			.filter((line) => line.startsWith("- "));

		expect(rules).toEqual([
			"- Write for the next reader under pressure: names/structure/control flow show intent.",
			"- Minimize complexity, not lines: simple paths, narrow APIs, deep modules.",
			"- Model domain invariants; make wrong states hard to express.",
			"- Fail loud near cause; never hide impossible state, corrupt data, or unexpected errors.",
			"- Co-locate code that changes together; organize by behavior/ownership.",
			"- Treat code as liability: no speculative hooks/layers/options/deps/features.",
			"- Prefer duplication over wrong abstraction.",
			"- Make effects/boundaries/failures explicit: IO, time, random, concurrency, retries, external deps.",
			"- Make prod diagnosable: structured errors/logs/metrics/traces/correlation IDs/breadcrumbs.",
			"- Make change easy, then make easy change: refactor small before behavior when shape fights goal.",
		]);
	});

	test("engineering-discipline.md pins reuse-first policy and completion stop", async () => {
		const fragment = await readFragment("engineering-discipline.md");

		expect(fragment).toContain(
			"For each gate-approved task, choose the first sufficient option:",
		);
		expect(fragment).toContain(
			"1. Reuse an existing project capability or established project pattern.",
		);
		expect(fragment).toContain(
			"2. Use an available platform or language capability.",
		);
		expect(fragment).toContain("3. Use an already-available dependency.");
		expect(fragment).toContain("4. Create the minimum custom work necessary.");
		expect(fragment).toContain(
			"Sufficient means fully meeting approved acceptance criteria and realistically reachable failure needs. Do not proceed to a later option after a sufficient one.",
		);
		expect(fragment).toContain(
			"This policy cannot skip or renegotiate a gate-approved task.",
		);
		expect(fragment).toContain("All approved safeguards remain mandatory");
		expect(fragment).toContain(
			"After required verification confirms approved acceptance criteria and realistically reachable failure paths, stop.",
		);
		expect(fragment).toContain(
			"Do not start a fresh improvement, hardening, or edge-case discovery sweep.",
		);
	});

	test("delivery roles consume engineering discipline through the shared fragment", async () => {
		const [taskBuilder, taskReviewer, speedrunBuilder] = await Promise.all([
			readPrompt("task-builder.md"),
			readPrompt("task-reviewer.md"),
			readPrompt("speedrun-builder.md"),
		]);

		for (const prompt of [taskBuilder, taskReviewer, speedrunBuilder]) {
			expect(
				prompt.match(/include_shared "engineering-discipline\.md"/g),
			).toHaveLength(1);
		}
	});

	test("task reviewer keeps verdicts stable and evidence bounded", async () => {
		const reviewer = await readPrompt("task-reviewer.md");

		expect(reviewer).toContain(
			"Edge cases required by approved requirements, design, acceptance criteria, or realistically reachable failures are addressed",
		);
		expect(reviewer).toContain(
			"Return FAILURE only when uncertainty affects an approved acceptance criterion or realistically reachable production invariant; otherwise record a non-blocking suggestion with clear guidance.",
		);
		expect(reviewer).toContain(`### SUCCESS Criteria
All of these must be true:
- Discipline: PASS (no scope violations)
- Accuracy: PASS (implementation matches design)
- Completeness: PASS (all acceptance criteria met)
- Quality: PASS (follows patterns) OR PASS with suggestions
- Testing: PASS (tests are high-value) OR N/A (no tests added)
- Commit: PASS (valid atomic commit with correct format) OR N/A (GIT_COMMIT=false or no code changes)
- Comments: PASS (no unnecessary comments) OR N/A (no code files modified)`);
		expect(reviewer).toContain(`### FAILURE Criteria
Any of these trigger FAILURE:
- Discipline: FAIL (scope violations found)
- Accuracy: FAIL (implementation doesn't match design)
- Completeness: FAIL (missing acceptance criteria)
- Quality: FAIL with blocking issues
- Testing: FAIL (superfluous or low-value tests added)
- Commit: FAIL (missing commit, wrong format, or unrelated files)
- Comments: FAIL (unnecessary comments found in modified files)`);
	});

	test("speedrun builder retains rapid-delivery safeguards", async () => {
		const speedrunBuilder = await readPrompt("speedrun-builder.md");

		expect(speedrunBuilder).toContain("- Do NOT commit changes");
		expect(speedrunBuilder).toContain(
			"- Do NOT modify files unrelated to the request",
		);
		expect(speedrunBuilder).toContain(
			"- If the request is ambiguous, prefer the most conservative interpretation",
		);
		expect(speedrunBuilder).toContain(
			"- Run smallest relevant format/lint/test check identifiable quickly.",
		);
		expect(speedrunBuilder).toContain(
			"- Add/modify tests only for behavior change, bug regression, or risky branch.",
		);
		expect(speedrunBuilder).toContain(
			"- Else report: `Tests: not added (no high-value regression)`.",
		);
		expect(speedrunBuilder).toContain(
			"- If design/broad coverage/scope exceeds gate: STOP -> /build-fast or /build.",
		);
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
