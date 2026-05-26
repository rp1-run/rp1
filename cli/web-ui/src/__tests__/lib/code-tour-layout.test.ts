import { describe, expect, test } from "bun:test";
import { buildCodeTourSceneLayout } from "@/lib/code-tour-layout";
import { buildCodeTourViewModel } from "@/lib/code-tour-view-model";
import type {
	CodeTourDocument,
	CodeTourFragment,
} from "../../../../shared/code-tour";

const tourDocument: CodeTourDocument = {
	version: "1.0",
	kind: "pr-walkthrough-code-tour",
	title: "Layout Tour",
	source: {
		kind: "github-pr",
		repo: "rp1-run/rp1",
		id: "394",
	},
	domains: {
		contract: {
			label: "Contract",
			color: "#7ad0ff",
		},
		reader: {
			label: "Reader",
			color: "#ffbf69",
		},
	},
	concepts: [
		{
			id: "contract",
			label: "Code Tour contract",
			domain: "contract",
			epicenter: true,
			fragments: ["contract-types", "contract-validator"],
		},
		{
			id: "source",
			label: "Source adapter",
			domain: "contract",
			fragments: ["source-detect", "source-view"],
		},
		{
			id: "reader",
			label: "3D reader",
			domain: "reader",
			fragments: ["reader-scene", "reader-panel"],
		},
		{
			id: "empty-state",
			label: "Fallback state",
			domain: "reader",
			fragments: ["diagnostic"],
		},
	],
	fragments: [
		fragment("contract-types", "CodeTourDocument", "cli/shared/code-tour.ts"),
		fragment(
			"contract-validator",
			"validateCodeTour",
			"cli/shared/code-tour.ts",
		),
		fragment(
			"source-detect",
			"detectCodeTour",
			"cli/web-ui/src/lib/code-tour-source.ts",
		),
		fragment(
			"source-view",
			"buildCodeTourViewModel",
			"cli/web-ui/src/lib/code-tour-view-model.ts",
		),
		fragment(
			"reader-scene",
			"CodeTour3DReader",
			"cli/web-ui/src/components/v2/CodeTour3DReader.tsx",
		),
		fragment(
			"reader-panel",
			"FloatingStepCard",
			"cli/web-ui/src/components/v2/CodeTour3DReader.tsx",
		),
		fragment(
			"diagnostic",
			"CodeTourDiagnosticState",
			"cli/web-ui/src/components/v2/CodeTour3DReader.tsx",
		),
	],
	edges: {
		concept: [
			{ from: "contract", to: "source", label: "parsed by" },
			{ from: "source", to: "reader", label: "feeds" },
			{ from: "contract", to: "empty-state", label: "validates" },
		],
		fragment: [
			{ from: "contract-validator", to: "source-detect", label: "guards" },
			{ from: "source-view", to: "reader-scene", label: "renders" },
		],
	},
	tour: [
		{ conceptId: "contract", title: "Start at the contract" },
		{ conceptId: "source", title: "Parse into the view model" },
		{ conceptId: "reader", title: "Render the walkthrough" },
		{ conceptId: "empty-state", title: "Fallback if rendering fails" },
	],
};

