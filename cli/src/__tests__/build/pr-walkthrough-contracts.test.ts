import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { parseCodeTourDocument } from "../../../shared/code-tour.js";
import { collectCatalogEntries } from "../../build/catalog-generator.js";
import { parseAgent, parseSkill } from "../../build/parser.js";
import { expectTaskRight } from "../helpers/index.js";

const projectRoot = join(import.meta.dir, "..", "..", "..", "..");

const readProjectFile = async (relativePath: string): Promise<string> =>
	readFile(join(projectRoot, relativePath), "utf-8");

const extractFrontmatter = (content: string): Record<string, unknown> => {
	const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
	if (!match?.[1]) {
		throw new Error("Missing YAML frontmatter");
	}

	return parseYaml(match[1]) as Record<string, unknown>;
};

const stripLeadingFrontmatter = (content: string): string =>
	content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "");

describe("pr-walkthrough build contracts", () => {
	test("catalog exposes the walkthrough as a fresh review workflow", async () => {
		const { entries } = await collectCatalogEntries(projectRoot);
		const entry = entries.find(
			(candidate) => candidate.name === "pr-walkthrough",
		);

		expect(entry).toBeDefined();
		expect(entry).toMatchObject({
			plugin: "dev",
			description:
				"Generate an evidence-grounded Code Tour walkthrough for a pull request.",
			category: "review",
			isWorkflow: true,
			keyArgs: ["TARGET", "BASE_BRANCH"],
			runPolicy: "fresh",
			identityArgs: [],
		});
	});

	test("skill declares target intake, reporter dispatch, and artifact registration", async () => {
		const skillDir = join(projectRoot, "plugins/dev/skills/pr-walkthrough");
		const skill = await expectTaskRight(parseSkill(skillDir));

		expect(skill.metadata?.category).toBe("review");
		expect(skill.metadata?.isWorkflow).toBe(true);
		expect(skill.metadata?.workflow?.runPolicy).toBe("fresh");
		expect(skill.metadata?.workflow?.identityArgs).toEqual([]);
		expect(skill.metadata?.subAgents).toEqual([
			"rp1-dev:pr-walkthrough-reporter",
		]);
		expect(skill.metadata?.arguments?.map((arg) => arg.name)).toEqual([
			"TARGET",
			"BASE_BRANCH",
		]);

		expect(skill.content).toContain("stateDiagram-v2");
		expect(skill.content).toContain("[*] --> collecting");
		expect(skill.content).toContain("collecting --> publishing");
		expect(skill.content).toContain(
			'{% dispatch_agent "rp1-dev:pr-walkthrough-reporter" %}',
		);
		expect(skill.content).toContain("gh pr view {resolved_pr_target}");
		expect(skill.content).toContain("git -C {codeRoot} diff --patch");
		expect(skill.content).toContain("Do not read `.rp1/work/pr-reviews/`");

		const registrationPayload = skill.content.match(
			/--type artifact_registered[\s\S]*?--data '([^']+)'/,
		)?.[1];
		expect(registrationPayload).toBeDefined();

		const payload = JSON.parse(
			registrationPayload!
				.replace(
					"{ARTIFACT_RELATIVE_PATH}",
					"pr-walkthroughs/pr-42-walkthrough-001.json",
				)
				.replace("{review_id}", "pr-42"),
		) as Record<string, unknown>;

		expect(payload).toEqual({
			path: "pr-walkthroughs/pr-42-walkthrough-001.json",
			feature: "pr-42",
			storageRoot: "work_dir",
			format: "json",
		});
		expect(skill.content).toContain("It must be relative.");
		expect(skill.content).toContain("It must start with `pr-walkthroughs/`.");
		expect(skill.content).toContain("It must end with `.json`.");
		expect(skill.content).toContain("It must not contain `..`.");
		expect(skill.content).toContain("Code Tour JSON");
		expect(skill.content).toContain("Do not accept a markdown artifact path");
		expect(skill.content).not.toContain("slide-ready markdown");
		expect(skill.content).not.toContain("plain markdown fallback");
		expect(skill.content).not.toContain("rp1-slide:");
		expect(skill.content).not.toContain("rp1-notes");
	});

	test("reporter requires evidence-grounded Code Tour JSON output", async () => {
		const agentPath = join(
			projectRoot,
			"plugins/dev/agents/pr-walkthrough-reporter.md",
		);
		const agent = await expectTaskRight(parseAgent(agentPath));

		expect(agent.arguments?.map((arg) => arg.name)).toEqual([
			"EVIDENCE_JSON",
			"KB_ROOT",
			"WORK_ROOT",
			"CODE_ROOT",
			"REVIEW_ID",
		]);
		expect(agent.content).toContain(
			"Parse `EVIDENCE_JSON` as the only source of truth.",
		);
		expect(agent.content).toContain(
			"Every evidence ID used in concept summaries, fragment labels, relationship rationale, or tour text must appear in `evidence_index`.",
		);
		expect(agent.content).toContain("source-context claims use `E-PR-###`");
		expect(agent.content).toContain("Use the canonical template:");
		expect(agent.content).toContain("Code Tour JSON");
		expect(agent.content).toContain("Contract Requirements");
		expect(agent.content).toContain('`version`: exactly `"1.0"`.');
		expect(agent.content).toContain(
			"`concepts`: small human-scannable concept set",
		);
		expect(agent.content).toContain("`fragments`: source-backed excerpts");
		expect(agent.content).toContain(
			"`edges.concept`: labeled relationships between concepts",
		);
		expect(agent.content).toContain(
			"Prefer 3-7 concepts. Small PRs may use 1-2 concepts.",
		);
		expect(agent.content).toContain(
			"Keep relationship labels short, human-readable, and verb-first where possible.",
		);
		expect(agent.content).toContain(
			"Put evidence IDs in `summary`, `sub`, or `reason` text",
		);
		expect(agent.content).toContain(
			"Fragment references must resolve to existing fragments.",
		);
		expect(agent.content).toContain(
			"pr-walkthroughs/{REVIEW_ID}-walkthrough-{NNN}.json",
		);
		expect(agent.content).toContain(
			'{"path":"pr-walkthroughs/{REVIEW_ID}-walkthrough-{NNN}.json"}',
		);
		expect(agent.content).not.toContain("Slide Contract Requirements");
		expect(agent.content).not.toContain("rp1-slide:");
		expect(agent.content).not.toContain("rp1-notes");
		expect(agent.content).not.toContain("slide-ready markdown");
	});

	test("artifact template index points to a valid Code Tour JSON template", async () => {
		const templateIndex = await readProjectFile(
			"plugins/base/skills/artifact-templates/SKILL.md",
		);
		const templatePath =
			"plugins/base/skills/artifact-templates/templates/pr-walkthrough-reporter/code-tour.json";
		const templateRelativePath =
			"templates/pr-walkthrough-reporter/code-tour.json";

		expect(templateIndex).toContain(
			`| pr-walkthrough-reporter | code-tour.json | data | workRoot | pr-walkthroughs/{REVIEW_ID}-walkthrough-{NNN}.json | ${templateRelativePath} |`,
		);

		const template = await readProjectFile(templatePath);
		const frontmatter = extractFrontmatter(template);
		const body = stripLeadingFrontmatter(template).trimStart();
		const parsed = JSON.parse(body) as Record<string, unknown>;

		expect(frontmatter).toMatchObject({
			scope: "workRoot",
			path_pattern: "pr-walkthroughs/{REVIEW_ID}-walkthrough-{NNN}.json",
			producer: "pr-walkthrough-reporter",
			type: "data",
			strictness: "flexible",
		});

		expect(parsed).toMatchObject({
			version: "1.0",
			kind: "pull-request",
			source: {
				kind: "{source_kind}",
				ref: "{head_ref}",
			},
			domains: {
				workflow: {
					label: "Workflow",
					color: "#7ad0ff",
				},
			},
		});
		expect(parsed.concepts).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					id: "concept-1",
					fragments: ["fragment-1"],
				}),
			]),
		);
		expect(parsed.fragments).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					id: "fragment-1",
					path: "{path}",
				}),
			]),
		);
		expect(parsed.edges).toMatchObject({
			concept: [
				{
					from: "concept-1",
					to: "concept-2",
					label: "{relationship_label}",
				},
			],
		});
		expect(parsed.tour).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					conceptId: "concept-1",
					reason: "{tour_step_reason_with_evidence_ids}",
				}),
			]),
		);

		const validation = parseCodeTourDocument(body);
		expect(validation.ok).toBe(true);
		expect(body).not.toContain("rp1-slide:");
		expect(body).not.toContain("rp1-notes");
		expect(body).not.toContain("pr-walkthrough-slide-source");
	});
});
