import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dir, "..", "..", "..", "..");

describe("code-investigate skill contract", () => {
	test("accepts freeform problem statements and passes an effective issue id downstream", async () => {
		const content = await readFile(
			join(REPO_ROOT, "plugins/dev/skills/code-investigate/SKILL.md"),
			"utf-8",
		);

		expect(content).toContain("name: PROBLEM_STATEMENT");
		expect(content).toContain("variadic: true");
		expect(content).toContain(
			"PROBLEM_STATEMENT={PROBLEM_STATEMENT}, ISSUE_ID={EFFECTIVE_ISSUE_ID}",
		);
		expect(content).toContain(
			'"path": "issues/{EFFECTIVE_ISSUE_ID}/investigation_report.md"',
		);
		expect(content).not.toContain(
			"passing the `RUN_ID` so it can emit `btw_update` events",
		);
	});
});
