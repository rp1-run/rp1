import { afterEach, describe, expect, mock, test } from "bun:test";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

let importVersion = 0;

const codeTourPath = ".rp1/work/pr-walkthroughs/pr-42-walkthrough-001.json";
const codeTourContent = JSON.stringify({
	version: "1.0",
	kind: "pr-walkthrough-code-tour",
	title: "Embedded Code Tour",
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
			id: "artifact-surface",
			label: "Artifact Content Surface",
			domain: "ui",
			epicenter: true,
			summary: "Embeds Code Tour JSON in the run detail surface.",
			fragments: ["content-panel"],
		},
	],
	fragments: [
		{
			id: "content-panel",
			label: "ContentPanel",
			path: "cli/web-ui/src/components/v2/ContentPanel.tsx",
			line: 60,
			language: "tsx",
			code: [
				{
					tokens: [
						["kw", "const"],
						["", " effectiveContentMode = ..."],
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
			conceptId: "artifact-surface",
			title: "Render embedded artifact",
			sub: "Run detail",
			reason: "The embedded surface should use the 3D reader by default.",
		},
	],
});

const unifiedContentRendererMock = {
	UnifiedContentRenderer: ({
		content,
		path,
	}: {
		readonly content: string;
		readonly path: string;
	}) => (
		<div data-testid="artifact-renderer">
			{path}:{content}
		</div>
	),
	SaveStatusIndicator: () => null,
};

mock.module(
	"@/components/v2/UnifiedContentRenderer",
	() => unifiedContentRendererMock,
);

mock.module(
	"@/components/v2/UnifiedContentRenderer.tsx",
	() => unifiedContentRendererMock,
);

const codeTourReaderMock = {
	CodeTour3DReader: ({
		tour,
		path,
		onSourceModeRequested,
	}: {
		readonly tour: { readonly title: string };
		readonly path: string;
		readonly onSourceModeRequested?: () => void;
	}) => (
		<div data-testid="code-tour-reader" data-path={path}>
			<span>{tour.title}</span>
			{onSourceModeRequested ? (
				<button
					type="button"
					aria-label="Mock code tour source mode"
					onClick={onSourceModeRequested}
				>
					Source
				</button>
			) : null}
		</div>
	),
};

mock.module("@/components/v2/CodeTour3DReader", () => codeTourReaderMock);

mock.module("@/components/v2/CodeTour3DReader.tsx", () => codeTourReaderMock);

async function importContentPanel() {
	return import(
		`../../../components/v2/ContentPanel.tsx?content-panel-test=${++importVersion}`
	);
}

describe("ContentPanel", () => {
	afterEach(() => {
		cleanup();
		mock.restore();
	});

	test("defaults valid Code Tour artifacts to the 3D reader", async () => {
		const { ContentPanel } = await importContentPanel();

		render(
			<ContentPanel
				content={codeTourContent}
				path={codeTourPath}
				isLoading={false}
				error={null}
			/>,
		);

		expect(screen.getByTestId("code-tour-reader").dataset.path).toBe(
			codeTourPath,
		);
		expect(screen.getByText("Embedded Code Tour")).toBeTruthy();
		expect(screen.queryByTestId("artifact-renderer")).toBeNull();
		expect(
			screen.queryByRole("button", { name: "Mock code tour source mode" }),
		).toBeNull();
	});

	test("keeps explicit markdown mode on the source renderer", async () => {
		const { ContentPanel } = await importContentPanel();

		render(
			<ContentPanel
				content={codeTourContent}
				path={codeTourPath}
				isLoading={false}
				error={null}
				contentMode="markdown"
			/>,
		);

		expect(screen.queryByTestId("code-tour-reader")).toBeNull();
		expect(screen.getByTestId("artifact-renderer").textContent).toContain(
			`${codeTourPath}:`,
		);
	});

	test("passes source mode requests to callers that own mode state", async () => {
		const { ContentPanel } = await importContentPanel();
		const onContentModeChange = mock(() => {});

		render(
			<ContentPanel
				content={codeTourContent}
				path={codeTourPath}
				isLoading={false}
				error={null}
				onContentModeChange={onContentModeChange}
			/>,
		);

		fireEvent.click(
			screen.getByRole("button", { name: "Mock code tour source mode" }),
		);

		expect(onContentModeChange).toHaveBeenCalledWith("markdown");
	});

	test("keeps ordinary JSON on the source renderer", async () => {
		const { ContentPanel } = await importContentPanel();

		render(
			<ContentPanel
				content={'{"status":"ok"}'}
				path="reports/data.json"
				isLoading={false}
				error={null}
			/>,
		);

		expect(screen.queryByTestId("code-tour-reader")).toBeNull();
		expect(screen.getByTestId("artifact-renderer").textContent).toContain(
			"reports/data.json:",
		);
	});
});
