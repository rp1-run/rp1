import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
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
				"Generate an evidence-grounded markdown walkthrough for a pull request.",
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
					"pr-walkthroughs/pr-42-walkthrough-001.md",
				)
				.replace("{review_id}", "pr-42"),
		) as Record<string, unknown>;

		expect(payload).toEqual({
			path: "pr-walkthroughs/pr-42-walkthrough-001.md",
			feature: "pr-42",
			storageRoot: "work_dir",
			format: "markdown",
		});
		expect(skill.content).toContain("It must be relative.");
		expect(skill.content).toContain("It must start with `pr-walkthroughs/`.");
		expect(skill.content).toContain("It must end with `.md`.");
		expect(skill.content).toContain("It must not contain `..`.");
	});

	test("reporter requires evidence-indexed markdown output", async () => {
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
			"Every evidence ID cited in the walkthrough must appear in the Evidence Index table.",
		);
		expect(agent.content).toContain(
			"Major purpose, change, reviewer-focus, and risk claims must cite one or more IDs inline.",
		);
		expect(agent.content).toContain(
			"pr-walkthroughs/{REVIEW_ID}-walkthrough-{NNN}.md",
		);
		expect(agent.content).toContain(
			'{"path":"pr-walkthroughs/{REVIEW_ID}-walkthrough-{NNN}.md"}',
		);

		for (const section of [
			"## At A Glance",
			"## Evidence Index",
			"## Change Map",
			"## Walkthrough",
			"## Reviewer Focus",
			"## Risks And Questions",
		]) {
			expect(agent.content).toContain(section);
		}
	});

	test("artifact template index points to a valid plain markdown template", async () => {
		const templateIndex = await readProjectFile(
			"plugins/base/skills/artifact-templates/SKILL.md",
		);
		const templatePath =
			"plugins/base/skills/artifact-templates/templates/pr-walkthrough-reporter/pr-walkthrough.md";
		const templateRelativePath =
			"templates/pr-walkthrough-reporter/pr-walkthrough.md";

		expect(templateIndex).toContain(
			`| pr-walkthrough-reporter | pr-walkthrough.md | document | workRoot | pr-walkthroughs/{REVIEW_ID}-walkthrough-{NNN}.md | ${templateRelativePath} |`,
		);

		const template = await readProjectFile(templatePath);
		const frontmatter = extractFrontmatter(template);
		const body = template.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "");

		expect(frontmatter).toMatchObject({
			scope: "workRoot",
			path_pattern: "pr-walkthroughs/{REVIEW_ID}-walkthrough-{NNN}.md",
			producer: "pr-walkthrough-reporter",
			type: "document",
			strictness: "flexible",
		});

		for (const section of [
			"## At A Glance",
			"## Evidence Index",
			"## Change Map",
			"## Walkthrough",
			"## Reviewer Focus",
			"## Risks And Questions",
		]) {
			expect(body).toContain(section);
		}

		for (const evidenceId of [
			"E-PR-001",
			"E-FILE-001",
			"E-DIFF-001",
			"E-COMMIT-001",
		]) {
			expect(body).toContain(evidenceId);
		}

		expect(body).not.toContain("---\n---");
		expect(body).not.toContain("speaker notes");
		expect(body).not.toContain("Reveal.js");
	});
});
