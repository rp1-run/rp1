import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { Logger } from "../cli/shared/logger.js";
import { buildPlatformPlugin } from "../cli/src/build/command.js";
import { PLATFORM_DEFINITIONS } from "../cli/src/build/platform-definitions.js";
import { resolveSharedIncludes } from "../cli/src/build/preprocessor.js";

const repoRoot = resolve(import.meta.dir, "..");

const readRepoFile = (path: string): Promise<string> =>
	readFile(resolve(repoRoot, path), "utf8");

const noopLogger: Logger = {
	trace: () => {},
	debug: () => {},
	info: () => {},
	warn: () => {},
	error: () => {},
	start: () => {},
	success: () => {},
	fail: () => {},
	box: () => {},
};

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

	test("defines bootstrap scaffolding as one-shot action work", async () => {
		const scaffolder = await readRepoFile(
			"plugins/dev/agents/bootstrap-scaffolder.md",
		);

		expect(scaffolder).toContain(
			"description: One-shot non-interactive bootstrap worker for bounded PLAN, REVISE, or APPLY actions",
		);
		expect(scaffolder).toContain("- name: ACTION");
		expect(scaffolder).toContain("type: enum");
		for (const action of ["PLAN", "REVISE", "APPLY"]) {
			expect(scaffolder).toContain(`      - "${action}"`);
		}
		for (const argument of [
			"PROJECT_NAME",
			"TARGET_DIR",
			"CHARTER_PATH",
			"PREFS_PATH",
			"KB_ROOT",
			"WORK_ROOT",
			"RUN_ID",
		]) {
			expect(scaffolder).toContain(`- name: ${argument}`);
		}
		expect(scaffolder).toContain(
			"Perform exactly one bounded `ACTION`, return one result, then stop.",
		);
		expect(scaffolder).toContain(
			"The parent skill owns all user interaction and artifact registration. Never ask the user or request input.",
		);
		expect(scaffolder).toContain("Do not invoke another skill or agent.");
		expect(scaffolder).toContain(
			"Return exactly one raw JSON object with these keys in this order: `action`, `status`, `changed_files`, `conflicts`, `research_fallback`, `warnings`, `retry_guidance`.",
		);
		expect(scaffolder).not.toMatch(
			/\$[1-9]|next_question|research_ready|Phase: INTERVIEW|Scratch Pad|Caller handles interaction|re-invokes|relay|continuation|checkpoint/i,
		);
		expect(scaffolder).not.toMatch(
			/{%\s*(?:ask_user|dispatch_agent|include_shared)\b/,
		);
	});

	test("makes bootstrap planning research bounded with an explicit fallback", async () => {
		const scaffolder = await readRepoFile(
			"plugins/dev/agents/bootstrap-scaffolder.md",
		);

		expect(scaffolder).toContain(
			"tools: Read, Write, Bash, WebFetch, WebSearch",
		);
		expect(scaffolder).toContain(
			"Read the complete `CHARTER_PATH` and `PREFS_PATH` before planning.",
		);
		expect(scaffolder).toContain(
			"Use at most 6 searches and 8 authoritative source reads.",
		);
		expect(scaffolder).toContain(
			"Prefer primary, authoritative sources for current tool and framework guidance.",
		);
		expect(scaffolder).toContain(
			"If no web research tool is available or a required lookup fails, continue from the persisted artifacts and model knowledge.",
		);
		expect(scaffolder).toContain(
			"Mark every version-sensitive claim without current authoritative evidence as `Verify before apply`.",
		);
		expectInOrder(scaffolder, [
			"Write the complete reconstructed preferences document",
			"Re-read `PREFS_PATH` and verify both updated sections",
		]);
	});

	test("revises one persisted bootstrap plan exactly once", async () => {
		const scaffolder = await readRepoFile(
			"plugins/dev/agents/bootstrap-scaffolder.md",
		);

		expect(scaffolder).toContain(
			"Require one substantive persisted `Revision Request` and a substantive `Scaffold Plan`.",
		);
		expect(scaffolder).toContain(
			"Write the replacement into `Revised Plan` exactly once; preserve the original `Scaffold Plan` and `Revision Request`.",
		);
		expect(scaffolder).toContain(
			"If `Revised Plan` is already substantive, do not revise it again.",
		);
		expect(scaffolder).toContain(
			"For `Revision Request` and `Revised Plan`, `Not requested` is also not a substantive revision value.",
		);
		expect(scaffolder).toContain(
			"Use only the ordinary charter and preferences sections as action state.",
		);
	});

	test("applies approved bootstrap plans idempotently without overwrites", async () => {
		const scaffolder = await readRepoFile(
			"plugins/dev/agents/bootstrap-scaffolder.md",
		);

		expectInOrder(scaffolder, [
			"Require a fresh `PREFS_PATH` read whose `Plan Review` is exactly `Approved` before any scaffold effect.",
			"Use a substantive `Revised Plan` when present; otherwise use `Scaffold Plan`.",
			"Check only the expected outputs declared by the approved plan.",
			"Create only missing planned outputs.",
			"Write the complete reconstructed preferences document with an `Apply Result`",
		]);
		expect(scaffolder).toContain(
			"Preserve every pre-existing output with different or unrelated content and report it as a conflict; never overwrite or merge it.",
		);
		expect(scaffolder).toContain(
			"On every APPLY invocation, re-check the approved plan and its expected outputs directly, including after a partial prior result.",
		);
		expect(scaffolder).toContain(
			"Resolve dependency versions through the selected package manager or installed-tool evidence; never assert an unverified exact version.",
		);
		expect(scaffolder).not.toContain("--type artifact_registered");
		expect(scaffolder).not.toContain("rp1 agent-tools emit");
	});

	test("rejects every bootstrap project name before target effects", async () => {
		const bootstrap = await readRepoFile(
			"plugins/dev/skills/bootstrap/SKILL.md",
		);

		expect(bootstrap).toContain("`^[a-z0-9][a-z0-9-]*$`");
		expect(bootstrap).toContain(
			"Validate every supplied, inferred, or recovered project name",
		);
		expect(bootstrap).toContain(
			"Do not trim, sanitize, lowercase, or otherwise rewrite a candidate",
		);
		expectInOrder(bootstrap, [
			"Validate `CANDIDATE_PROJECT_NAME`",
			"Only after validation may the parent set `PROJECT_NAME` and `TARGET_DIR`",
			"Initialize Or Reuse The Selected Target",
		]);
	});

	test("discovers bootstrap resume state only from ordinary preferences", async () => {
		const bootstrap = await readRepoFile(
			"plugins/dev/skills/bootstrap/SKILL.md",
		);

		expect(bootstrap).toContain(
			"A resumable candidate exists only when its resolved `{targetKbRoot}/preferences.md` exists.",
		);
		expect(bootstrap).toContain(
			"Inspect only the current directory and safe-named direct children",
		);
		expect(bootstrap).toContain(
			"Known `_TBD_` sections in `charter.md` and `preferences.md` are the only resume state.",
		);
		expect(bootstrap).not.toContain("rp1 agent-tools workflow-state");
		expect(bootstrap).not.toContain("## Scratch Pad");
		expect(bootstrap).not.toContain("<!-- Phase:");
	});

	test("keeps bootstrap interviews parent-owned and durable before planning", async () => {
		const bootstrap = await readRepoFile(
			"plugins/dev/skills/bootstrap/SKILL.md",
		);

		expect(bootstrap).toContain(
			'{% include_shared "parent-owned-interview.md" %}',
		);
		expectInOrder(bootstrap, [
			"Ask one focused charter question directly from this parent skill.",
			"Write the complete reconstructed charter",
			"Re-read the charter after the successful write",
			"Ask one focused preferences question directly from this parent skill.",
			"Write the complete reconstructed preferences document",
			"Re-read the preferences document after the successful write",
			"ACTION=PLAN",
		]);
		expect(bootstrap).toContain(
			"MUST NOT dispatch inside either interview loop",
		);
		expect(bootstrap).not.toMatch(/{%\s*ask_user\b/);
		expect(bootstrap).not.toContain(
			'{% dispatch_agent "rp1-dev:charter-interviewer" %}',
		);
	});

	test("keeps the composed bootstrap prompt compatible with parent-owned questions", async () => {
		const bootstrap = await readRepoFile(
			"plugins/dev/skills/bootstrap/SKILL.md",
		);
		const result = await resolveSharedIncludes(bootstrap, repoRoot);

		expect(result._tag).toBe("Right");
		if (result._tag === "Left") {
			throw new Error(result.left.message);
		}

		expect(bootstrap).not.toContain('{% include_shared "anti-loop.md" %}');
		for (const prohibition of [
			"Ask for clarification or approval",
			"Wait for user feedback",
			"Request additional information",
		]) {
			expect(result.right).not.toContain(prohibition);
		}
	});

	test("renders one directory-only selected-target handoff on every platform", async () => {
		const outputRoot = await mkdtemp(
			join(tmpdir(), "rp1-bootstrap-directory-handoff-"),
		);

		try {
			const platformDefinitions = Array.from(PLATFORM_DEFINITIONS.values());
			expect(platformDefinitions.map(({ id }) => id).sort()).toEqual([
				"antigravity",
				"claude-code",
				"codex",
				"copilot",
				"opencode",
			]);

			for (const definition of platformDefinitions) {
				const platformOutput = join(outputRoot, definition.id);
				const result = await buildPlatformPlugin(
					"dev",
					repoRoot,
					platformOutput,
					definition,
					noopLogger,
					true,
				);

				expect(result.summary.errors).toEqual([]);
				const skillDirectory =
					definition.id === "claude-code" ? "bootstrap" : "rp1-bootstrap";
				const bootstrap = await readFile(
					join(platformOutput, "dev", "skills", skillDirectory, "SKILL.md"),
					"utf8",
				);

				expect(bootstrap.match(/rp1 agent-tools resolve-args/g)).toHaveLength(
					2,
				);
				expect(bootstrap.match(/--args "/g)).toHaveLength(1);
				expect(
					bootstrap.match(/--project-root "\{TARGET_DIR\}"/g),
				).toHaveLength(1);
				expect(bootstrap).toContain("--name rp1-dev':'bootstrap");
				expectInOrder(bootstrap, [
					"## 0. Resolve Arguments",
					"Use these resolved values for all subsequent steps.",
					"The generated Resolve Arguments section already parsed `PROJECT_NAME`",
					"This directory-only lookup is the one explicit exception",
					'--project-root "{TARGET_DIR}"',
					"Consume only `data.directories`",
					"`targetProjectRoot`, `targetKbRoot`, and `targetWorkRoot` replace the invocation roots",
				]);
			}
		} finally {
			await rm(outputRoot, { recursive: true, force: true });
		}
	});

	test("persists bootstrap approval decisions before their actions", async () => {
		const bootstrap = await readRepoFile(
			"plugins/dev/skills/bootstrap/SKILL.md",
		);

		expectInOrder(bootstrap, [
			"Persist the accepted plan as `Approved` in `Plan Review`",
			"Re-read and verify the approval",
			"ACTION=APPLY",
		]);
		expectInOrder(bootstrap, [
			"Persist the complete requested change in `Revision Request`",
			"Re-read and verify the requested change",
			"ACTION=REVISE",
		]);
		expect(bootstrap).toContain(
			"Persist `Revision limit reached; rerun bootstrap to request another plan`",
		);
		expect(bootstrap).toContain(
			"Stop without another dispatch and give rerun guidance.",
		);
	});

	test("bounds bootstrap to one plan, one revision, and one apply dispatch", async () => {
		const bootstrap = await readRepoFile(
			"plugins/dev/skills/bootstrap/SKILL.md",
		);

		expect(bootstrap.match(/ACTION=PLAN/g)).toHaveLength(1);
		expect(bootstrap.match(/ACTION=REVISE/g)).toHaveLength(1);
		expect(bootstrap.match(/ACTION=APPLY/g)).toHaveLength(1);
		expect(
			bootstrap.match(/{% dispatch_agent "rp1-dev:bootstrap-scaffolder" %}/g),
		).toHaveLength(3);
	});

	test("registers bootstrap KB artifacts from the resolved target roots", async () => {
		const bootstrap = await readRepoFile(
			"plugins/dev/skills/bootstrap/SKILL.md",
		);

		expect(bootstrap).toContain(
			"Map `directories.projectRoot` to `targetProjectRoot` and `directories.kbRoot` to `targetKbRoot`",
		);
		expect(bootstrap).toContain('--project "{targetProjectRoot}"');
		expect(bootstrap).toContain(
			'"path": "{targetKbRoot}/charter.md", "feature": "{PROJECT_NAME}", "storageRoot": "project"',
		);
		expect(bootstrap).toContain(
			'"path": "{targetKbRoot}/preferences.md", "feature": "{PROJECT_NAME}", "storageRoot": "project"',
		);
	});

	test("defines ordinary bootstrap preference gaps", async () => {
		const bootstrap = await readRepoFile(
			"plugins/dev/skills/bootstrap/SKILL.md",
		);

		for (const heading of [
			"Project",
			"Tech Stack",
			"Research Notes",
			"Scaffold Plan",
			"Plan Review",
			"Revision Request",
			"Revised Plan",
			"Apply Result",
		]) {
			expect(bootstrap).toContain(`## ${heading}`);
		}
		expect(bootstrap).toContain("**Status**: Draft");
	});
});
