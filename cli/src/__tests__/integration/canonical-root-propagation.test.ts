import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dir, "..", "..", "..", "..");

const readPrompt = (relativePath: string): Promise<string> =>
	readFile(join(REPO_ROOT, relativePath), "utf-8");

describe("canonical root propagation", () => {
	test("passes canonical roots through workflow and standalone skill dispatches", async () => {
		const cases = [
			{
				path: "plugins/dev/skills/build/SKILL.md",
				expected: [
					"KB_ROOT={kbRoot}, WORK_ROOT={workRoot}, WORKFLOW=build, RUN_ID={RUN_ID}",
					"MODE=archive, FEATURE_ID={FEATURE_ID}, ARCHIVE_PATH={ARCHIVE_RETRY_PATH}, WORK_ROOT={workRoot}, SKIP_DOC_CHECK=false",
				],
			},
			{
				path: "plugins/dev/skills/build-fast/SKILL.md",
				expected: [
					"DEVELOPMENT_REQUEST={DEVELOPMENT_REQUEST}, WORKFLOW=build-fast, RUN_ID={RUN_ID}, KB_ROOT={kbRoot}, WORK_ROOT={workRoot}",
					"KB_ROOT={kbRoot}",
					"WORK_ROOT={workRoot}",
				],
			},
			{
				path: "plugins/dev/skills/blueprint/SKILL.md",
				expected: [
					"CHARTER_PATH={kbRoot}/charter.md",
					"PRD_NAME={PRD_NAME}, PRD_PATH={workRoot}/prds/{PRD_NAME}.md, EXTRA_CONTEXT={EXTRA_CONTEXT}, KB_ROOT={kbRoot}, WORK_ROOT={workRoot}",
				],
			},
			{
				path: "plugins/dev/skills/pr-review/SKILL.md",
				expected: ["KB_ROOT: {kbRoot}", "WORK_ROOT: {workRoot}"],
			},
			{
				path: "plugins/dev/skills/address-pr-feedback/SKILL.md",
				expected: ["WORK_ROOT: {workRoot}"],
			},
			{
				path: "plugins/dev/skills/feature-edit/SKILL.md",
				expected: ["KB_ROOT: {kbRoot}", "WORK_ROOT: {workRoot}"],
			},
			{
				path: "plugins/dev/skills/feature-archive/SKILL.md",
				expected: ["WORK_ROOT: {workRoot}"],
			},
			{
				path: "plugins/dev/skills/blueprint-archive/SKILL.md",
				expected: ["KB_ROOT: {kbRoot}", "WORK_ROOT: {workRoot}"],
			},
			{
				path: "plugins/dev/skills/code-check/SKILL.md",
				expected: ["KB_ROOT: {kbRoot}", "WORK_ROOT: {workRoot}"],
			},
			{
				path: "plugins/dev/skills/code-audit/SKILL.md",
				expected: ["KB_ROOT: {kbRoot}"],
			},
			{
				path: "plugins/base/skills/project-birds-eye-view/SKILL.md",
				expected: ["KB_ROOT: {kbRoot}"],
			},
			{
				path: "plugins/base/skills/deep-research/SKILL.md",
				expected: ["WORK_ROOT: {workRoot}"],
			},
		] as const;

		for (const { path, expected } of cases) {
			const content = await readPrompt(path);
			for (const snippet of expected) {
				expect(content).toContain(snippet);
			}
		}
	});

	test("uses canonical roots inside prompt-authored file operations", async () => {
		const cases = [
			{
				path: "plugins/dev/agents/build-fast-planner.md",
				expected: [
					"{{KB_ROOT from prompt}}",
					"{{WORK_ROOT from prompt}}",
					"Always read: `{KB_ROOT}/index.md`",
					'mkdir -p "{WORK_ROOT}/quick-builds"',
				],
				unexpected: ['mkdir -p ".rp1/work/quick-builds"'],
			},
			{
				path: "plugins/dev/agents/feature-requirement-gatherer.md",
				expected: [
					"{{KB_ROOT from prompt}}",
					"{{WORK_ROOT from prompt}}",
					"Write to `{WORK_ROOT}/features/{FEATURE_ID}/requirements.md`.",
				],
				unexpected: [
					"Write to `.rp1/work/features/{FEATURE_ID}/requirements.md`.",
				],
			},
			{
				path: "plugins/dev/agents/feature-editor.md",
				expected: [
					"{{KB_ROOT from prompt}}",
					"{{WORK_ROOT from prompt}}",
					"Load feature docs from `{WORK_ROOT}/features/{FEATURE_ID}/`:",
				],
				unexpected: [
					"Load feature docs from `.rp1/work/features/{FEATURE_ID}/`:",
				],
			},
			{
				path: "plugins/dev/agents/pr-feedback-collector.md",
				expected: [
					"{{WORK_ROOT from prompt}}",
					"`mkdir -p {WORK_ROOT}/pr-reviews/`",
				],
				unexpected: ["`mkdir -p .rp1/work/pr-reviews/`"],
			},
			{
				path: "plugins/dev/agents/pr-visualizer.md",
				expected: [
					"{{KB_ROOT from prompt}}",
					"{{WORK_ROOT from prompt}}",
					"`mkdir -p {WORK_ROOT}/pr-reviews`",
				],
				unexpected: ["`mkdir -p .rp1/work/pr-reviews`"],
			},
			{
				path: "plugins/dev/agents/blueprint-wizard.md",
				expected: [
					"{{KB_ROOT from prompt}}",
					"{{WORK_ROOT from prompt}}",
					"`{KB_ROOT}/charter.md`",
				],
				unexpected: ["`.rp1/context/charter.md`"],
			},
			{
				path: "plugins/base/agents/project-documenter.md",
				expected: [
					"{{KB_ROOT from prompt}}",
					"{{WORK_ROOT from prompt}}",
					"| OUTPUT_FILE | `{WORK_ROOT}/birds-eye/{TODAY}-{PROJECT_SLUG}.md` (n+1 dedup) |",
				],
				unexpected: [
					"| **OUTPUT_FILE** | `.rp1/context/birds-eye-view.md` |",
					"| **OUTPUT_FILE** | `{KB_ROOT}/birds-eye-view.md` |",
				],
			},
			{
				path: "plugins/base/agents/research-reporter.md",
				expected: [
					"{{WORK_ROOT from prompt}}",
					"mkdir -p {WORK_ROOT}/research",
					"{WORK_ROOT}/research/YYYY-MM-DD-{topic-slug}.md",
				],
				unexpected: ["mkdir -p .rp1/work/research"],
			},
		] as const;

		for (const { path, expected, unexpected } of cases) {
			const content = await readPrompt(path);
			for (const snippet of expected) {
				expect(content).toContain(snippet);
			}
			for (const snippet of unexpected) {
				expect(content).not.toContain(snippet);
			}
		}
	});
});
