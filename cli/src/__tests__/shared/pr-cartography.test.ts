import { describe, expect, test } from "bun:test";
import {
	formatPRCartographyValidationIssues,
	type PRCartographyDocument,
	parsePRCartographyDocument,
	validatePRCartographyDocument,
} from "../../../shared/pr-cartography.js";

const validCartography = (): PRCartographyDocument => ({
	version: "1.0",
	kind: "pr-cartography",
	source: {
		source: "github_pr",
		target: "482",
		reviewId: "pr-482",
		baseRef: "main",
		headRef: "feat/cartography",
		repo: "acme/billing",
		url: "https://github.com/acme/billing/pull/482",
	},
	evidenceIndex: [
		{
			id: "E-FILE-001",
			kind: "file",
			source: "plugins/dev/skills/pr-walkthrough/SKILL.md",
			summary: "The walkthrough skill participates in PR evidence collection.",
		},
		{
			id: "E-DIFF-001",
			kind: "diff",
			source: "plugins/dev/skills/pr-walkthrough/SKILL.md",
			summary:
				"The workflow validates generated artifacts before registration.",
		},
	],
	files: [
		{
			id: "file-walkthrough-skill",
			path: "plugins/dev/skills/pr-walkthrough/SKILL.md",
			evidenceIds: ["E-FILE-001"],
		},
	],
	fragments: [
		{
			id: "frag-validation-step",
			fileId: "file-walkthrough-skill",
			path: "plugins/dev/skills/pr-walkthrough/SKILL.md",
			line: 140,
			lineEnd: 172,
			summary:
				"The workflow checks validation before registering the artifact.",
			evidenceIds: ["E-DIFF-001"],
		},
	],
	boundaries: [
		{
			id: "boundary-artifact-validation",
			label: "Artifact validation boundary",
			summary: "Walkthrough output is checked before it is published.",
			fragmentIds: ["frag-validation-step"],
			contractIds: ["contract-code-tour-output"],
			entityIds: ["entity-walkthrough-artifact"],
			sideEffectIds: ["effect-register-artifact"],
			riskSurfaceIds: ["risk-validation-before-registration"],
			evidenceIds: ["E-DIFF-001"],
			confidence: "supported",
		},
	],
	contracts: [
		{
			id: "contract-code-tour-output",
			label: "Code Tour output",
			kind: "workflow-output",
			producer: "pr-walkthrough-reporter",
			consumer: "code-tour-validate",
			fragmentIds: ["frag-validation-step"],
			evidenceIds: ["E-DIFF-001"],
		},
	],
	entities: [
		{
			id: "entity-walkthrough-artifact",
			label: "Walkthrough artifact",
			kind: "artifact",
			summary: "The JSON file published for the run.",
			fragmentIds: ["frag-validation-step"],
			evidenceIds: ["E-DIFF-001"],
		},
	],
	sideEffects: [
		{
			id: "effect-register-artifact",
			label: "Registers one artifact",
			kind: "workflow-output",
			summary: "Successful runs publish exactly one Code Tour JSON path.",
			fragmentIds: ["frag-validation-step"],
			evidenceIds: ["E-DIFF-001"],
		},
	],
	riskSurfaces: [
		{
			id: "risk-validation-before-registration",
			label: "Validation order",
			question:
				"Does the workflow validate the Code Tour JSON before registration?",
			fragmentIds: ["frag-validation-step"],
			evidenceIds: ["E-DIFF-001"],
			confidence: "question",
		},
	],
	relationships: [
		{
			from: "boundary-artifact-validation",
			to: "contract-code-tour-output",
			kind: "uses-contract",
			label: "validates contract",
			evidenceIds: ["E-DIFF-001"],
		},
	],
});

const mutableCartography = (): Record<string, unknown> =>
	JSON.parse(JSON.stringify(validCartography())) as Record<string, unknown>;

