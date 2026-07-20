import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const repoRoot = resolve(import.meta.dir, "..");

const readRepoFile = (path: string): Promise<string> =>
	readFile(resolve(repoRoot, path), "utf8");

const expectInOrder = (content: string, fragments: string[]): void => {
	let previousIndex = -1;
	for (const fragment of fragments) {
		const index = content.indexOf(fragment);
		expect(index).toBeGreaterThan(previousIndex);
		previousIndex = index;
	}
};

describe("parent-owned interview foundation", () => {
	test("keeps interaction in the parent and persists before continuing", async () => {
		const contract = await readRepoFile(
			"plugins/shared/parent-owned-interview.md",
		);

		expect(contract).toContain(
			"Only the including top-level skill asks user-facing questions.",
		);
		expect(contract).toContain(
			"At most 10 parent questions per artifact phase.",
		);
		expect(contract).toContain(
			"Preserve Will and Won't as separate regions, including list indentation and hierarchy.",
		);
		expectInOrder(contract, [
			"1. Read the entire current artifact.",
			"2. Scan only the caller-declared required sections.",
			"3. Ask one focused question from the parent.",
			"4. Reconstruct and write the entire artifact",
			"5. Re-read the artifact",
			"6. Only after the successful re-read",
		]);
		expect(contract).not.toMatch(/\{%\s*(?:if|case|ask_user)\b/);
	});

	test("makes every required charter field an ordinary durable gap", async () => {
		const charter = await readRepoFile(
			"plugins/base/skills/artifact-templates/templates/charter-interviewer/charter.md",
		);

		for (const heading of [
			"Vision",
			"Problem & Context",
			"Target Users",
			"Business Rationale",
			"Success Criteria",
		]) {
			expect(charter).toContain(`## ${heading}\n_TBD_`);
		}
		expect(charter).toContain("### Will\n- _TBD_");
		expect(charter).toContain("### Won't\n- _TBD_");
		expect(charter).toContain("**Status**: Draft");
		expect(charter).not.toContain("Scratch Pad");
	});

	test("uses durable PRD gaps and a resolved charter link", async () => {
		const prd = await readRepoFile(
			"plugins/base/skills/artifact-templates/templates/blueprint-wizard/prd.md",
		);

		expect(prd).toContain("**Charter**: {Resolved Charter Link}");
		expect(prd).toContain("**Additional Context**: _TBD_");
		expect(prd).toContain("**Status**: Draft");
		for (const heading of [
			"Surface Overview",
			"Dependencies & Constraints",
			"Milestones & Timeline",
			"Open Questions",
		]) {
			expect(prd).toContain(`## ${heading}\n_TBD_`);
		}
		for (const heading of [
			"In Scope",
			"Out of Scope",
			"Functional Requirements",
			"Non-Functional Requirements",
		]) {
			expect(prd).toContain(`### ${heading}\n_TBD_`);
		}
		expect(prd).toContain("| A1 | _TBD_ | _TBD_ | _TBD_ |");
		expect(prd).not.toContain(".rp1/context/charter.md");
	});
});
