import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { parseAgent } from "../../build/parser.js";
import { expectTaskRight } from "../helpers/index.js";

const projectRoot = join(import.meta.dir, "..", "..", "..", "..");
const FRONTMATTER_REGEX = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/;

const readProjectFile = async (relativePath: string): Promise<string> =>
	readFile(join(projectRoot, relativePath), "utf-8");

const extractTemplateFrontmatter = (
	content: string,
): Record<string, unknown> => {
	const match = content.match(FRONTMATTER_REGEX);
	if (!match?.[1]) {
		throw new Error("Missing YAML frontmatter");
	}

	return parseYaml(match[1]) as Record<string, unknown>;
};

describe("Build v2 readiness contracts", () => {
	test("validation producers expose the shared envelope fields and statuses", async () => {
		const producerPaths = [
			"plugins/dev/agents/code-checker.md",
			"plugins/dev/agents/feature-verifier.md",
			"plugins/dev/agents/comment-cleaner.md",
		];

		for (const producerPath of producerPaths) {
			const content = await readProjectFile(producerPath);

			expect(content.toLowerCase()).toContain("validation envelope");
			for (const field of [
				'"status": "PASS|WARN|FAIL|WAITING"',
				'"blocking_issues"',
				'"warnings"',
				'"manual_items"',
				'"artifacts"',
				'"evidence"',
			]) {
				expect(content).toContain(field);
			}
		}
	});

	test("aggregator normalizes validation envelopes and writes the readiness artifact", async () => {
		const agentPath = join(
			projectRoot,
			"plugins/dev/agents/build-verify-aggregator.md",
		);
		const agent = await expectTaskRight(parseAgent(agentPath));

		expect(agent.arguments?.map((arg) => arg.name)).toEqual([
			"PHASE_RESULTS",
			"FEATURE_ID",
			"WORK_ROOT",
			"WORKFLOW",
			"RUN_ID",
		]);
		expect(agent.tools).toEqual(["Read", "Write", "Bash"]);
		expect(agent.content).toContain(
			"Allowed statuses: PASS, WARN, FAIL, WAITING.",
		);
		expect(agent.content).toContain(
			"Missing/null required component -> synthesize a FAIL envelope",
		);
		expect(agent.content).toContain(
			"Legacy `verification_complete: true` with no status -> PASS",
		);
		expect(agent.content).toContain(
			"Legacy `reason`, `error`, or `message` on FAIL/error-shaped output",
		);
		expect(agent.content).toContain("WAITING status or required manual item");
		expect(agent.content).toContain("Any warning or non-blocking manual item");
		expect(agent.content).toContain(
			"Required manual item: `required === true` or `blocks_release === true`.",
		);
		expect(agent.content).toContain(
			"Lead with readiness status, blockers, warnings, manual items, requirement evidence.",
		);
		expect(agent.content).toContain(
			"Write `{WORK_ROOT}/features/{FEATURE_ID}/build-readiness.md`.",
		);
		expect(agent.content).toContain('"storageRoot": "work_dir"');
	});

	test("readiness semantics cover missing, failing, warning, waiting, and evidence pass-through cases", async () => {
		const content = await readProjectFile(
			"plugins/dev/agents/build-verify-aggregator.md",
		);

		for (const expectedContract of [
			"Missing component, FAIL status, or any blocking issue",
			"return_to_implementation",
			"WAITING status or required manual item",
			"wait_for_human",
			"Any warning or non-blocking manual item",
			"proceed_with_notes",
			"Otherwise | PASS",
			'"evidence": []',
		]) {
			expect(content).toContain(expectedContract);
		}
	});

	test("validation producers do not bypass the shared envelope on terminal output", async () => {
		const verifier = await readProjectFile(
			"plugins/dev/agents/feature-verifier.md",
		);
		const cleaner = await readProjectFile(
			"plugins/dev/agents/comment-cleaner.md",
		);

		expect(verifier).toContain(
			"final output ONLY the raw JSON validation envelope from Step 7.5",
		);
		expect(verifier).not.toContain(
			"Your final output should be the completed verification report",
		);
		expect(cleaner).toContain(
			"If validation fails, output the shared validation envelope",
		);
		expect(cleaner).toContain(
			"If it is greater than 1500, output the shared validation envelope",
		);
		expect(cleaner).toContain(
			"Return ONLY raw JSON, no prose, no markdown fence.",
		);
		expect(cleaner).toContain("output the shared validation envelope and stop");
		expect(cleaner).not.toContain("```markdown");
		expect(cleaner).not.toContain(
			"Also output one machine-readable validation envelope",
		);
		expect(cleaner).not.toContain("Output the summary and stop.");
		expect(cleaner).toContain('"status": "FAIL"');
		expect(cleaner).toContain('"status": "WARN"');
	});

	test("build skill passes readiness context and branches on PASS WARN FAIL WAITING", async () => {
		const content = await readProjectFile("plugins/dev/skills/build/SKILL.md");

		expect(content).toContain(
			"PHASE_RESULTS={PHASE_RESULTS_JSON}, FEATURE_ID={FEATURE_ID}, WORK_ROOT={workRoot}, WORKFLOW=build, RUN_ID={RUN_ID}",
		);
		expect(content).toContain(
			"Extract `readiness_status`, `release_behavior`, `ready_for_release`, `blocking_issues`, `warnings`, and `manual_items`.",
		);
		for (const expectedBehavior of [
			"PASS/proceed",
			"WARN/proceed_with_notes",
			"FAIL/return_to_implementation",
			"WAITING/wait_for_human",
		]) {
			expect(content).toContain(expectedBehavior);
		}
		// Phase results carry task_plan_warnings and documentation_followups as preserved arrays
		expect(content).toContain("task_plan_warnings");
		expect(content).toContain("documentation_followups");
		expect(content).toContain("never hardcode to `[]` unless actually empty");
		expect(content).toContain("blocks_release = false");
	});

	test("build-readiness template leads with readiness evidence and explicit work artifact registration", async () => {
		const template = await readProjectFile(
			"plugins/base/skills/artifact-templates/templates/build-verify-aggregator/build-readiness.md",
		);
		const frontmatter = extractTemplateFrontmatter(template);
		const body = template.replace(FRONTMATTER_REGEX, "");

		expect(frontmatter).toMatchObject({
			scope: "workRoot",
			path_pattern: "features/{FEATURE_ID}/build-readiness.md",
			producer: "build-verify-aggregator",
			type: "document",
			strictness: "strict",
		});
		expect(template).toContain('"storageRoot": "work_dir"');
		expect(body).toContain("**Status**: PASS | WARN | FAIL | WAITING");

		const sectionOrder = [
			"## Decision",
			"## Blocking Issues",
			"## Non-Blocking Notes",
			"## Manual Verification",
			"## Requirement Evidence",
			"## Validation Components",
		].map((section) => body.indexOf(section));

		expect(sectionOrder.every((index) => index >= 0)).toBe(true);
		expect(sectionOrder).toEqual([...sectionOrder].sort((a, b) => a - b));
	});
});