describe("validatePRCartographyDocument", () => {
	test("accepts valid PR cartography", () => {
		const result = validatePRCartographyDocument(validCartography());

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.document.version).toBe("1.0");
			expect(result.document.boundaries[0]?.id).toBe(
				"boundary-artifact-validation",
			);
		}
	});

	test("rejects unsupported version and kind", () => {
		const document = mutableCartography();
		document.version = "2.0";
		document.kind = "walkthrough-map";

		const result = validatePRCartographyDocument(document);

		expect(result.ok).toBe(false);
		if (!result.ok) {
			const formatted = formatPRCartographyValidationIssues(result.issues);
			expect(formatted).toContain(
				'$.version: Unsupported PR cartography version "2.0"; expected "1.0"',
			);
			expect(formatted).toContain(
				'$.kind: Unsupported PR cartography kind "walkthrough-map"; expected "pr-cartography"',
			);
		}
	});

	test("rejects duplicate evidence and cartography ids", () => {
		const document = mutableCartography() as {
			evidenceIndex: Array<Record<string, unknown>>;
			files: Array<Record<string, unknown>>;
		};
		document.evidenceIndex.push({
			id: "E-DIFF-001",
			kind: "diff",
			source: "duplicate.patch",
			summary: "Duplicate evidence entry.",
		});
		document.files.push({
			id: "frag-validation-step",
			path: "duplicate.ts",
			evidenceIds: ["E-DIFF-001"],
		});

		const result = validatePRCartographyDocument(document);

		expect(result.ok).toBe(false);
		if (!result.ok) {
			const formatted = formatPRCartographyValidationIssues(result.issues);
			expect(formatted).toContain(
				'$.evidenceIndex[2].id: Duplicate evidence id "E-DIFF-001" already defined at $.evidenceIndex[1].id',
			);
			expect(formatted).toContain(
				'$.fragments[0].id: Duplicate cartography id "frag-validation-step" already defined at $.files[1].id',
			);
		}
	});

	test("rejects unresolved evidence, file, and fragment references", () => {
		const document = mutableCartography() as {
			files: Array<{ evidenceIds: string[] }>;
			fragments: Array<{ fileId: string; evidenceIds: string[] }>;
			boundaries: Array<{ fragmentIds: string[]; contractIds: string[] }>;
		};
		document.files[0].evidenceIds = ["missing-evidence"];
		document.fragments[0].fileId = "missing-file";
		document.fragments[0].evidenceIds = ["missing-evidence"];
		document.boundaries[0].fragmentIds = ["missing-fragment"];
		document.boundaries[0].contractIds = ["file-walkthrough-skill"];

		const result = validatePRCartographyDocument(document);

		expect(result.ok).toBe(false);
		if (!result.ok) {
			const formatted = formatPRCartographyValidationIssues(result.issues);
			expect(formatted).toContain(
				'$.files[0].evidenceIds[0]: Unknown evidence id "missing-evidence"',
			);
			expect(formatted).toContain(
				'$.fragments[0].fileId: Unknown file id "missing-file"',
			);
			expect(formatted).toContain(
				'$.boundaries[0].fragmentIds[0]: Unknown fragment id "missing-fragment"',
			);
			expect(formatted).toContain(
				'$.boundaries[0].contractIds[0]: Unknown contract id "file-walkthrough-skill"',
			);
		}
	});

	test("rejects broken relationship endpoints", () => {
		const document = mutableCartography() as {
			relationships: Array<{ from: string; to: string }>;
		};
		document.relationships[0].from = "missing-boundary";
		document.relationships[0].to = "missing-contract";

		const result = validatePRCartographyDocument(document);

		expect(result.ok).toBe(false);
		if (!result.ok) {
			const formatted = formatPRCartographyValidationIssues(result.issues);
			expect(formatted).toContain(
				'$.relationships[0].from: Unknown cartography relationship endpoint "missing-boundary"',
			);
			expect(formatted).toContain(
				'$.relationships[0].to: Unknown cartography relationship endpoint "missing-contract"',
			);
		}
	});

	test("rejects verdict-oriented risk language", () => {
		const document = mutableCartography() as {
			riskSurfaces: Array<{
				label: string;
				question: string;
				confidence: string;
			}>;
		};
		document.riskSurfaces[0].label = "Merge readiness";
		document.riskSurfaces[0].question = "Should we approve this PR?";
		document.riskSurfaces[0].confidence = "certain";

		const result = validatePRCartographyDocument(document);

		expect(result.ok).toBe(false);
		if (!result.ok) {
			const formatted = formatPRCartographyValidationIssues(result.issues);
			expect(formatted).toContain(
				"$.riskSurfaces[0].label: Risk surfaces must be phrased as reviewer focus or open questions; remove merge-readiness language",
			);
			expect(formatted).toContain(
				"$.riskSurfaces[0].question: Risk surfaces must be phrased as reviewer focus or open questions; remove approval language",
			);
			expect(formatted).toContain(
				'$.riskSurfaces[0].confidence: Expected "supported" or "question"',
			);
		}
	});
});

describe("parsePRCartographyDocument", () => {
	test("returns readable root errors for malformed JSON", () => {
		const result = parsePRCartographyDocument("{no-json");

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.issues[0]?.path).toBe("$");
			expect(result.issues[0]?.message).toContain("Malformed JSON");
		}
	});
});
