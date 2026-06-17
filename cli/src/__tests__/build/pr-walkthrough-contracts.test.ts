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

const stripLeadingFrontmatter = (content: string): string =>
	content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "");

const slideMarkers = [
	"<!-- rp1-slide: horizontal -->",
	"<!-- rp1-slide: vertical -->",
	"<!-- rp1-notes -->",
] as const;

type SlideMarker = (typeof slideMarkers)[number];

const collectControlMarkers = (content: string): SlideMarker[] => {
	const markers = new Set<string>(slideMarkers);
	const controlMarkers: SlideMarker[] = [];
	let inFence = false;

	for (const line of content.split(/\r?\n/)) {
		const trimmed = line.trim();

		if (/^(`{3,}|~{3,})/.test(trimmed)) {
			inFence = !inFence;
			continue;
		}

		// Control markers are valid only when they occupy the whole trimmed line.
		if (!inFence && markers.has(trimmed)) {
			controlMarkers.push(trimmed as SlideMarker);
		}
	}

	return controlMarkers;
};

const collectSlideMetadata = (
	content: string,
): Array<Record<string, unknown>> =>
	[...content.matchAll(/<!-- rp1-slide-meta\r?\n([\s\S]*?)\r?\n-->/g)].map(
		(match) => parseYaml(match[1] ?? "") as Record<string, unknown>,
	);

const collectEvidenceIndexIds = (content: string): string[] =>
	[...content.matchAll(/^\| (E-[A-Z]+-\d{3}) \|/gm)].map(
		(match) => match[1] ?? "",
	);

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

		expect(skill.content).toContain("slide-ready markdown");
		expect(skill.content).toContain("plain markdown fallback");
		expect(skill.content).toContain(
			"Do not reject an otherwise valid reporter artifact because it contains the canonical slide-ready markdown contract fields",
		);
		expect(skill.content).toContain(
			"reserved `<!-- rp1-slide: ... -->` markers",
		);
		expect(skill.content).toContain("slide metadata blocks");
		expect(skill.content).toContain(
			"`<!-- rp1-notes -->` speaker-note sections",
		);
		expect(skill.content).toContain(
			"Do not strip or forbid the canonical slide-ready markdown contract metadata",
		);
	});

	test("reporter requires evidence-indexed slide-ready markdown output", async () => {
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
		expect(agent.content).toContain("Use the canonical template:");
		expect(agent.content).toContain("Slide Contract Requirements");
		expect(agent.content).toContain(
			"YAML frontmatter must declare `rp1_contract`, `rp1_contract_version`, `rp1_source_type`, `rp1_review_id`, `rp1_source`, `rp1_generation`, `rp1_slide_markers`, and `rp1_evidence_ids`.",
		);
		expect(agent.content).toContain("`<!-- rp1-slide: horizontal -->`");
		expect(agent.content).toContain("`<!-- rp1-slide: vertical -->`");
		expect(agent.content).toContain("`<!-- rp1-notes -->`");
		expect(agent.content).toContain(
			"Horizontal slide metadata uses `depth: 0`",
		);
		expect(agent.content).toContain(
			"vertical detail under the same topic uses `depth: 1` or greater",
		);
		expect(agent.content).toContain(
			"Every substantive claim on slide faces, vertical details, and speaker notes must cite or sit adjacent to an Evidence Index ID.",
		);
		expect(agent.content).toContain("Pre-Write Compliance Self-Check");
		expect(agent.content).toContain(
			"Marker collisions: scan line by line while tracking fenced code blocks",
		);
		expect(agent.content).toContain(
			"Evidence resolution: every ID in `rp1_evidence_ids`, slide metadata, slide faces, vertical details, and notes appears in the Evidence Index table.",
		);
		expect(agent.content).toContain(
			"Notes citation: every substantive notes claim cites or is adjacent to an Evidence Index ID.",
		);
		expect(agent.content).toContain(
			"Fallback readability: top-to-bottom markdown still explains purpose, scope, change map, walkthrough, reviewer focus, and risks/questions coherently.",
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

	test("artifact template index points to a valid slide-ready markdown template", async () => {
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
		const templateBody = stripLeadingFrontmatter(template).trimStart();
		const artifactFrontmatter = extractFrontmatter(templateBody);
		const body = stripLeadingFrontmatter(templateBody);

		expect(frontmatter).toMatchObject({
			scope: "workRoot",
			path_pattern: "pr-walkthroughs/{REVIEW_ID}-walkthrough-{NNN}.md",
			producer: "pr-walkthrough-reporter",
			type: "document",
			strictness: "flexible",
		});

		expect(artifactFrontmatter).toMatchObject({
			rp1_contract: "pr-walkthrough-slide-source",
			rp1_contract_version: "1.0.0",
			rp1_source_type: "{source_type}",
			rp1_review_id: "{REVIEW_ID}",
			rp1_source: {
				target: "{source_target}",
				base_branch: "{base_branch}",
				head_ref: "{head_ref}",
				pr_number: "{pr_number}",
				pr_url: "{PR_URL}",
			},
			rp1_generation: {
				created_at: "{TIMESTAMP}",
				generator: "rp1-dev pr-walkthrough",
				artifact_id: "{REVIEW_ID}-walkthrough-{NNN}",
			},
			rp1_slide_markers: {
				horizontal: "<!-- rp1-slide: horizontal -->",
				vertical: "<!-- rp1-slide: vertical -->",
				notes: "<!-- rp1-notes -->",
				metadata_open: "<!-- rp1-slide-meta",
				metadata_close: "-->",
			},
			rp1_evidence_ids: [
				"E-PR-001",
				"E-FILE-001",
				"E-DIFF-001",
				"E-COMMIT-001",
			],
		});
		expect(Object.keys(artifactFrontmatter)).toEqual(
			expect.arrayContaining([
				"rp1_source",
				"rp1_generation",
				"rp1_slide_markers",
				"rp1_evidence_ids",
			]),
		);

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

		const frontmatterEvidenceIds = artifactFrontmatter.rp1_evidence_ids;
		expect(frontmatterEvidenceIds).toEqual([
			"E-PR-001",
			"E-FILE-001",
			"E-DIFF-001",
			"E-COMMIT-001",
		]);

		const evidenceIndexIds = collectEvidenceIndexIds(body);
		expect(evidenceIndexIds).toEqual([
			"E-PR-001",
			"E-FILE-001",
			"E-DIFF-001",
			"E-COMMIT-001",
		]);

		for (const evidenceId of evidenceIndexIds) {
			expect(body).toContain(evidenceId);
			expect(body).toContain(`| ${evidenceId} |`);
		}

		const controlMarkers = collectControlMarkers(body);
		expect(
			controlMarkers.filter((marker) => marker === slideMarkers[0]),
		).toHaveLength(6);
		expect(
			controlMarkers.filter((marker) => marker === slideMarkers[1]),
		).toHaveLength(2);
		expect(
			controlMarkers.filter((marker) => marker === slideMarkers[2]),
		).toHaveLength(3);

		const slideMetadata = collectSlideMetadata(body);
		expect(slideMetadata).toHaveLength(8);
		for (const metadata of slideMetadata) {
			expect(Object.keys(metadata)).toEqual(
				expect.arrayContaining(["id", "role", "depth", "evidence"]),
			);
			expect(Array.isArray(metadata.evidence)).toBe(true);
			for (const evidenceId of metadata.evidence as string[]) {
				expect(frontmatterEvidenceIds).toContain(evidenceId);
				expect(evidenceIndexIds).toContain(evidenceId);
			}
		}
		expect(slideMetadata).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					id: "slide-001",
					role: "at-a-glance",
					depth: 0,
					evidence: ["E-PR-001", "E-FILE-001"],
				}),
				expect.objectContaining({
					id: "slide-003-detail-001",
					role: "change-detail",
					depth: 1,
					evidence: ["E-DIFF-001"],
				}),
			]),
		);

		expect(body).toContain("<!-- rp1-notes -->\nNotes:");
		expect(body).toContain(
			"Every ID listed in `rp1_evidence_ids`, slide metadata `evidence` arrays, inline citations, notes, and vertical detail must resolve to a row in this table.",
		);
		expect(body).not.toMatch(/^\s*---\s*$/m);
		expect(body).not.toMatch(/^\s*--\s*$/m);
	});

	test("reserved markers are slide controls only when line-alone outside fenced code blocks", () => {
		const artifact = `---
rp1_contract: pr-walkthrough-slide-source
---

<!-- rp1-slide: horizontal -->
<!-- rp1-slide-meta
id: slide-001
role: at-a-glance
depth: 0
evidence: [E-PR-001]
-->
## At A Glance

Generated prose can mention <!-- rp1-slide: vertical --> inline without creating structure.

\`\`\`markdown
<!-- rp1-slide: horizontal -->
---
--
<!-- rp1-notes -->
\`\`\`

<!-- rp1-notes -->
Notes:

- Notes cite E-PR-001 and may quote separator-like source text.

<!-- rp1-slide: vertical -->
<!-- rp1-slide-meta
id: slide-001-detail-001
role: detail
depth: 1
evidence: [E-PR-001]
-->
### Detail

The vertical slide stays under the parent topic. [E-PR-001]
`;

		expect(collectControlMarkers(artifact)).toEqual([
			"<!-- rp1-slide: horizontal -->",
			"<!-- rp1-notes -->",
			"<!-- rp1-slide: vertical -->",
		]);
	});
});
