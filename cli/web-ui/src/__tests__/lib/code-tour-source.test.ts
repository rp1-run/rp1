import { describe, expect, test } from "bun:test";
import {
	isCodeTourJsonArtifactCandidate,
	parseCodeTourSource,
} from "@/lib/code-tour-source";
import type { Artifact } from "@/types/runs";

const codeTourContent = JSON.stringify({
	version: "1.0",
	kind: "pr-walkthrough-code-tour",
	title: "Route Smoke Tour",
	source: {
		kind: "github-pr",
		repo: "rp1-run/rp1",
		id: "42",
	},
	domains: {
		ui: {
			label: "Arcade UI",
			color: "#7ad0ff",
		},
	},
	concepts: [
		{
			id: "artifact-route",
			label: "Artifact Route",
			domain: "ui",
			epicenter: true,
			summary: "Routes valid Code Tour JSON to the 3D reader.",
			fragments: ["artifact-viewer-page"],
		},
	],
	fragments: [
		{
			id: "artifact-viewer-page",
			label: "ArtifactViewerPage",
			path: "cli/web-ui/src/pages/v2/ArtifactViewerPage.tsx",
			line: 360,
			language: "tsx",
			code: [
				{
					tokens: [
						["kw", "const"],
						["", " codeTourResult = parseCodeTourSource(...)"],
					],
				},
			],
		},
	],
	edges: {
		concept: [],
		fragment: [],
	},
	tour: [
		{
			conceptId: "artifact-route",
			title: "Open the artifact route",
			sub: "Arcade",
			reason: "The normal run artifact route passes JSON into the reader.",
		},
	],
});

const codeTourArtifact = (
	path = ".rp1/work/pr-walkthroughs/pr-42-walkthrough-001.json",
): Pick<Artifact, "locationKind" | "path"> => ({
	path,
	locationKind: "file",
});

describe("isCodeTourJsonArtifactCandidate", () => {
	test("recognizes pr-walkthrough JSON artifacts in work-root paths", () => {
		expect(
			isCodeTourJsonArtifactCandidate(
				".rp1/work/pr-walkthroughs/pr-42-walkthrough-001.json",
			),
		).toBe(true);
		expect(
			isCodeTourJsonArtifactCandidate(
				"features/feature-1/pr-walkthroughs/pr-42-walkthrough-001.JSON",
			),
		).toBe(true);
		expect(isCodeTourJsonArtifactCandidate("pr-reviews/pr-42.json")).toBe(
			false,
		);
	});
});

describe("parseCodeTourSource", () => {
	test("returns a Code Tour view model for valid tour JSON", () => {
		const result = parseCodeTourSource({
			artifact: codeTourArtifact(),
			content: codeTourContent,
		});

		expect(result?.kind).toBe("tour");
		if (result?.kind === "tour") {
			expect(result.tour.title).toBe("Route Smoke Tour");
			expect(result.tour.sourceLabel).toBe("rp1-run/rp1 / PR #42");
			expect(result.tour.concepts[0]?.label).toBe("Artifact Route");
			expect(result.tour.fragments[0]?.location).toBe(
				"cli/web-ui/src/pages/v2/ArtifactViewerPage.tsx:360",
			);
		}
	});

	test("returns a diagnostic for invalid Code Tour candidates", () => {
		const result = parseCodeTourSource({
			artifact: codeTourArtifact(),
			content: codeTourContent.replace('"version":"1.0"', '"version":"9.9"'),
		});

		expect(result?.kind).toBe("diagnostic");
		if (result?.kind === "diagnostic") {
			expect(result.message).toContain("could not be rendered");
			expect(result.detail).toContain("Unsupported Code Tour version");
		}
	});

	test("ignores invalid non-candidate JSON and URL artifacts", () => {
		expect(
			parseCodeTourSource({
				path: "reports/raw-data.json",
				content: "{",
			}),
		).toBeNull();
		expect(
			parseCodeTourSource({
				artifact: {
					path: "https://github.com/rp1-run/rp1/pull/42",
					locationKind: "url",
				},
				content: codeTourContent,
			}),
		).toBeNull();
	});
});
