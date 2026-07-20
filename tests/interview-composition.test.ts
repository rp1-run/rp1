import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const repoRoot = resolve(import.meta.dir, "..");

const readRepoFile = (path: string): Promise<string> =>
	readFile(resolve(repoRoot, path), "utf8");

const blueprintFinalizerPaths = [
	"plugins/dev/agents/charter-interviewer.md",
	"plugins/dev/agents/blueprint-wizard.md",
] as const;

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

	test("validates the effective PRD name before blueprint artifact effects", async () => {
		const blueprint = await readRepoFile(
			"plugins/dev/skills/blueprint/SKILL.md",
		);

		expect(blueprint).toContain('`EFFECTIVE_PRD_NAME = PRD_NAME || "main"`');
		expect(blueprint).toContain("`^[A-Za-z0-9][A-Za-z0-9_-]*$`");
		expectInOrder(blueprint, [
			'`EFFECTIVE_PRD_NAME = PRD_NAME || "main"`',
			"Validate `EFFECTIVE_PRD_NAME`",
			"Read `{kbRoot}/charter.md`",
		]);
	});

	test("keeps blueprint interviews parent-owned and finalizers bounded", async () => {
		const blueprint = await readRepoFile(
			"plugins/dev/skills/blueprint/SKILL.md",
		);

		expect(blueprint).toContain(
			'{% include_shared "parent-owned-interview.md" %}',
		);
		expectInOrder(blueprint, [
			"Ask one focused charter question directly from this parent skill.",
			"Write the complete reconstructed charter",
			"Re-read the charter after the successful write",
			'{% dispatch_agent "rp1-dev:charter-interviewer" %}',
		]);
		expectInOrder(blueprint, [
			"Ask one focused PRD question directly from this parent skill.",
			"Write the complete reconstructed PRD",
			"Re-read the PRD after the successful write",
			'{% dispatch_agent "rp1-dev:blueprint-wizard" %}',
		]);
		expect(
			blueprint.match(/{% dispatch_agent "rp1-dev:charter-interviewer" %}/g),
		).toHaveLength(1);
		expect(
			blueprint.match(/{% dispatch_agent "rp1-dev:blueprint-wizard" %}/g),
		).toHaveLength(1);
		expect(blueprint).not.toMatch(/{%\s*ask_user\b/);
		expect(blueprint).not.toContain("Scratch Pad");
	});

	test("persists blueprint context and registers resolved artifacts", async () => {
		const blueprint = await readRepoFile(
			"plugins/dev/skills/blueprint/SKILL.md",
		);

		expect(blueprint).toContain(
			"Persist `EXTRA_CONTEXT` in `**Additional Context**`",
		);
		expect(blueprint).toContain(
			'"path": "{kbRoot}/charter.md", "feature": "blueprint", "storageRoot": "project"',
		);
		expect(blueprint).toContain(
			'"path": "prds/{EFFECTIVE_PRD_NAME}.md", "feature": "{EFFECTIVE_PRD_NAME}", "storageRoot": "work_dir"',
		);
	});

	test("keeps retained blueprint agents one-shot and non-interactive", async () => {
		for (const path of blueprintFinalizerPaths) {
			const finalizer = await readRepoFile(path);

			expect(finalizer).toContain("one-shot non-interactive finalizer");
			expect(finalizer).toContain("tools: Read, Write");
			expect(finalizer).toContain(
				"Return exactly one raw JSON object with these keys in this order: `status`, `artifact`, `gaps`, `warnings`.",
			);
			expect(finalizer).toContain(
				"Artifact registration belongs to the parent skill.",
			);
			expect(finalizer).not.toMatch(
				/{%\s*(?:ask_user|dispatch_agent|include_shared)\b/,
			);
			expect(finalizer).not.toMatch(
				/next_question|request_user_input|Scratch Pad|qa_history|relay envelope|continuation payload|checkpoint|--type artifact_registered/i,
			);
		}
	});

	test("keeps unresolved charter Vision draft and preserves nested scope", async () => {
		const finalizer = await readRepoFile(
			"plugins/dev/agents/charter-interviewer.md",
		);

		expect(finalizer).toContain(
			"Missing, empty, or placeholder-only Vision is a gap.",
		);
		expect(finalizer).toContain(
			"Never infer or invent Vision from another section.",
		);
		expect(finalizer).toContain(
			"Keep the document status `Draft` whenever any required gap remains.",
		);
		expect(finalizer).toContain(
			"Preserve the complete nested list blocks under `Will` and `Won't` byte-for-byte.",
		);
		expect(finalizer).toContain(
			"Never move, merge, flatten, reorder, or drop items between them.",
		);
	});

	test("preserves substantive content while finalizing either artifact", async () => {
		for (const path of blueprintFinalizerPaths) {
			const finalizer = await readRepoFile(path);

			expect(finalizer).toContain(
				"Preserve every substantive user-authored field and every unrelated section.",
			);
			expect(finalizer).toContain(
				"Read the supplied ordinary artifact before deciding whether a write is needed.",
			);
			expect(finalizer).toContain(
				"Report every remaining required gap explicitly in `gaps`.",
			);
		}
	});
});
