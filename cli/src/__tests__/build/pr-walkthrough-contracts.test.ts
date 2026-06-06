import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as E from "fp-ts/lib/Either.js";
import { parse as parseYaml } from "yaml";
import {
	type CodeTourDocument,
	parseCodeTourDocument,
	validateCodeTourDocument,
} from "../../../shared/code-tour.js";
import type { Logger } from "../../../shared/logger.js";
import {
	type PRCartographyDocument,
	validatePRCartographyDocument,
} from "../../../shared/pr-cartography.js";
import { execute as executeCodeTourValidate } from "../../agent-tools/code-tour-validate/index.js";
import { execute as executePRCartographyValidate } from "../../agent-tools/pr-cartography-validate/index.js";
import { collectCatalogEntries } from "../../build/catalog-generator.js";
import { buildPlatformPlugin } from "../../build/command.js";
import { parseAgent, parseSkill } from "../../build/parser.js";
import { PLATFORM_DEFINITIONS } from "../../build/platform-definitions.js";
import { expectTaskRight } from "../helpers/index.js";

const projectRoot = join(import.meta.dir, "..", "..", "..", "..");
const codexDef = PLATFORM_DEFINITIONS.get("codex")!;

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

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const countOccurrences = (content: string, needle: string): number =>
	content.split(needle).length - 1;

const verdictLanguageChecks: readonly {
	readonly label: string;
	readonly pattern: RegExp;
}[] = [
	{ label: "approval language", pattern: /\bapprov(?:e|al|ed|ing)\b/i },
	{ label: "rejection language", pattern: /\breject(?:ion|ed|ing)?\b/i },
	{
		label: "requested-changes language",
		pattern: /\brequest(?:ed|ing)? changes\b/i,
	},
	{
		label: "requested-changes language",
		pattern: /\bchanges requested\b/i,
	},
	{ label: "merge-readiness language", pattern: /\bmerge[- ]readiness\b/i },
	{ label: "merge-readiness language", pattern: /\bready to merge\b/i },
	{ label: "merge-readiness language", pattern: /\bsafe to merge\b/i },
	{ label: "merge-readiness language", pattern: /\bshould merge\b/i },
	{ label: "merge-readiness language", pattern: /\bdo not merge\b/i },
	{ label: "PR-comment language", pattern: /\b(?:pr\s+)?comment(?:s)?\b/i },
	{ label: "finding language", pattern: /\bfinding(?:s)?\b/i },
	{ label: "verdict language", pattern: /\bverdict(?:s)?\b/i },
	{ label: "approval language", pattern: /\blgtm\b/i },
	{ label: "approval language", pattern: /\bship it\b/i },
];

const verdictLanguageMatches = (content: string): string[] =>
	verdictLanguageChecks
		.filter(({ pattern }) => pattern.test(content))
		.map(({ label }) => label);

const expectNoVerdictLanguage = (content: string): void => {
	expect(verdictLanguageMatches(content)).toEqual([]);
};

const collectUserFacingCodeTourText = (
	document: CodeTourDocument,
): readonly string[] => [
	document.title,
	...Object.values(document.domains).map((domain) => domain.label),
	...document.concepts.flatMap((concept) => [
		concept.label,
		concept.summary ?? "",
	]),
	...document.fragments.map((fragment) => fragment.label),
	...(document.edges?.concept ?? []).map((edge) => edge.label ?? ""),
	...(document.edges?.fragment ?? []).map((edge) => edge.label ?? ""),
	...(document.tour ?? []).flatMap((step) => [
		step.title,
		step.sub ?? "",
		step.reason ?? "",
	]),
];