const prShapedTourDocument: CodeTourDocument = {
	version: "1.0",
	kind: "pr-walkthrough-code-tour",
	title: "PR-shaped Layout Tour",
	source: {
		kind: "github-pr",
		repo: "rp1-run/rp1",
		id: "394",
	},
	domains: tourDocument.domains,
	concepts: [
		{
			id: "code-tour-contract",
			label: "Code Tour v1 contract and validator",
			domain: "contract",
			epicenter: true,
			fragments: [
				"frag-contract-types",
				"frag-validate-fn",
				"frag-contract-tests",
			],
		},
		{
			id: "three-reader",
			label: "Three.js 3D Code Tour reader",
			domain: "reader",
			fragments: ["frag-reader-props", "frag-reader-css"],
		},
		{
			id: "reader-pipeline",
			label: "Artifact detection and view-model pipeline",
			domain: "contract",
			fragments: ["frag-source-gate", "frag-view-model", "frag-content-branch"],
		},
		{
			id: "workflow-gate",
			label: "Workflow validation gate and producer rewrite",
			domain: "contract",
			fragments: ["frag-template-routing", "frag-contract-test-rewrite"],
		},
		{
			id: "reveal-removal",
			label: "Reveal.js walkthrough removal",
			domain: "reader",
			fragments: ["frag-reveal-delete", "frag-slide-source-delete"],
		},
		{
			id: "prototype-and-docs",
			label: "3D prototype and documentation updates",
			domain: "reader",
			fragments: ["frag-docs-walkthrough"],
		},
	],
	fragments: [
		fragment(
			"frag-contract-types",
			"CodeTourDocument interface",
			"cli/shared/code-tour.ts",
		),
		fragment(
			"frag-validate-fn",
			"validateCodeTourDocument",
			"cli/shared/code-tour.ts",
		),
		fragment(
			"frag-contract-tests",
			"Code Tour validator tests",
			"cli/src/__tests__/code-tour.test.ts",
		),
		fragment(
			"frag-reader-props",
			"CodeTour3DReader props",
			"cli/web-ui/src/components/v2/CodeTour3DReader.tsx",
		),
		fragment(
			"frag-reader-css",
			"CodeTour3DReader CSS",
			"cli/web-ui/src/components/v2/CodeTour3DReader.css",
		),
		fragment(
			"frag-source-gate",
			"parseCodeTourSource",
			"cli/web-ui/src/lib/code-tour-source.ts",
		),
		fragment(
			"frag-view-model",
			"buildCodeTourViewModel",
			"cli/web-ui/src/lib/code-tour-view-model.ts",
		),
		fragment(
			"frag-content-branch",
			"Artifact viewer branch",
			"cli/web-ui/src/pages/v2/ArtifactViewerPage.tsx",
		),
		fragment(
			"frag-template-routing",
			"Reporter output routing",
			"plugins/dev/agents/pr-walkthrough-reporter.md",
		),
		fragment(
			"frag-contract-test-rewrite",
			"Reporter contract tests",
			"cli/src/__tests__/pr-walkthrough.test.ts",
		),
		fragment(
			"frag-reveal-delete",
			"Reveal removal",
			"cli/web-ui/src/components/v2/RevealWalkthrough.tsx",
		),
		fragment(
			"frag-slide-source-delete",
			"Slide source removal",
			"cli/web-ui/src/lib/walkthrough.ts",
		),
		fragment(
			"frag-docs-walkthrough",
			"Walkthrough docs",
			"docs/arcade/walkthrough.md",
		),
	],
	edges: {
		concept: [
			{
				from: "code-tour-contract",
				to: "workflow-gate",
				label: "validates production output",
			},
			{
				from: "code-tour-contract",
				to: "reader-pipeline",
				label: "parsed by source gate",
			},
			{
				from: "reader-pipeline",
				to: "three-reader",
				label: "provides view model to",
			},
			{ from: "three-reader", to: "reveal-removal", label: "replaces" },
			{
				from: "workflow-gate",
				to: "prototype-and-docs",
				label: "documented by",
			},
		],
		fragment: [
			{
				from: "frag-validate-fn",
				to: "frag-source-gate",
				label: "called by parseCodeTourSource",
			},
			{
				from: "frag-source-gate",
				to: "frag-content-branch",
				label: "feeds codeTourResult into",
			},
			{
				from: "frag-content-branch",
				to: "frag-reader-props",
				label: "renders when tour mode active",
			},
		],
	},
	tour: [
		{ conceptId: "code-tour-contract", title: "Start at the contract" },
		{ conceptId: "workflow-gate", title: "Validate the workflow" },
		{ conceptId: "reader-pipeline", title: "Parse into the reader" },
		{ conceptId: "three-reader", title: "Render the scene" },
		{ conceptId: "reveal-removal", title: "Remove old walkthroughs" },
		{ conceptId: "prototype-and-docs", title: "Compare with the prototype" },
	],
};

describe("code tour Dagre layout", () => {
	test("returns finite concept and fragment positions for every node", () => {
		const tour = buildCodeTourViewModel(tourDocument);
		const layout = buildCodeTourSceneLayout(tour);

		expect(layout.concepts.size).toBe(tour.concepts.length);
		expect(layout.fragments.size).toBe(tour.fragments.length);

		for (const point of [
			...layout.concepts.values(),
			...layout.fragments.values(),
		]) {
			expect(Number.isFinite(point.x)).toBe(true);
			expect(Number.isFinite(point.y)).toBe(true);
			expect(Number.isFinite(point.z)).toBe(true);
		}
	});

	test("keeps directed relationships readable in left-to-right order", () => {
		const layout = buildCodeTourSceneLayout(
			buildCodeTourViewModel(tourDocument),
		);

		expect(layout.concepts.get("contract")?.x).toBeLessThan(
			layout.concepts.get("reader")?.x ?? Number.NEGATIVE_INFINITY,
		);
		expect(layout.fragments.get("contract-types")?.x).toBeLessThan(
			layout.fragments.get("contract-validator")?.x ?? Number.NEGATIVE_INFINITY,
		);
		expect(layout.fragments.get("source-view")?.x).toBeLessThan(
			layout.fragments.get("reader-scene")?.x ?? Number.NEGATIVE_INFINITY,
		);
	});

	test("lays out shortcut-heavy PR walkthrough graphs without stalling", () => {
		const startedAt = performance.now();
		const tour = buildCodeTourViewModel(prShapedTourDocument);
		const layout = buildCodeTourSceneLayout(tour);
		const durationMs = performance.now() - startedAt;

		expect(layout.concepts.size).toBe(6);
		expect(layout.fragments.size).toBe(13);
		expect(durationMs).toBeLessThan(1000);
	});
});

function fragment(id: string, label: string, path: string): CodeTourFragment {
	return {
		id,
		label,
		path,
		line: 1,
		language: "ts",
		code: [
			{
				type: "add" as const,
				tokens: [["", `export const ${id.replaceAll("-", "_")} = true;`]],
			},
		],
	};
}