const representativeGithubCartography = (): PRCartographyDocument => ({
	version: "1.0",
	kind: "pr-cartography",
	source: {
		source: "github_pr",
		target: "482",
		reviewId: "pr-482",
		baseRef: "main",
		headRef: "feat/cartography",
		repo: "acme/rp1",
		url: "https://github.com/acme/rp1/pull/482",
	},
	evidenceIndex: [
		{
			id: "E-PR-001",
			kind: "pr",
			source: "https://github.com/acme/rp1/pull/482",
			summary: "PR metadata identifies a walkthrough cartography change.",
		},
		{
			id: "E-FILE-001",
			kind: "file",
			source: "plugins/dev/skills/pr-walkthrough/SKILL.md",
			summary: "The walkthrough skill validates cartography before reporting.",
		},
		{
			id: "E-DIFF-001",
			kind: "diff",
			source: "plugins/dev/skills/pr-walkthrough/SKILL.md",
			summary: "Cartography validation gates reporter dispatch.",
		},
		{
			id: "E-DIFF-002",
			kind: "diff",
			source: "plugins/dev/agents/pr-walkthrough-reporter.md",
			summary: "The reporter writes one Code Tour JSON artifact.",
		},
		{
			id: "E-COMMIT-001",
			kind: "commit",
			source: "abc1234",
			summary: "Implementation keeps the walkthrough orientation-only.",
		},
	],
	files: [
		{
			id: "file-walkthrough-skill",
			path: "plugins/dev/skills/pr-walkthrough/SKILL.md",
			evidenceIds: ["E-FILE-001"],
		},
		{
			id: "file-walkthrough-reporter",
			path: "plugins/dev/agents/pr-walkthrough-reporter.md",
			evidenceIds: ["E-DIFF-002"],
		},
	],
	fragments: [
		{
			id: "frag-cartography-validation",
			fileId: "file-walkthrough-skill",
			path: "plugins/dev/skills/pr-walkthrough/SKILL.md",
			line: 178,
			lineEnd: 187,
			summary: "Validated cartography is required before reporter dispatch.",
			evidenceIds: ["E-DIFF-001"],
		},
		{
			id: "frag-reporter-output",
			fileId: "file-walkthrough-reporter",
			path: "plugins/dev/agents/pr-walkthrough-reporter.md",
			line: 244,
			lineEnd: 291,
			summary: "The reporter writes one JSON artifact path.",
			evidenceIds: ["E-DIFF-002"],
		},
	],
	boundaries: [
		{
			id: "boundary-walkthrough-validation",
			label: "Walkthrough validation boundary",
			summary:
				"Cartography and Code Tour validators gate the published output.",
			fragmentIds: ["frag-cartography-validation", "frag-reporter-output"],
			contractIds: ["contract-code-tour-output"],
			entityIds: ["entity-code-tour-artifact"],
			sideEffectIds: ["effect-register-artifact"],
			riskSurfaceIds: ["risk-output-validation"],
			evidenceIds: ["E-DIFF-001", "E-DIFF-002"],
			confidence: "supported",
		},
	],
	contracts: [
		{
			id: "contract-code-tour-output",
			label: "Code Tour output contract",
			kind: "workflow-output",
			producer: "pr-walkthrough-reporter",
			consumer: "code-tour-validate",
			fragmentIds: ["frag-reporter-output"],
			evidenceIds: ["E-DIFF-002"],
		},
	],
	entities: [
		{
			id: "entity-code-tour-artifact",
			label: "Code Tour artifact",
			kind: "artifact",
			summary: "The JSON file opened by the walkthrough reader.",
			fragmentIds: ["frag-reporter-output"],
			evidenceIds: ["E-DIFF-002"],
		},
	],
	sideEffects: [
		{
			id: "effect-register-artifact",
			label: "Registers one artifact",
			kind: "workflow-output",
			summary: "Successful runs publish one work-root Code Tour JSON path.",
			fragmentIds: ["frag-reporter-output"],
			evidenceIds: ["E-DIFF-002"],
		},
	],
	riskSurfaces: [
		{
			id: "risk-output-validation",
			label: "Output validation focus",
			question:
				"Does the workflow validate the Code Tour JSON before registration?",
			fragmentIds: ["frag-cartography-validation", "frag-reporter-output"],
			evidenceIds: ["E-DIFF-001", "E-DIFF-002"],
			confidence: "question",
		},
	],
	relationships: [
		{
			from: "boundary-walkthrough-validation",
			to: "contract-code-tour-output",
			kind: "uses-contract",
			label: "validates output",
			evidenceIds: ["E-DIFF-001", "E-DIFF-002"],
		},
	],
});

const representativeLocalDiffCartography = (): PRCartographyDocument => {
	const cartography = clone(representativeGithubCartography());
	return {
		...cartography,
		source: {
			source: "git_diff",
			target: "feat/local-cartography",
			reviewId: "feat-local-cartography",
			baseRef: "main",
			headRef: "feat/local-cartography",
		},
		evidenceIndex: cartography.evidenceIndex.map((evidence) =>
			evidence.id === "E-PR-001"
				? {
						...evidence,
						kind: "branch",
						source: "feat/local-cartography",
						summary: "Local branch metadata identifies the walkthrough diff.",
					}
				: evidence,
		),
	};
};

const representativeCodeTour = (
	cartography: PRCartographyDocument,
	title: string,
): CodeTourDocument => ({
	version: "1.0",
	kind: cartography.source.source === "git_diff" ? "branch" : "pull-request",
	title,
	source: {
		kind: cartography.source.source === "git_diff" ? "branch" : "github-pr",
		repo: cartography.source.repo,
		id: cartography.source.target,
		url: cartography.source.url,
		ref: cartography.source.headRef,
	},
	domains: {
		workflow: {
			label: "Workflow",
			color: "#7ad0ff",
		},
		artifact: {
			label: "Artifact",
			color: "#8bdc8b",
		},
	},
	concepts: [
		{
			id: "concept-walkthrough-validation",
			label: "Walkthrough validation",
			domain: "workflow",
			epicenter: true,
			summary:
				"- Cartography is checked before reporting\n- Code Tour JSON is checked before publishing",
			fragments: [
				"fragment-cartography-validation",
				"fragment-reporter-output",
			],
			evidenceIds: ["E-DIFF-001", "E-DIFF-002"],
			cartographyRefs: [
				{ kind: "boundary", id: "boundary-walkthrough-validation" },
				{ kind: "contract", id: "contract-code-tour-output" },
				{ kind: "entity", id: "entity-code-tour-artifact" },
				{ kind: "sideEffect", id: "effect-register-artifact" },
				{ kind: "riskSurface", id: "risk-output-validation" },
			],
		},
		{
			id: "concept-code-tour-output",
			label: "Code Tour output",
			domain: "artifact",
			summary: "- The reporter returns one JSON path",
			fragments: ["fragment-reporter-output"],
			evidenceIds: ["E-DIFF-002"],
			cartographyRefs: [{ kind: "contract", id: "contract-code-tour-output" }],
		},
	],
	fragments: [
		{
			id: "fragment-cartography-validation",
			label: "validates cartography",
			path: "plugins/dev/skills/pr-walkthrough/SKILL.md",
			line: 178,
			lineEnd: 187,
			language: "markdown",
			code: [
				{
					tokens: [["", "rp1 agent-tools pr-cartography-validate"]],
				},
			],
			evidenceIds: ["E-DIFF-001"],
			cartographyRefs: [
				{ kind: "fragment", id: "frag-cartography-validation" },
				{ kind: "file", id: "file-walkthrough-skill" },
			],
		},
		{
			id: "fragment-reporter-output",
			label: "writes one artifact",
			path: "plugins/dev/agents/pr-walkthrough-reporter.md",
			line: 244,
			lineEnd: 291,
			language: "markdown",
			code: [
				{
					tokens: [["", '{"path":"pr-walkthroughs/{REVIEW_ID}.json"}']],
				},
			],
			evidenceIds: ["E-DIFF-002"],
			cartographyRefs: [
				{ kind: "fragment", id: "frag-reporter-output" },
				{ kind: "file", id: "file-walkthrough-reporter" },
			],
		},
	],
	edges: {
		concept: [
			{
				from: "concept-walkthrough-validation",
				to: "concept-code-tour-output",
				label: "validates output",
				kind: "uses-contract",
				evidenceIds: ["E-DIFF-001", "E-DIFF-002"],
				cartographyRefs: [
					{
						kind: "relationship",
						from: "boundary-walkthrough-validation",
						to: "contract-code-tour-output",
						relationshipKind: "uses-contract",
					},
				],
			},
		],
	},
	tour: [
		{
			conceptId: "concept-walkthrough-validation",
			title: "Start with validation",
			sub: "Workflow output",
			reason:
				"- Check the graph handoff first\n- Then inspect the JSON publishing gate",
			evidenceIds: ["E-DIFF-001", "E-DIFF-002"],
			cartographyRefs: [
				{ kind: "boundary", id: "boundary-walkthrough-validation" },
				{ kind: "riskSurface", id: "risk-output-validation" },
			],
		},
	],
});

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
			"rp1-dev:pr-cartographer",
			"rp1-dev:pr-walkthrough-reporter",
		]);
		expect(skill.allowedTools?.split(",").map((tool) => tool.trim())).toContain(
			"Read",
		);
		expect(skill.metadata?.arguments?.map((arg) => arg.name)).toEqual([
			"TARGET",
			"BASE_BRANCH",
		]);

		expect(skill.content).toContain("stateDiagram-v2");
		expect(skill.content).toContain("[*] --> collecting");
		expect(skill.content).toContain("collecting --> publishing");
		expect(skill.content).toContain(
			'{% dispatch_agent "rp1-dev:pr-cartographer" %}',
		);
		expect(skill.content).toContain(
			'{% dispatch_agent "rp1-dev:pr-walkthrough-reporter" %}',
		);
		expect(skill.content).toContain("PR_CARTOGRAPHY_JSON");
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
		expect(skill.content).toContain(
			"{workRoot}/{ARTIFACT_RELATIVE_PATH}` must exist and be readable.",
		);
		expect(skill.content).toContain("Code Tour JSON");
		expect(skill.content).toContain("Do not accept a markdown artifact path");
		expect(skill.content).toContain("do not write it as a workflow artifact.");
		const antiLoopSection = skill.content.slice(
			skill.content.indexOf("## Anti-Loop"),
		);
		expect(antiLoopSection).toContain(
			"- Register PR cartography as a workflow artifact.",
		);
		expect(skill.content).not.toContain("slide-ready markdown");
		expect(skill.content).not.toContain("plain markdown fallback");
		expect(skill.content).not.toContain("rp1-slide:");
		expect(skill.content).not.toContain("rp1-notes");
	});

	test("skill validates PR cartography before reporter dispatch and artifact registration", async () => {
		const skillDir = join(projectRoot, "plugins/dev/skills/pr-walkthrough");
		const skill = await expectTaskRight(parseSkill(skillDir));

		const evidenceStart = skill.content.indexOf(
			"## 1. Collect Direct Evidence",
		);
		const cartographerDispatch = skill.content.indexOf(
			'{% dispatch_agent "rp1-dev:pr-cartographer" %}',
		);
		const cartographyValidation = skill.content.indexOf(
			"rp1 agent-tools pr-cartography-validate",
		);
		const reporterDispatch = skill.content.indexOf(
			'{% dispatch_agent "rp1-dev:pr-walkthrough-reporter" %}',
		);
		const codeTourValidation = skill.content.indexOf(
			"rp1 agent-tools code-tour-validate {workRoot}/{ARTIFACT_RELATIVE_PATH}",
		);
		const artifactRegistration = skill.content.indexOf(
			"--type artifact_registered",
		);

		expect(cartographerDispatch).toBeGreaterThan(evidenceStart);
		expect(cartographyValidation).toBeGreaterThan(cartographerDispatch);
		expect(reporterDispatch).toBeGreaterThan(cartographyValidation);
		expect(codeTourValidation).toBeGreaterThan(reporterDispatch);
		expect(artifactRegistration).toBeGreaterThan(codeTourValidation);
		expect(
			countOccurrences(
				skill.content,
				'{% dispatch_agent "rp1-dev:pr-cartographer" %}',
			),
		).toBe(1);
		expect(
			countOccurrences(
				skill.content,
				'{% dispatch_agent "rp1-dev:pr-walkthrough-reporter" %}',
			),
		).toBe(1);

		const cartographyGate = skill.content.slice(
			cartographerDispatch,
			reporterDispatch,
		);
		expect(cartographyGate).toContain("store it as `PR_CARTOGRAPHY_JSON`");
		expect(cartographyGate).toContain(
			"the single source of truth for the PR cartography v1 contract in `cli/shared/pr-cartography.ts`",
		);
		expect(cartographyGate).toContain("Read the `ToolResult` JSON envelope.");
		expect(cartographyGate).toContain("invalid PR cartography");
		expect(cartographyGate).toContain(
			"stop without dispatching the reporter or registering an artifact",
		);
		expect(cartographyGate).not.toContain("--type artifact_registered");

		const reporterHandoffStart = skill.content.indexOf(
			"Dispatch the reporter exactly once.",
		);
		const reporterHandoff = skill.content.slice(
			reporterHandoffStart,
			codeTourValidation,
		);
		const reporterDispatchBlock = skill.content.slice(
			reporterDispatch,
			codeTourValidation,
		);
		expect(reporterHandoff).toContain(
			"Pass validated `PR_GRAPH_JSON` as the source input by forwarding `PR_CARTOGRAPHY_JSON`.",
		);
		expect(reporterDispatchBlock).toContain(
			"PR_GRAPH_JSON: {{stringify(PR_CARTOGRAPHY_JSON)}}",
		);
		expect(reporterDispatchBlock).toContain(
			"EVIDENCE_JSON: {{stringify(EVIDENCE_JSON)}}",
		);
		expect(reporterHandoff).toContain(
			"must not be replaced by `.rp1/work/pr-reviews/`",
		);
		expect(reporterHandoff).not.toContain("--type artifact_registered");
	});

	test("skill fails invalid Code Tour output before artifact registration", async () => {
		const skillDir = join(projectRoot, "plugins/dev/skills/pr-walkthrough");
		const skill = await expectTaskRight(parseSkill(skillDir));

		const validationStart = skill.content.indexOf(
			"Validate the returned path and content before registration:",
		);
		const registrationStart = skill.content.indexOf("## 3. Register Artifact");

		expect(validationStart).toBeGreaterThan(-1);
		expect(registrationStart).toBeGreaterThan(validationStart);

		const validationSection = skill.content.slice(
			validationStart,
			registrationStart,
		);
		expect(validationSection).toContain(
			"rp1 agent-tools code-tour-validate {workRoot}/{ARTIFACT_RELATIVE_PATH}",
		);
		expect(validationSection).toContain(
			"the single source of truth for the Code Tour v1 contract in `cli/shared/code-tour.ts`",
		);
		expect(validationSection).toContain("Read the `ToolResult` JSON envelope.");
		expect(validationSection).toContain(
			"the first `errors[].message` is `{FIRST_VALIDATION_ISSUE}`",
		);
		expect(validationSection).toContain("invalid Code Tour artifact");
		expect(validationSection).toContain("missing Code Tour artifact");
		expect(validationSection).toContain("stop without registering an artifact");
		expect(validationSection).not.toContain("--type artifact_registered");

		const registrationSection = skill.content.slice(registrationStart);
		expect(registrationSection).toContain(
			"only after path, file-existence, JSON parse, and Code Tour semantic validation pass",
		);
		expect(countOccurrences(skill.content, "--type artifact_registered")).toBe(
			1,
		);
		expect(validationSection).toContain("It must be relative.");
		expect(validationSection).toContain(
			"It must start with `pr-walkthroughs/`.",
		);
		expect(validationSection).toContain("It must end with `.json`.");
		expect(validationSection).toContain("It must not contain `..`.");
		expect(validationSection).toContain(
			"{workRoot}/{ARTIFACT_RELATIVE_PATH}` must exist and be readable.",
		);
		expect(validationSection).toContain(
			"If missing or unreadable, emit `publishing`",
		);
		expect(validationSection).toContain("missing Code Tour artifact");
		expect(skill.content).toContain(
			"Do not accept a markdown artifact path, secondary artifact path, invalid Code Tour JSON, missing output, slide-oriented output, or any cartography artifact path for new walkthrough runs.",
		);
	});

	test("representative walkthrough fixtures validate through cartography and Code Tour gates", async () => {
		const fixtures = [
			{
				name: "github-pr",
				cartography: representativeGithubCartography(),
				title: "Map PR walkthrough output",
			},
			{
				name: "local-diff",
				cartography: representativeLocalDiffCartography(),
				title: "Map local walkthrough output",
			},
		];

		for (const fixture of fixtures) {
			const cartographyValidation = validatePRCartographyDocument(
				fixture.cartography,
			);
			expect(cartographyValidation.ok).toBe(true);

			const cartographyToolResult = await executePRCartographyValidate(
				JSON.stringify(fixture.cartography),
				{ inputSource: "stdin" },
			)();
			expect(E.isRight(cartographyToolResult)).toBe(true);
			if (!E.isRight(cartographyToolResult)) {
				throw new Error(`${fixture.name} cartography tool failed`);
			}
			expect(cartographyToolResult.right.success).toBe(true);
			expect(cartographyToolResult.right.tool).toBe("pr-cartography-validate");

			const codeTour = representativeCodeTour(
				fixture.cartography,
				fixture.title,
			);
			const codeTourValidation = validateCodeTourDocument(codeTour, {
				cartography: fixture.cartography,
			});
			expect(codeTourValidation.ok).toBe(true);
			expectNoVerdictLanguage(
				collectUserFacingCodeTourText(codeTour).join("\n"),
			);

			const codeTourToolResult = await executeCodeTourValidate(
				JSON.stringify(codeTour),
				{ inputSource: "stdin" },
			)();
			expect(E.isRight(codeTourToolResult)).toBe(true);
			if (!E.isRight(codeTourToolResult)) {
				throw new Error(`${fixture.name} Code Tour tool failed`);
			}
			expect(codeTourToolResult.right.success).toBe(true);
			expect(codeTourToolResult.right.tool).toBe("code-tour-validate");
		}
	});

	test("validation fixtures reject invalid cartography and invalid reporter candidates", async () => {
		const cartography = representativeGithubCartography();
		const invalidCartography: PRCartographyDocument = {
			...cartography,
			relationships: [
				{
					...cartography.relationships[0]!,
					to: "missing-contract",
				},
			],
			riskSurfaces: [
				{
					...cartography.riskSurfaces[0]!,
					question: "Should we approve this PR?",
				},
			],
		};

		const cartographyValidation =
			validatePRCartographyDocument(invalidCartography);
		expect(cartographyValidation.ok).toBe(false);
		if (!cartographyValidation.ok) {
			expect(cartographyValidation.issues).toEqual(
				expect.arrayContaining([
					{
						path: "$.riskSurfaces[0].question",
						message:
							"Risk surfaces must be phrased as reviewer focus or open questions; remove approval language",
					},
					{
						path: "$.relationships[0].to",
						message:
							'Unknown cartography relationship endpoint "missing-contract"',
					},
				]),
			);
		}

		const cartographyToolResult = await executePRCartographyValidate(
			JSON.stringify(invalidCartography),
			{ inputSource: "stdin" },
		)();
		expect(E.isRight(cartographyToolResult)).toBe(true);
		if (!E.isRight(cartographyToolResult)) {
			throw new Error("invalid cartography tool failed unexpectedly");
		}
		expect(cartographyToolResult.right.success).toBe(false);
		expect(cartographyToolResult.right.data).toBeNull();
		expect(cartographyToolResult.right.errors).toContainEqual({
			context: "$.relationships[0].to",
			message: 'Unknown cartography relationship endpoint "missing-contract"',
		});

		const validCartography = representativeGithubCartography();
		const validCodeTour = representativeCodeTour(
			validCartography,
			"Map PR walkthrough output",
		);
		const invalidCodeTour: CodeTourDocument = {
			...validCodeTour,
			concepts: [
				{
					...validCodeTour.concepts[0]!,
					fragments: ["missing-fragment"],
				},
				...validCodeTour.concepts.slice(1),
			],
		};

		const codeTourValidation = validateCodeTourDocument(invalidCodeTour, {
			cartography: validCartography,
		});
		expect(codeTourValidation.ok).toBe(false);
		if (!codeTourValidation.ok) {
			expect(codeTourValidation.issues).toContainEqual({
				path: "$.concepts[0].fragments[0]",
				message: 'Unknown fragment "missing-fragment"',
			});
		}

		const codeTourToolResult = await executeCodeTourValidate(
			JSON.stringify(invalidCodeTour),
			{ inputSource: "stdin" },
		)();
		expect(E.isRight(codeTourToolResult)).toBe(true);
		if (!E.isRight(codeTourToolResult)) {
			throw new Error("invalid Code Tour tool failed unexpectedly");
		}
		expect(codeTourToolResult.right.success).toBe(false);
		expect(codeTourToolResult.right.data).toBeNull();
		expect(codeTourToolResult.right.errors).toContainEqual({
			context: "$.concepts[0].fragments[0]",
			message: 'Unknown fragment "missing-fragment"',
		});

		const markdownCandidate = parseCodeTourDocument(
			"# Walkthrough\n\n```json\n{}\n```",
		);
		expect(markdownCandidate.ok).toBe(false);
		if (!markdownCandidate.ok) {
			expect(markdownCandidate.issues[0]?.path).toBe("$");
			expect(markdownCandidate.issues[0]?.message).toContain("Malformed JSON");
		}
	});

	test("prompt output contracts stay orientation-only and single-artifact", async () => {
		const skillDir = join(projectRoot, "plugins/dev/skills/pr-walkthrough");
		const skill = await expectTaskRight(parseSkill(skillDir));
		const reporter = await expectTaskRight(
			parseAgent(
				join(projectRoot, "plugins/dev/agents/pr-walkthrough-reporter.md"),
			),
		);

		const skillOutputSection = skill.content.slice(
			skill.content.indexOf("## Output"),
			skill.content.indexOf("## Anti-Loop"),
		);
		const reporterOutputSection = reporter.content.slice(
			reporter.content.indexOf("## 7. Output"),
			reporter.content.indexOf("## Anti-Loop"),
		);

		expectNoVerdictLanguage(skillOutputSection);
		expectNoVerdictLanguage(reporterOutputSection);
		expect(skillOutputSection).toContain("## PR Walkthrough Complete");
		expect(skillOutputSection).toContain(
			"**Artifact**: {ARTIFACT_RELATIVE_PATH}",
		);
		expect(reporterOutputSection).toContain(
			'{"path":"pr-walkthroughs/{REVIEW_ID}-walkthrough-{NNN}.json"}',
		);

		const reporterAntiLoop = reporter.content.slice(
			reporter.content.indexOf("## Anti-Loop"),
		);
		expect(reporterAntiLoop).toContain(
			"Do not produce more than one walkthrough artifact.",
		);
		expect(reporterAntiLoop).toContain(
			"Do not produce markdown, slide markers, speaker notes, or a rendered review verdict.",
		);

		const prWalkthroughDocs = await readProjectFile(
			"docs/reference/dev/pr-walkthrough.md",
		);
		expect(prWalkthroughDocs).toContain("Use [`pr-review`](pr-review.md)");
	});

	test("pr-cartographer is a pure JSON agent registered in the agent catalog", async () => {
		const agentPath = join(
			projectRoot,
			"plugins/dev/agents/pr-cartographer.md",
		);
		const agent = await expectTaskRight(parseAgent(agentPath));

		expect(agent).toMatchObject({
			name: "pr-cartographer",
			description:
				"Convert direct PR evidence into orientation-only PR cartography JSON",
			model: "inherit",
			tools: [],
		});
		expect(agent.arguments?.map((arg) => arg.name)).toEqual(["EVIDENCE_JSON"]);
		expect(agent.content).toContain(
			"Parse `EVIDENCE_JSON` as the only source of truth.",
		);
		expect(agent.content).toContain(
			"Return exactly one JSON object matching `cli/shared/pr-cartography.ts`",
		);
		expect(agent.content).toContain('"version": "1.0"');
		expect(agent.content).toContain('"kind": "pr-cartography"');
		expect(agent.content).toContain("Every relationship endpoint must point");
		expect(agent.content).toContain(
			"Risk surfaces are review-orientation questions, not findings.",
		);
		expect(agent.content).toContain(
			"Output only the raw JSON object. No markdown fence",
		);
		expect(agent.content).toContain(
			"Do not read files, repositories, KB files",
		);
		expect(agent.content).toContain(
			"Do not write files or register artifacts.",
		);

		const catalog = parseYaml(await readProjectFile("catalog/agents.yaml")) as {
			agents?: Array<Record<string, unknown>>;
		};
		expect(catalog.agents).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					name: "rp1-dev:pr-cartographer",
					description:
						"Convert direct PR evidence into orientation-only PR cartography JSON",
					plugin: "dev",
				}),
			]),
		);
	});

	test("codex build exposes pr-cartographer as a generated dev agent", async () => {
		const outputRoot = await mkdtemp(
			join(tmpdir(), "pr-walkthrough-contracts-"),
		);

		try {
			const result = await buildPlatformPlugin(
				"dev",
				projectRoot,
				outputRoot,
				codexDef,
				noopLogger,
				true,
			);

			expect(result.summary.errors).toEqual([]);
			expect(result.assets.agents).toEqual(
				expect.arrayContaining([
					{
						name: "pr-cartographer",
						path: "dev/agents/rp1-dev-pr-cartographer.toml",
					},
				]),
			);

			const generated = await readFile(
				join(outputRoot, "dev", "agents", "rp1-dev-pr-cartographer.toml"),
				"utf-8",
			);
			expect(generated).toContain('name = "rp1-dev-pr-cartographer"');
			expect(generated).toContain(
				"Convert direct PR evidence into orientation-only PR cartography JSON",
			);
			expect(generated).toContain(
				"Parse `EVIDENCE_JSON` as the only source of truth.",
			);
			expect(generated).toContain(
				"Output only the raw JSON object. No markdown fence",
			);
			expect(generated).toContain("Do not write files or register artifacts.");
		} finally {
			await rm(outputRoot, { recursive: true, force: true });
		}
	}, 30000);

	test("reporter requires evidence-grounded Code Tour JSON output", async () => {
		const agentPath = join(
			projectRoot,
			"plugins/dev/agents/pr-walkthrough-reporter.md",
		);
		const agent = await expectTaskRight(parseAgent(agentPath));

		expect(agent.arguments?.map((arg) => arg.name)).toEqual([
			"PR_GRAPH_JSON",
			"EVIDENCE_JSON",
			"KB_ROOT",
			"WORK_ROOT",
			"CODE_ROOT",
			"REVIEW_ID",
		]);
		expect(agent.content).toContain(
			"Parse `PR_GRAPH_JSON` as the primary semantic source.",
		);
		expect(agent.content).toContain(
			"Parse `EVIDENCE_JSON` as the direct evidence backing the graph",
		);
		expect(agent.content).toContain(
			"Use evidence IDs internally and in non-user-facing provenance fields while constructing the artifact.",
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
			"Boundaries and contracts are the first concept candidates.",
		);
		expect(agent.content).toContain(
			"Surface entities and side effects inside the nearest boundary/contract concept",
		);
		expect(agent.content).toContain(
			"Present risk surfaces as reviewer focus or open questions",
		);
		expect(agent.content).toContain(
			"Populate provenance on every supported concept, fragment, edge, and tour step.",
		);
		expect(agent.content).toContain(
			"Prefer 3-7 concepts. Small PRs may use 1-2 concepts.",
		);
		expect(agent.content).toContain(
			"Keep relationship labels short, human-readable, and verb-first where possible.",
		);
		expect(agent.content).toContain(
			"no dense paragraphs, no process narration, no evidence IDs",
		);
		expect(agent.content).toContain(
			"Do not expose evidence IDs or cartography IDs in user-facing text.",
		);
		expect(agent.content).toContain(
			"Fragment references must resolve to existing fragments.",
		);
		expect(agent.content).toContain(
			"Do not invent concepts, relationships, risk claims, or intent not supported by `PR_GRAPH_JSON`.",
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
					evidenceIds: ["E-DIFF-001"],
					cartographyRefs: expect.arrayContaining([
						{ kind: "boundary", id: "boundary-main" },
						{ kind: "contract", id: "contract-output" },
					]),
				}),
			]),
		);
		expect(parsed.fragments).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					id: "fragment-1",
					path: "{path}",
					evidenceIds: ["E-DIFF-001"],
					cartographyRefs: expect.arrayContaining([
						{ kind: "fragment", id: "frag-main" },
						{ kind: "file", id: "file-main" },
					]),
				}),
			]),
		);
		expect(parsed.edges).toMatchObject({
			concept: [
				{
					from: "concept-1",
					to: "concept-2",
					label: "{relationship_label}",
					evidenceIds: ["E-DIFF-001"],
					cartographyRefs: [
						{
							kind: "relationship",
							from: "boundary-main",
							to: "contract-output",
							relationshipKind: "uses-contract",
						},
					],
				},
			],
		});
		expect(parsed.tour).toEqual([
			{
				conceptId: "concept-1",
				title: "{tour_step_title}",
				sub: "{tour_step_context}",
				reason: "- {why_this_step_matters}\\n- {what_to_inspect}",
				evidenceIds: ["E-DIFF-001"],
				cartographyRefs: [
					{ kind: "boundary", id: "boundary-main" },
					{ kind: "riskSurface", id: "risk-output-contract" },
				],
			},
		]);

		const validation = parseCodeTourDocument(body);
		expect(validation.ok).toBe(true);
		expect(body).not.toContain("rp1-slide:");
		expect(body).not.toContain("rp1-notes");
		expect(body).not.toContain("pr-walkthrough-slide-source");
	});
});
